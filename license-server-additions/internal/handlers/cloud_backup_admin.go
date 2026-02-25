package handlers

// This file adds the three admin handler methods that are NOT yet present in
// the existing cloud_backup.go:
//
//   AdminList          – GET  /api/v1/admin/cloud-backups
//                        Lists ALL licenses with their cloud storage usage stats.
//
//   AdminListForLicense – GET /api/v1/admin/cloud-backups/:license_id
//                        Lists all backups (any status) for one license.
//                        NOTE: The existing AdminListBackups already does this but
//                        under a different route shape — this version is a clean
//                        alias with the expected URL param name.
//
//   AdminDeleteBackup  – DELETE /api/v1/admin/cloud-backups/backup/:backup_id
//                        Admin-level deletion by backup_id (no ownership check).
//
//   AdminSetQuotaByLicenseID – PUT /api/v1/admin/licenses/:id/quota
//                        Sets quota using the license primary-key (:id) instead of
//                        the existing AdminSetQuota which uses :license_id.
//                        Accepts { "quota_bytes": N } OR { "quota_mb": N }.
//
// The CloudBackupHandler struct and NewCloudBackupHandler constructor are
// defined in cloud_backup.go — do NOT redefine them here.

import (
	"fmt"
	"log"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/proxpanel/license-server/internal/database"
	"github.com/proxpanel/license-server/internal/models"
)

// AdminList handles GET /api/v1/admin/cloud-backups
//
// Returns every license that has a cloud_storage_usage row, plus summary totals.
// Licenses with 0 usage but a non-default quota are included so the admin can
// see quota configurations for new customers.
//
// Protected by the JWT middleware registered in main.go.
func (h *CloudBackupHandler) AdminList(c *fiber.Ctx) error {
	type CustomerRow struct {
		LicenseID    uint       `json:"license_id"`
		LicenseKey   string     `json:"license_key"`
		CustomerName string     `json:"customer_name"`
		UsedBytes    int64      `json:"used_bytes"`
		QuotaBytes   int64      `json:"quota_bytes"`
		BackupCount  int        `json:"backup_count"`
		Tier         string     `json:"tier"`
		LastUpload   *time.Time `json:"last_upload"`
	}

	// LEFT JOIN so we see all licenses that have a cloud_storage_usage row.
	// We do NOT include licenses without a usage row to keep the list clean;
	// admins can set a quota for any license via AdminSetQuotaByLicenseID which
	// will create the row on demand.
	rows, err := database.DB.Raw(`
		SELECT
			l.id                                    AS license_id,
			l.license_key                           AS license_key,
			COALESCE(c.name, 'Unknown Customer')    AS customer_name,
			COALESCE(u.total_used_bytes, 0)         AS used_bytes,
			COALESCE(u.quota_bytes, 524288000)       AS quota_bytes,
			COALESCE(u.backup_count, 0)             AS backup_count,
			COALESCE(u.tier, 'free')                AS tier,
			u.last_upload
		FROM licenses l
		LEFT JOIN customers c
			ON c.id = l.customer_id
			AND c.deleted_at IS NULL
		INNER JOIN cloud_storage_usage u
			ON u.license_id = l.id
		WHERE l.deleted_at IS NULL
		ORDER BY u.total_used_bytes DESC, l.id ASC
	`).Rows()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Database query failed: " + err.Error(),
		})
	}
	defer rows.Close()

	var customers []CustomerRow
	var totalUsed int64

	for rows.Next() {
		var row CustomerRow
		if scanErr := rows.Scan(
			&row.LicenseID,
			&row.LicenseKey,
			&row.CustomerName,
			&row.UsedBytes,
			&row.QuotaBytes,
			&row.BackupCount,
			&row.Tier,
			&row.LastUpload,
		); scanErr != nil {
			log.Printf("CloudBackup AdminList: scan error: %v", scanErr)
			continue
		}
		customers = append(customers, row)
		totalUsed += row.UsedBytes
	}

	return c.JSON(fiber.Map{
		"success":              true,
		"customers":            customers,
		"total_customers":      len(customers),
		"total_used_bytes":     totalUsed,
		"total_used_formatted": formatStorageBytes(totalUsed),
	})
}

// AdminListForLicense handles GET /api/v1/admin/cloud-backups/:license_id
//
// Returns all backup records (any status: active, expired, deleted) for the
// given license.  This is the counterpart to the customer-facing List handler
// but without status filtering and without ownership enforcement.
//
// Protected by the JWT middleware registered in main.go.
func (h *CloudBackupHandler) AdminListForLicense(c *fiber.Ctx) error {
	licenseID := c.Params("license_id")
	if licenseID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Missing license_id URL parameter",
		})
	}

	var backups []models.CloudBackup
	database.DB.
		Where("license_id = ?", licenseID).
		Order("created_at DESC").
		Find(&backups)

	return c.JSON(fiber.Map{
		"success": true,
		"backups": backups,
	})
}

// AdminDeleteBackup handles DELETE /api/v1/admin/cloud-backups/backup/:backup_id
//
// Admin-level hard deletion: no license ownership check.  Removes the file from
// disk and soft-deletes the DB record.  Storage counters are adjusted.
//
// Protected by the JWT middleware registered in main.go.
func (h *CloudBackupHandler) AdminDeleteBackup(c *fiber.Ctx) error {
	backupID := c.Params("backup_id")
	if backupID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Missing backup_id URL parameter",
		})
	}

	var backup models.CloudBackup
	if err := database.DB.
		Where("backup_id = ? AND status = 'active'", backupID).
		First(&backup).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Backup not found or already deleted",
		})
	}

	// Remove physical file (best-effort — storage may have moved).
	if rmErr := os.Remove(backup.FilePath); rmErr != nil && !os.IsNotExist(rmErr) {
		log.Printf("CloudBackup AdminDeleteBackup: WARNING: could not remove %s: %v", backup.FilePath, rmErr)
	}

	now := time.Now().UTC()

	// Soft-delete in DB.
	database.DB.Model(&backup).Updates(map[string]interface{}{
		"status":     "deleted",
		"updated_at": now,
	})

	// Adjust usage counters.
	var usage models.CloudStorageUsage
	if database.DB.Where("license_id = ?", backup.LicenseID).First(&usage).Error == nil {
		newUsed := usage.TotalUsedBytes - backup.SizeBytes
		if newUsed < 0 {
			newUsed = 0
		}
		newCount := usage.BackupCount - 1
		if newCount < 0 {
			newCount = 0
		}
		database.DB.Model(&usage).Updates(map[string]interface{}{
			"total_used_bytes": newUsed,
			"backup_count":     newCount,
			"updated_at":       now,
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": fmt.Sprintf("Backup %s deleted by admin", backupID),
	})
}

// AdminSetQuotaByLicenseID handles PUT /api/v1/admin/licenses/:id/quota
//
// Sets the cloud storage quota for a license identified by its primary key (:id).
// This is the route-shape expected by the admin panel's licenses route group:
//
//   licenses.Put("/:id/quota", cloudBackupHandler.AdminSetQuotaByLicenseID)
//
// Accepts either:
//   { "quota_bytes": 1073741824 }  — raw bytes
//   { "quota_mb":    1024 }         — megabytes (converted internally)
//
// If both are provided, quota_bytes takes precedence.
//
// The existing AdminSetQuota in cloud_backup.go uses ":license_id" as the param
// name and accepts only { "quota_mb": N }.  This method uses ":id" to match the
// licenses route group convention and also accepts quota_bytes for precision.
//
// Protected by the JWT middleware registered in main.go.
func (h *CloudBackupHandler) AdminSetQuotaByLicenseID(c *fiber.Ctx) error {
	licenseID := c.Params("id")
	if licenseID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Missing :id URL parameter",
		})
	}

	// Verify the license exists and is not soft-deleted.
	var lic models.License
	if err := database.DB.Where("id = ? AND deleted_at IS NULL", licenseID).First(&lic).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "License not found",
		})
	}

	var body struct {
		QuotaBytes *int64 `json:"quota_bytes"`
		QuotaMB    *int64 `json:"quota_mb"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
		})
	}

	var quotaBytes int64
	switch {
	case body.QuotaBytes != nil && *body.QuotaBytes > 0:
		quotaBytes = *body.QuotaBytes
	case body.QuotaMB != nil && *body.QuotaMB > 0:
		quotaBytes = *body.QuotaMB * 1024 * 1024
	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "quota_bytes or quota_mb is required and must be > 0",
		})
	}

	// Upsert the usage row.
	usage, err := h.getOrCreateUsage(lic.ID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to load storage usage record",
		})
	}

	now := time.Now().UTC()
	if err := database.DB.Model(usage).Updates(map[string]interface{}{
		"quota_bytes": quotaBytes,
		"tier":        "custom",
		"updated_at":  now,
	}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to update quota: " + err.Error(),
		})
	}

	log.Printf("CloudBackup AdminSetQuotaByLicenseID: license %d quota set to %s",
		lic.ID, formatStorageBytes(quotaBytes))

	return c.JSON(fiber.Map{
		"success":         true,
		"message":         fmt.Sprintf("Quota set to %s for license %s", formatStorageBytes(quotaBytes), lic.LicenseKey),
		"license_id":      lic.ID,
		"quota_bytes":     quotaBytes,
		"quota_formatted": formatStorageBytes(quotaBytes),
	})
}

// ─── package-level helper ─────────────────────────────────────────────────────

// formatStorageBytes formats a byte count as a human-readable string.
// Defined here to avoid redeclaring formatBytes from cloud_backup.go.
func formatStorageBytes(b int64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}

package handlers

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/proxpanel/license-server/internal/database"
	"github.com/proxpanel/license-server/internal/models"
)

const (
	// cloudBackupBaseDir is the root directory for all cloud backup storage.
	cloudBackupBaseDir = "/opt/proxpanel-license/cloud-backups"

	// cloudMaxFileSizeBytes is the hard limit per uploaded file (1 GB).
	cloudMaxFileSizeBytes = int64(1 * 1024 * 1024 * 1024)

	// cloudBackupExtension is the required file extension for all backup files.
	cloudBackupExtension = ".proisp.bak"
)

// CloudBackupHandler handles all cloud backup operations.
type CloudBackupHandler struct{}

// NewCloudBackupHandler creates a new CloudBackupHandler.
func NewCloudBackupHandler() *CloudBackupHandler {
	return &CloudBackupHandler{}
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: authenticate request by X-License-Key header and return the License.
// ─────────────────────────────────────────────────────────────────────────────

func (h *CloudBackupHandler) authenticateLicense(c *fiber.Ctx) (*models.License, error) {
	licenseKey := c.Get("X-License-Key")
	if licenseKey == "" {
		return nil, fmt.Errorf("missing license key")
	}

	var license models.License
	if err := database.DB.Where("license_key = ?", licenseKey).First(&license).Error; err != nil {
		return nil, fmt.Errorf("invalid license key")
	}

	if license.Status != "active" {
		return nil, fmt.Errorf("license is not active")
	}

	return &license, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: get or create CloudStorageUsage for a license (free tier by default).
// ─────────────────────────────────────────────────────────────────────────────

func (h *CloudBackupHandler) getOrCreateUsage(licenseID uint) (*models.CloudStorageUsage, error) {
	var usage models.CloudStorageUsage

	result := database.DB.Where("license_id = ?", licenseID).First(&usage)
	if result.Error == nil {
		return &usage, nil
	}

	// Does not exist — create free-tier record.
	now := time.Now()
	usage = models.CloudStorageUsage{
		LicenseID:      licenseID,
		TotalUsedBytes: 0,
		QuotaBytes:     int64(524288000), // 500 MB — matches CloudQuotaFree constant
		Tier:           "free",
		BackupCount:    0,
		CreatedAt:      now,
		UpdatedAt:      now,
	}

	if err := database.DB.Create(&usage).Error; err != nil {
		return nil, err
	}

	return &usage, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: generate a unique backup_id.
// Format: "<licenseID>-<hex timestamp>"
// ─────────────────────────────────────────────────────────────────────────────

func generateBackupID(licenseID uint) string {
	return fmt.Sprintf("%d-%x", licenseID, time.Now().UnixNano())
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload — POST /api/v1/license/cloud-backup/upload
//
//	Headers : X-License-Key
//	Form    : file  (multipart), backup_type (optional: full|data|config)
//
// Validates extension, checks quota, saves to disk, creates DB record.
// ─────────────────────────────────────────────────────────────────────────────

func (h *CloudBackupHandler) Upload(c *fiber.Ctx) error {
	license, err := h.authenticateLicense(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"success": false,
			"message": err.Error(),
		})
	}

	// Parse multipart form.
	fileHeader, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "No file provided — use multipart field name 'file'",
		})
	}

	// Validate file extension.
	if !strings.HasSuffix(strings.ToLower(fileHeader.Filename), cloudBackupExtension) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": fmt.Sprintf("Invalid file type — only %s files are accepted", cloudBackupExtension),
		})
	}

	// Enforce per-file size limit.
	if fileHeader.Size > cloudMaxFileSizeBytes {
		return c.Status(fiber.StatusRequestEntityTooLarge).JSON(fiber.Map{
			"success": false,
			"message": fmt.Sprintf("File too large — maximum allowed size is 1 GB"),
		})
	}

	// Load current storage usage and check quota.
	usage, err := h.getOrCreateUsage(license.ID)
	if err != nil {
		log.Printf("CloudBackup Upload: failed to get usage for license %d: %v", license.ID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to retrieve storage quota information",
		})
	}

	if usage.TotalUsedBytes+fileHeader.Size > usage.QuotaBytes {
		available := usage.QuotaBytes - usage.TotalUsedBytes
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"success": false,
			"message": fmt.Sprintf(
				"Storage quota exceeded — available: %d bytes (%d MB), file size: %d bytes",
				available, available/(1024*1024), fileHeader.Size,
			),
		})
	}

	// Build storage path and create directory.
	backupID := generateBackupID(license.ID)
	licenseDir := filepath.Join(cloudBackupBaseDir, fmt.Sprintf("%d", license.ID))
	if err := os.MkdirAll(licenseDir, 0750); err != nil {
		log.Printf("CloudBackup Upload: failed to create directory %s: %v", licenseDir, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to create storage directory",
		})
	}

	destPath := filepath.Join(licenseDir, backupID+cloudBackupExtension)

	// Open uploaded file and stream to disk.
	src, err := fileHeader.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to open uploaded file",
		})
	}
	defer src.Close()

	dst, err := os.Create(destPath)
	if err != nil {
		log.Printf("CloudBackup Upload: failed to create file %s: %v", destPath, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to write backup file to storage",
		})
	}
	defer dst.Close()

	written, err := io.Copy(dst, src)
	if err != nil {
		// Clean up partial file on error.
		os.Remove(destPath)
		log.Printf("CloudBackup Upload: failed to write file %s: %v", destPath, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to write backup file to storage",
		})
	}

	// Determine expiry: 30 days for free tier, 90 days for paid.
	expiryDays := 30
	if usage.Tier != "free" {
		expiryDays = 90
	}
	expiresAt := time.Now().Add(time.Duration(expiryDays) * 24 * time.Hour)

	// Create CloudBackup record in DB.
	backup := models.CloudBackup{
		LicenseID:              license.ID,
		BackupID:               backupID,
		Filename:               fileHeader.Filename,
		FilePath:               destPath,
		EncryptionKeyEncrypted: "", // Customer-side encryption; no server-side key stored.
		SizeBytes:              written,
		CreatedAt:              time.Now(),
		ExpiresAt:              &expiresAt,
		DownloadCount:          0,
		Status:                 "active",
	}

	if err := database.DB.Create(&backup).Error; err != nil {
		os.Remove(destPath)
		log.Printf("CloudBackup Upload: failed to save DB record for license %d: %v", license.ID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to register backup in database",
		})
	}

	// Update CloudStorageUsage using raw SQL so the increments are atomic.
	if err := database.DB.Exec(`
		UPDATE cloud_storage_usage
		SET total_used_bytes = total_used_bytes + ?,
		    backup_count     = backup_count + 1,
		    last_upload      = NOW(),
		    updated_at       = NOW()
		WHERE license_id = ?
	`, written, license.ID).Error; err != nil {
		// Non-fatal — log and continue.
		log.Printf("CloudBackup Upload: failed to update storage usage for license %d: %v", license.ID, err)
	}

	// Reload usage for response.
	_ = database.DB.Where("license_id = ?", license.ID).First(usage)

	usedPercent := float64(0)
	if usage.QuotaBytes > 0 {
		usedPercent = float64(usage.TotalUsedBytes) / float64(usage.QuotaBytes) * 100
	}

	log.Printf("CloudBackup Upload: license %d uploaded %s (%d bytes), backup_id=%s",
		license.ID, fileHeader.Filename, written, backupID)

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"success": true,
		"message": "Backup uploaded successfully",
		"data": fiber.Map{
			"backup_id":  backupID,
			"filename":   fileHeader.Filename,
			"size_bytes": written,
			"expires_at": expiresAt,
			"storage": fiber.Map{
				"used_bytes":    usage.TotalUsedBytes,
				"quota_bytes":   usage.QuotaBytes,
				"backup_count":  usage.BackupCount,
				"tier":          usage.Tier,
				"usage_percent": fmt.Sprintf("%.1f", usedPercent),
			},
		},
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// List — GET /api/v1/license/cloud-backup/list
//
//	Headers : X-License-Key
//
// Returns all active backup records for this license plus a storage summary.
// ─────────────────────────────────────────────────────────────────────────────

func (h *CloudBackupHandler) List(c *fiber.Ctx) error {
	license, err := h.authenticateLicense(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"success": false,
			"message": err.Error(),
		})
	}

	var backups []models.CloudBackup
	if err := database.DB.
		Where("license_id = ? AND status = ?", license.ID, "active").
		Order("created_at DESC").
		Find(&backups).Error; err != nil {
		log.Printf("CloudBackup List: DB error for license %d: %v", license.ID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to retrieve backup list",
		})
	}

	usage, err := h.getOrCreateUsage(license.ID)
	if err != nil {
		log.Printf("CloudBackup List: usage error for license %d: %v", license.ID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to retrieve storage usage",
		})
	}

	// Build response objects — only expose safe fields.
	type backupItem struct {
		ID            uint       `json:"id"`
		BackupID      string     `json:"backup_id"`
		Filename      string     `json:"filename"`
		SizeBytes     int64      `json:"size_bytes"`
		BackupType    string     `json:"backup_type"`
		CreatedAt     time.Time  `json:"created_at"`
		ExpiresAt     *time.Time `json:"expires_at"`
		DownloadCount int        `json:"download_count"`
	}

	items := make([]backupItem, 0, len(backups))
	for _, b := range backups {
		bt := "full" // default; BackupType field may not exist on all model versions
		items = append(items, backupItem{
			ID:            b.ID,
			BackupID:      b.BackupID,
			Filename:      b.Filename,
			SizeBytes:     b.SizeBytes,
			BackupType:    bt,
			CreatedAt:     b.CreatedAt,
			ExpiresAt:     b.ExpiresAt,
			DownloadCount: b.DownloadCount,
		})
	}

	usedPercent := float64(0)
	if usage.QuotaBytes > 0 {
		usedPercent = float64(usage.TotalUsedBytes) / float64(usage.QuotaBytes) * 100
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"backups": items,
			"storage": fiber.Map{
				"used_bytes":    usage.TotalUsedBytes,
				"quota_bytes":   usage.QuotaBytes,
				"backup_count":  usage.BackupCount,
				"tier":          usage.Tier,
				"usage_percent": fmt.Sprintf("%.1f", usedPercent),
				"last_upload":   usage.LastUpload,
			},
		},
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Usage — GET /api/v1/license/cloud-backup/usage
//
//	Headers : X-License-Key
//
// Returns CloudStorageUsage for this license; creates free tier if not exists.
// ─────────────────────────────────────────────────────────────────────────────

func (h *CloudBackupHandler) Usage(c *fiber.Ctx) error {
	license, err := h.authenticateLicense(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"success": false,
			"message": err.Error(),
		})
	}

	usage, err := h.getOrCreateUsage(license.ID)
	if err != nil {
		log.Printf("CloudBackup Usage: error for license %d: %v", license.ID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to retrieve storage usage",
		})
	}

	usedPercent := float64(0)
	if usage.QuotaBytes > 0 {
		usedPercent = float64(usage.TotalUsedBytes) / float64(usage.QuotaBytes) * 100
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"license_id":    usage.LicenseID,
			"used_bytes":    usage.TotalUsedBytes,
			"quota_bytes":   usage.QuotaBytes,
			"tier":          usage.Tier,
			"backup_count":  usage.BackupCount,
			"usage_percent": fmt.Sprintf("%.1f", usedPercent),
			"last_upload":   usage.LastUpload,
		},
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Download — GET /api/v1/license/cloud-backup/download/:backup_id
//
//	Headers : X-License-Key
//
// Validates ownership, increments download counter, streams file to client.
// ─────────────────────────────────────────────────────────────────────────────

func (h *CloudBackupHandler) Download(c *fiber.Ctx) error {
	license, err := h.authenticateLicense(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"success": false,
			"message": err.Error(),
		})
	}

	backupID := c.Params("backup_id")
	if backupID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "backup_id is required",
		})
	}

	var backup models.CloudBackup
	if err := database.DB.
		Where("backup_id = ? AND license_id = ? AND status = ?", backupID, license.ID, "active").
		First(&backup).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Backup not found or does not belong to this license",
		})
	}

	// Check that the file still exists on disk.
	if _, err := os.Stat(backup.FilePath); os.IsNotExist(err) {
		log.Printf("CloudBackup Download: file missing on disk for backup_id=%s path=%s", backupID, backup.FilePath)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Backup file not found on storage — please contact support",
		})
	}

	// Increment download counter and update last_downloaded.
	if err := database.DB.Exec(`
		UPDATE cloud_backups
		SET download_count  = download_count + 1,
		    last_downloaded = NOW()
		WHERE backup_id = ?
	`, backupID).Error; err != nil {
		// Non-fatal.
		log.Printf("CloudBackup Download: failed to update download count for backup_id=%s: %v", backupID, err)
	}

	// Log download event.
	log.Printf("CloudBackup Download: license %d downloading backup_id=%s filename=%s ip=%s",
		license.ID, backupID, backup.Filename, c.IP())

	// Set download headers and stream file.
	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, sanitizeFilename(backup.Filename)))
	c.Set("Content-Type", "application/octet-stream")

	return c.SendFile(backup.FilePath)
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete — DELETE /api/v1/license/cloud-backup/:backup_id
//
//	Headers : X-License-Key
//
// Validates ownership, deletes file from disk, marks record deleted,
// decrements CloudStorageUsage.
// ─────────────────────────────────────────────────────────────────────────────

func (h *CloudBackupHandler) Delete(c *fiber.Ctx) error {
	license, err := h.authenticateLicense(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"success": false,
			"message": err.Error(),
		})
	}

	backupID := c.Params("backup_id")
	if backupID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "backup_id is required",
		})
	}

	var backup models.CloudBackup
	if err := database.DB.
		Where("backup_id = ? AND license_id = ? AND status = ?", backupID, license.ID, "active").
		First(&backup).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Backup not found or does not belong to this license",
		})
	}

	// Delete file from disk (best-effort; continue even if missing).
	fileSize := backup.SizeBytes
	if err := os.Remove(backup.FilePath); err != nil && !os.IsNotExist(err) {
		log.Printf("CloudBackup Delete: failed to remove file %s: %v", backup.FilePath, err)
	}

	// Mark record as deleted.
	if err := database.DB.Exec(`
		UPDATE cloud_backups
		SET status     = 'deleted',
		    updated_at = NOW()
		WHERE backup_id = ?
	`, backupID).Error; err != nil {
		log.Printf("CloudBackup Delete: failed to update DB record for backup_id=%s: %v", backupID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to mark backup as deleted",
		})
	}

	// Decrement storage usage (guard against going negative).
	if err := database.DB.Exec(`
		UPDATE cloud_storage_usage
		SET total_used_bytes = GREATEST(total_used_bytes - ?, 0),
		    backup_count     = GREATEST(backup_count - 1, 0),
		    updated_at       = NOW()
		WHERE license_id = ?
	`, fileSize, license.ID).Error; err != nil {
		log.Printf("CloudBackup Delete: failed to decrement usage for license %d: %v", license.ID, err)
	}

	log.Printf("CloudBackup Delete: license %d deleted backup_id=%s filename=%s",
		license.ID, backupID, backup.Filename)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Backup deleted successfully",
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// AdminList — GET /api/v1/admin/cloud-backups
//
//	Auth    : JWT (handled by adminProtected middleware)
//	Query   : ?page=1&limit=20
//
// Lists all cloud backups across all licenses with license info.
// ─────────────────────────────────────────────────────────────────────────────

func (h *CloudBackupHandler) AdminList(c *fiber.Ctx) error {
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "20"))

	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 200 {
		limit = 20
	}
	offset := (page - 1) * limit

	var backups []models.CloudBackup
	var total int64

	query := database.DB.Model(&models.CloudBackup{}).
		Where("status != ?", "deleted")

	if err := query.Count(&total).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to count backups",
		})
	}

	if err := query.
		Preload("License").
		Order("created_at DESC").
		Offset(offset).
		Limit(limit).
		Find(&backups).Error; err != nil {
		log.Printf("CloudBackup AdminList: DB error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to retrieve backup list",
		})
	}

	// Build enriched response.
	type adminBackupItem struct {
		ID            uint       `json:"id"`
		BackupID      string     `json:"backup_id"`
		LicenseID     uint       `json:"license_id"`
		LicenseKey    string     `json:"license_key"`
		Filename      string     `json:"filename"`
		SizeBytes     int64      `json:"size_bytes"`
		Status        string     `json:"status"`
		DownloadCount int        `json:"download_count"`
		CreatedAt     time.Time  `json:"created_at"`
		ExpiresAt     *time.Time `json:"expires_at"`
		LastDownload  *time.Time `json:"last_downloaded"`
	}

	items := make([]adminBackupItem, 0, len(backups))
	for _, b := range backups {
		lk := ""
		if b.License != nil {
			lk = b.License.LicenseKey
		}
		items = append(items, adminBackupItem{
			ID:            b.ID,
			BackupID:      b.BackupID,
			LicenseID:     b.LicenseID,
			LicenseKey:    lk,
			Filename:      b.Filename,
			SizeBytes:     b.SizeBytes,
			Status:        b.Status,
			DownloadCount: b.DownloadCount,
			CreatedAt:     b.CreatedAt,
			ExpiresAt:     b.ExpiresAt,
			LastDownload:  b.LastDownloaded,
		})
	}

	totalPages := int(total) / limit
	if int(total)%limit != 0 {
		totalPages++
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"backups":     items,
			"total":       total,
			"page":        page,
			"limit":       limit,
			"total_pages": totalPages,
		},
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// AdminDelete — DELETE /api/v1/admin/cloud-backups/:id
//
//	Auth    : JWT (handled by adminProtected middleware)
//
// Hard-deletes a backup by its primary key (DB id).
// ─────────────────────────────────────────────────────────────────────────────

func (h *CloudBackupHandler) AdminDelete(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "id is required",
		})
	}

	var backup models.CloudBackup
	if err := database.DB.First(&backup, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Backup not found",
		})
	}

	fileSize := backup.SizeBytes
	licenseID := backup.LicenseID

	// Remove from disk.
	if err := os.Remove(backup.FilePath); err != nil && !os.IsNotExist(err) {
		log.Printf("CloudBackup AdminDelete: failed to remove file %s: %v", backup.FilePath, err)
	}

	// Hard-delete the DB record.
	if err := database.DB.Delete(&models.CloudBackup{}, id).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to delete backup record",
		})
	}

	// Decrement storage usage.
	if err := database.DB.Exec(`
		UPDATE cloud_storage_usage
		SET total_used_bytes = GREATEST(total_used_bytes - ?, 0),
		    backup_count     = GREATEST(backup_count - 1, 0),
		    updated_at       = NOW()
		WHERE license_id = ?
	`, fileSize, licenseID).Error; err != nil {
		log.Printf("CloudBackup AdminDelete: usage decrement failed for license %d: %v", licenseID, err)
	}

	log.Printf("CloudBackup AdminDelete: admin deleted backup id=%s filename=%s license=%d",
		id, backup.Filename, licenseID)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Backup deleted successfully",
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// AdminSetTier — PUT /api/v1/admin/licenses/:id/cloud-tier
//
//	Auth    : JWT (handled by adminProtected middleware)
//	Body    : { "tier": "free|basic|pro|enterprise" }
//
// Updates the cloud storage tier and quota for a specific license.
// ─────────────────────────────────────────────────────────────────────────────

func (h *CloudBackupHandler) AdminSetTier(c *fiber.Ctx) error {
	licenseID := c.Params("id")
	if licenseID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "license id is required",
		})
	}

	var req struct {
		Tier string `json:"tier"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
		})
	}

	// Map tier name to quota bytes.
	quotaMap := map[string]int64{
		"free":       int64(524288000),    // 500 MB
		"basic":      int64(5368709120),   // 5 GB
		"pro":        int64(21474836480),  // 20 GB
		"enterprise": int64(107374182400), // 100 GB
	}

	quota, ok := quotaMap[req.Tier]
	if !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid tier — must be one of: free, basic, pro, enterprise",
		})
	}

	// Verify the license exists.
	var license models.License
	if err := database.DB.First(&license, licenseID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "License not found",
		})
	}

	// Upsert — update if exists, insert if not.
	var usage models.CloudStorageUsage
	result := database.DB.Where("license_id = ?", license.ID).First(&usage)

	if result.Error != nil {
		// Create new record.
		now := time.Now()
		usage = models.CloudStorageUsage{
			LicenseID:      license.ID,
			TotalUsedBytes: 0,
			QuotaBytes:     quota,
			Tier:           req.Tier,
			BackupCount:    0,
			CreatedAt:      now,
			UpdatedAt:      now,
		}
		if err := database.DB.Create(&usage).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"success": false,
				"message": "Failed to create storage record",
			})
		}
	} else {
		// Update existing.
		if err := database.DB.Model(&usage).
			Updates(map[string]interface{}{
				"tier":        req.Tier,
				"quota_bytes": quota,
				"updated_at":  time.Now(),
			}).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"success": false,
				"message": "Failed to update storage tier",
			})
		}
	}

	log.Printf("CloudBackup AdminSetTier: license %d tier set to %s (quota: %d bytes)", license.ID, req.Tier, quota)

	return c.JSON(fiber.Map{
		"success": true,
		"message": fmt.Sprintf("Cloud storage tier updated to %s", req.Tier),
		"data": fiber.Map{
			"license_id":  license.ID,
			"tier":        req.Tier,
			"quota_bytes": quota,
			"quota_mb":    quota / (1024 * 1024),
		},
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// sanitizeFilename removes any directory components from a filename to prevent
// path traversal when setting Content-Disposition headers.
// ─────────────────────────────────────────────────────────────────────────────

func sanitizeFilename(name string) string {
	return filepath.Base(name)
}

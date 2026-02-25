package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/proxpanel/license-server/internal/database"
	"github.com/proxpanel/license-server/internal/models"
	"gorm.io/gorm"
)

const (
	// defaultQuotaBytes is 500 MB in bytes.
	defaultQuotaBytes int64 = 524288000
	// maxUploadBytes is 1 GB in bytes — uploads larger than this are rejected immediately.
	maxUploadBytes int64 = 1073741824
)

// CloudBackupHandler handles cloud backup storage for ProxPanel customers.
// Files are stored at {storageDir}/{license_id}/{backup_id}.bak
type CloudBackupHandler struct {
	storageDir string
}

// NewCloudBackupHandler constructs a CloudBackupHandler.
// The storage directory is read from CLOUD_BACKUP_STORAGE_DIR env var
// and defaults to /opt/proxpanel-license/cloud-backups.
func NewCloudBackupHandler() *CloudBackupHandler {
	storageDir := os.Getenv("CLOUD_BACKUP_STORAGE_DIR")
	if storageDir == "" {
		storageDir = "/opt/proxpanel-license/cloud-backups"
	}
	if err := os.MkdirAll(storageDir, 0750); err != nil {
		log.Printf("CloudBackup: WARNING: could not create storage dir %s: %v", storageDir, err)
	}
	return &CloudBackupHandler{storageDir: storageDir}
}

// ──────────────────────────────────────────────────────────────────────────────
// Public handler methods
// ──────────────────────────────────────────────────────────────────────────────

// Upload handles POST /api/v1/cloud-backup/upload
//
// Expected headers:
//
//	X-License-Key  – customer license key
//	X-Filename     – original filename for the backup
//	Content-Length – file size (used for quota pre-check)
//
// The raw request body is the backup file bytes.
func (h *CloudBackupHandler) Upload(c *fiber.Ctx) error {
	license, err := h.getLicenseByKey(c.Get("X-License-Key"))
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"success": false,
			"message": "Invalid or missing license key",
		})
	}

	filename := c.Get("X-Filename")
	if filename == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Missing X-Filename header",
		})
	}
	// Sanitise filename to a basename — prevent any path traversal.
	filename = filepath.Base(filename)
	if filename == "." || filename == "/" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid filename",
		})
	}

	// Reject oversized uploads early using Content-Length before reading the body.
	contentLengthStr := c.Get("Content-Length")
	if contentLengthStr != "" {
		if declaredSize, convErr := strconv.ParseInt(contentLengthStr, 10, 64); convErr == nil {
			if declaredSize > maxUploadBytes {
				return c.Status(fiber.StatusRequestEntityTooLarge).JSON(fiber.Map{
					"success": false,
					"message": fmt.Sprintf("File too large. Maximum allowed size is %d MB", maxUploadBytes/1024/1024),
				})
			}
		}
	}

	// Read the raw request body.
	body := c.Request().Body()
	fileSize := int64(len(body))

	if fileSize == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Upload body is empty",
		})
	}
	if fileSize > maxUploadBytes {
		return c.Status(fiber.StatusRequestEntityTooLarge).JSON(fiber.Map{
			"success": false,
			"message": fmt.Sprintf("File too large. Maximum allowed size is %d MB", maxUploadBytes/1024/1024),
		})
	}

	// Check storage quota.
	usage, err := h.getOrCreateUsage(license.ID)
	if err != nil {
		log.Printf("CloudBackup: Upload: failed to get usage for license %d: %v", license.ID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to check storage quota",
		})
	}

	if usage.TotalUsedBytes+fileSize > usage.QuotaBytes {
		usedMB := usage.TotalUsedBytes / 1024 / 1024
		quotaMB := usage.QuotaBytes / 1024 / 1024
		return c.Status(fiber.StatusPaymentRequired).JSON(fiber.Map{
			"success": false,
			"message": fmt.Sprintf("Storage quota exceeded. %d MB used of %d MB", usedMB, quotaMB),
		})
	}

	// Generate a unique backup_id.
	backupID, err := generateBackupID()
	if err != nil {
		log.Printf("CloudBackup: Upload: failed to generate backup_id: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to generate backup identifier",
		})
	}

	// Create the per-license directory.
	licenseDir := filepath.Join(h.storageDir, fmt.Sprintf("%d", license.ID))
	if err := os.MkdirAll(licenseDir, 0750); err != nil {
		log.Printf("CloudBackup: Upload: failed to create directory %s: %v", licenseDir, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to create storage directory",
		})
	}

	// Write the file.
	filePath := filepath.Join(licenseDir, backupID+".bak")
	if err := os.WriteFile(filePath, body, 0640); err != nil {
		log.Printf("CloudBackup: Upload: failed to write file %s: %v", filePath, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to write backup file",
		})
	}

	// Persist the backup record.
	// EncryptionKeyEncrypted is required (NOT NULL) by the live DB schema.
	// Backups are already encrypted by the customer before upload; we store a
	// placeholder value here to satisfy the constraint.
	backup := models.CloudBackup{
		LicenseID:              license.ID,
		BackupID:               backupID,
		Filename:               filename,
		FilePath:               filePath,
		EncryptionKeyEncrypted: "client-side-encrypted",
		SizeBytes:              fileSize,
		Status:                 "active",
	}
	if err := database.DB.Create(&backup).Error; err != nil {
		// Clean up the file if DB insert fails.
		_ = os.Remove(filePath)
		log.Printf("CloudBackup: Upload: failed to insert record for license %d: %v", license.ID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to save backup metadata",
		})
	}

	// Update storage usage.
	now := time.Now()
	if err := database.DB.Model(usage).Updates(map[string]interface{}{
		"total_used_bytes": gorm.Expr("total_used_bytes + ?", fileSize),
		"backup_count":     gorm.Expr("backup_count + 1"),
		"last_upload":      now,
		"updated_at":       now,
	}).Error; err != nil {
		log.Printf("CloudBackup: Upload: failed to update usage for license %d: %v", license.ID, err)
		// Non-fatal — backup was saved; usage counters can be resynced later.
	}

	log.Printf("CloudBackup: Upload: license %d uploaded %q (%d bytes), backup_id=%s",
		license.ID, filename, fileSize, backupID)

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"success":    true,
		"backup_id":  backupID,
		"filename":   filename,
		"size_bytes": fileSize,
	})
}

// List handles GET /api/v1/cloud-backup/list
func (h *CloudBackupHandler) List(c *fiber.Ctx) error {
	license, err := h.getLicenseByKey(c.Get("X-License-Key"))
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"success": false,
			"message": "Invalid or missing license key",
		})
	}

	var backups []models.CloudBackup
	if err := database.DB.
		Where("license_id = ? AND status = 'active'", license.ID).
		Order("created_at DESC").
		Find(&backups).Error; err != nil {
		log.Printf("CloudBackup: List: failed to query backups for license %d: %v", license.ID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to retrieve backup list",
		})
	}

	usage, err := h.getOrCreateUsage(license.ID)
	if err != nil {
		log.Printf("CloudBackup: List: failed to get usage for license %d: %v", license.ID, err)
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
		"backups": backups,
		"usage": fiber.Map{
			"used_bytes":   usage.TotalUsedBytes,
			"quota_bytes":  usage.QuotaBytes,
			"backup_count": usage.BackupCount,
			"used_percent": usedPercent,
		},
	})
}

// Download handles GET /api/v1/cloud-backup/download/:backup_id
func (h *CloudBackupHandler) Download(c *fiber.Ctx) error {
	license, err := h.getLicenseByKey(c.Get("X-License-Key"))
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"success": false,
			"message": "Invalid or missing license key",
		})
	}

	backupID := c.Params("backup_id")
	if backupID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Missing backup_id parameter",
		})
	}

	var backup models.CloudBackup
	if err := database.DB.
		Where("backup_id = ? AND license_id = ? AND status = 'active'", backupID, license.ID).
		First(&backup).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Backup not found",
		})
	}

	// Verify the file still exists on disk.
	if _, statErr := os.Stat(backup.FilePath); os.IsNotExist(statErr) {
		log.Printf("CloudBackup: Download: file missing on disk for backup_id=%s license=%d path=%s",
			backupID, license.ID, backup.FilePath)
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Backup file not found on storage",
		})
	}

	// Record download audit entry.
	downloadRecord := models.CloudBackupDownload{
		BackupID:           backupID,
		LicenseID:          license.ID,
		DownloadedByIP:     c.IP(),
		DownloadedByUser:   license.LicenseKey,
		DownloadedAt:       time.Now(),
		Success:            true,
	}
	if err := database.DB.Create(&downloadRecord).Error; err != nil {
		log.Printf("CloudBackup: Download: failed to create audit record for backup_id=%s: %v", backupID, err)
		// Non-fatal.
	}

	// Increment download_count and update last_downloaded.
	now := time.Now()
	if err := database.DB.Model(&backup).Updates(map[string]interface{}{
		"download_count":  gorm.Expr("download_count + 1"),
		"last_downloaded": now,
	}).Error; err != nil {
		log.Printf("CloudBackup: Download: failed to update download stats for backup_id=%s: %v", backupID, err)
		// Non-fatal.
	}

	log.Printf("CloudBackup: Download: license %d downloading backup_id=%s filename=%q",
		license.ID, backupID, backup.Filename)

	// Set Content-Disposition so the browser saves the file with the original name.
	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, backup.Filename))
	return c.SendFile(backup.FilePath)
}

// Delete handles DELETE /api/v1/cloud-backup/:backup_id
func (h *CloudBackupHandler) Delete(c *fiber.Ctx) error {
	license, err := h.getLicenseByKey(c.Get("X-License-Key"))
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"success": false,
			"message": "Invalid or missing license key",
		})
	}

	backupID := c.Params("backup_id")
	if backupID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Missing backup_id parameter",
		})
	}

	var backup models.CloudBackup
	if err := database.DB.
		Where("backup_id = ? AND license_id = ? AND status = 'active'", backupID, license.ID).
		First(&backup).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Backup not found",
		})
	}

	fileSize := backup.SizeBytes

	// Remove from disk (best-effort — mark deleted in DB regardless).
	if err := os.Remove(backup.FilePath); err != nil && !os.IsNotExist(err) {
		log.Printf("CloudBackup: Delete: failed to remove file %s: %v", backup.FilePath, err)
		// Continue — still mark as deleted in DB so quota is freed.
	}

	// Soft-delete: mark status = 'deleted'.
	now := time.Now()
	if err := database.DB.Model(&backup).Updates(map[string]interface{}{
		"status":     "deleted",
		"updated_at": now,
	}).Error; err != nil {
		log.Printf("CloudBackup: Delete: failed to mark backup deleted (backup_id=%s): %v", backupID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to delete backup record",
		})
	}

	// Decrement usage counters.
	if err := database.DB.
		Model(&models.CloudStorageUsage{}).
		Where("license_id = ?", license.ID).
		Updates(map[string]interface{}{
			"total_used_bytes": gorm.Expr("GREATEST(total_used_bytes - ?, 0)", fileSize),
			"backup_count":     gorm.Expr("GREATEST(backup_count - 1, 0)"),
			"updated_at":       now,
		}).Error; err != nil {
		log.Printf("CloudBackup: Delete: failed to update usage for license %d: %v", license.ID, err)
		// Non-fatal.
	}

	log.Printf("CloudBackup: Delete: license %d deleted backup_id=%s filename=%q (%d bytes freed)",
		license.ID, backupID, backup.Filename, fileSize)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Backup deleted",
	})
}

// Usage handles GET /api/v1/cloud-backup/usage
func (h *CloudBackupHandler) Usage(c *fiber.Ctx) error {
	license, err := h.getLicenseByKey(c.Get("X-License-Key"))
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"success": false,
			"message": "Invalid or missing license key",
		})
	}

	usage, err := h.getOrCreateUsage(license.ID)
	if err != nil {
		log.Printf("CloudBackup: Usage: failed to get usage for license %d: %v", license.ID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to retrieve storage usage",
		})
	}

	usedPercent := float64(0)
	if usage.QuotaBytes > 0 {
		usedPercent = float64(usage.TotalUsedBytes) / float64(usage.QuotaBytes) * 100
	}

	freeMB := (usage.QuotaBytes - usage.TotalUsedBytes) / 1024 / 1024
	if freeMB < 0 {
		freeMB = 0
	}

	return c.JSON(fiber.Map{
		"success": true,
		"usage": fiber.Map{
			"used_bytes":   usage.TotalUsedBytes,
			"quota_bytes":  usage.QuotaBytes,
			"free_bytes":   usage.QuotaBytes - usage.TotalUsedBytes,
			"free_mb":      freeMB,
			"used_mb":      usage.TotalUsedBytes / 1024 / 1024,
			"quota_mb":     usage.QuotaBytes / 1024 / 1024,
			"backup_count": usage.BackupCount,
			"used_percent": usedPercent,
			"tier":         usage.Tier,
			"last_upload":  usage.LastUpload,
		},
	})
}

// ──────────────────────────────────────────────────────────────────────────────
// Admin handlers — these are typically protected by admin JWT middleware
// ──────────────────────────────────────────────────────────────────────────────

// AdminListBackups handles GET /api/v1/admin/cloud-backup/:license_id
// Returns all backups for a specific license (admin view).
func (h *CloudBackupHandler) AdminListBackups(c *fiber.Ctx) error {
	licenseIDStr := c.Params("license_id")
	if licenseIDStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Missing license_id parameter",
		})
	}

	var license models.License
	if err := database.DB.First(&license, licenseIDStr).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "License not found",
		})
	}

	var backups []models.CloudBackup
	if err := database.DB.
		Where("license_id = ?", license.ID).
		Order("created_at DESC").
		Find(&backups).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to retrieve backup list",
		})
	}

	usage, _ := h.getOrCreateUsage(license.ID)

	return c.JSON(fiber.Map{
		"success": true,
		"backups": backups,
		"usage":   usage,
	})
}

// AdminSetQuota handles POST /api/v1/admin/cloud-backup/:license_id/quota
// Allows an admin to change the storage quota for a specific license.
//
// Body: { "quota_mb": 1024 }
func (h *CloudBackupHandler) AdminSetQuota(c *fiber.Ctx) error {
	licenseIDStr := c.Params("license_id")
	if licenseIDStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Missing license_id parameter",
		})
	}

	var license models.License
	if err := database.DB.First(&license, licenseIDStr).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "License not found",
		})
	}

	var req struct {
		QuotaMB int64 `json:"quota_mb"`
	}
	if err := c.BodyParser(&req); err != nil || req.QuotaMB <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body — quota_mb must be a positive integer",
		})
	}

	quotaBytes := req.QuotaMB * 1024 * 1024
	usage, err := h.getOrCreateUsage(license.ID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to retrieve storage usage record",
		})
	}

	if err := database.DB.Model(usage).Updates(map[string]interface{}{
		"quota_bytes": quotaBytes,
		"updated_at":  time.Now(),
	}).Error; err != nil {
		log.Printf("CloudBackup: AdminSetQuota: failed to update quota for license %d: %v", license.ID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to update quota",
		})
	}

	log.Printf("CloudBackup: AdminSetQuota: license %d quota set to %d MB", license.ID, req.QuotaMB)

	return c.JSON(fiber.Map{
		"success":     true,
		"message":     fmt.Sprintf("Quota updated to %d MB", req.QuotaMB),
		"quota_bytes": quotaBytes,
	})
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

// getLicenseByKey looks up a license by its license key.
// Returns an error if the key is empty, not found, or the license is inactive.
func (h *CloudBackupHandler) getLicenseByKey(licenseKey string) (*models.License, error) {
	if licenseKey == "" {
		return nil, fmt.Errorf("empty license key")
	}

	var license models.License
	if err := database.DB.
		Where("license_key = ? AND status = 'active'", licenseKey).
		First(&license).Error; err != nil {
		return nil, fmt.Errorf("license not found or inactive: %w", err)
	}
	return &license, nil
}

// getOrCreateUsage returns the CloudStorageUsage record for the given license,
// creating one with default quota (500 MB) if it does not exist yet.
func (h *CloudBackupHandler) getOrCreateUsage(licenseID uint) (*models.CloudStorageUsage, error) {
	var usage models.CloudStorageUsage
	err := database.DB.Where("license_id = ?", licenseID).First(&usage).Error

	if err == nil {
		// Record already exists.
		return &usage, nil
	}

	// Any error other than "record not found" is unexpected.
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, fmt.Errorf("failed to query storage usage: %w", err)
	}

	// Create a new record with defaults.
	usage = models.CloudStorageUsage{
		LicenseID:      licenseID,
		TotalUsedBytes: 0,
		QuotaBytes:     defaultQuotaBytes,
		BackupCount:    0,
	}
	if createErr := database.DB.Create(&usage).Error; createErr != nil {
		// If creation fails due to a concurrent insert (race condition), try to
		// fetch again — whichever goroutine won the race already created it.
		var existing models.CloudStorageUsage
		if retryErr := database.DB.Where("license_id = ?", licenseID).First(&existing).Error; retryErr == nil {
			return &existing, nil
		}
		return nil, fmt.Errorf("failed to create storage usage record: %w", createErr)
	}

	log.Printf("CloudBackup: getOrCreateUsage: created storage usage record for license %d (quota: %d MB)",
		licenseID, defaultQuotaBytes/1024/1024)
	return &usage, nil
}

// generateBackupID produces a cryptographically random 32-character hex string
// (16 random bytes encoded as hex) suitable for use as a backup_id.
func generateBackupID() (string, error) {
	b := make([]byte, 16)
	if _, err := io.ReadFull(rand.Reader, b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

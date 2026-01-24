package handlers

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/proisp/backend/internal/config"
	"github.com/proisp/backend/internal/database"
	"github.com/proisp/backend/internal/middleware"
	"github.com/proisp/backend/internal/models"
)

type BackupHandler struct {
	backupDir string
	cfg       *config.Config
}

func NewBackupHandler(cfg *config.Config) *BackupHandler {
	backupDir := "/var/backups/proisp"
	os.MkdirAll(backupDir, 0755)
	return &BackupHandler{
		backupDir: backupDir,
		cfg:       cfg,
	}
}

// BackupInfo represents a backup file info
type BackupInfo struct {
	ID        string    `json:"id"`
	Filename  string    `json:"filename"`
	Size      int64     `json:"size"`
	CreatedAt time.Time `json:"created_at"`
	Type      string    `json:"type"`
}

// List returns all backups
func (h *BackupHandler) List(c *fiber.Ctx) error {
	files, err := os.ReadDir(h.backupDir)
	if err != nil {
		return c.JSON(fiber.Map{
			"success": true,
			"data":    []BackupInfo{},
		})
	}

	backups := []BackupInfo{}
	for i, file := range files {
		if file.IsDir() {
			continue
		}

		info, err := file.Info()
		if err != nil {
			continue
		}

		backupType := "full"
		if strings.Contains(file.Name(), "_config") {
			backupType = "config"
		} else if strings.Contains(file.Name(), "_data") {
			backupType = "data"
		}

		backups = append(backups, BackupInfo{
			ID:        strconv.Itoa(i + 1),
			Filename:  file.Name(),
			Size:      info.Size(),
			CreatedAt: info.ModTime(),
			Type:      backupType,
		})
	}

	// Sort by date descending
	for i := 0; i < len(backups)-1; i++ {
		for j := i + 1; j < len(backups); j++ {
			if backups[i].CreatedAt.Before(backups[j].CreatedAt) {
				backups[i], backups[j] = backups[j], backups[i]
			}
		}
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    backups,
	})
}

// CreateBackupRequest represents create backup request
type CreateBackupRequest struct {
	Type        string `json:"type"` // full, data, config
	Description string `json:"description"`
}

// Create creates a new backup
func (h *BackupHandler) Create(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
	}

	var req CreateBackupRequest
	if err := c.BodyParser(&req); err != nil {
		req.Type = "full"
	}

	if req.Type == "" {
		req.Type = "full"
	}

	timestamp := time.Now().Format("20060102_150405")
	filename := fmt.Sprintf("proisp_%s_%s.sql", req.Type, timestamp)
	filepath := filepath.Join(h.backupDir, filename)

	// Build pg_dump command
	cmd := exec.Command("pg_dump",
		"-h", h.cfg.DBHost,
		"-p", strconv.Itoa(h.cfg.DBPort),
		"-U", h.cfg.DBUser,
		"-d", h.cfg.DBName,
		"-f", filepath,
		"--no-owner",
		"--no-acl",
	)
	cmd.Env = append(os.Environ(), fmt.Sprintf("PGPASSWORD=%s", h.cfg.DBPassword))

	// Add table filters based on type
	if req.Type == "data" {
		// Only data tables (exclude settings, permissions)
		cmd.Args = append(cmd.Args,
			"--table=subscribers",
			"--table=services",
			"--table=nas",
			"--table=resellers",
			"--table=transactions",
			"--table=invoices",
			"--table=prepaid_cards",
			"--table=sessions",
			"--table=radcheck",
			"--table=radreply",
			"--table=radacct",
		)
	} else if req.Type == "config" {
		// Only config tables
		cmd.Args = append(cmd.Args,
			"--table=users",
			"--table=settings",
			"--table=permissions",
			"--table=permission_groups",
			"--table=communication_templates",
			"--table=communication_rules",
			"--table=bandwidth_rules",
		)
	}

	output, err := cmd.CombinedOutput()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": fmt.Sprintf("Failed to create backup: %s", string(output)),
		})
	}

	// Get file info
	info, _ := os.Stat(filepath)

	// Create audit log
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionCreate,
		EntityType:  "backup",
		EntityName:  filename,
		Description: fmt.Sprintf("Created %s backup", req.Type),
		IPAddress:   c.IP(),
		UserAgent:   c.Get("User-Agent"),
	}
	database.DB.Create(&auditLog)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Backup created successfully",
		"data": BackupInfo{
			ID:        filename,
			Filename:  filename,
			Size:      info.Size(),
			CreatedAt: info.ModTime(),
			Type:      req.Type,
		},
	})
}

// Download downloads a backup file
func (h *BackupHandler) Download(c *fiber.Ctx) error {
	filename := c.Params("filename")
	if filename == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Filename is required",
		})
	}

	// Sanitize filename to prevent path traversal
	filename = filepath.Base(filename)
	filePath := filepath.Join(h.backupDir, filename)

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Backup not found",
		})
	}

	return c.Download(filePath, filename)
}

// Restore restores from a backup
func (h *BackupHandler) Restore(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
	}

	filename := c.Params("filename")
	if filename == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Filename is required",
		})
	}

	// Sanitize filename
	filename = filepath.Base(filename)
	filePath := filepath.Join(h.backupDir, filename)

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Backup not found",
		})
	}

	// Run psql to restore
	cmd := exec.Command("psql",
		"-h", h.cfg.DBHost,
		"-p", strconv.Itoa(h.cfg.DBPort),
		"-U", h.cfg.DBUser,
		"-d", h.cfg.DBName,
		"-f", filePath,
	)
	cmd.Env = append(os.Environ(), fmt.Sprintf("PGPASSWORD=%s", h.cfg.DBPassword))

	output, err := cmd.CombinedOutput()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": fmt.Sprintf("Failed to restore backup: %s", string(output)),
		})
	}

	// Create audit log
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionUpdate,
		EntityType:  "backup",
		EntityName:  filename,
		Description: "Restored from backup",
		IPAddress:   c.IP(),
		UserAgent:   c.Get("User-Agent"),
	}
	database.DB.Create(&auditLog)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Backup restored successfully",
	})
}

// Delete deletes a backup file
func (h *BackupHandler) Delete(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
	}

	filename := c.Params("filename")
	if filename == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Filename is required",
		})
	}

	// Sanitize filename
	filename = filepath.Base(filename)
	filePath := filepath.Join(h.backupDir, filename)

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Backup not found",
		})
	}

	if err := os.Remove(filePath); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to delete backup",
		})
	}

	// Create audit log
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionDelete,
		EntityType:  "backup",
		EntityName:  filename,
		Description: "Deleted backup",
		IPAddress:   c.IP(),
		UserAgent:   c.Get("User-Agent"),
	}
	database.DB.Create(&auditLog)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Backup deleted successfully",
	})
}

// Upload uploads a backup file
func (h *BackupHandler) Upload(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
	}

	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "No file uploaded",
		})
	}

	// Validate file extension
	if !strings.HasSuffix(file.Filename, ".sql") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Only .sql files are allowed",
		})
	}

	// Sanitize filename
	filename := filepath.Base(file.Filename)
	destPath := filepath.Join(h.backupDir, filename)

	// Open source file
	src, err := file.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to open uploaded file",
		})
	}
	defer src.Close()

	// Create destination file
	dst, err := os.Create(destPath)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to save file",
		})
	}
	defer dst.Close()

	// Copy content
	if _, err := io.Copy(dst, src); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to save file",
		})
	}

	// Create audit log
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionCreate,
		EntityType:  "backup",
		EntityName:  filename,
		Description: "Uploaded backup file",
		IPAddress:   c.IP(),
		UserAgent:   c.Get("User-Agent"),
	}
	database.DB.Create(&auditLog)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Backup uploaded successfully",
		"data": fiber.Map{
			"filename": filename,
		},
	})
}

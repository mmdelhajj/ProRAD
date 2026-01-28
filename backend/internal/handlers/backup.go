package handlers

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/proisp/backend/internal/config"
	"github.com/proisp/backend/internal/database"
	"github.com/proisp/backend/internal/middleware"
	"github.com/proisp/backend/internal/models"
	"github.com/proisp/backend/internal/services"
)

// Download tokens for secure file downloads
var (
	downloadTokens     = make(map[string]downloadTokenInfo)
	downloadTokenMutex sync.RWMutex
)

type downloadTokenInfo struct {
	Filename  string
	ExpiresAt time.Time
	UserID    uint
}

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
	Encrypted bool      `json:"encrypted"`
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

		// Only show .proisp.bak files (encrypted backups) and legacy .sql files
		if !strings.HasSuffix(file.Name(), ".proisp.bak") && !strings.HasSuffix(file.Name(), ".sql") {
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

		// Mark encrypted backups
		encrypted := strings.HasSuffix(file.Name(), ".proisp.bak")

		backups = append(backups, BackupInfo{
			ID:        strconv.Itoa(i + 1),
			Filename:  file.Name(),
			Size:      info.Size(),
			CreatedAt: info.ModTime(),
			Type:      backupType,
			Encrypted: encrypted,
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

// Create creates a new encrypted backup
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
	// Create temp file for pg_dump output (custom format)
	tempFile := filepath.Join(h.backupDir, fmt.Sprintf(".temp_%s_%s.dump", req.Type, timestamp))
	// Final encrypted backup file
	filename := fmt.Sprintf("proisp_%s_%s.proisp.bak", req.Type, timestamp)
	finalPath := filepath.Join(h.backupDir, filename)

	// Build pg_dump command with custom format (-Fc for compressed binary)
	cmd := exec.Command("pg_dump",
		"-h", h.cfg.DBHost,
		"-p", strconv.Itoa(h.cfg.DBPort),
		"-U", h.cfg.DBUser,
		"-d", h.cfg.DBName,
		"-Fc", // Custom format (compressed, binary)
		"-f", tempFile,
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
		os.Remove(tempFile) // Clean up temp file
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": fmt.Sprintf("Failed to create backup: %s", string(output)),
		})
	}

	// Encrypt the backup file
	if err := h.encryptBackup(tempFile, finalPath); err != nil {
		os.Remove(tempFile)
		os.Remove(finalPath)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": fmt.Sprintf("Failed to encrypt backup: %v", err),
		})
	}

	// Remove temp file
	os.Remove(tempFile)

	// Get file info
	info, _ := os.Stat(finalPath)

	// Create audit log
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionCreate,
		EntityType:  "backup",
		EntityName:  filename,
		Description: fmt.Sprintf("Created encrypted %s backup", req.Type),
		IPAddress:   c.IP(),
		UserAgent:   c.Get("User-Agent"),
	}
	database.DB.Create(&auditLog)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Encrypted backup created successfully",
		"data": BackupInfo{
			ID:        filename,
			Filename:  filename,
			Size:      info.Size(),
			CreatedAt: info.ModTime(),
			Type:      req.Type,
			Encrypted: true,
		},
	})
}

// deriveEncryptionKey derives a 32-byte AES-256 key from the license key
func (h *BackupHandler) deriveEncryptionKey() []byte {
	// Use database password + fixed salt to derive encryption key
	// This must match backup_scheduler.go's deriveEncryptionKey() exactly
	salt := "ProxPanel-Backup-Encryption-2024"
	combined := h.cfg.DBPassword + salt
	hash := sha256.Sum256([]byte(combined))
	return hash[:]
}

// encryptBackup encrypts a backup file using AES-256-GCM
func (h *BackupHandler) encryptBackup(inputPath, outputPath string) error {
	// Read input file
	plaintext, err := os.ReadFile(inputPath)
	if err != nil {
		return fmt.Errorf("failed to read input file: %v", err)
	}

	// Get encryption key
	key := h.deriveEncryptionKey()

	// Create AES cipher
	block, err := aes.NewCipher(key)
	if err != nil {
		return fmt.Errorf("failed to create cipher: %v", err)
	}

	// Create GCM
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return fmt.Errorf("failed to create GCM: %v", err)
	}

	// Create nonce
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return fmt.Errorf("failed to create nonce: %v", err)
	}

	// Encrypt and prepend nonce
	ciphertext := gcm.Seal(nonce, nonce, plaintext, nil)

	// Write encrypted file with magic header
	header := []byte("PROXPANEL_ENCRYPTED_BACKUP_V1\n")
	output := append(header, ciphertext...)

	if err := os.WriteFile(outputPath, output, 0600); err != nil {
		return fmt.Errorf("failed to write encrypted file: %v", err)
	}

	return nil
}

// decryptBackup decrypts an encrypted backup file
func (h *BackupHandler) decryptBackup(inputPath, outputPath string) error {
	// Read encrypted file
	data, err := os.ReadFile(inputPath)
	if err != nil {
		return fmt.Errorf("failed to read encrypted file: %v", err)
	}

	// Check and remove magic header
	header := []byte("PROXPANEL_ENCRYPTED_BACKUP_V1\n")
	if len(data) < len(header) || string(data[:len(header)]) != string(header) {
		return fmt.Errorf("invalid encrypted backup format - this file may be corrupted or not a ProxPanel backup")
	}
	ciphertext := data[len(header):]

	// Get decryption key
	key := h.deriveEncryptionKey()

	// Create AES cipher
	block, err := aes.NewCipher(key)
	if err != nil {
		return fmt.Errorf("failed to create cipher: %v", err)
	}

	// Create GCM
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return fmt.Errorf("failed to create GCM: %v", err)
	}

	// Extract nonce
	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return fmt.Errorf("ciphertext too short")
	}
	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]

	// Decrypt
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return fmt.Errorf("decryption failed - this backup may be from a different installation")
	}

	// Write decrypted file
	if err := os.WriteFile(outputPath, plaintext, 0600); err != nil {
		return fmt.Errorf("failed to write decrypted file: %v", err)
	}

	return nil
}

// Download downloads a backup file (authenticated)
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

// GetDownloadToken generates a temporary download token
func (h *BackupHandler) GetDownloadToken(c *fiber.Ctx) error {
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

	// Generate random token
	tokenBytes := make([]byte, 32)
	rand.Read(tokenBytes)
	token := hex.EncodeToString(tokenBytes)

	// Store token with 5 minute expiry
	downloadTokenMutex.Lock()
	downloadTokens[token] = downloadTokenInfo{
		Filename:  filename,
		ExpiresAt: time.Now().Add(5 * time.Minute),
		UserID:    user.ID,
	}
	downloadTokenMutex.Unlock()

	// Clean up expired tokens
	go cleanupExpiredTokens()

	return c.JSON(fiber.Map{
		"success": true,
		"token":   token,
		"url":     fmt.Sprintf("/api/backups/public-download/%s", token),
	})
}

// PublicDownload downloads a backup using a temporary token (no auth required)
func (h *BackupHandler) PublicDownload(c *fiber.Ctx) error {
	token := c.Params("token")
	if token == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Token is required",
		})
	}

	// Look up token
	downloadTokenMutex.RLock()
	info, exists := downloadTokens[token]
	downloadTokenMutex.RUnlock()

	if !exists {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Invalid or expired download token",
		})
	}

	// Check expiry
	if time.Now().After(info.ExpiresAt) {
		downloadTokenMutex.Lock()
		delete(downloadTokens, token)
		downloadTokenMutex.Unlock()
		return c.Status(fiber.StatusGone).JSON(fiber.Map{
			"success": false,
			"message": "Download token has expired",
		})
	}

	// Delete token after use (one-time use)
	downloadTokenMutex.Lock()
	delete(downloadTokens, token)
	downloadTokenMutex.Unlock()

	// Serve the file
	filePath := filepath.Join(h.backupDir, info.Filename)
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Backup file not found",
		})
	}

	return c.Download(filePath, info.Filename)
}

// cleanupExpiredTokens removes expired download tokens
func cleanupExpiredTokens() {
	downloadTokenMutex.Lock()
	defer downloadTokenMutex.Unlock()

	now := time.Now()
	for token, info := range downloadTokens {
		if now.After(info.ExpiresAt) {
			delete(downloadTokens, token)
		}
	}
}

// ValidateBackup validates a backup file without restoring it
// Returns detailed validation info so user can decide whether to proceed
func (h *BackupHandler) ValidateBackup(c *fiber.Ctx) error {
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

	// Check file exists
	fileInfo, err := os.Stat(filePath)
	if os.IsNotExist(err) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Backup file not found",
			"valid":   false,
		})
	}

	validationResult := fiber.Map{
		"filename":   filename,
		"size":       fileInfo.Size(),
		"created_at": fileInfo.ModTime(),
		"encrypted":  strings.HasSuffix(filename, ".proisp.bak"),
	}

	var tempDecrypted string
	var fileToValidate string

	// Check if this is an encrypted backup (.proisp.bak)
	if strings.HasSuffix(filename, ".proisp.bak") {
		// Try to decrypt the backup
		tempDecrypted = filepath.Join(h.backupDir, fmt.Sprintf(".validate_temp_%d.dump", time.Now().UnixNano()))
		if err := h.decryptBackup(filePath, tempDecrypted); err != nil {
			return c.JSON(fiber.Map{
				"success": true,
				"valid":   false,
				"message": fmt.Sprintf("Backup decryption failed: %v. This backup cannot be restored on this server.", err),
				"data":    validationResult,
			})
		}
		defer os.Remove(tempDecrypted)
		fileToValidate = tempDecrypted
		validationResult["decryption"] = "success"
	} else {
		fileToValidate = filePath
	}

	// Validate the backup format using pg_restore --list (dry run)
	cmd := exec.Command("pg_restore", "--list", fileToValidate)
	output, err := cmd.CombinedOutput()
	if err != nil {
		// Check if it might be a SQL file
		if !strings.HasSuffix(filename, ".proisp.bak") {
			// For SQL files, try to validate syntax
			cmd = exec.Command("psql",
				"-h", h.cfg.DBHost,
				"-p", strconv.Itoa(h.cfg.DBPort),
				"-U", h.cfg.DBUser,
				"-d", h.cfg.DBName,
				"-f", filePath,
				"--set", "ON_ERROR_STOP=1",
				"-c", "\\q", // Just parse, don't execute
			)
			cmd.Env = append(os.Environ(), fmt.Sprintf("PGPASSWORD=%s", h.cfg.DBPassword))
			_, sqlErr := cmd.CombinedOutput()
			if sqlErr != nil {
				return c.JSON(fiber.Map{
					"success": true,
					"valid":   false,
					"message": "Backup format validation failed. The file may be corrupted or not a valid backup.",
					"data":    validationResult,
				})
			}
			validationResult["format"] = "sql"
		} else {
			return c.JSON(fiber.Map{
				"success": true,
				"valid":   false,
				"message": "Backup format validation failed. The backup file appears to be corrupted.",
				"data":    validationResult,
			})
		}
	} else {
		validationResult["format"] = "pg_dump_custom"
		// Count objects in backup
		lines := strings.Split(string(output), "\n")
		tableCount := 0
		dataCount := 0
		for _, line := range lines {
			if strings.Contains(line, " TABLE ") {
				tableCount++
			}
			if strings.Contains(line, " TABLE DATA ") {
				dataCount++
			}
		}
		validationResult["table_count"] = tableCount
		validationResult["data_sections"] = dataCount
	}

	return c.JSON(fiber.Map{
		"success": true,
		"valid":   true,
		"message": "Backup validation successful. This backup can be safely restored.",
		"data":    validationResult,
	})
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

	var cmd *exec.Cmd
	var tempDecrypted string

	// Check if this is an encrypted backup (.proisp.bak)
	if strings.HasSuffix(filename, ".proisp.bak") {
		// Decrypt the backup first
		tempDecrypted = filepath.Join(h.backupDir, fmt.Sprintf(".restore_temp_%d.dump", time.Now().UnixNano()))
		if err := h.decryptBackup(filePath, tempDecrypted); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"success": false,
				"message": fmt.Sprintf("Failed to decrypt backup: %v. This backup cannot be restored on this server - it may be from a different installation.", err),
			})
		}
		defer os.Remove(tempDecrypted) // Clean up temp file after restore

		// Validate the backup format before restoring
		validateCmd := exec.Command("pg_restore", "--list", tempDecrypted)
		if _, err := validateCmd.CombinedOutput(); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "Backup validation failed. The backup file appears to be corrupted and cannot be restored safely.",
			})
		}

		// Use pg_restore for custom format backups
		cmd = exec.Command("pg_restore",
			"-h", h.cfg.DBHost,
			"-p", strconv.Itoa(h.cfg.DBPort),
			"-U", h.cfg.DBUser,
			"-d", h.cfg.DBName,
			"--clean",              // Clean (drop) database objects before recreating
			"--if-exists",          // Don't error if objects don't exist
			"--no-owner",           // Don't set ownership
			"--no-acl",             // Don't restore access privileges
			"--single-transaction", // Restore as single transaction
			tempDecrypted,
		)
	} else {
		// Legacy SQL file - use psql
		cmd = exec.Command("psql",
			"-h", h.cfg.DBHost,
			"-p", strconv.Itoa(h.cfg.DBPort),
			"-U", h.cfg.DBUser,
			"-d", h.cfg.DBName,
			"-f", filePath,
		)
	}

	cmd.Env = append(os.Environ(), fmt.Sprintf("PGPASSWORD=%s", h.cfg.DBPassword))

	output, err := cmd.CombinedOutput()
	if err != nil {
		// For pg_restore, some errors are warnings - check if it's a real failure
		if strings.Contains(string(output), "FATAL") || strings.Contains(string(output), "could not connect") {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"success": false,
				"message": fmt.Sprintf("Failed to restore backup: %s", string(output)),
			})
		}
		// pg_restore may return non-zero even with warnings, so log but continue
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

	// Validate file extension - accept both encrypted (.proisp.bak) and legacy (.sql)
	isEncrypted := strings.HasSuffix(file.Filename, ".proisp.bak")
	isLegacy := strings.HasSuffix(file.Filename, ".sql")
	if !isEncrypted && !isLegacy {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Only .proisp.bak or .sql files are allowed",
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

	// Validate encrypted backup format if it's a .proisp.bak file
	if isEncrypted {
		// Read first 30 bytes to check header
		f, err := os.Open(destPath)
		if err == nil {
			header := make([]byte, 30)
			n, _ := f.Read(header)
			f.Close()
			expectedHeader := "PROXPANEL_ENCRYPTED_BACKUP_V1\n"
			if n < len(expectedHeader) || string(header[:len(expectedHeader)]) != expectedHeader {
				os.Remove(destPath)
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
					"success": false,
					"message": "Invalid backup file format - this is not a valid ProxPanel encrypted backup",
				})
			}
		}
	}

	// Create audit log
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionCreate,
		EntityType:  "backup",
		EntityName:  filename,
		Description: fmt.Sprintf("Uploaded backup file (%s)", map[bool]string{true: "encrypted", false: "legacy SQL"}[isEncrypted]),
		IPAddress:   c.IP(),
		UserAgent:   c.Get("User-Agent"),
	}
	database.DB.Create(&auditLog)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Backup uploaded successfully",
		"data": fiber.Map{
			"filename":  filename,
			"encrypted": isEncrypted,
		},
	})
}

// ========== Backup Schedule Management ==========

// ListSchedules returns all backup schedules
func (h *BackupHandler) ListSchedules(c *fiber.Ctx) error {
	var schedules []models.BackupSchedule
	if err := database.DB.Order("created_at DESC").Find(&schedules).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to fetch schedules",
		})
	}

	// Hide FTP passwords in response
	for i := range schedules {
		if schedules[i].FTPPassword != "" {
			schedules[i].FTPPassword = "********"
		}
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    schedules,
	})
}

// GetSchedule returns a single backup schedule
func (h *BackupHandler) GetSchedule(c *fiber.Ctx) error {
	id := c.Params("id")

	var schedule models.BackupSchedule
	if err := database.DB.First(&schedule, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Schedule not found",
		})
	}

	// Hide FTP password
	if schedule.FTPPassword != "" {
		schedule.FTPPassword = "********"
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    schedule,
	})
}

// CreateSchedule creates a new backup schedule
func (h *BackupHandler) CreateSchedule(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
	}

	var schedule models.BackupSchedule
	if err := c.BodyParser(&schedule); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
		})
	}

	// Validate required fields
	if schedule.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Schedule name is required",
		})
	}

	if schedule.Frequency == "" {
		schedule.Frequency = "daily"
	}

	if schedule.BackupType == "" {
		schedule.BackupType = "full"
	}

	if schedule.TimeOfDay == "" {
		schedule.TimeOfDay = "02:00"
	}

	if schedule.Retention == 0 {
		schedule.Retention = 7
	}

	if schedule.LocalPath == "" {
		schedule.LocalPath = h.backupDir
	}

	// Set ID to 0 for new record
	schedule.ID = 0

	// Calculate next run time using configured timezone
	nextRun := services.CalculateNextRunForSchedule(&schedule)
	schedule.NextRunAt = &nextRun

	if err := database.DB.Create(&schedule).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to create schedule",
		})
	}

	// Create audit log
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionCreate,
		EntityType:  "backup_schedule",
		EntityID:    schedule.ID,
		EntityName:  schedule.Name,
		Description: fmt.Sprintf("Created backup schedule: %s (%s)", schedule.Name, schedule.Frequency),
		IPAddress:   c.IP(),
		UserAgent:   c.Get("User-Agent"),
	}
	database.DB.Create(&auditLog)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Schedule created successfully",
		"data":    schedule,
	})
}

// UpdateSchedule updates a backup schedule
func (h *BackupHandler) UpdateSchedule(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
	}

	id := c.Params("id")

	var existing models.BackupSchedule
	if err := database.DB.First(&existing, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Schedule not found",
		})
	}

	var updates models.BackupSchedule
	if err := c.BodyParser(&updates); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
		})
	}

	// Don't update password if it's masked
	if updates.FTPPassword == "********" || updates.FTPPassword == "" {
		updates.FTPPassword = existing.FTPPassword
	}

	// Update fields
	existing.Name = updates.Name
	existing.IsEnabled = updates.IsEnabled
	existing.BackupType = updates.BackupType
	existing.Frequency = updates.Frequency
	existing.DayOfWeek = updates.DayOfWeek
	existing.DayOfMonth = updates.DayOfMonth
	existing.TimeOfDay = updates.TimeOfDay
	existing.Retention = updates.Retention
	existing.StorageType = updates.StorageType
	existing.LocalPath = updates.LocalPath
	existing.FTPEnabled = updates.FTPEnabled
	existing.FTPHost = updates.FTPHost
	existing.FTPPort = updates.FTPPort
	existing.FTPUsername = updates.FTPUsername
	existing.FTPPassword = updates.FTPPassword
	existing.FTPPath = updates.FTPPath
	existing.FTPPassive = updates.FTPPassive
	existing.FTPTLS = updates.FTPTLS

	// Recalculate next run time using configured timezone
	nextRun := services.CalculateNextRunForSchedule(&existing)
	existing.NextRunAt = &nextRun

	if err := database.DB.Save(&existing).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to update schedule",
		})
	}

	// Create audit log
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionUpdate,
		EntityType:  "backup_schedule",
		EntityID:    existing.ID,
		EntityName:  existing.Name,
		Description: fmt.Sprintf("Updated backup schedule: %s", existing.Name),
		IPAddress:   c.IP(),
		UserAgent:   c.Get("User-Agent"),
	}
	database.DB.Create(&auditLog)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Schedule updated successfully",
		"data":    existing,
	})
}

// DeleteSchedule deletes a backup schedule
func (h *BackupHandler) DeleteSchedule(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
	}

	id := c.Params("id")

	var schedule models.BackupSchedule
	if err := database.DB.First(&schedule, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Schedule not found",
		})
	}

	if err := database.DB.Delete(&schedule).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to delete schedule",
		})
	}

	// Create audit log
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionDelete,
		EntityType:  "backup_schedule",
		EntityID:    schedule.ID,
		EntityName:  schedule.Name,
		Description: fmt.Sprintf("Deleted backup schedule: %s", schedule.Name),
		IPAddress:   c.IP(),
		UserAgent:   c.Get("User-Agent"),
	}
	database.DB.Create(&auditLog)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Schedule deleted successfully",
	})
}

// ToggleSchedule enables/disables a backup schedule
func (h *BackupHandler) ToggleSchedule(c *fiber.Ctx) error {
	id := c.Params("id")

	var schedule models.BackupSchedule
	if err := database.DB.First(&schedule, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Schedule not found",
		})
	}

	schedule.IsEnabled = !schedule.IsEnabled
	database.DB.Save(&schedule)

	status := "disabled"
	if schedule.IsEnabled {
		status = "enabled"
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": fmt.Sprintf("Schedule %s", status),
		"data":    schedule,
	})
}

// TestFTP tests FTP connection
func (h *BackupHandler) TestFTP(c *fiber.Ctx) error {
	var req struct {
		Host     string `json:"host"`
		Port     int    `json:"port"`
		Username string `json:"username"`
		Password string `json:"password"`
		Path     string `json:"path"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request",
		})
	}

	if req.Port == 0 {
		req.Port = 21
	}

	err := services.TestFTPConnection(req.Host, req.Port, req.Username, req.Password, req.Path)
	if err != nil {
		return c.JSON(fiber.Map{
			"success": false,
			"message": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "FTP connection successful",
	})
}

// ListBackupLogs returns backup execution logs
func (h *BackupHandler) ListBackupLogs(c *fiber.Ctx) error {
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "50"))
	offset := (page - 1) * limit

	var logs []models.BackupLog
	var total int64

	query := database.DB.Model(&models.BackupLog{})

	// Filter by schedule if specified
	if scheduleID := c.Query("schedule_id"); scheduleID != "" {
		query = query.Where("schedule_id = ?", scheduleID)
	}

	// Filter by status if specified
	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}

	query.Count(&total)
	query.Order("started_at DESC").Offset(offset).Limit(limit).Find(&logs)

	return c.JSON(fiber.Map{
		"success": true,
		"data":    logs,
		"total":   total,
		"page":    page,
		"limit":   limit,
	})
}

// RunScheduleNow manually triggers a scheduled backup
func (h *BackupHandler) RunScheduleNow(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
	}

	id := c.Params("id")

	var schedule models.BackupSchedule
	if err := database.DB.First(&schedule, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Schedule not found",
		})
	}

	// Run backup in background
	go func() {
		svc := services.NewBackupSchedulerService(h.cfg)
		svc.RunManualBackup(schedule.BackupType, &schedule, user.ID, user.Username)
	}()

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Backup started",
	})
}

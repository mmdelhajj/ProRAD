package services

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/jlaffaye/ftp"
	"github.com/proisp/backend/internal/config"
	"github.com/proisp/backend/internal/database"
	"github.com/proisp/backend/internal/models"
)

// BackupSchedulerService handles scheduled backups
type BackupSchedulerService struct {
	cfg       *config.Config
	backupDir string
	stopChan  chan struct{}
}

// NewBackupSchedulerService creates a new backup scheduler service
func NewBackupSchedulerService(cfg *config.Config) *BackupSchedulerService {
	backupDir := "/var/backups/proisp"
	os.MkdirAll(backupDir, 0755)
	return &BackupSchedulerService{
		cfg:       cfg,
		backupDir: backupDir,
		stopChan:  make(chan struct{}),
	}
}

// Start starts the backup scheduler
func (s *BackupSchedulerService) Start() {
	log.Println("BackupSchedulerService started, checking every 1 minute")

	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	// Initial check
	s.checkSchedules()

	for {
		select {
		case <-s.stopChan:
			log.Println("BackupSchedulerService stopped")
			return
		case <-ticker.C:
			s.checkSchedules()
		}
	}
}

// Stop stops the backup scheduler
func (s *BackupSchedulerService) Stop() {
	close(s.stopChan)
}

// checkSchedules checks all schedules and runs due backups
func (s *BackupSchedulerService) checkSchedules() {
	var schedules []models.BackupSchedule
	if err := database.DB.Where("is_enabled = ?", true).Find(&schedules).Error; err != nil {
		log.Printf("BackupScheduler: Failed to load schedules: %v", err)
		return
	}

	// Use configured timezone for time comparison
	tz := getConfiguredTimezone()
	now := time.Now().In(tz)

	for _, schedule := range schedules {
		if s.isDue(&schedule, now) {
			go s.runBackup(&schedule)
		}
	}
}

// isDue checks if a schedule is due to run
func (s *BackupSchedulerService) isDue(schedule *models.BackupSchedule, now time.Time) bool {
	// Parse time of day
	hour, minute := 2, 0 // default 02:00
	if schedule.TimeOfDay != "" {
		fmt.Sscanf(schedule.TimeOfDay, "%d:%d", &hour, &minute)
	}

	// Check if it's the right time (within 1 minute window)
	if now.Hour() != hour || now.Minute() != minute {
		return false
	}

	// Check frequency
	switch schedule.Frequency {
	case "daily":
		// Runs every day at specified time
		return true
	case "weekly":
		// Runs on specified day of week
		return int(now.Weekday()) == schedule.DayOfWeek
	case "monthly":
		// Runs on specified day of month
		return now.Day() == schedule.DayOfMonth
	}

	return false
}

// runBackup executes a scheduled backup
func (s *BackupSchedulerService) runBackup(schedule *models.BackupSchedule) {
	startTime := time.Now()

	// Update status to running
	database.DB.Model(schedule).Updates(map[string]interface{}{
		"last_status": "running",
		"last_run_at": startTime,
	})

	// Create backup log entry
	backupLog := models.BackupLog{
		ScheduleID:   &schedule.ID,
		ScheduleName: schedule.Name,
		BackupType:   schedule.BackupType,
		Status:       "running",
		StartedAt:    startTime,
	}
	database.DB.Create(&backupLog)

	// Generate filenames
	timestamp := startTime.Format("20060102_150405")
	tempFile := filepath.Join(s.backupDir, fmt.Sprintf(".temp_%s_%s_scheduled.dump", schedule.BackupType, timestamp))
	filename := fmt.Sprintf("proisp_%s_%s_scheduled.proisp.bak", schedule.BackupType, timestamp)
	localPath := filepath.Join(s.backupDir, filename)

	// Run pg_dump with custom format
	err := s.createDatabaseBackupCustomFormat(schedule.BackupType, tempFile)
	if err != nil {
		s.handleBackupError(schedule, &backupLog, err, startTime)
		return
	}

	// Encrypt the backup
	err = s.EncryptFile(tempFile, localPath)
	os.Remove(tempFile) // Clean up temp file regardless
	if err != nil {
		s.handleBackupError(schedule, &backupLog, fmt.Errorf("encryption failed: %v", err), startTime)
		return
	}

	// Get file info
	fileInfo, err := os.Stat(localPath)
	if err != nil {
		s.handleBackupError(schedule, &backupLog, err, startTime)
		return
	}

	backupLog.Filename = filename
	backupLog.FileSize = fileInfo.Size()
	backupLog.StoragePath = localPath

	// Upload to FTP if enabled
	if schedule.FTPEnabled && (schedule.StorageType == "ftp" || schedule.StorageType == "both") {
		err = s.uploadToFTP(schedule, localPath, filename)
		if err != nil {
			log.Printf("BackupScheduler: FTP upload failed for %s: %v", schedule.Name, err)
			// Don't fail the whole backup if FTP fails but local succeeded
			if schedule.StorageType == "ftp" {
				s.handleBackupError(schedule, &backupLog, fmt.Errorf("FTP upload failed: %v", err), startTime)
				return
			}
		} else {
			backupLog.StorageType = "both"
			backupLog.StoragePath = fmt.Sprintf("local:%s, ftp:%s/%s", localPath, schedule.FTPPath, filename)
		}
	}

	// Delete old backups based on retention policy
	if schedule.Retention > 0 {
		s.cleanOldBackups(schedule)
	}

	// Update schedule status
	nextRun := s.calculateNextRun(schedule)
	database.DB.Model(schedule).Updates(map[string]interface{}{
		"last_status":      "success",
		"last_error":       "",
		"last_backup_file": filename,
		"next_run_at":      nextRun,
	})

	// Complete backup log
	completedAt := time.Now()
	backupLog.Status = "success"
	backupLog.CompletedAt = completedAt
	backupLog.Duration = int(completedAt.Sub(startTime).Seconds())
	if backupLog.StorageType == "" {
		backupLog.StorageType = "local"
	}
	database.DB.Save(&backupLog)

	log.Printf("BackupScheduler: Backup completed for %s (%s, %d bytes)",
		schedule.Name, filename, fileInfo.Size())
}

// createDatabaseBackup creates a database backup (legacy SQL format)
func (s *BackupSchedulerService) createDatabaseBackup(backupType, destPath string) error {
	cmd := exec.Command("pg_dump",
		"-h", s.cfg.DBHost,
		"-p", strconv.Itoa(s.cfg.DBPort),
		"-U", s.cfg.DBUser,
		"-d", s.cfg.DBName,
		"-f", destPath,
		"--no-owner",
		"--no-acl",
	)
	cmd.Env = append(os.Environ(), fmt.Sprintf("PGPASSWORD=%s", s.cfg.DBPassword))

	// Add table filters based on type
	if backupType == "data" {
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
	} else if backupType == "config" {
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
		return fmt.Errorf("%s: %s", err.Error(), string(output))
	}
	return nil
}

// createDatabaseBackupCustomFormat creates a database backup in custom format (compressed binary)
func (s *BackupSchedulerService) createDatabaseBackupCustomFormat(backupType, destPath string) error {
	cmd := exec.Command("pg_dump",
		"-h", s.cfg.DBHost,
		"-p", strconv.Itoa(s.cfg.DBPort),
		"-U", s.cfg.DBUser,
		"-d", s.cfg.DBName,
		"-Fc", // Custom format (compressed, binary)
		"-f", destPath,
		"--no-owner",
		"--no-acl",
	)
	cmd.Env = append(os.Environ(), fmt.Sprintf("PGPASSWORD=%s", s.cfg.DBPassword))

	// Add table filters based on type
	if backupType == "data" {
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
	} else if backupType == "config" {
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
		return fmt.Errorf("%s: %s", err.Error(), string(output))
	}
	return nil
}

// uploadToFTP uploads a file to FTP server
func (s *BackupSchedulerService) uploadToFTP(schedule *models.BackupSchedule, localPath, filename string) error {
	// Connect to FTP
	addr := fmt.Sprintf("%s:%d", schedule.FTPHost, schedule.FTPPort)
	conn, err := ftp.Dial(addr, ftp.DialWithTimeout(30*time.Second))
	if err != nil {
		return fmt.Errorf("FTP connection failed: %v", err)
	}
	defer conn.Quit()

	// Login
	err = conn.Login(schedule.FTPUsername, schedule.FTPPassword)
	if err != nil {
		return fmt.Errorf("FTP login failed: %v", err)
	}

	// Change to backup directory (create if needed)
	if schedule.FTPPath != "" && schedule.FTPPath != "/" {
		// Try to change to directory, create if doesn't exist
		err = conn.ChangeDir(schedule.FTPPath)
		if err != nil {
			// Try to create directory
			conn.MakeDir(schedule.FTPPath)
			err = conn.ChangeDir(schedule.FTPPath)
			if err != nil {
				return fmt.Errorf("FTP directory change failed: %v", err)
			}
		}
	}

	// Open local file
	file, err := os.Open(localPath)
	if err != nil {
		return fmt.Errorf("failed to open local file: %v", err)
	}
	defer file.Close()

	// Upload file
	err = conn.Stor(filename, file)
	if err != nil {
		return fmt.Errorf("FTP upload failed: %v", err)
	}

	log.Printf("BackupScheduler: Uploaded %s to FTP %s", filename, schedule.FTPHost)
	return nil
}

// cleanOldBackups removes backups older than retention period
func (s *BackupSchedulerService) cleanOldBackups(schedule *models.BackupSchedule) {
	cutoff := time.Now().AddDate(0, 0, -schedule.Retention)

	// Clean local backups
	files, err := os.ReadDir(s.backupDir)
	if err != nil {
		return
	}

	for _, file := range files {
		if file.IsDir() {
			continue
		}

		info, err := file.Info()
		if err != nil {
			continue
		}

		// Only delete backup files (both encrypted .proisp.bak and legacy .sql)
		name := file.Name()
		isBackup := strings.HasSuffix(name, ".proisp.bak") || strings.HasSuffix(name, ".sql")
		if info.ModTime().Before(cutoff) && isBackup && len(name) > 10 {
			os.Remove(filepath.Join(s.backupDir, name))
			log.Printf("BackupScheduler: Deleted old backup %s", name)
		}
	}

	// Clean FTP backups if enabled
	if schedule.FTPEnabled {
		s.cleanOldFTPBackups(schedule, cutoff)
	}
}

// cleanOldFTPBackups removes old backups from FTP server
func (s *BackupSchedulerService) cleanOldFTPBackups(schedule *models.BackupSchedule, cutoff time.Time) {
	addr := fmt.Sprintf("%s:%d", schedule.FTPHost, schedule.FTPPort)
	conn, err := ftp.Dial(addr, ftp.DialWithTimeout(30*time.Second))
	if err != nil {
		return
	}
	defer conn.Quit()

	err = conn.Login(schedule.FTPUsername, schedule.FTPPassword)
	if err != nil {
		return
	}

	if schedule.FTPPath != "" && schedule.FTPPath != "/" {
		conn.ChangeDir(schedule.FTPPath)
	}

	entries, err := conn.List("")
	if err != nil {
		return
	}

	for _, entry := range entries {
		if entry.Type == ftp.EntryTypeFile && entry.Time.Before(cutoff) {
			if filepath.Ext(entry.Name) == ".sql" {
				conn.Delete(entry.Name)
				log.Printf("BackupScheduler: Deleted old FTP backup %s", entry.Name)
			}
		}
	}
}

// calculateNextRun calculates the next run time for a schedule
func (s *BackupSchedulerService) calculateNextRun(schedule *models.BackupSchedule) time.Time {
	// Use configured timezone
	tz := getConfiguredTimezone()
	now := time.Now().In(tz)

	hour, minute := 2, 0
	if schedule.TimeOfDay != "" {
		fmt.Sscanf(schedule.TimeOfDay, "%d:%d", &hour, &minute)
	}

	next := time.Date(now.Year(), now.Month(), now.Day(), hour, minute, 0, 0, tz)

	switch schedule.Frequency {
	case "daily":
		if next.Before(now) || next.Equal(now) {
			next = next.AddDate(0, 0, 1)
		}
	case "weekly":
		daysUntil := (schedule.DayOfWeek - int(now.Weekday()) + 7) % 7
		if daysUntil == 0 && (next.Before(now) || next.Equal(now)) {
			daysUntil = 7
		}
		next = next.AddDate(0, 0, daysUntil)
	case "monthly":
		next = time.Date(now.Year(), now.Month(), schedule.DayOfMonth, hour, minute, 0, 0, tz)
		if next.Before(now) || next.Equal(now) {
			next = next.AddDate(0, 1, 0)
		}
	}

	return next
}

// CalculateNextRunForSchedule calculates and updates next_run_at for a schedule (exported for use by handlers)
func CalculateNextRunForSchedule(schedule *models.BackupSchedule) time.Time {
	// Use configured timezone
	tz := getConfiguredTimezone()
	now := time.Now().In(tz)

	hour, minute := 2, 0
	if schedule.TimeOfDay != "" {
		fmt.Sscanf(schedule.TimeOfDay, "%d:%d", &hour, &minute)
	}

	next := time.Date(now.Year(), now.Month(), now.Day(), hour, minute, 0, 0, tz)

	switch schedule.Frequency {
	case "daily":
		if next.Before(now) || next.Equal(now) {
			next = next.AddDate(0, 0, 1)
		}
	case "weekly":
		daysUntil := (schedule.DayOfWeek - int(now.Weekday()) + 7) % 7
		if daysUntil == 0 && (next.Before(now) || next.Equal(now)) {
			daysUntil = 7
		}
		next = next.AddDate(0, 0, daysUntil)
	case "monthly":
		next = time.Date(now.Year(), now.Month(), schedule.DayOfMonth, hour, minute, 0, 0, tz)
		if next.Before(now) || next.Equal(now) {
			next = next.AddDate(0, 1, 0)
		}
	}

	return next
}

// handleBackupError handles backup errors
func (s *BackupSchedulerService) handleBackupError(schedule *models.BackupSchedule, backupLog *models.BackupLog, err error, startTime time.Time) {
	log.Printf("BackupScheduler: Backup failed for %s: %v", schedule.Name, err)

	completedAt := time.Now()

	// Update schedule
	database.DB.Model(schedule).Updates(map[string]interface{}{
		"last_status": "failed",
		"last_error":  err.Error(),
	})

	// Update backup log
	backupLog.Status = "failed"
	backupLog.ErrorMessage = err.Error()
	backupLog.CompletedAt = completedAt
	backupLog.Duration = int(completedAt.Sub(startTime).Seconds())
	database.DB.Save(backupLog)
}

// TestFTPConnection tests FTP connection with given credentials
func TestFTPConnection(host string, port int, username, password, path string) error {
	addr := fmt.Sprintf("%s:%d", host, port)
	conn, err := ftp.Dial(addr, ftp.DialWithTimeout(10*time.Second))
	if err != nil {
		return fmt.Errorf("connection failed: %v", err)
	}
	defer conn.Quit()

	err = conn.Login(username, password)
	if err != nil {
		return fmt.Errorf("login failed: %v", err)
	}

	if path != "" && path != "/" {
		err = conn.ChangeDir(path)
		if err != nil {
			// Try to create directory
			err = conn.MakeDir(path)
			if err != nil {
				return fmt.Errorf("cannot access or create directory %s: %v", path, err)
			}
		}
	}

	return nil
}

// RunManualBackup runs a manual backup with optional FTP upload
func (s *BackupSchedulerService) RunManualBackup(backupType string, ftpConfig *models.BackupSchedule, userID uint, username string) (*models.BackupLog, error) {
	startTime := time.Now()

	// Create backup log entry
	backupLog := models.BackupLog{
		BackupType:    backupType,
		Status:        "running",
		StartedAt:     startTime,
		CreatedByID:   &userID,
		CreatedByName: username,
	}
	database.DB.Create(&backupLog)

	// Generate filenames
	timestamp := startTime.Format("20060102_150405")
	tempFile := filepath.Join(s.backupDir, fmt.Sprintf(".temp_%s_%s.dump", backupType, timestamp))
	filename := fmt.Sprintf("proisp_%s_%s.proisp.bak", backupType, timestamp)
	localPath := filepath.Join(s.backupDir, filename)

	// Run pg_dump with custom format
	err := s.createDatabaseBackupCustomFormat(backupType, tempFile)
	if err != nil {
		backupLog.Status = "failed"
		backupLog.ErrorMessage = err.Error()
		backupLog.CompletedAt = time.Now()
		database.DB.Save(&backupLog)
		return &backupLog, err
	}

	// Encrypt the backup
	err = s.EncryptFile(tempFile, localPath)
	os.Remove(tempFile) // Clean up temp file regardless
	if err != nil {
		backupLog.Status = "failed"
		backupLog.ErrorMessage = fmt.Sprintf("Encryption failed: %v", err)
		backupLog.CompletedAt = time.Now()
		database.DB.Save(&backupLog)
		return &backupLog, err
	}

	// Get file info
	fileInfo, _ := os.Stat(localPath)
	backupLog.Filename = filename
	backupLog.FileSize = fileInfo.Size()
	backupLog.StoragePath = localPath
	backupLog.StorageType = "local"

	// Upload to FTP if configured
	if ftpConfig != nil && ftpConfig.FTPEnabled {
		err = s.uploadToFTP(ftpConfig, localPath, filename)
		if err != nil {
			// FTP failed but local succeeded
			backupLog.ErrorMessage = fmt.Sprintf("Local backup succeeded, FTP failed: %v", err)
		} else {
			backupLog.StorageType = "both"
		}
	}

	completedAt := time.Now()
	backupLog.Status = "success"
	backupLog.CompletedAt = completedAt
	backupLog.Duration = int(completedAt.Sub(startTime).Seconds())
	database.DB.Save(&backupLog)

	return &backupLog, nil
}

// deriveEncryptionKey derives a 32-byte key from the database password and a salt
func (s *BackupSchedulerService) deriveEncryptionKey() []byte {
	// Use database password + fixed salt to derive encryption key
	// This ensures backups can only be decrypted with knowledge of the DB password
	salt := "ProxPanel-Backup-Encryption-2024"
	combined := s.cfg.DBPassword + salt
	hash := sha256.Sum256([]byte(combined))
	return hash[:]
}

// EncryptFile encrypts a file using AES-256-GCM
func (s *BackupSchedulerService) EncryptFile(inputPath, outputPath string) error {
	// Read input file
	plaintext, err := os.ReadFile(inputPath)
	if err != nil {
		return fmt.Errorf("failed to read input file: %v", err)
	}

	// Get encryption key
	key := s.deriveEncryptionKey()

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
	header := []byte("PROXPANEL_ENCRYPTED_V1\n")
	output := append(header, ciphertext...)

	if err := os.WriteFile(outputPath, output, 0600); err != nil {
		return fmt.Errorf("failed to write encrypted file: %v", err)
	}

	return nil
}

// DecryptFile decrypts a file encrypted with EncryptFile
func (s *BackupSchedulerService) DecryptFile(inputPath, outputPath string) error {
	// Read encrypted file
	data, err := os.ReadFile(inputPath)
	if err != nil {
		return fmt.Errorf("failed to read encrypted file: %v", err)
	}

	// Check and remove magic header
	header := []byte("PROXPANEL_ENCRYPTED_V1\n")
	if len(data) < len(header) || string(data[:len(header)]) != string(header) {
		return fmt.Errorf("invalid encrypted file format")
	}
	ciphertext := data[len(header):]

	// Get decryption key
	key := s.deriveEncryptionKey()

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
		return fmt.Errorf("decryption failed: %v", err)
	}

	// Write decrypted file
	if err := os.WriteFile(outputPath, plaintext, 0600); err != nil {
		return fmt.Errorf("failed to write decrypted file: %v", err)
	}

	return nil
}

// IsEncrypted checks if a backup file is encrypted
func IsEncrypted(filePath string) bool {
	file, err := os.Open(filePath)
	if err != nil {
		return false
	}
	defer file.Close()

	header := make([]byte, 23) // Length of "PROXPANEL_ENCRYPTED_V1\n"
	n, err := file.Read(header)
	if err != nil || n < 23 {
		return false
	}

	return string(header) == "PROXPANEL_ENCRYPTED_V1\n"
}

// GetEncryptionKeyHash returns a hash of the encryption key for verification
func (s *BackupSchedulerService) GetEncryptionKeyHash() string {
	key := s.deriveEncryptionKey()
	hash := sha256.Sum256(key)
	return hex.EncodeToString(hash[:8]) // Return first 8 bytes as hex
}

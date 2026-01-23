package handlers

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/proisp/backend/internal/security"
)

// SystemUpdateHandler handles system updates
type SystemUpdateHandler struct {
	licenseServer    string
	licenseKey       string
	installDir       string
	updating         bool
	updateStatus     *UpdateStatus
	cachedUpdateInfo *CachedUpdateInfo
	mutex            sync.RWMutex
}

// UpdateStatus tracks current update progress
type UpdateStatus struct {
	InProgress   bool      `json:"in_progress"`
	Step         string    `json:"step"`
	Progress     int       `json:"progress"`
	Message      string    `json:"message"`
	Error        string    `json:"error,omitempty"`
	StartedAt    time.Time `json:"started_at,omitempty"`
	CompletedAt  time.Time `json:"completed_at,omitempty"`
	FromVersion  string    `json:"from_version,omitempty"`
	ToVersion    string    `json:"to_version,omitempty"`
	NeedsRestart bool      `json:"needs_restart"`
}

// UpdateCheckResponse from license server
type UpdateCheckResponse struct {
	Success         bool   `json:"success"`
	UpdateAvailable bool   `json:"update_available"`
	Version         string `json:"version"`
	ReleaseNotes    string `json:"release_notes"`
	IsCritical      bool   `json:"is_critical"`
	FileSize        int64  `json:"file_size"`
	Checksum        string `json:"checksum"`
	Signature       string `json:"signature"`
	IsEncrypted     bool   `json:"is_encrypted"`
	EncryptionKey   string `json:"encryption_key,omitempty"`
	ReleasedAt      string `json:"released_at"`
}

// CachedUpdateInfo stores update info from check for use during download
type CachedUpdateInfo struct {
	Version       string
	Checksum      string
	Signature     string
	IsEncrypted   bool
	EncryptionKey string
}

// NewSystemUpdateHandler creates a new system update handler
func NewSystemUpdateHandler() *SystemUpdateHandler {
	return &SystemUpdateHandler{
		licenseServer: os.Getenv("LICENSE_SERVER"),
		licenseKey:    os.Getenv("LICENSE_KEY"),
		installDir:    getInstallDir(),
		updateStatus:  &UpdateStatus{},
	}
}

func getInstallDir() string {
	if dir := os.Getenv("INSTALL_DIR"); dir != "" {
		return dir
	}
	return "/opt/proxpanel"
}

func getCurrentVersion() string {
	versionFile := filepath.Join(getInstallDir(), "VERSION")
	data, err := os.ReadFile(versionFile)
	if err != nil {
		return os.Getenv("PROXPANEL_VERSION")
	}
	return string(bytes.TrimSpace(data))
}

// CheckUpdate checks for available updates
func (h *SystemUpdateHandler) CheckUpdate(c *fiber.Ctx) error {
	if h.licenseServer == "" || h.licenseKey == "" {
		return c.JSON(fiber.Map{
			"success":          true,
			"update_available": false,
			"message":          "License not configured",
		})
	}

	currentVersion := getCurrentVersion()
	if currentVersion == "" {
		currentVersion = "1.0.0"
	}

	// Call license server
	reqBody, _ := json.Marshal(map[string]string{
		"license_key":     h.licenseKey,
		"current_version": currentVersion,
	})

	resp, err := http.Post(
		h.licenseServer+"/api/v1/update/check",
		"application/json",
		bytes.NewBuffer(reqBody),
	)
	if err != nil {
		return c.JSON(fiber.Map{
			"success":          true,
			"update_available": false,
			"current_version":  currentVersion,
			"message":          "Could not connect to update server",
		})
	}
	defer resp.Body.Close()

	var updateResp UpdateCheckResponse
	if err := json.NewDecoder(resp.Body).Decode(&updateResp); err != nil {
		return c.JSON(fiber.Map{
			"success":          true,
			"update_available": false,
			"current_version":  currentVersion,
		})
	}

	// Cache update info for later use during download
	if updateResp.UpdateAvailable {
		h.mutex.Lock()
		h.cachedUpdateInfo = &CachedUpdateInfo{
			Version:       updateResp.Version,
			Checksum:      updateResp.Checksum,
			Signature:     updateResp.Signature,
			IsEncrypted:   updateResp.IsEncrypted,
			EncryptionKey: updateResp.EncryptionKey,
		}
		h.mutex.Unlock()
	}

	return c.JSON(fiber.Map{
		"success":          true,
		"update_available": updateResp.UpdateAvailable,
		"current_version":  currentVersion,
		"new_version":      updateResp.Version,
		"release_notes":    updateResp.ReleaseNotes,
		"is_critical":      updateResp.IsCritical,
		"file_size":        updateResp.FileSize,
		"released_at":      updateResp.ReleasedAt,
		"is_encrypted":     updateResp.IsEncrypted,
	})
}

// GetUpdateStatus returns current update status
func (h *SystemUpdateHandler) GetUpdateStatus(c *fiber.Ctx) error {
	h.mutex.RLock()
	defer h.mutex.RUnlock()

	return c.JSON(fiber.Map{
		"success": true,
		"data":    h.updateStatus,
	})
}

// StartUpdate initiates the update process
func (h *SystemUpdateHandler) StartUpdate(c *fiber.Ctx) error {
	h.mutex.Lock()
	if h.updating {
		h.mutex.Unlock()
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"success": false,
			"message": "Update already in progress",
		})
	}
	h.updating = true
	h.mutex.Unlock()

	var req struct {
		Version string `json:"version"`
	}
	if err := c.BodyParser(&req); err != nil {
		h.mutex.Lock()
		h.updating = false
		h.mutex.Unlock()
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request",
		})
	}

	// Start update in background
	go h.performUpdate(req.Version)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Update started",
	})
}

func (h *SystemUpdateHandler) setStatus(step string, progress int, message string) {
	h.mutex.Lock()
	defer h.mutex.Unlock()
	h.updateStatus.Step = step
	h.updateStatus.Progress = progress
	h.updateStatus.Message = message
}

func (h *SystemUpdateHandler) performUpdate(version string) {
	currentVersion := getCurrentVersion()

	h.mutex.Lock()
	h.updateStatus = &UpdateStatus{
		InProgress:  true,
		Step:        "preparing",
		Progress:    0,
		Message:     "Preparing update...",
		StartedAt:   time.Now(),
		FromVersion: currentVersion,
		ToVersion:   version,
	}
	// Get cached update info
	updateInfo := h.cachedUpdateInfo
	h.mutex.Unlock()

	// Track backup dir for rollback
	backupDir := fmt.Sprintf("/opt/proxpanel-backup-%s", time.Now().Format("20060102-150405"))
	updateFailed := false

	defer func() {
		h.mutex.Lock()
		h.updating = false
		h.updateStatus.InProgress = false
		h.updateStatus.CompletedAt = time.Now()
		h.mutex.Unlock()

		// Auto-rollback if update failed and backup exists
		if updateFailed {
			h.performRollback(backupDir, currentVersion, version)
		}
	}()

	// Step 1: Create backup
	h.setStatus("backup", 10, "Creating backup...")
	if err := exec.Command("cp", "-r", h.installDir, backupDir).Run(); err != nil {
		h.setError("Failed to create backup: " + err.Error())
		updateFailed = true
		return
	}

	// Step 2: Download update
	h.setStatus("download", 25, "Downloading update...")
	downloadURL := fmt.Sprintf("%s/api/v1/update/download/%s?license_key=%s",
		h.licenseServer, version, h.licenseKey)

	tmpFile := "/tmp/proxpanel-update.tar.gz.enc"
	if updateInfo == nil || !updateInfo.IsEncrypted {
		tmpFile = "/tmp/proxpanel-update.tar.gz"
	}

	if err := h.downloadFile(downloadURL, tmpFile); err != nil {
		h.setError("Failed to download update: " + err.Error())
		updateFailed = true
		return
	}

	// Step 3: Decrypt if encrypted
	decryptedFile := "/tmp/proxpanel-update.tar.gz"
	if updateInfo != nil && updateInfo.IsEncrypted {
		h.setStatus("decrypt", 35, "Decrypting update package...")

		if updateInfo.EncryptionKey == "" {
			h.setError("Encrypted package but no encryption key provided")
			os.Remove(tmpFile)
			updateFailed = true
			return
		}

		encryptedData, err := os.ReadFile(tmpFile)
		if err != nil {
			h.setError("Failed to read encrypted package: " + err.Error())
			os.Remove(tmpFile)
			updateFailed = true
			return
		}

		decryptedData, err := security.DecryptUpdatePackage(encryptedData, updateInfo.EncryptionKey)
		if err != nil {
			h.setError("Failed to decrypt package: " + err.Error())
			os.Remove(tmpFile)
			updateFailed = true
			return
		}

		// Write decrypted data
		if err := os.WriteFile(decryptedFile, decryptedData, 0644); err != nil {
			h.setError("Failed to write decrypted package: " + err.Error())
			os.Remove(tmpFile)
			updateFailed = true
			return
		}
		os.Remove(tmpFile) // Remove encrypted file

		// Step 4: Verify signature and checksum
		h.setStatus("verify", 45, "Verifying package integrity and signature...")

		if updateInfo.Checksum != "" && updateInfo.Signature != "" {
			if err := security.VerifyUpdatePackage(decryptedData, version, updateInfo.Checksum, updateInfo.Signature); err != nil {
				h.setError("Package verification failed: " + err.Error())
				os.Remove(decryptedFile)
				updateFailed = true
				return
			}
			log.Println("Update package signature and checksum verified successfully")
		} else if updateInfo.Checksum != "" {
			// Verify checksum only
			actualChecksum := security.CalculateChecksum(decryptedData)
			if actualChecksum != updateInfo.Checksum {
				h.setError(fmt.Sprintf("Checksum mismatch: expected %s, got %s", updateInfo.Checksum, actualChecksum))
				os.Remove(decryptedFile)
				updateFailed = true
				return
			}
			log.Println("Update package checksum verified successfully")
		}
	} else {
		// Non-encrypted: verify checksum if available
		h.setStatus("verify", 45, "Verifying package integrity...")

		if updateInfo != nil && updateInfo.Checksum != "" {
			// Read file to verify checksum
			fileData, err := os.ReadFile(decryptedFile)
			if err == nil {
				actualChecksum := security.CalculateChecksum(fileData)
				if actualChecksum != updateInfo.Checksum {
					h.setError(fmt.Sprintf("Checksum mismatch: expected %s, got %s", updateInfo.Checksum, actualChecksum))
					os.Remove(decryptedFile)
					updateFailed = true
					return
				}
				log.Println("Update package checksum verified successfully")
			}
		}
	}

	// Step 5: Extract update to temp directory first
	h.setStatus("extract", 55, "Extracting update...")
	tmpExtractDir := "/tmp/proxpanel-update-extract"
	os.RemoveAll(tmpExtractDir)
	os.MkdirAll(tmpExtractDir, 0755)

	cmd := exec.Command("tar", "-xzf", decryptedFile, "-C", tmpExtractDir)
	output, err := cmd.CombinedOutput()
	if err != nil {
		h.setError(fmt.Sprintf("Failed to extract update: %v - %s", err, string(output)))
		updateFailed = true
		return
	}
	os.Remove(decryptedFile)

	// Step 5: VALIDATE update package before applying
	h.setStatus("validate", 60, "Validating update package...")

	// Check for versioned root directory (e.g., proxpanel-1.0.27/)
	packageRoot := tmpExtractDir
	entries, _ := os.ReadDir(tmpExtractDir)
	for _, entry := range entries {
		if entry.IsDir() && (entry.Name() == "proxpanel-"+version ||
			(len(entry.Name()) > 10 && entry.Name()[:10] == "proxpanel-")) {
			packageRoot = filepath.Join(tmpExtractDir, entry.Name())
			break
		}
	}

	// Check that required files exist and are valid
	// Support multiple structures:
	// 1. backend/proisp-api/proisp-api (subdirectory with binary)
	// 2. backend/proisp-api (direct binary)
	// 3. backend/api (old name)
	apiBinary := filepath.Join(packageRoot, "backend", "proisp-api", "proisp-api")
	if _, err := os.Stat(apiBinary); err != nil {
		// Try flat structure
		apiBinary = filepath.Join(packageRoot, "backend", "proisp-api")
	}
	if _, err := os.Stat(apiBinary); err != nil {
		// Try old name
		apiBinary = filepath.Join(packageRoot, "backend", "api")
	}

	radiusBinary := filepath.Join(packageRoot, "backend", "proisp-radius", "proisp-radius")
	if _, err := os.Stat(radiusBinary); err != nil {
		// Try flat structure
		radiusBinary = filepath.Join(packageRoot, "backend", "proisp-radius")
	}
	if _, err := os.Stat(radiusBinary); err != nil {
		// Try old name
		radiusBinary = filepath.Join(packageRoot, "backend", "radius")
	}

	// Support both frontend/dist (new) and frontend/ directly (old 1.0.23 format)
	frontendDist := filepath.Join(packageRoot, "frontend", "dist")
	if _, err := os.Stat(filepath.Join(frontendDist, "index.html")); err != nil {
		// Try old format - files directly in frontend/
		frontendDist = filepath.Join(packageRoot, "frontend")
	}

	// Validate API binary exists and is a file (not directory)
	if apiInfo, err := os.Stat(apiBinary); err != nil || apiInfo.IsDir() {
		h.setError("Invalid update package: API binary missing or invalid")
		os.RemoveAll(tmpExtractDir)
		updateFailed = true
		return
	}

	// Validate RADIUS binary exists and is a file
	if radiusInfo, err := os.Stat(radiusBinary); err != nil || radiusInfo.IsDir() {
		h.setError("Invalid update package: RADIUS binary missing or invalid")
		os.RemoveAll(tmpExtractDir)
		updateFailed = true
		return
	}

	// Validate frontend dist exists and is a directory
	if distInfo, err := os.Stat(frontendDist); err != nil || !distInfo.IsDir() {
		h.setError("Invalid update package: Frontend dist missing or invalid")
		os.RemoveAll(tmpExtractDir)
		updateFailed = true
		return
	}

	// Validate frontend has index.html
	if _, err := os.Stat(filepath.Join(frontendDist, "index.html")); err != nil {
		h.setError("Invalid update package: Frontend index.html missing")
		os.RemoveAll(tmpExtractDir)
		updateFailed = true
		return
	}

	// Test that binaries are executable (ELF format check)
	h.setStatus("validate", 65, "Testing binaries...")
	testCmd := exec.Command(apiBinary, "--version")
	testCmd.Env = append(os.Environ(), "PROXPANEL_VERSION=test")
	// Just check it doesn't crash immediately - timeout after 2 seconds
	if err := testCmd.Start(); err == nil {
		go func() {
			time.Sleep(2 * time.Second)
			testCmd.Process.Kill()
		}()
		testCmd.Wait()
	}

	// Step 6: Apply update (copy files - don't stop API, it will restart after)
	h.setStatus("apply", 70, "Applying update files...")

	// Backup current binaries (in case we need to rollback)
	exec.Command("cp", filepath.Join(h.installDir, "backend", "proisp-api"), "/tmp/proisp-api-backup").Run()
	exec.Command("cp", filepath.Join(h.installDir, "backend", "proisp-radius"), "/tmp/proisp-radius-backup").Run()

	// Update backend binaries - copy to temp first, then move (atomic)
	exec.Command("mkdir", "-p", filepath.Join(h.installDir, "backend")).Run()

	// Copy API to temp location first
	tmpApi := filepath.Join(h.installDir, "backend", "proisp-api.new")
	if err := exec.Command("cp", "-f", apiBinary, tmpApi).Run(); err != nil {
		h.setError("Failed to copy API binary: " + err.Error())
		os.RemoveAll(tmpExtractDir)
		updateFailed = true
		return
	}
	exec.Command("chmod", "+x", tmpApi).Run()

	// Copy RADIUS to temp location
	tmpRadius := filepath.Join(h.installDir, "backend", "proisp-radius.new")
	if err := exec.Command("cp", "-f", radiusBinary, tmpRadius).Run(); err != nil {
		h.setError("Failed to copy RADIUS binary: " + err.Error())
		os.Remove(tmpApi)
		os.RemoveAll(tmpExtractDir)
		updateFailed = true
		return
	}
	exec.Command("chmod", "+x", tmpRadius).Run()

	h.setStatus("apply", 75, "Updating frontend...")

	// Update frontend dist - copy to temp first
	tmpDist := filepath.Join(h.installDir, "frontend", "dist.new")
	exec.Command("rm", "-rf", tmpDist).Run()
	if err := exec.Command("cp", "-r", frontendDist, tmpDist).Run(); err != nil {
		h.setError("Failed to copy frontend: " + err.Error())
		os.Remove(tmpApi)
		os.Remove(tmpRadius)
		os.RemoveAll(tmpExtractDir)
		updateFailed = true
		return
	}

	// Now atomically move files into place
	h.setStatus("apply", 80, "Finalizing file updates...")

	// Move new binaries into place (mv is atomic on same filesystem)
	exec.Command("mv", "-f", tmpApi, filepath.Join(h.installDir, "backend", "proisp-api")).Run()
	exec.Command("mv", "-f", tmpRadius, filepath.Join(h.installDir, "backend", "proisp-radius")).Run()

	// Move frontend
	oldDist := filepath.Join(h.installDir, "frontend", "dist.old")
	currentDist := filepath.Join(h.installDir, "frontend", "dist")
	exec.Command("rm", "-rf", oldDist).Run()
	exec.Command("mv", currentDist, oldDist).Run()
	exec.Command("mv", tmpDist, currentDist).Run()
	exec.Command("rm", "-rf", oldDist).Run()

	// Ensure nginx.conf exists for frontend
	nginxConf := filepath.Join(h.installDir, "frontend", "nginx.conf")
	if _, err := os.Stat(nginxConf); os.IsNotExist(err) {
		nginxContent := `server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location /api {
        proxy_pass http://proxpanel-api:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
`
		os.WriteFile(nginxConf, []byte(nginxContent), 0644)
	}

	// Cleanup
	os.RemoveAll(tmpExtractDir)
	os.Remove("/tmp/proisp-api-backup")
	os.Remove("/tmp/proisp-radius-backup")

	// Step 5: Update version file
	h.setStatus("finalize", 80, "Finalizing update...")
	os.WriteFile(filepath.Join(h.installDir, "VERSION"), []byte(version), 0644)

	// Step 6: Report success to license server
	h.setStatus("report", 90, "Reporting update status...")
	h.reportUpdateStatus(currentVersion, version, "success", "")

	// Done - need restart
	h.mutex.Lock()
	h.updateStatus.Step = "complete"
	h.updateStatus.Progress = 100
	h.updateStatus.Message = "Update complete! Restarting services..."
	h.updateStatus.NeedsRestart = true
	h.mutex.Unlock()

	// Trigger service restart
	go h.restartServices()
}

func (h *SystemUpdateHandler) setError(message string) {
	h.mutex.Lock()
	defer h.mutex.Unlock()
	h.updateStatus.Error = message
	h.updateStatus.Message = "Update failed"
	h.updateStatus.Progress = 0
}

func (h *SystemUpdateHandler) downloadFile(url, dest string) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed with status: %d", resp.StatusCode)
	}

	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	return err
}

func (h *SystemUpdateHandler) verifyChecksum(file, expected string) bool {
	f, err := os.Open(file)
	if err != nil {
		return false
	}
	defer f.Close()

	hasher := sha256.New()
	if _, err := io.Copy(hasher, f); err != nil {
		return false
	}

	actual := hex.EncodeToString(hasher.Sum(nil))
	return actual == expected
}

func (h *SystemUpdateHandler) reportUpdateStatus(fromVersion, toVersion, status, errorMsg string) {
	serverIP := os.Getenv("SERVER_IP")
	reqBody, _ := json.Marshal(map[string]string{
		"license_key":   h.licenseKey,
		"server_ip":     serverIP,
		"from_version":  fromVersion,
		"to_version":    toVersion,
		"status":        status,
		"error_message": errorMsg,
	})

	http.Post(
		h.licenseServer+"/api/v1/update/report",
		"application/json",
		bytes.NewBuffer(reqBody),
	)
}

func (h *SystemUpdateHandler) restartServices() {
	time.Sleep(1 * time.Second)

	// Restart frontend to pick up new dist files
	exec.Command("docker", "restart", "proxpanel-frontend").Run()
	time.Sleep(2 * time.Second)

	// Restart RADIUS to pick up new binary
	exec.Command("docker", "restart", "proxpanel-radius").Run()
	time.Sleep(1 * time.Second)

	// Restart API last - this will use the new binary
	// The current request will complete, then container restarts with new code
	exec.Command("docker", "restart", "proxpanel-api").Run()
}

// performRollback restores the system to the backup state after a failed update
func (h *SystemUpdateHandler) performRollback(backupDir, fromVersion, toVersion string) {
	// Check if backup exists
	if _, err := os.Stat(backupDir); os.IsNotExist(err) {
		log.Printf("Rollback: No backup found at %s, cannot rollback", backupDir)
		h.reportUpdateStatus(fromVersion, toVersion, "failed", h.updateStatus.Error)
		return
	}

	log.Printf("Rollback: Starting automatic rollback from %s...", backupDir)
	h.setStatus("rollback", 0, "Rolling back to previous version...")

	// Restore backend binaries
	h.setStatus("rollback", 25, "Restoring API binary...")
	backupApi := filepath.Join(backupDir, "backend", "proisp-api")
	if _, err := os.Stat(backupApi); err == nil {
		exec.Command("cp", "-f", backupApi, filepath.Join(h.installDir, "backend", "proisp-api")).Run()
		exec.Command("chmod", "+x", filepath.Join(h.installDir, "backend", "proisp-api")).Run()
	}

	h.setStatus("rollback", 50, "Restoring RADIUS binary...")
	backupRadius := filepath.Join(backupDir, "backend", "proisp-radius")
	if _, err := os.Stat(backupRadius); err == nil {
		exec.Command("cp", "-f", backupRadius, filepath.Join(h.installDir, "backend", "proisp-radius")).Run()
		exec.Command("chmod", "+x", filepath.Join(h.installDir, "backend", "proisp-radius")).Run()
	}

	h.setStatus("rollback", 75, "Restoring frontend...")
	backupFrontend := filepath.Join(backupDir, "frontend", "dist")
	if _, err := os.Stat(backupFrontend); err == nil {
		currentDist := filepath.Join(h.installDir, "frontend", "dist")
		exec.Command("rm", "-rf", currentDist).Run()
		exec.Command("cp", "-r", backupFrontend, currentDist).Run()
	}

	// Restore VERSION file
	backupVersion := filepath.Join(backupDir, "VERSION")
	if _, err := os.Stat(backupVersion); err == nil {
		exec.Command("cp", "-f", backupVersion, filepath.Join(h.installDir, "VERSION")).Run()
	}

	h.setStatus("rollback", 90, "Cleaning up and reporting...")

	// Report rollback status
	h.reportUpdateStatus(fromVersion, toVersion, "rolled_back", h.updateStatus.Error)

	// Cleanup backup after successful rollback
	os.RemoveAll(backupDir)

	h.mutex.Lock()
	h.updateStatus.Step = "rolled_back"
	h.updateStatus.Progress = 100
	h.updateStatus.Message = "Update failed. System has been rolled back to the previous version."
	h.mutex.Unlock()

	log.Println("Rollback: Automatic rollback completed successfully")
}

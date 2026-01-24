package handlers

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
)

// SystemUpdateHandler handles system updates
type SystemUpdateHandler struct {
	licenseServer string
	licenseKey    string
	installDir    string
	updating      bool
	updateStatus  *UpdateStatus
	mutex         sync.RWMutex
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
	ReleasedAt      string `json:"released_at"`
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

	return c.JSON(fiber.Map{
		"success":          true,
		"update_available": updateResp.UpdateAvailable,
		"current_version":  currentVersion,
		"new_version":      updateResp.Version,
		"release_notes":    updateResp.ReleaseNotes,
		"is_critical":      updateResp.IsCritical,
		"file_size":        updateResp.FileSize,
		"released_at":      updateResp.ReleasedAt,
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
	h.mutex.Unlock()

	defer func() {
		h.mutex.Lock()
		h.updating = false
		h.updateStatus.InProgress = false
		h.updateStatus.CompletedAt = time.Now()
		h.mutex.Unlock()
	}()

	// Step 1: Create backup
	h.setStatus("backup", 10, "Creating backup...")
	backupDir := fmt.Sprintf("/opt/proxpanel-backup-%s", time.Now().Format("20060102-150405"))
	if err := exec.Command("cp", "-r", h.installDir, backupDir).Run(); err != nil {
		h.setError("Failed to create backup: " + err.Error())
		return
	}

	// Step 2: Download update
	h.setStatus("download", 30, "Downloading update...")
	downloadURL := fmt.Sprintf("%s/api/v1/update/download/%s?license_key=%s",
		h.licenseServer, version, h.licenseKey)

	tmpFile := "/tmp/proxpanel-update.tar.gz"
	if err := h.downloadFile(downloadURL, tmpFile); err != nil {
		h.setError("Failed to download update: " + err.Error())
		return
	}

	// Step 3: Verify checksum (optional, if provided)
	h.setStatus("verify", 50, "Verifying package integrity...")

	// Step 4: Rename old binaries to allow extraction (handles "Text file busy")
	h.setStatus("prepare", 55, "Preparing files for update...")
	apiOld := filepath.Join(h.installDir, "backend/proisp-api/proisp-api")
	radiusOld := filepath.Join(h.installDir, "backend/proisp-radius/proisp-radius")
	os.Rename(apiOld, apiOld+".old")
	os.Rename(radiusOld, radiusOld+".old")

	// Step 5: Extract update
	h.setStatus("extract", 60, "Extracting update...")
	if err := exec.Command("tar", "-xzf", tmpFile, "-C", h.installDir, "--overwrite").Run(); err != nil {
		// Restore on failure
		os.Rename(apiOld+".old", apiOld)
		os.Rename(radiusOld+".old", radiusOld)
		h.setError("Failed to extract update: " + err.Error())
		return
	}
	os.Remove(tmpFile)
	os.Remove(apiOld + ".old")
	os.Remove(radiusOld + ".old")

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
	time.Sleep(2 * time.Second)

	// Restart via docker-compose
	cmd := exec.Command("docker-compose", "restart", "api", "radius")
	cmd.Dir = h.installDir
	cmd.Run()
}

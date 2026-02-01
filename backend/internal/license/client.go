package license

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/proisp/backend/internal/security"
)

// Config holds license client configuration
type Config struct {
	ServerURL     string
	LicenseKey    string
	CheckInterval time.Duration
}

// Client handles license validation and communication
type Client struct {
	config        Config
	httpClient    *http.Client
	licenseInfo   *LicenseInfo
	encryptionKey string
	mutex         sync.RWMutex
	stopChan      chan struct{}
	isValid       bool
	lastCheck     time.Time
	gracePeriod   bool
}

// LicenseInfo contains license details from server
type LicenseInfo struct {
	Valid           bool       `json:"valid"`
	Message         string     `json:"message"`
	LicenseID       uint       `json:"license_id,omitempty"`
	CustomerName    string     `json:"customer_name,omitempty"`
	Tier            string     `json:"tier,omitempty"`
	MaxSubscribers  int        `json:"max_subscribers,omitempty"`
	Features        string     `json:"features,omitempty"`
	ExpiresAt       *time.Time `json:"expires_at,omitempty"`
	IsLifetime      bool       `json:"is_lifetime,omitempty"`
	EncryptionKey   string     `json:"encryption_key,omitempty"`
	GracePeriod     bool       `json:"grace_period,omitempty"`
	DaysRemaining   int        `json:"days_remaining,omitempty"`
	// WHMCS-style license status
	LicenseStatus   string `json:"license_status"`    // active, warning, grace, readonly, blocked
	ReadOnly        bool   `json:"read_only"`         // true if system should be read-only
	DaysUntilExpiry int    `json:"days_until_expiry"` // negative if expired
	WarningMessage  string `json:"warning_message,omitempty"`
}

// HeartbeatRequest contains usage data for heartbeat
type HeartbeatRequest struct {
	LicenseKey      string  `json:"license_key"`
	ServerIP        string  `json:"server_ip"`
	SubscriberCount int     `json:"subscriber_count"`
	OnlineCount     int     `json:"online_count"`
	CPUUsage        float64 `json:"cpu_usage"`
	MemoryUsage     float64 `json:"memory_usage"`
	DiskUsage       float64 `json:"disk_usage"`
	Version         string  `json:"version"`
}

// Global client instance
var defaultClient *Client
var devMode bool

// buildMode is set at compile time: -ldflags "-X github.com/proisp/backend/internal/license.buildMode=dev"
// For production builds, this remains empty and license validation is enforced
var buildMode string

// Initialize creates and starts the license client
func Initialize(serverURL, licenseKey string) error {
	// Internal development check - uses build-time variable, not environment
	// This is set only when building for development: go build -ldflags "-X github.com/proisp/backend/internal/license.buildMode=dev"
	if buildMode == "dev" {
		devMode = true
		defaultClient = &Client{
			isValid: true,
			licenseInfo: &LicenseInfo{
				Valid:          true,
				LicenseStatus:  "active",
				Message:        "Development build",
				CustomerName:   "Development",
				Tier:           "unlimited",
				MaxSubscribers: 999999,
				IsLifetime:     true,
			},
			stopChan: make(chan struct{}),
		}
		return nil
	}

	config := Config{
		ServerURL:     serverURL,
		LicenseKey:    licenseKey,
		CheckInterval: 30 * time.Second, // Check every 30 seconds (pro security)
	}

	client := &Client{
		config: config,
		httpClient: security.CreatePinnedHTTPClient(),
		stopChan: make(chan struct{}),
	}

	// Initialize enterprise security features
	security.InitEnterpriseSecurity(licenseKey)

	// Register stealth check function for random delayed checks
	security.RegisterStealthCheck(func() bool {
		if client == nil {
			return false
		}
		err := client.validate()
		return err == nil
	})

	// Initial validation - always set defaultClient so status can be queried
	validationErr := client.validate()

	// Set the client even if validation failed, so status can still be reported
	defaultClient = client

	// Set validation point for initialization
	security.SetValidationPoint("init", validationErr == nil)

	// Start background validation
	go client.backgroundCheck()

	if validationErr != nil {
		// Log the license status for debugging
		if client.licenseInfo != nil {
			log.Printf("License validation failed. Status: %s, Message: %s",
				client.licenseInfo.LicenseStatus, client.licenseInfo.Message)
		}
		return fmt.Errorf("initial license validation failed: %v", validationErr)
	}

	log.Printf("License client initialized. Customer: %s, Tier: %s, Max Subscribers: %d",
		client.licenseInfo.CustomerName, client.licenseInfo.Tier, client.licenseInfo.MaxSubscribers)

	return nil
}

// IsValid returns whether the license is currently valid
func IsValid() bool {
	if defaultClient == nil {
		return false
	}
	defaultClient.mutex.RLock()
	defer defaultClient.mutex.RUnlock()

	// Also check all validation points (multi-point validation)
	if !security.CheckAllValidationPoints() {
		// Set validation point to track this check
		security.SetValidationPoint("isvalid_check", false)
		return false
	}

	security.SetValidationPoint("isvalid_check", true)
	return defaultClient.isValid
}

// GetEncryptionKey returns the license encryption key
func GetEncryptionKey() string {
	if defaultClient == nil {
		return ""
	}
	defaultClient.mutex.RLock()
	defer defaultClient.mutex.RUnlock()
	return defaultClient.encryptionKey
}

// GetLicenseInfo returns current license information
func GetLicenseInfo() *LicenseInfo {
	if defaultClient == nil {
		return nil
	}
	defaultClient.mutex.RLock()
	defer defaultClient.mutex.RUnlock()
	return defaultClient.licenseInfo
}

// GetMaxSubscribers returns the maximum allowed subscribers
func GetMaxSubscribers() int {
	if defaultClient == nil {
		return 0
	}
	defaultClient.mutex.RLock()
	defer defaultClient.mutex.RUnlock()
	if defaultClient.licenseInfo != nil {
		return defaultClient.licenseInfo.MaxSubscribers
	}
	return 0
}

// Secrets contains database/service secrets fetched from license server
type Secrets struct {
	DBPassword    string `json:"db_password"`
	RedisPassword string `json:"redis_password"`
	JWTSecret     string `json:"jwt_secret"`
	EncryptionKey string `json:"encryption_key"`
}

// FetchSecrets retrieves database/service secrets from the license server
// This is used for Option 2 security - secrets are not stored on customer disk
func FetchSecrets(serverURL, licenseKey string) (*Secrets, error) {
	if serverURL == "" || licenseKey == "" {
		return nil, fmt.Errorf("server URL and license key are required")
	}

	// Build hardware ID for verification
	hardwareID := security.GetHardwareID()

	url := fmt.Sprintf("%s/api/v1/license/secrets", serverURL)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %v", err)
	}

	req.Header.Set("X-License-Key", licenseKey)
	req.Header.Set("X-Hardware-ID", hardwareID)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch secrets: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %v", err)
	}

	if resp.StatusCode != 200 {
		var errResp struct {
			Message string `json:"message"`
		}
		json.Unmarshal(body, &errResp)
		return nil, fmt.Errorf("license server error: %s", errResp.Message)
	}

	var response struct {
		Success bool    `json:"success"`
		Data    Secrets `json:"data"`
	}

	if err := json.Unmarshal(body, &response); err != nil {
		return nil, fmt.Errorf("failed to parse response: %v", err)
	}

	if !response.Success {
		return nil, fmt.Errorf("failed to fetch secrets")
	}

	log.Printf("Secrets fetched from license server successfully")
	return &response.Data, nil
}

// CanAddSubscriber checks if adding a new subscriber is allowed
// Returns: allowed, currentCount, maxAllowed, error
func CanAddSubscriber(currentCount int) (bool, int, int, error) {
	if defaultClient == nil {
		return false, 0, 0, fmt.Errorf("license client not initialized")
	}

	// In dev mode, always allow
	if devMode {
		return true, currentCount, 999999, nil
	}

	maxSubscribers := GetMaxSubscribers()
	if maxSubscribers == 0 {
		// No limit set - allow
		return true, currentCount, 0, nil
	}

	if currentCount >= maxSubscribers {
		return false, currentCount, maxSubscribers, nil
	}

	return true, currentCount, maxSubscribers, nil
}

// VerifySubscriberCount verifies subscriber count with license server (remote check)
func VerifySubscriberCount(currentCount int) (bool, string, error) {
	if defaultClient == nil {
		return false, "", fmt.Errorf("license client not initialized")
	}

	// In dev mode, always allow
	if devMode {
		return true, "", nil
	}

	serverIP, _ := getOutboundIP()

	req := map[string]interface{}{
		"license_key":       defaultClient.config.LicenseKey,
		"server_ip":         serverIP,
		"subscriber_count":  currentCount,
		"action":            "add_subscriber",
	}

	body, err := json.Marshal(req)
	if err != nil {
		return false, "", err
	}

	resp, err := defaultClient.httpClient.Post(
		defaultClient.config.ServerURL+"/api/v1/license/verify-subscriber",
		"application/json",
		bytes.NewBuffer(body),
	)
	if err != nil {
		// On network error, fall back to local check
		log.Printf("Warning: Could not verify with license server: %v, using local check", err)
		allowed, _, _, _ := CanAddSubscriber(currentCount)
		return allowed, "", nil
	}
	defer resp.Body.Close()

	var result struct {
		Success bool   `json:"success"`
		Allowed bool   `json:"allowed"`
		Message string `json:"message"`
		Max     int    `json:"max_subscribers"`
		Current int    `json:"current_count"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false, "", err
	}

	if !result.Allowed {
		return false, result.Message, nil
	}

	return true, "", nil
}

// InGracePeriod returns whether we're in the grace period
func InGracePeriod() bool {
	if defaultClient == nil {
		return false
	}
	defaultClient.mutex.RLock()
	defer defaultClient.mutex.RUnlock()
	return defaultClient.gracePeriod
}

// IsReadOnly returns whether the system should be in read-only mode
func IsReadOnly() bool {
	if defaultClient == nil {
		return false
	}
	defaultClient.mutex.RLock()
	defer defaultClient.mutex.RUnlock()
	if defaultClient.licenseInfo != nil {
		return defaultClient.licenseInfo.ReadOnly
	}
	return false
}

// GetLicenseStatus returns the current license status (active, warning, grace, readonly, blocked)
func GetLicenseStatus() string {
	if defaultClient == nil {
		return "unknown"
	}
	defaultClient.mutex.RLock()
	defer defaultClient.mutex.RUnlock()
	if defaultClient.licenseInfo != nil && defaultClient.licenseInfo.LicenseStatus != "" {
		return defaultClient.licenseInfo.LicenseStatus
	}
	if defaultClient.isValid {
		return "active"
	}
	return "blocked"
}

// IsDevMode returns true if running in development mode (no license checks)
func IsDevMode() bool {
	return devMode
}

// GetWarningMessage returns any license warning message
func GetWarningMessage() string {
	if defaultClient == nil {
		return ""
	}
	defaultClient.mutex.RLock()
	defer defaultClient.mutex.RUnlock()
	if defaultClient.licenseInfo != nil {
		return defaultClient.licenseInfo.WarningMessage
	}
	return ""
}

// GetDaysUntilExpiry returns days until license expires (negative if expired)
func GetDaysUntilExpiry() int {
	if defaultClient == nil {
		return 0
	}
	defaultClient.mutex.RLock()
	defer defaultClient.mutex.RUnlock()
	if defaultClient.licenseInfo != nil {
		return defaultClient.licenseInfo.DaysUntilExpiry
	}
	return 0
}

// SendHeartbeat sends usage statistics to license server
func SendHeartbeat(subscriberCount, onlineCount int, cpuUsage, memUsage, diskUsage float64) error {
	if defaultClient == nil {
		return fmt.Errorf("license client not initialized")
	}
	return defaultClient.sendHeartbeat(subscriberCount, onlineCount, cpuUsage, memUsage, diskUsage)
}

// Stop gracefully stops the license client
func Stop() {
	if defaultClient != nil && defaultClient.stopChan != nil {
		close(defaultClient.stopChan)
	}
}

// Revalidate forces a re-validation with the license server
func Revalidate() error {
	if defaultClient == nil {
		return fmt.Errorf("license client not initialized")
	}
	// Skip validation in dev mode - always valid
	if devMode {
		return nil
	}
	return defaultClient.validate()
}

// validate performs license validation with the server
func (c *Client) validate() error {
	serverIP, _ := getOutboundIP()
	serverMAC, _ := getMACAddress()
	// Use HOST_HOSTNAME env var first (explicitly set for Docker), then HOSTNAME
	hostname := os.Getenv("HOST_HOSTNAME")
	if hostname == "" {
		hostname = os.Getenv("HOSTNAME")
	}
	if hostname == "" {
		hostname, _ = os.Hostname()
	}
	hardwareID := security.GetHardwareID()

	req := map[string]string{
		"license_key": c.config.LicenseKey,
		"server_ip":   serverIP,
		"server_mac":  serverMAC,
		"hostname":    hostname,
		"version":     getVersion(),
		"hardware_id": hardwareID,
	}

	body, err := json.Marshal(req)
	if err != nil {
		return err
	}

	resp, err := c.httpClient.Post(
		c.config.ServerURL+"/api/v1/license/validate",
		"application/json",
		bytes.NewBuffer(body),
	)
	if err != nil {
		return fmt.Errorf("failed to contact license server: %v", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	var info LicenseInfo
	if err := json.Unmarshal(respBody, &info); err != nil {
		return fmt.Errorf("invalid response from license server: %v", err)
	}

	c.mutex.Lock()
	defer c.mutex.Unlock()

	c.licenseInfo = &info
	c.isValid = info.Valid
	c.encryptionKey = info.EncryptionKey
	c.gracePeriod = info.GracePeriod
	c.lastCheck = time.Now()

	// Record check time for timing anomaly detection
	security.RecordCheckTime()

	// Set validation point
	security.SetValidationPoint("validate", info.Valid)

	// Kill switch - immediate termination if license is killed by server
	if info.LicenseStatus == "killed" || info.LicenseStatus == "terminated" {
		log.Println("FATAL: License has been terminated by server. Shutting down.")
		os.Exit(1)
	}

	if !info.Valid {
		return fmt.Errorf("license validation failed: %s", info.Message)
	}

	return nil
}

// backgroundCheck runs periodic license checks
func (c *Client) backgroundCheck() {
	ticker := time.NewTicker(c.config.CheckInterval)
	defer ticker.Stop()

	for {
		select {
		case <-c.stopChan:
			return
		case <-ticker.C:
			if err := c.validate(); err != nil {
				log.Printf("License revalidation failed: %v", err)
				// Don't immediately invalidate - use grace period
				c.mutex.Lock()
				if time.Since(c.lastCheck) > 5*time.Minute {
					c.isValid = false
					log.Println("License marked as invalid after 5 minutes without successful validation")
				}
				c.mutex.Unlock()
			}
		}
	}
}

// sendHeartbeat sends usage data to license server
func (c *Client) sendHeartbeat(subscriberCount, onlineCount int, cpuUsage, memUsage, diskUsage float64) error {
	serverIP, _ := getOutboundIP()

	req := HeartbeatRequest{
		LicenseKey:      c.config.LicenseKey,
		ServerIP:        serverIP,
		SubscriberCount: subscriberCount,
		OnlineCount:     onlineCount,
		CPUUsage:        cpuUsage,
		MemoryUsage:     memUsage,
		DiskUsage:       diskUsage,
		Version:         getVersion(),
	}

	body, err := json.Marshal(req)
	if err != nil {
		return err
	}

	resp, err := c.httpClient.Post(
		c.config.ServerURL+"/api/v1/license/heartbeat",
		"application/json",
		bytes.NewBuffer(body),
	)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var result struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return err
	}

	if !result.Success {
		security.SetValidationPoint("heartbeat", false)
		return fmt.Errorf("heartbeat failed: %s", result.Message)
	}

	security.SetValidationPoint("heartbeat", true)
	return nil
}

// Helper functions

func getOutboundIP() (string, error) {
	// Use SERVER_IP from environment if set (for Docker containers)
	if serverIP := os.Getenv("SERVER_IP"); serverIP != "" {
		return serverIP, nil
	}
	// Fallback to auto-detection
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return "", err
	}
	defer conn.Close()
	localAddr := conn.LocalAddr().(*net.UDPAddr)
	return localAddr.IP.String(), nil
}

func getMACAddress() (string, error) {
	// Use SERVER_MAC from environment if set (for Docker containers)
	if serverMAC := os.Getenv("SERVER_MAC"); serverMAC != "" {
		return serverMAC, nil
	}

	interfaces, err := net.Interfaces()
	if err != nil {
		return "", err
	}

	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp != 0 && iface.Flags&net.FlagLoopback == 0 {
			mac := iface.HardwareAddr.String()
			if mac != "" {
				return mac, nil
			}
		}
	}

	return "", fmt.Errorf("no MAC address found")
}

func getVersion() string {
	// This would normally come from build flags
	return os.Getenv("PROXPANEL_VERSION")
}

// AsyncSubscriberValidation runs subscriber count validation in background
// This doesn't block the application but enforces limits
func AsyncSubscriberValidation(currentCount int) {
	if defaultClient == nil || devMode {
		return
	}

	go func() {
		allowed, msg, err := VerifySubscriberCount(currentCount)
		if err != nil {
			log.Printf("Async subscriber validation error: %v", err)
			return
		}
		if !allowed {
			log.Printf("WARNING: Subscriber limit exceeded: %s", msg)
			// Update local state to reflect limit exceeded
			defaultClient.mutex.Lock()
			if defaultClient.licenseInfo != nil {
				defaultClient.licenseInfo.WarningMessage = msg
			}
			defaultClient.mutex.Unlock()
		}
	}()
}

// StartAsyncHeartbeat starts a background goroutine that sends heartbeats
// without blocking the main application
func StartAsyncHeartbeat(getStats func() (int, int, float64, float64, float64)) {
	if defaultClient == nil || devMode {
		return
	}

	go func() {
		// Initial delay before first heartbeat
		time.Sleep(10 * time.Second)

		ticker := time.NewTicker(60 * time.Second) // Heartbeat every 60 seconds
		defer ticker.Stop()

		for {
			select {
			case <-defaultClient.stopChan:
				return
			case <-ticker.C:
				subscriberCount, onlineCount, cpu, mem, disk := getStats()
				if err := defaultClient.sendHeartbeat(subscriberCount, onlineCount, cpu, mem, disk); err != nil {
					log.Printf("Async heartbeat failed: %v", err)
				}
			}
		}
	}()
}

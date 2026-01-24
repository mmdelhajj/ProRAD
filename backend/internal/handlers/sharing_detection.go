package handlers

import (
	"fmt"
	"log"
	"sort"
	"sync"

	"github.com/gofiber/fiber/v2"
	"github.com/proisp/backend/internal/database"
	"github.com/proisp/backend/internal/mikrotik"
	"github.com/proisp/backend/internal/models"
)

type SharingDetectionHandler struct{}

func NewSharingDetectionHandler() *SharingDetectionHandler {
	return &SharingDetectionHandler{}
}

// SuspiciousAccount represents an account suspected of sharing
type SuspiciousAccount struct {
	SubscriberID    uint   `json:"subscriber_id"`
	Username        string `json:"username"`
	FullName        string `json:"full_name"`
	IPAddress       string `json:"ip_address"`
	ServiceName     string `json:"service_name"`
	ConnectionCount int    `json:"connection_count"`
	TTLValues       []int  `json:"ttl_values"`
	TTLStatus       string `json:"ttl_status"` // "normal", "router_detected", "multiple_os"
	SuspicionLevel  string `json:"suspicion_level"` // "low", "medium", "high"
	Reasons         []string `json:"reasons"`
	NASName         string `json:"nas_name"`
	NASIPAddress    string `json:"nas_ip_address"`
}

// SharingStats represents overall sharing detection statistics
type SharingStats struct {
	TotalOnline       int `json:"total_online"`
	SuspiciousCount   int `json:"suspicious_count"`
	HighRiskCount     int `json:"high_risk_count"`
	RouterDetected    int `json:"router_detected"`
	HighConnections   int `json:"high_connections"`
}

// Thresholds for detection
const (
	ConnectionThresholdMedium = 200  // Medium suspicion
	ConnectionThresholdHigh   = 400  // High suspicion
	NormalTTLWindows          = 128  // Windows default
	NormalTTLLinux            = 64   // Linux/Android/iOS default
)

// List returns all online users with sharing detection analysis
func (h *SharingDetectionHandler) List(c *fiber.Ctx) error {
	// Get thresholds from query params (allow customization)
	connThresholdMedium := c.QueryInt("conn_threshold_medium", ConnectionThresholdMedium)
	connThresholdHigh := c.QueryInt("conn_threshold_high", ConnectionThresholdHigh)

	// Get all online subscribers with their NAS and Service
	var subscribers []models.Subscriber
	if err := database.DB.Preload("Nas").Preload("Service").
		Where("is_online = ?", true).Find(&subscribers).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to get online subscribers",
		})
	}

	if len(subscribers) == 0 {
		return c.JSON(fiber.Map{
			"success": true,
			"data":    []SuspiciousAccount{},
			"stats": SharingStats{
				TotalOnline: 0,
			},
		})
	}

	// Group subscribers by NAS
	nasSubs := make(map[uint][]models.Subscriber)
	for _, sub := range subscribers {
		if sub.NasID != nil {
			nasSubs[*sub.NasID] = append(nasSubs[*sub.NasID], sub)
		}
	}

	// Analyze each NAS in parallel
	var allResults []SuspiciousAccount
	var mu sync.Mutex
	var wg sync.WaitGroup

	for nasID, subs := range nasSubs {
		if len(subs) == 0 || subs[0].Nas == nil {
			continue
		}

		wg.Add(1)
		go func(nas *models.Nas, subscribers []models.Subscriber) {
			defer wg.Done()
			results := analyzeNasSubscribers(nas, subscribers, connThresholdMedium, connThresholdHigh)
			mu.Lock()
			allResults = append(allResults, results...)
			mu.Unlock()
		}(subs[0].Nas, subs)
		_ = nasID // avoid unused variable
	}

	wg.Wait()

	// Sort by suspicion level (high first) then by connection count
	sort.Slice(allResults, func(i, j int) bool {
		levelOrder := map[string]int{"high": 0, "medium": 1, "low": 2}
		if levelOrder[allResults[i].SuspicionLevel] != levelOrder[allResults[j].SuspicionLevel] {
			return levelOrder[allResults[i].SuspicionLevel] < levelOrder[allResults[j].SuspicionLevel]
		}
		return allResults[i].ConnectionCount > allResults[j].ConnectionCount
	})

	// Calculate stats
	stats := SharingStats{
		TotalOnline: len(subscribers),
	}
	for _, r := range allResults {
		if r.SuspicionLevel == "medium" || r.SuspicionLevel == "high" {
			stats.SuspiciousCount++
		}
		if r.SuspicionLevel == "high" {
			stats.HighRiskCount++
		}
		if r.TTLStatus == "router_detected" {
			stats.RouterDetected++
		}
		if r.ConnectionCount >= connThresholdMedium {
			stats.HighConnections++
		}
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    allResults,
		"stats":   stats,
	})
}

// GetSubscriberDetails returns detailed sharing analysis for a specific subscriber
func (h *SharingDetectionHandler) GetSubscriberDetails(c *fiber.Ctx) error {
	id := c.Params("id")

	var subscriber models.Subscriber
	if err := database.DB.Preload("Nas").Preload("Service").First(&subscriber, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Subscriber not found",
		})
	}

	if !subscriber.IsOnline || subscriber.Nas == nil {
		return c.JSON(fiber.Map{
			"success": true,
			"data": fiber.Map{
				"subscriber_id": subscriber.ID,
				"username":      subscriber.Username,
				"is_online":     false,
				"message":       "Subscriber is offline",
			},
		})
	}

	// Get detailed connection info from MikroTik
	client := mikrotik.NewClient(
		fmt.Sprintf("%s:%d", subscriber.Nas.IPAddress, subscriber.Nas.APIPort),
		subscriber.Nas.APIUsername,
		subscriber.Nas.APIPassword,
	)
	defer client.Close()

	// Get connection count
	connCount, err := client.GetConnectionCount(subscriber.IPAddress)
	if err != nil {
		log.Printf("SharingDetection: Failed to get connection count for %s: %v", subscriber.Username, err)
		connCount = 0
	}

	// Get TTL values
	ttlValues, err := client.GetTTLValues(subscriber.IPAddress)
	if err != nil {
		log.Printf("SharingDetection: Failed to get TTL values for %s: %v", subscriber.Username, err)
		ttlValues = []int{}
	}

	// Get connection details
	connections, err := client.GetConnectionDetails(subscriber.IPAddress)
	if err != nil {
		log.Printf("SharingDetection: Failed to get connection details for %s: %v", subscriber.Username, err)
		connections = []map[string]string{}
	}

	// Analyze
	ttlStatus, ttlReasons := analyzeTTL(ttlValues)

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"subscriber_id":    subscriber.ID,
			"username":         subscriber.Username,
			"full_name":        subscriber.FullName,
			"ip_address":       subscriber.IPAddress,
			"service_name":     subscriber.Service.Name,
			"connection_count": connCount,
			"ttl_values":       ttlValues,
			"ttl_status":       ttlStatus,
			"ttl_analysis":     ttlReasons,
			"connections":      connections,
			"nas_name":         subscriber.Nas.Name,
		},
	})
}

// analyzeNasSubscribers analyzes all subscribers on a NAS
func analyzeNasSubscribers(nas *models.Nas, subscribers []models.Subscriber, connThresholdMedium, connThresholdHigh int) []SuspiciousAccount {
	client := mikrotik.NewClient(
		fmt.Sprintf("%s:%d", nas.IPAddress, nas.APIPort),
		nas.APIUsername,
		nas.APIPassword,
	)
	defer client.Close()

	var results []SuspiciousAccount

	for _, sub := range subscribers {
		if sub.IPAddress == "" {
			continue
		}

		result := SuspiciousAccount{
			SubscriberID: sub.ID,
			Username:     sub.Username,
			FullName:     sub.FullName,
			IPAddress:    sub.IPAddress,
			NASName:      nas.Name,
			NASIPAddress: nas.IPAddress,
			Reasons:      []string{},
		}

		if sub.Service.ID > 0 {
			result.ServiceName = sub.Service.Name
		}

		// Get connection count
		connCount, err := client.GetConnectionCount(sub.IPAddress)
		if err != nil {
			log.Printf("SharingDetection: Failed to get connection count for %s: %v", sub.Username, err)
			connCount = 0
		}
		result.ConnectionCount = connCount

		// Get TTL values (sample from recent connections)
		ttlValues, err := client.GetTTLValues(sub.IPAddress)
		if err != nil {
			log.Printf("SharingDetection: Failed to get TTL for %s: %v", sub.Username, err)
		}
		result.TTLValues = ttlValues

		// Analyze TTL
		ttlStatus, ttlReasons := analyzeTTL(ttlValues)
		result.TTLStatus = ttlStatus
		result.Reasons = append(result.Reasons, ttlReasons...)

		// Analyze connection count
		if connCount >= connThresholdHigh {
			result.Reasons = append(result.Reasons, fmt.Sprintf("Very high connection count: %d", connCount))
		} else if connCount >= connThresholdMedium {
			result.Reasons = append(result.Reasons, fmt.Sprintf("High connection count: %d", connCount))
		}

		// Determine suspicion level
		result.SuspicionLevel = calculateSuspicionLevel(connCount, ttlStatus, connThresholdMedium, connThresholdHigh)

		results = append(results, result)
	}

	return results
}

// analyzeTTL analyzes TTL values to detect sharing
func analyzeTTL(ttlValues []int) (string, []string) {
	if len(ttlValues) == 0 {
		return "unknown", []string{}
	}

	var reasons []string
	status := "normal"

	// Check for router-decremented TTL values
	hasRouterTTL := false
	hasMultipleOS := false

	ttlCounts := make(map[int]int)
	for _, ttl := range ttlValues {
		ttlCounts[ttl]++

		// TTL 127 = Windows behind router (128-1)
		// TTL 63 = Linux/Android behind router (64-1)
		// TTL 126 or 62 = Two routers
		if ttl == 127 || ttl == 63 || ttl == 126 || ttl == 62 {
			hasRouterTTL = true
		}
	}

	// Check for multiple OS types
	hasWindows := ttlCounts[128] > 0 || ttlCounts[127] > 0
	hasLinux := ttlCounts[64] > 0 || ttlCounts[63] > 0
	if hasWindows && hasLinux {
		hasMultipleOS = true
	}

	if hasRouterTTL {
		status = "router_detected"
		if ttlCounts[127] > 0 {
			reasons = append(reasons, fmt.Sprintf("TTL=127 detected (%d packets) - Windows device behind router", ttlCounts[127]))
		}
		if ttlCounts[63] > 0 {
			reasons = append(reasons, fmt.Sprintf("TTL=63 detected (%d packets) - Linux/Android device behind router", ttlCounts[63]))
		}
		if ttlCounts[126] > 0 || ttlCounts[62] > 0 {
			reasons = append(reasons, "TTL indicates multiple routers in chain")
		}
	}

	if hasMultipleOS {
		if status == "normal" {
			status = "multiple_os"
		}
		reasons = append(reasons, "Multiple OS types detected (Windows + Linux/Android)")
	}

	return status, reasons
}

// calculateSuspicionLevel determines overall suspicion level
func calculateSuspicionLevel(connCount int, ttlStatus string, thresholdMedium, thresholdHigh int) string {
	score := 0

	// Connection count scoring
	if connCount >= thresholdHigh {
		score += 3
	} else if connCount >= thresholdMedium {
		score += 2
	} else if connCount >= thresholdMedium/2 {
		score += 1
	}

	// TTL scoring
	switch ttlStatus {
	case "router_detected":
		score += 2
	case "multiple_os":
		score += 1
	}

	// Determine level
	if score >= 4 {
		return "high"
	} else if score >= 2 {
		return "medium"
	}
	return "low"
}

// GetStats returns overall sharing detection statistics
func (h *SharingDetectionHandler) GetStats(c *fiber.Ctx) error {
	// Quick stats without full analysis
	var onlineCount int64
	database.DB.Model(&models.Subscriber{}).Where("is_online = ?", true).Count(&onlineCount)

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"total_online": onlineCount,
			"message":      "Use /sharing/list for full analysis",
		},
	})
}

// NASRuleStatus represents TTL rule status for a NAS
type NASRuleStatus struct {
	NASID          uint   `json:"nas_id"`
	NASName        string `json:"nas_name"`
	NASIPAddress   string `json:"nas_ip_address"`
	RulesConfigured bool   `json:"rules_configured"`
	RuleCount      int    `json:"rule_count"`
	Error          string `json:"error,omitempty"`
}

// getCompanyName retrieves company name from settings, defaults to "ProISP"
func getCompanyName() string {
	var pref models.SystemPreference
	if err := database.DB.Where("key = ?", "company_name").First(&pref).Error; err != nil {
		return "ProISP"
	}
	if pref.Value == "" {
		return "ProISP"
	}
	return pref.Value
}

// getTTLRuleComment returns the TTL rule comment with company branding
func getTTLRuleComment() string {
	return getCompanyName() + "-TTL-Detection"
}

// ListNASRuleStatus returns TTL rule status for all NAS devices
func (h *SharingDetectionHandler) ListNASRuleStatus(c *fiber.Ctx) error {
	var nasList []models.Nas
	if err := database.DB.Where("is_active = ?", true).Find(&nasList).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to get NAS list",
		})
	}

	results := make([]NASRuleStatus, len(nasList))
	var wg sync.WaitGroup
	var mu sync.Mutex

	for i, nas := range nasList {
		wg.Add(1)
		go func(idx int, n models.Nas) {
			defer wg.Done()

			status := NASRuleStatus{
				NASID:        n.ID,
				NASName:      n.Name,
				NASIPAddress: n.IPAddress,
			}

			client := mikrotik.NewClient(
				fmt.Sprintf("%s:%d", n.IPAddress, n.APIPort),
				n.APIUsername,
				n.APIPassword,
			)
			defer client.Close()

			count, err := client.CountTTLRules(getTTLRuleComment())
			if err != nil {
				status.Error = err.Error()
			} else {
				status.RuleCount = count
				status.RulesConfigured = count >= 4 // We expect 4 rules
			}

			mu.Lock()
			results[idx] = status
			mu.Unlock()
		}(i, nas)
	}

	wg.Wait()

	return c.JSON(fiber.Map{
		"success": true,
		"data":    results,
	})
}

// GenerateTTLRules creates TTL detection mangle rules on a NAS
func (h *SharingDetectionHandler) GenerateTTLRules(c *fiber.Ctx) error {
	nasID := c.Params("nas_id")

	var nas models.Nas
	if err := database.DB.First(&nas, nasID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "NAS not found",
		})
	}

	client := mikrotik.NewClient(
		fmt.Sprintf("%s:%d", nas.IPAddress, nas.APIPort),
		nas.APIUsername,
		nas.APIPassword,
	)
	defer client.Close()

	// Create the TTL detection rules
	rules := []struct {
		TTL  int
		Mark string
		Desc string
	}{
		{127, "ttl_127", "Windows behind router"},
		{63, "ttl_63", "Linux/Android behind router"},
		{128, "ttl_128", "Direct Windows"},
		{64, "ttl_64", "Direct Linux/Android"},
	}

	createdCount := 0
	var errors []string

	for _, rule := range rules {
		err := client.CreateTTLMangleRule(rule.TTL, rule.Mark, getTTLRuleComment()+" - "+rule.Desc)
		if err != nil {
			errors = append(errors, fmt.Sprintf("TTL=%d: %s", rule.TTL, err.Error()))
		} else {
			createdCount++
		}
	}

	if createdCount == 0 {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to create any rules",
			"errors":  errors,
		})
	}

	return c.JSON(fiber.Map{
		"success":       true,
		"message":       fmt.Sprintf("Created %d TTL detection rules on %s", createdCount, nas.Name),
		"created_count": createdCount,
		"errors":        errors,
	})
}

// RemoveTTLRules removes TTL detection rules from a NAS
func (h *SharingDetectionHandler) RemoveTTLRules(c *fiber.Ctx) error {
	nasID := c.Params("nas_id")

	var nas models.Nas
	if err := database.DB.First(&nas, nasID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "NAS not found",
		})
	}

	client := mikrotik.NewClient(
		fmt.Sprintf("%s:%d", nas.IPAddress, nas.APIPort),
		nas.APIUsername,
		nas.APIPassword,
	)
	defer client.Close()

	removedCount, err := client.RemoveTTLRules(getTTLRuleComment())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to remove rules: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"success":       true,
		"message":       fmt.Sprintf("Removed %d TTL detection rules from %s", removedCount, nas.Name),
		"removed_count": removedCount,
	})
}

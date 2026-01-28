package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"sync"
	"time"

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
	SubscriberID       uint     `json:"subscriber_id"`
	Username           string   `json:"username"`
	FullName           string   `json:"full_name"`
	IPAddress          string   `json:"ip_address"`
	ServiceName        string   `json:"service_name"`
	ConnectionCount    int      `json:"connection_count"`
	UniqueDestinations int      `json:"unique_destinations"` // Number of unique destination IPs
	TTLValues          []int    `json:"ttl_values"`
	TTLStatus          string   `json:"ttl_status"`      // "normal", "router_detected", "multiple_os", "double_router"
	SuspicionLevel     string   `json:"suspicion_level"` // "normal", "low", "medium", "high", "critical"
	ConfidenceScore    int      `json:"confidence_score"` // 0-100% confidence that sharing is happening
	Reasons            []string `json:"reasons"`
	NASName            string   `json:"nas_name"`
	NASIPAddress       string   `json:"nas_ip_address"`
}

// SharingStats represents overall sharing detection statistics
type SharingStats struct {
	TotalOnline       int `json:"total_online"`
	SuspiciousCount   int `json:"suspicious_count"`
	HighRiskCount     int `json:"high_risk_count"`
	RouterDetected    int `json:"router_detected"`
	HighConnections   int `json:"high_connections"`
}

// Thresholds for detection - IMPROVED for better accuracy
const (
	// Connection thresholds (higher = more accurate, fewer false positives)
	ConnectionThresholdLow    = 300  // Low suspicion - could be heavy user
	ConnectionThresholdMedium = 500  // Medium suspicion - likely sharing
	ConnectionThresholdHigh   = 800  // High suspicion - definitely sharing

	// Unique destination thresholds (many destinations = more devices)
	DestinationThresholdLow    = 50   // Normal browsing
	DestinationThresholdMedium = 100  // Multiple devices likely
	DestinationThresholdHigh   = 150  // Definitely multiple devices

	// TTL values
	NormalTTLWindows = 128 // Windows default
	NormalTTLLinux   = 64  // Linux/Android/iOS default
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

// analyzeNasSubscribers analyzes all subscribers on a NAS using batch queries
func analyzeNasSubscribers(nas *models.Nas, subscribers []models.Subscriber, connThresholdMedium, connThresholdHigh int) []SuspiciousAccount {
	client := mikrotik.NewClient(
		fmt.Sprintf("%s:%d", nas.IPAddress, nas.APIPort),
		nas.APIUsername,
		nas.APIPassword,
	)
	defer client.Close()

	// Build IP to subscriber map for fast lookup
	ipToSub := make(map[string]*models.Subscriber)
	for i := range subscribers {
		if subscribers[i].IPAddress != "" {
			ipToSub[subscribers[i].IPAddress] = &subscribers[i]
		}
	}

	// BATCH QUERY: Get all connection stats at once (connections + unique destinations)
	log.Printf("SharingDetection: Getting connection stats for %d IPs on NAS %s", len(ipToSub), nas.Name)
	connStats, err := client.GetAllConnectionStats()
	if err != nil {
		log.Printf("SharingDetection: Failed to get batch connection stats: %v", err)
		connStats = make(map[string]*mikrotik.ConnectionStats)
	}

	// BATCH QUERY: Get all TTL marks at once
	ttlMarks, err := client.GetAllTTLMarks()
	if err != nil {
		log.Printf("SharingDetection: Failed to get batch TTL marks: %v", err)
		ttlMarks = make(map[string][]int)
	}

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

		if sub.Service != nil && sub.Service.ID > 0 {
			result.ServiceName = sub.Service.Name
		}

		// Get connection stats from batch result
		if stats := connStats[sub.IPAddress]; stats != nil {
			result.ConnectionCount = stats.TotalConnections
			result.UniqueDestinations = stats.UniqueDestinations
		}

		// Get TTL values from batch result
		result.TTLValues = ttlMarks[sub.IPAddress]

		// Analyze TTL with improved detection
		ttlStatus, ttlReasons, ttlScore := analyzeTTLImproved(result.TTLValues)
		result.TTLStatus = ttlStatus
		result.Reasons = append(result.Reasons, ttlReasons...)

		// Calculate confidence score based on multiple factors
		confidenceScore := calculateConfidenceScore(result.ConnectionCount, result.UniqueDestinations, ttlScore, ttlStatus)
		result.ConfidenceScore = confidenceScore

		// Add reasons based on thresholds
		if result.ConnectionCount >= ConnectionThresholdHigh {
			result.Reasons = append(result.Reasons, fmt.Sprintf("Very high connections: %d (threshold: %d)", result.ConnectionCount, ConnectionThresholdHigh))
		} else if result.ConnectionCount >= ConnectionThresholdMedium {
			result.Reasons = append(result.Reasons, fmt.Sprintf("High connections: %d (threshold: %d)", result.ConnectionCount, ConnectionThresholdMedium))
		} else if result.ConnectionCount >= ConnectionThresholdLow {
			result.Reasons = append(result.Reasons, fmt.Sprintf("Elevated connections: %d", result.ConnectionCount))
		}

		// Determine suspicion level
		result.SuspicionLevel = calculateSuspicionLevel(result.ConnectionCount, ttlStatus, connThresholdMedium, connThresholdHigh)

		results = append(results, result)
	}

	log.Printf("SharingDetection: Analyzed %d subscribers on NAS %s", len(results), nas.Name)
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

// analyzeTTLImproved analyzes TTL values with improved accuracy and returns a score
func analyzeTTLImproved(ttlValues []int) (string, []string, int) {
	if len(ttlValues) == 0 {
		return "unknown", []string{}, 0
	}

	var reasons []string
	status := "normal"
	score := 0 // 0-100 score for confidence calculation

	// Count occurrences of each TTL
	ttlCounts := make(map[int]int)
	totalPackets := 0
	for _, ttl := range ttlValues {
		ttlCounts[ttl]++
		totalPackets++
	}

	// Check for router-decremented TTL values (strongest indicator)
	// TTL 127 = Windows behind router (128-1)
	// TTL 63 = Linux/Android behind router (64-1)
	// TTL 126 or 62 = Two routers (rare but definitive)
	// TTL 125 or 61 = Three routers (very rare)

	routerTTLCount := ttlCounts[127] + ttlCounts[63] + ttlCounts[126] + ttlCounts[62] + ttlCounts[125] + ttlCounts[61]
	routerTTLPercent := 0
	if totalPackets > 0 {
		routerTTLPercent = (routerTTLCount * 100) / totalPackets
	}

	// Check for direct connections (normal)
	directTTLCount := ttlCounts[128] + ttlCounts[64]
	directTTLPercent := 0
	if totalPackets > 0 {
		directTTLPercent = (directTTLCount * 100) / totalPackets
	}

	// Multiple OS detection
	hasWindows := ttlCounts[128] > 0 || ttlCounts[127] > 0
	hasLinux := ttlCounts[64] > 0 || ttlCounts[63] > 0

	// If majority is direct TTL (normal connections), reduce suspicion
	if directTTLPercent > 80 && routerTTLPercent == 0 {
		return "normal", []string{"Direct connections only (TTL=128/64)"}, 0
	}

	// Analyze findings
	if routerTTLPercent > 0 {
		status = "router_detected"

		if ttlCounts[127] > 0 {
			percent := (ttlCounts[127] * 100) / totalPackets
			reasons = append(reasons, fmt.Sprintf("TTL=127: %d packets (%d%%) - Windows device behind router", ttlCounts[127], percent))
			score += 30 // Strong indicator
		}
		if ttlCounts[63] > 0 {
			percent := (ttlCounts[63] * 100) / totalPackets
			reasons = append(reasons, fmt.Sprintf("TTL=63: %d packets (%d%%) - Linux/Android device behind router", ttlCounts[63], percent))
			score += 30
		}
		if ttlCounts[126] > 0 || ttlCounts[62] > 0 {
			status = "double_router"
			reasons = append(reasons, "TTL=126/62: Multiple routers detected (double NAT)")
			score += 50 // Very strong indicator
		}
		if ttlCounts[125] > 0 || ttlCounts[61] > 0 {
			reasons = append(reasons, "TTL=125/61: Triple router chain detected")
			score += 60
		}
	}

	// Multiple OS types is suspicious (different devices)
	if hasWindows && hasLinux {
		if status == "normal" {
			status = "multiple_os"
		}
		reasons = append(reasons, "Multiple OS types detected (Windows + Linux/Android devices)")
		score += 25
	}

	// TTL diversity (many different TTL values = many hops/devices)
	uniqueTTLs := len(ttlCounts)
	if uniqueTTLs > 4 {
		reasons = append(reasons, fmt.Sprintf("%d different TTL values detected (unusual diversity)", uniqueTTLs))
		score += 15
	}

	// Cap score at 100
	if score > 100 {
		score = 100
	}

	return status, reasons, score
}

// calculateConfidenceScore calculates overall confidence (0-100%) that sharing is happening
func calculateConfidenceScore(connCount, uniqueDest, ttlScore int, ttlStatus string) int {
	score := 0

	// 1. Connection count factor (0-35 points)
	// More connections = more likely sharing
	if connCount >= ConnectionThresholdHigh {
		score += 35
	} else if connCount >= ConnectionThresholdMedium {
		score += 25
	} else if connCount >= ConnectionThresholdLow {
		score += 15
	} else if connCount >= 100 {
		score += 5
	}

	// 2. Unique destinations factor (0-25 points)
	// Many unique destinations = multiple devices browsing
	if uniqueDest >= DestinationThresholdHigh {
		score += 25
	} else if uniqueDest >= DestinationThresholdMedium {
		score += 18
	} else if uniqueDest >= DestinationThresholdLow {
		score += 10
	}

	// 3. TTL score factor (0-40 points)
	// TTL analysis is the most reliable indicator
	score += (ttlScore * 40) / 100

	// 4. Combined factors bonus
	// If BOTH connection count AND TTL are suspicious, increase confidence
	if connCount >= ConnectionThresholdMedium && ttlStatus == "router_detected" {
		score += 10
	}
	if connCount >= ConnectionThresholdMedium && uniqueDest >= DestinationThresholdMedium {
		score += 5
	}

	// Cap at 100
	if score > 100 {
		score = 100
	}

	return score
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

// getSharingCompanyName retrieves company name from settings for sharing detection branding
func getSharingCompanyName() string {
	name := database.GetCompanyName()
	if name == "" {
		return "ISP"
	}
	return name
}

// getTTLRuleComment returns the TTL rule comment with company branding
func getTTLRuleComment() string {
	return getSharingCompanyName() + "-TTL-Detection"
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

// GetHistory returns historical sharing detections
func (h *SharingDetectionHandler) GetHistory(c *fiber.Ctx) error {
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 50)
	suspicionLevel := c.Query("suspicion_level", "")
	username := c.Query("username", "")
	days := c.QueryInt("days", 7)

	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 50
	}

	offset := (page - 1) * limit

	// Build query
	query := database.DB.Model(&models.SharingDetection{})

	// Filter by date range
	cutoff := time.Now().AddDate(0, 0, -days)
	query = query.Where("detected_at >= ?", cutoff)

	// Filter by suspicion level
	if suspicionLevel != "" {
		query = query.Where("suspicion_level = ?", suspicionLevel)
	}

	// Filter by username
	if username != "" {
		query = query.Where("username ILIKE ?", "%"+username+"%")
	}

	// Get total count
	var total int64
	query.Count(&total)

	// Get records
	var detections []models.SharingDetection
	if err := query.Order("detected_at DESC").Offset(offset).Limit(limit).Find(&detections).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to get history",
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    detections,
		"meta": fiber.Map{
			"page":       page,
			"limit":      limit,
			"total":      total,
			"totalPages": (total + int64(limit) - 1) / int64(limit),
		},
	})
}

// GetRepeatOffenders returns subscribers detected multiple times
func (h *SharingDetectionHandler) GetRepeatOffenders(c *fiber.Ctx) error {
	days := c.QueryInt("days", 30)
	minCount := c.QueryInt("min_count", 3)

	cutoff := time.Now().AddDate(0, 0, -days)

	type RepeatOffender struct {
		SubscriberID    uint    `json:"subscriber_id"`
		Username        string  `json:"username"`
		FullName        string  `json:"full_name"`
		DetectionCount  int     `json:"detection_count"`
		AvgConfidence   float64 `json:"avg_confidence"`
		HighRiskCount   int     `json:"high_risk_count"`
		LastDetectedAt  time.Time `json:"last_detected_at"`
		ServiceName     string  `json:"service_name"`
	}

	var offenders []RepeatOffender
	err := database.DB.Model(&models.SharingDetection{}).
		Select(`
			subscriber_id,
			username,
			MAX(full_name) as full_name,
			COUNT(*) as detection_count,
			AVG(confidence_score) as avg_confidence,
			SUM(CASE WHEN suspicion_level = 'high' THEN 1 ELSE 0 END) as high_risk_count,
			MAX(detected_at) as last_detected_at,
			MAX(service_name) as service_name
		`).
		Where("detected_at >= ?", cutoff).
		Group("subscriber_id, username").
		Having("COUNT(*) >= ?", minCount).
		Order("detection_count DESC").
		Scan(&offenders).Error

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to get repeat offenders",
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    offenders,
	})
}

// GetTrends returns sharing detection trends over time
func (h *SharingDetectionHandler) GetTrends(c *fiber.Ctx) error {
	days := c.QueryInt("days", 7)

	type DailyTrend struct {
		Date           string `json:"date"`
		TotalDetected  int    `json:"total_detected"`
		HighRiskCount  int    `json:"high_risk_count"`
		MediumRiskCount int   `json:"medium_risk_count"`
		AvgConfidence  float64 `json:"avg_confidence"`
	}

	var trends []DailyTrend
	cutoff := time.Now().AddDate(0, 0, -days)

	err := database.DB.Model(&models.SharingDetection{}).
		Select(`
			DATE(detected_at) as date,
			COUNT(*) as total_detected,
			SUM(CASE WHEN suspicion_level = 'high' THEN 1 ELSE 0 END) as high_risk_count,
			SUM(CASE WHEN suspicion_level = 'medium' THEN 1 ELSE 0 END) as medium_risk_count,
			AVG(confidence_score) as avg_confidence
		`).
		Where("detected_at >= ?", cutoff).
		Group("DATE(detected_at)").
		Order("date DESC").
		Scan(&trends).Error

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to get trends",
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    trends,
	})
}

// GetSettings returns sharing detection settings
func (h *SharingDetectionHandler) GetSettings(c *fiber.Ctx) error {
	var settings models.SharingDetectionSetting
	if err := database.DB.First(&settings).Error; err != nil {
		// Return defaults
		settings = models.SharingDetectionSetting{
			Enabled:             true,
			ScanTime:            "03:00",
			RetentionDays:       30,
			MinSuspicionLevel:   "medium",
			ConnectionThreshold: 500,
			NotifyOnHighRisk:    false,
			AutoSuspendRepeat:   false,
			RepeatThreshold:     5,
		}
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    settings,
	})
}

// UpdateSettings updates sharing detection settings
func (h *SharingDetectionHandler) UpdateSettings(c *fiber.Ctx) error {
	var req struct {
		Enabled             *bool   `json:"enabled"`
		ScanTime            string  `json:"scan_time"`
		RetentionDays       int     `json:"retention_days"`
		MinSuspicionLevel   string  `json:"min_suspicion_level"`
		ConnectionThreshold int     `json:"connection_threshold"`
		NotifyOnHighRisk    *bool   `json:"notify_on_high_risk"`
		AutoSuspendRepeat   *bool   `json:"auto_suspend_repeat"`
		RepeatThreshold     int     `json:"repeat_threshold"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
		})
	}

	// Get or create settings
	var settings models.SharingDetectionSetting
	if err := database.DB.First(&settings).Error; err != nil {
		settings = models.SharingDetectionSetting{}
	}

	// Update fields
	if req.Enabled != nil {
		settings.Enabled = *req.Enabled
	}
	if req.ScanTime != "" {
		settings.ScanTime = req.ScanTime
	}
	if req.RetentionDays > 0 {
		settings.RetentionDays = req.RetentionDays
	}
	if req.MinSuspicionLevel != "" {
		settings.MinSuspicionLevel = req.MinSuspicionLevel
	}
	if req.ConnectionThreshold > 0 {
		settings.ConnectionThreshold = req.ConnectionThreshold
	}
	if req.NotifyOnHighRisk != nil {
		settings.NotifyOnHighRisk = *req.NotifyOnHighRisk
	}
	if req.AutoSuspendRepeat != nil {
		settings.AutoSuspendRepeat = *req.AutoSuspendRepeat
	}
	if req.RepeatThreshold > 0 {
		settings.RepeatThreshold = req.RepeatThreshold
	}
	settings.UpdatedAt = time.Now()

	if err := database.DB.Save(&settings).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to save settings",
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Settings updated",
		"data":    settings,
	})
}

// RunManualScan triggers an immediate scan
func (h *SharingDetectionHandler) RunManualScan(c *fiber.Ctx) error {
	// Import service here to avoid circular dependency
	// The actual scan will be done inline since we can't import services package

	// Get settings
	var settings models.SharingDetectionSetting
	if err := database.DB.First(&settings).Error; err != nil {
		settings = models.SharingDetectionSetting{
			MinSuspicionLevel:   "medium",
			ConnectionThreshold: 500,
		}
	}

	// Get all online subscribers
	var subscribers []models.Subscriber
	if err := database.DB.Preload("Nas").Preload("Service").
		Where("is_online = ?", true).Find(&subscribers).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to get subscribers",
		})
	}

	if len(subscribers) == 0 {
		return c.JSON(fiber.Map{
			"success": true,
			"message": "No online subscribers to scan",
			"saved":   0,
		})
	}

	// Group by NAS
	nasSubs := make(map[uint][]models.Subscriber)
	for _, sub := range subscribers {
		if sub.NasID != nil {
			nasSubs[*sub.NasID] = append(nasSubs[*sub.NasID], sub)
		}
	}

	// Analyze each NAS
	var allDetections []models.SharingDetection
	var mu sync.Mutex
	var wg sync.WaitGroup

	for _, subs := range nasSubs {
		if len(subs) == 0 || subs[0].Nas == nil {
			continue
		}

		wg.Add(1)
		go func(nas *models.Nas, subscribers []models.Subscriber) {
			defer wg.Done()

			client := mikrotik.NewClient(
				fmt.Sprintf("%s:%d", nas.IPAddress, nas.APIPort),
				nas.APIUsername,
				nas.APIPassword,
			)
			defer client.Close()

			connStats, _ := client.GetAllConnectionStats()
			if connStats == nil {
				connStats = make(map[string]*mikrotik.ConnectionStats)
			}

			ttlMarks, _ := client.GetAllTTLMarks()
			if ttlMarks == nil {
				ttlMarks = make(map[string][]int)
			}

			for _, sub := range subscribers {
				if sub.IPAddress == "" {
					continue
				}

				detection := models.SharingDetection{
					SubscriberID: sub.ID,
					Username:     sub.Username,
					FullName:     sub.FullName,
					IPAddress:    sub.IPAddress,
					NasID:        sub.NasID,
					NasName:      nas.Name,
					ScanType:     "manual",
					DetectedAt:   time.Now(),
				}

				if sub.Service != nil {
					detection.ServiceName = sub.Service.Name
				}

				if stats := connStats[sub.IPAddress]; stats != nil {
					detection.ConnectionCount = stats.TotalConnections
					detection.UniqueDestinations = stats.UniqueDestinations
				}

				// Analyze TTL
				ttlValues := ttlMarks[sub.IPAddress]
				ttlStatus, reasons := analyzeTTL(ttlValues)
				detection.TTLStatus = ttlStatus

				// Calculate suspicion level
				detection.SuspicionLevel = calculateSuspicionLevel(
					detection.ConnectionCount,
					ttlStatus,
					settings.ConnectionThreshold,
					settings.ConnectionThreshold*2,
				)

				// Calculate confidence
				detection.ConfidenceScore = calculateConfidenceScore(
					detection.ConnectionCount,
					detection.UniqueDestinations,
					0,
					ttlStatus,
				)

				// Only save medium/high
				levelOrder := map[string]int{"low": 1, "medium": 2, "high": 3}
				if levelOrder[detection.SuspicionLevel] >= levelOrder[settings.MinSuspicionLevel] {
					if len(reasons) > 0 {
						reasonsJSON, _ := json.Marshal(reasons)
						detection.Reasons = string(reasonsJSON)
					}
					mu.Lock()
					allDetections = append(allDetections, detection)
					mu.Unlock()
				}
			}
		}(subs[0].Nas, subs)
	}

	wg.Wait()

	// Save to database
	savedCount := 0
	for _, detection := range allDetections {
		if err := database.DB.Create(&detection).Error; err == nil {
			savedCount++
		}
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": fmt.Sprintf("Manual scan completed. Found %d suspicious accounts.", savedCount),
		"saved":   savedCount,
		"scanned": len(subscribers),
	})
}

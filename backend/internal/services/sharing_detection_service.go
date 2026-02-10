package services

import (
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"sync"
	"time"

	"github.com/proisp/backend/internal/database"
	"github.com/proisp/backend/internal/mikrotik"
	"github.com/proisp/backend/internal/models"
)

// SharingDetectionService handles automatic sharing detection scanning
type SharingDetectionService struct {
	stopChan chan struct{}
	running  bool
	mu       sync.Mutex
}

// Detection thresholds
const (
	SharingConnectionThresholdLow    = 300
	SharingConnectionThresholdMedium = 500
	SharingConnectionThresholdHigh   = 800
)

// NewSharingDetectionService creates a new sharing detection service
func NewSharingDetectionService() *SharingDetectionService {
	return &SharingDetectionService{
		stopChan: make(chan struct{}),
	}
}

// Start begins the sharing detection service
func (s *SharingDetectionService) Start() {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return
	}
	s.running = true
	s.mu.Unlock()

	log.Println("[SharingDetection] Service started")

	go s.run()
}

// Stop stops the sharing detection service
func (s *SharingDetectionService) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running {
		return
	}

	close(s.stopChan)
	s.running = false
	log.Println("[SharingDetection] Service stopped")
}

// run is the main service loop
func (s *SharingDetectionService) run() {
	// Check every minute if it's time to scan
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	// Track last scan date to avoid multiple scans per day
	var lastScanDate string

	for {
		select {
		case <-s.stopChan:
			return
		case <-ticker.C:
			settings := s.getSettings()
			if !settings.Enabled {
				continue
			}

			// Get current time in configured timezone
			now := s.getCurrentTime()
			currentDate := now.Format("2006-01-02")
			currentTime := now.Format("15:04")

			// Check if it's scan time and we haven't scanned today
			if currentTime == settings.ScanTime && lastScanDate != currentDate {
				log.Printf("[SharingDetection] Starting scheduled scan at %s", currentTime)
				s.runScan(settings)
				lastScanDate = currentDate

				// Cleanup old records
				s.cleanupOldRecords(settings.RetentionDays)
			}
		}
	}
}

// getSettings retrieves sharing detection settings
func (s *SharingDetectionService) getSettings() models.SharingDetectionSetting {
	var settings models.SharingDetectionSetting
	if err := database.DB.First(&settings).Error; err != nil {
		// Return defaults if no settings exist
		return models.SharingDetectionSetting{
			Enabled:             true,
			ScanTime:            "03:00",
			RetentionDays:       30,
			MinSuspicionLevel:   "medium",
			ConnectionThreshold: 500,
		}
	}
	return settings
}

// getCurrentTime returns current time in system timezone
func (s *SharingDetectionService) getCurrentTime() time.Time {
	// Try to get timezone from system preferences
	var pref models.SystemPreference
	if err := database.DB.Where("key = ?", "system_timezone").First(&pref).Error; err == nil && pref.Value != "" {
		if loc, err := time.LoadLocation(pref.Value); err == nil {
			return time.Now().In(loc)
		}
	}
	return time.Now()
}

// runScan performs the sharing detection scan
func (s *SharingDetectionService) runScan(settings models.SharingDetectionSetting) {
	startTime := time.Now()
	log.Println("[SharingDetection] Scan starting...")

	// Get all online subscribers with their NAS
	var subscribers []models.Subscriber
	if err := database.DB.Preload("Nas").Preload("Service").
		Where("is_online = ?", true).Find(&subscribers).Error; err != nil {
		log.Printf("[SharingDetection] Failed to get subscribers: %v", err)
		return
	}

	if len(subscribers) == 0 {
		log.Println("[SharingDetection] No online subscribers to scan")
		return
	}

	log.Printf("[SharingDetection] Scanning %d online subscribers", len(subscribers))

	// Group subscribers by NAS
	nasSubs := make(map[uint][]models.Subscriber)
	for _, sub := range subscribers {
		if sub.NasID != nil {
			nasSubs[*sub.NasID] = append(nasSubs[*sub.NasID], sub)
		}
	}

	// Analyze each NAS in parallel
	var allResults []models.SharingDetection
	var mu sync.Mutex
	var wg sync.WaitGroup

	for _, subs := range nasSubs {
		if len(subs) == 0 || subs[0].Nas == nil {
			continue
		}

		wg.Add(1)
		go func(nas *models.Nas, subscribers []models.Subscriber) {
			defer wg.Done()
			results := s.analyzeNasSubscribers(nas, subscribers, settings)
			mu.Lock()
			allResults = append(allResults, results...)
			mu.Unlock()
		}(subs[0].Nas, subs)
	}

	wg.Wait()

	// Filter by minimum suspicion level and save to database
	savedCount := 0
	for _, detection := range allResults {
		if s.shouldSave(detection.SuspicionLevel, settings.MinSuspicionLevel) {
			detection.ScanType = "automatic"
			detection.DetectedAt = time.Now()
			if err := database.DB.Create(&detection).Error; err != nil {
				log.Printf("[SharingDetection] Failed to save detection for %s: %v", detection.Username, err)
			} else {
				savedCount++
			}
		}
	}

	duration := time.Since(startTime)
	log.Printf("[SharingDetection] Scan completed in %v. Found %d suspicious, saved %d",
		duration, len(allResults), savedCount)
}

// shouldSave checks if detection meets minimum suspicion level
func (s *SharingDetectionService) shouldSave(level, minLevel string) bool {
	levelOrder := map[string]int{"low": 1, "medium": 2, "high": 3}
	return levelOrder[level] >= levelOrder[minLevel]
}

// analyzeNasSubscribers analyzes all subscribers on a NAS
func (s *SharingDetectionService) analyzeNasSubscribers(nas *models.Nas, subscribers []models.Subscriber, settings models.SharingDetectionSetting) []models.SharingDetection {
	client := mikrotik.NewClient(
		fmt.Sprintf("%s:%d", nas.IPAddress, nas.APIPort),
		nas.APIUsername,
		nas.APIPassword,
	)
	defer client.Close()

	// Get all connection stats at once
	connStats, err := client.GetAllConnectionStats()
	if err != nil {
		log.Printf("[SharingDetection] Failed to get connection stats from %s: %v", nas.Name, err)
		connStats = make(map[string]*mikrotik.ConnectionStats)
	}

	// Get all TTL marks at once
	ttlMarks, err := client.GetAllTTLMarks()
	if err != nil {
		log.Printf("[SharingDetection] Failed to get TTL marks from %s: %v", nas.Name, err)
		ttlMarks = make(map[string][]int)
	}

	var results []models.SharingDetection

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
		}

		if sub.Service != nil {
			detection.ServiceName = sub.Service.Name
		}

		// Get connection stats
		if stats := connStats[sub.IPAddress]; stats != nil {
			detection.ConnectionCount = stats.TotalConnections
			detection.UniqueDestinations = stats.UniqueDestinations
		}

		// Get TTL values
		ttlValues := ttlMarks[sub.IPAddress]
		if len(ttlValues) > 0 {
			ttlJSON, _ := json.Marshal(ttlValues)
			detection.TTLValues = string(ttlJSON)
		}

		// Analyze TTL
		ttlStatus, reasons, ttlScore := s.analyzeTTL(ttlValues)
		detection.TTLStatus = ttlStatus

		// Calculate confidence score
		detection.ConfidenceScore = s.calculateConfidenceScore(
			detection.ConnectionCount,
			detection.UniqueDestinations,
			ttlScore,
			ttlStatus,
		)

		// Add connection-based reasons
		if detection.ConnectionCount >= SharingConnectionThresholdHigh {
			reasons = append(reasons, fmt.Sprintf("Very high connections: %d", detection.ConnectionCount))
		} else if detection.ConnectionCount >= SharingConnectionThresholdMedium {
			reasons = append(reasons, fmt.Sprintf("High connections: %d", detection.ConnectionCount))
		}

		if len(reasons) > 0 {
			reasonsJSON, _ := json.Marshal(reasons)
			detection.Reasons = string(reasonsJSON)
		}

		// Calculate suspicion level
		detection.SuspicionLevel = s.calculateSuspicionLevel(
			detection.ConnectionCount,
			ttlStatus,
			settings.ConnectionThreshold,
		)

		// Only add if suspicious
		if detection.SuspicionLevel != "low" || detection.ConnectionCount >= SharingConnectionThresholdLow {
			results = append(results, detection)
		}
	}

	return results
}

// analyzeTTL analyzes TTL values for sharing indicators
func (s *SharingDetectionService) analyzeTTL(ttlValues []int) (string, []string, int) {
	if len(ttlValues) == 0 {
		return "unknown", []string{}, 0
	}

	var reasons []string
	status := "normal"
	score := 0

	ttlCounts := make(map[int]int)
	totalPackets := 0
	for _, ttl := range ttlValues {
		ttlCounts[ttl]++
		totalPackets++
	}

	// Check for router-decremented TTL values
	routerTTLCount := ttlCounts[127] + ttlCounts[63] + ttlCounts[126] + ttlCounts[62]

	// Direct connections
	directTTLCount := ttlCounts[128] + ttlCounts[64]
	directTTLPercent := 0
	if totalPackets > 0 {
		directTTLPercent = (directTTLCount * 100) / totalPackets
	}

	// Multiple OS detection
	hasWindows := ttlCounts[128] > 0 || ttlCounts[127] > 0
	hasLinux := ttlCounts[64] > 0 || ttlCounts[63] > 0

	// If mostly direct connections, it's normal
	if directTTLPercent > 80 && routerTTLCount == 0 {
		return "normal", []string{}, 0
	}

	// Analyze findings
	if routerTTLCount > 0 {
		status = "router_detected"

		if ttlCounts[127] > 0 {
			percent := (ttlCounts[127] * 100) / totalPackets
			reasons = append(reasons, fmt.Sprintf("TTL=127: %d%% - Windows behind router", percent))
			score += 30
		}
		if ttlCounts[63] > 0 {
			percent := (ttlCounts[63] * 100) / totalPackets
			reasons = append(reasons, fmt.Sprintf("TTL=63: %d%% - Linux/Android behind router", percent))
			score += 30
		}
		if ttlCounts[126] > 0 || ttlCounts[62] > 0 {
			status = "double_router"
			reasons = append(reasons, "Double NAT detected (TTL=126/62)")
			score += 50
		}
	}

	// Multiple OS types
	if hasWindows && hasLinux {
		if status == "normal" {
			status = "multiple_os"
		}
		reasons = append(reasons, "Multiple OS types (Windows + Linux/Android)")
		score += 25
	}

	if score > 100 {
		score = 100
	}

	return status, reasons, score
}

// calculateConfidenceScore calculates sharing confidence
func (s *SharingDetectionService) calculateConfidenceScore(connCount, uniqueDest, ttlScore int, ttlStatus string) int {
	score := 0

	// Connection count factor (0-35 points)
	if connCount >= SharingConnectionThresholdHigh {
		score += 35
	} else if connCount >= SharingConnectionThresholdMedium {
		score += 25
	} else if connCount >= SharingConnectionThresholdLow {
		score += 15
	}

	// Unique destinations factor (0-25 points)
	if uniqueDest >= 150 {
		score += 25
	} else if uniqueDest >= 100 {
		score += 18
	} else if uniqueDest >= 50 {
		score += 10
	}

	// TTL score factor (0-40 points)
	score += (ttlScore * 40) / 100

	// Combined factors bonus
	if connCount >= SharingConnectionThresholdMedium && ttlStatus == "router_detected" {
		score += 10
	}

	if score > 100 {
		score = 100
	}

	return score
}

// calculateSuspicionLevel determines suspicion level
func (s *SharingDetectionService) calculateSuspicionLevel(connCount int, ttlStatus string, threshold int) string {
	score := 0

	// Connection count scoring
	if connCount >= threshold*2 {
		score += 3
	} else if connCount >= threshold {
		score += 2
	} else if connCount >= threshold/2 {
		score += 1
	}

	// TTL scoring
	switch ttlStatus {
	case "router_detected", "double_router":
		score += 2
	case "multiple_os":
		score += 1
	}

	if score >= 4 {
		return "high"
	} else if score >= 2 {
		return "medium"
	}
	return "low"
}

// cleanupOldRecords removes records older than retention days
func (s *SharingDetectionService) cleanupOldRecords(retentionDays int) {
	cutoff := time.Now().AddDate(0, 0, -retentionDays)
	result := database.DB.Where("detected_at < ?", cutoff).Delete(&models.SharingDetection{})
	if result.RowsAffected > 0 {
		log.Printf("[SharingDetection] Cleaned up %d old records", result.RowsAffected)
	}
}

// RunManualScan performs an immediate manual scan
func (s *SharingDetectionService) RunManualScan() (int, error) {
	settings := s.getSettings()

	// Get all online subscribers
	var subscribers []models.Subscriber
	if err := database.DB.Preload("Nas").Preload("Service").
		Where("is_online = ?", true).Find(&subscribers).Error; err != nil {
		return 0, fmt.Errorf("failed to get subscribers: %v", err)
	}

	if len(subscribers) == 0 {
		return 0, nil
	}

	// Group by NAS
	nasSubs := make(map[uint][]models.Subscriber)
	for _, sub := range subscribers {
		if sub.NasID != nil {
			nasSubs[*sub.NasID] = append(nasSubs[*sub.NasID], sub)
		}
	}

	// Analyze
	var allResults []models.SharingDetection
	var mu sync.Mutex
	var wg sync.WaitGroup

	for _, subs := range nasSubs {
		if len(subs) == 0 || subs[0].Nas == nil {
			continue
		}

		wg.Add(1)
		go func(nas *models.Nas, subscribers []models.Subscriber) {
			defer wg.Done()
			results := s.analyzeNasSubscribers(nas, subscribers, settings)
			mu.Lock()
			allResults = append(allResults, results...)
			mu.Unlock()
		}(subs[0].Nas, subs)
	}

	wg.Wait()

	// Sort by suspicion level
	sort.Slice(allResults, func(i, j int) bool {
		levelOrder := map[string]int{"high": 0, "medium": 1, "low": 2}
		return levelOrder[allResults[i].SuspicionLevel] < levelOrder[allResults[j].SuspicionLevel]
	})

	// Save to database
	savedCount := 0
	for _, detection := range allResults {
		if s.shouldSave(detection.SuspicionLevel, settings.MinSuspicionLevel) {
			detection.ScanType = "manual"
			detection.DetectedAt = time.Now()
			if err := database.DB.Create(&detection).Error; err == nil {
				savedCount++
			}
		}
	}

	return savedCount, nil
}

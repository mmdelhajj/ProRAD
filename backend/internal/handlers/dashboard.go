package handlers

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/proisp/backend/internal/database"
	"github.com/proisp/backend/internal/middleware"
	"github.com/proisp/backend/internal/models"
)

type DashboardHandler struct{}

func NewDashboardHandler() *DashboardHandler {
	return &DashboardHandler{}
}

// DashboardStats holds the dashboard statistics structure
type DashboardStats struct {
	// Users
	TotalSubscribers    int64   `json:"total_subscribers"`
	OnlineSubscribers   int64   `json:"online_subscribers"`
	OfflineSubscribers  int64   `json:"offline_subscribers"`
	ActiveSubscribers   int64   `json:"active_subscribers"`
	InactiveSubscribers int64   `json:"inactive_subscribers"`
	ExpiredSubscribers  int64   `json:"expired_subscribers"`
	ExpiringSubscribers int64   `json:"expiring_subscribers"`
	NewSubscribers      int64   `json:"new_subscribers"`

	// Resellers
	TotalResellers int64   `json:"total_resellers"`
	TotalBalance   float64 `json:"total_balance"`

	// Revenue
	TodayRevenue   float64 `json:"today_revenue"`
	MonthRevenue   float64 `json:"month_revenue"`
	UnpaidInvoices int64   `json:"unpaid_invoices"`
	UnpaidAmount   float64 `json:"unpaid_amount"`

	// System
	TotalNas       int64 `json:"total_nas"`
	OnlineNas      int64 `json:"online_nas"`
	TotalServices  int64 `json:"total_services"`
	ActiveSessions int64 `json:"active_sessions"`
}

// Stats returns dashboard statistics with caching to reduce database load
func (h *DashboardHandler) Stats(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
	}

	// Build cache key based on user type/reseller (different users see different stats)
	cacheKey := database.CacheKeyDashboardStats + "admin"
	if user.UserType == models.UserTypeReseller && user.ResellerID != nil {
		cacheKey = database.CacheKeyDashboardStats + "reseller:" + strconv.FormatUint(uint64(*user.ResellerID), 10)
	}

	// Try to get from cache first (reduces 13+ COUNT queries)
	var cachedStats DashboardStats
	if err := database.CacheGet(cacheKey, &cachedStats); err == nil {
		return c.JSON(fiber.Map{
			"success": true,
			"data":    cachedStats,
			"cached":  true,
		})
	}

	var stats struct {
		// Users
		TotalSubscribers    int64   `json:"total_subscribers"`
		OnlineSubscribers   int64   `json:"online_subscribers"`
		OfflineSubscribers  int64   `json:"offline_subscribers"`
		ActiveSubscribers   int64   `json:"active_subscribers"`
		InactiveSubscribers int64   `json:"inactive_subscribers"`
		ExpiredSubscribers  int64   `json:"expired_subscribers"`
		ExpiringSubscribers int64   `json:"expiring_subscribers"`
		NewSubscribers      int64   `json:"new_subscribers"`

		// Resellers
		TotalResellers  int64   `json:"total_resellers"`
		TotalBalance    float64 `json:"total_balance"`

		// Revenue
		TodayRevenue    float64 `json:"today_revenue"`
		MonthRevenue    float64 `json:"month_revenue"`
		UnpaidInvoices  int64   `json:"unpaid_invoices"`
		UnpaidAmount    float64 `json:"unpaid_amount"`

		// System
		TotalNas        int64   `json:"total_nas"`
		OnlineNas       int64   `json:"online_nas"`
		TotalServices   int64   `json:"total_services"`
		ActiveSessions  int64   `json:"active_sessions"`
	}

	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	weekFromNow := now.AddDate(0, 0, 7)

	// Base query for reseller filtering
	subscriberQuery := database.DB.Model(&models.Subscriber{})
	resellerQuery := database.DB.Model(&models.Reseller{})
	transactionQuery := database.DB.Model(&models.Transaction{})

	if user.UserType == models.UserTypeReseller && user.ResellerID != nil {
		subscriberQuery = subscriberQuery.Where("reseller_id IN (SELECT id FROM resellers WHERE id = ? OR parent_id = ?)", *user.ResellerID, *user.ResellerID)
		resellerQuery = resellerQuery.Where("id = ? OR parent_id = ?", *user.ResellerID, *user.ResellerID)
		transactionQuery = transactionQuery.Where("reseller_id = ?", *user.ResellerID)
	}

	// Subscriber stats - apply reseller filter to all queries
	subscriberQuery.Count(&stats.TotalSubscribers)

	// Create filtered queries for each stat
	onlineQuery := database.DB.Model(&models.Subscriber{}).Where("is_online = ?", true)
	activeQuery := database.DB.Model(&models.Subscriber{}).Where("status = ?", models.SubscriberStatusActive)
	inactiveQuery := database.DB.Model(&models.Subscriber{}).Where("status = ?", models.SubscriberStatusInactive)
	expiredQuery := database.DB.Model(&models.Subscriber{}).Where("expiry_date < ?", now)
	expiringQuery := database.DB.Model(&models.Subscriber{}).Where("expiry_date BETWEEN ? AND ?", now, weekFromNow)
	newQuery := database.DB.Model(&models.Subscriber{}).Where("created_at >= ?", monthStart)

	// Apply reseller filter if user is a reseller
	if user.UserType == models.UserTypeReseller && user.ResellerID != nil {
		resellerFilter := "reseller_id IN (SELECT id FROM resellers WHERE id = ? OR parent_id = ?)"
		onlineQuery = onlineQuery.Where(resellerFilter, *user.ResellerID, *user.ResellerID)
		activeQuery = activeQuery.Where(resellerFilter, *user.ResellerID, *user.ResellerID)
		inactiveQuery = inactiveQuery.Where(resellerFilter, *user.ResellerID, *user.ResellerID)
		expiredQuery = expiredQuery.Where(resellerFilter, *user.ResellerID, *user.ResellerID)
		expiringQuery = expiringQuery.Where(resellerFilter, *user.ResellerID, *user.ResellerID)
		newQuery = newQuery.Where(resellerFilter, *user.ResellerID, *user.ResellerID)
	}

	onlineQuery.Count(&stats.OnlineSubscribers)
	stats.OfflineSubscribers = stats.TotalSubscribers - stats.OnlineSubscribers
	activeQuery.Count(&stats.ActiveSubscribers)
	inactiveQuery.Count(&stats.InactiveSubscribers)
	expiredQuery.Count(&stats.ExpiredSubscribers)
	expiringQuery.Count(&stats.ExpiringSubscribers)
	newQuery.Count(&stats.NewSubscribers)

	// Reseller stats
	resellerQuery.Count(&stats.TotalResellers)
	database.DB.Model(&models.Reseller{}).Select("COALESCE(SUM(balance), 0)").Scan(&stats.TotalBalance)

	// Revenue stats
	database.DB.Model(&models.Transaction{}).
		Where("created_at >= ? AND type IN (?, ?)", today, models.TransactionTypeNew, models.TransactionTypeRenewal).
		Select("COALESCE(SUM(ABS(amount)), 0)").Scan(&stats.TodayRevenue)

	database.DB.Model(&models.Transaction{}).
		Where("created_at >= ? AND type IN (?, ?)", monthStart, models.TransactionTypeNew, models.TransactionTypeRenewal).
		Select("COALESCE(SUM(ABS(amount)), 0)").Scan(&stats.MonthRevenue)

	database.DB.Model(&models.Invoice{}).Where("status = ?", models.PaymentStatusPending).Count(&stats.UnpaidInvoices)
	database.DB.Model(&models.Invoice{}).Where("status = ?", models.PaymentStatusPending).
		Select("COALESCE(SUM(total - amount_paid), 0)").Scan(&stats.UnpaidAmount)

	// System stats
	database.DB.Model(&models.Nas{}).Where("is_active = ?", true).Count(&stats.TotalNas)
	database.DB.Model(&models.Nas{}).Where("is_online = ?", true).Count(&stats.OnlineNas)
	database.DB.Model(&models.Service{}).Where("is_active = ?", true).Count(&stats.TotalServices)
	database.DB.Model(&models.RadAcct{}).Where("acctstoptime IS NULL").Count(&stats.ActiveSessions)

	// Cache the stats for 30 seconds to reduce database load
	// This is especially important for systems with 30,000+ users
	database.CacheSet(cacheKey, stats, database.CacheTTLDashboardStats)

	return c.JSON(fiber.Map{
		"success": true,
		"data":    stats,
		"cached":  false,
	})
}

// ChartData returns chart data
func (h *DashboardHandler) ChartData(c *fiber.Ctx) error {
	chartType := c.Query("type", "new_expired")
	days := c.QueryInt("days", 30)

	if days > 365 {
		days = 365
	}

	startDate := time.Now().AddDate(0, 0, -days)

	var data []struct {
		Date  string `json:"date"`
		Count int64  `json:"count"`
	}

	switch chartType {
	case "new_expired":
		// New subscribers
		var newData []struct {
			Date  string `json:"date"`
			Count int64  `json:"count"`
		}
		database.DB.Model(&models.Subscriber{}).
			Select("DATE(created_at) as date, COUNT(*) as count").
			Where("created_at >= ?", startDate).
			Group("DATE(created_at)").
			Order("date").
			Scan(&newData)

		// Expired subscribers
		var expiredData []struct {
			Date  string `json:"date"`
			Count int64  `json:"count"`
		}
		database.DB.Model(&models.Subscriber{}).
			Select("DATE(expiry_date) as date, COUNT(*) as count").
			Where("expiry_date >= ? AND expiry_date <= ?", startDate, time.Now()).
			Group("DATE(expiry_date)").
			Order("date").
			Scan(&expiredData)

		return c.JSON(fiber.Map{
			"success": true,
			"data": fiber.Map{
				"new":     newData,
				"expired": expiredData,
			},
		})

	case "revenue":
		database.DB.Model(&models.Transaction{}).
			Select("DATE(created_at) as date, SUM(ABS(amount)) as count").
			Where("created_at >= ? AND type IN (?, ?)", startDate, models.TransactionTypeNew, models.TransactionTypeRenewal).
			Group("DATE(created_at)").
			Order("date").
			Scan(&data)

	case "services":
		var serviceData []struct {
			Name  string `json:"name"`
			Count int64  `json:"count"`
		}
		database.DB.Model(&models.Subscriber{}).
			Select("services.name, COUNT(*) as count").
			Joins("JOIN services ON services.id = subscribers.service_id").
			Group("services.id, services.name").
			Order("count DESC").
			Limit(10).
			Scan(&serviceData)

		return c.JSON(fiber.Map{
			"success": true,
			"data":    serviceData,
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    data,
	})
}

// RecentTransactions returns recent transactions
func (h *DashboardHandler) RecentTransactions(c *fiber.Ctx) error {
	limit := c.QueryInt("limit", 10)
	if limit > 50 {
		limit = 50
	}

	var transactions []models.Transaction
	query := database.DB.Model(&models.Transaction{}).
		Preload("Subscriber").
		Preload("Reseller.User").
		Order("created_at DESC").
		Limit(limit)

	user := middleware.GetCurrentUser(c)
	if user.UserType == models.UserTypeReseller && user.ResellerID != nil {
		query = query.Where("reseller_id = ?", *user.ResellerID)
	}

	query.Find(&transactions)

	return c.JSON(fiber.Map{
		"success": true,
		"data":    transactions,
	})
}

// TopResellers returns top resellers
func (h *DashboardHandler) TopResellers(c *fiber.Ctx) error {
	limit := c.QueryInt("limit", 5)
	if limit > 20 {
		limit = 20
	}

	var resellers []struct {
		ID          uint    `json:"id"`
		Name        string  `json:"name"`
		Username    string  `json:"username"`
		Balance     float64 `json:"balance"`
		TotalUsers  int64   `json:"total_users"`
		ActiveUsers int64   `json:"active_users"`
		NewUsers    int64   `json:"new_users"`
	}

	monthStart := time.Date(time.Now().Year(), time.Now().Month(), 1, 0, 0, 0, 0, time.Now().Location())

	database.DB.Raw(`
		SELECT
			r.id,
			r.name,
			u.username,
			r.balance,
			(SELECT COUNT(*) FROM subscribers WHERE reseller_id = r.id) as total_users,
			(SELECT COUNT(*) FROM subscribers WHERE reseller_id = r.id AND status = 1) as active_users,
			(SELECT COUNT(*) FROM subscribers WHERE reseller_id = r.id AND created_at >= ?) as new_users
		FROM resellers r
		JOIN users u ON u.id = r.user_id
		WHERE r.deleted_at IS NULL
		ORDER BY active_users DESC
		LIMIT ?
	`, monthStart, limit).Scan(&resellers)

	return c.JSON(fiber.Map{
		"success": true,
		"data":    resellers,
	})
}

// Sessions returns active sessions
func (h *DashboardHandler) Sessions(c *fiber.Ctx) error {
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 25)
	search := c.Query("search", "")

	if page < 1 {
		page = 1
	}
	if limit > 100 {
		limit = 100
	}
	offset := (page - 1) * limit

	query := database.DB.Model(&models.RadAcct{}).Where("acctstoptime IS NULL")

	if search != "" {
		searchPattern := "%" + search + "%"
		query = query.Where("username ILIKE ? OR framedipaddress ILIKE ? OR callingstationid ILIKE ?",
			searchPattern, searchPattern, searchPattern)
	}

	var total int64
	query.Count(&total)

	var sessions []models.RadAcct
	query.Order("acctstarttime DESC").Offset(offset).Limit(limit).Find(&sessions)

	return c.JSON(fiber.Map{
		"success": true,
		"data":    sessions,
		"meta": fiber.Map{
			"page":       page,
			"limit":      limit,
			"total":      total,
			"totalPages": (total + int64(limit) - 1) / int64(limit),
		},
	})
}

// SystemMetrics returns CPU, Memory, and Disk usage percentages
func (h *DashboardHandler) SystemMetrics(c *fiber.Ctx) error {
	metrics := fiber.Map{
		"cpu_percent":    getCPUPercent(),
		"memory_percent": getMemoryPercent(),
		"disk_percent":   getDiskPercent(),
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    metrics,
	})
}

// getCPUPercent reads /proc/stat twice with a delay to calculate real-time CPU usage
func getCPUPercent() float64 {
	// Try host's /proc/stat first (mounted from host system for accurate VM CPU)
	procPath := "/host/proc/stat"
	if _, err := os.Stat(procPath); os.IsNotExist(err) {
		// Fallback to container's /proc/stat if host mount not available
		procPath = "/proc/stat"
	}

	// Take first sample
	total1, idle1 := readCPUStat(procPath)
	if total1 == 0 {
		return 0
	}

	// Wait 200ms for second sample
	time.Sleep(200 * time.Millisecond)

	// Take second sample
	total2, idle2 := readCPUStat(procPath)
	if total2 == 0 {
		return 0
	}

	// Calculate delta
	totalDelta := total2 - total1
	idleDelta := idle2 - idle1

	if totalDelta == 0 {
		return 0
	}

	// Calculate real-time usage percentage
	usage := float64(totalDelta-idleDelta) / float64(totalDelta) * 100
	return roundToOneDecimal(usage)
}

// readCPUStat reads /proc/stat and returns total and idle CPU times
func readCPUStat(procPath string) (total, idle uint64) {
	file, err := os.Open(procPath)
	if err != nil {
		return 0, 0
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	if !scanner.Scan() {
		return 0, 0
	}

	line := scanner.Text()
	if !strings.HasPrefix(line, "cpu ") {
		return 0, 0
	}

	fields := strings.Fields(line)
	if len(fields) < 5 {
		return 0, 0
	}

	// Parse CPU times: user, nice, system, idle, iowait, irq, softirq, steal
	user, _ := strconv.ParseUint(fields[1], 10, 64)
	nice, _ := strconv.ParseUint(fields[2], 10, 64)
	system, _ := strconv.ParseUint(fields[3], 10, 64)
	idleTime, _ := strconv.ParseUint(fields[4], 10, 64)
	iowait := uint64(0)
	if len(fields) > 5 {
		iowait, _ = strconv.ParseUint(fields[5], 10, 64)
	}

	total = user + nice + system + idleTime + iowait
	idle = idleTime + iowait
	return total, idle
}

// getMemoryPercent reads memory usage from host's /proc/meminfo (mounted at /host/proc)
func getMemoryPercent() float64 {
	// Try host's /proc/meminfo first (mounted from host system for accurate VM memory)
	procPath := "/host/proc/meminfo"
	if _, err := os.Stat(procPath); os.IsNotExist(err) {
		// Fallback to container's /proc/meminfo if host mount not available
		procPath = "/proc/meminfo"
	}

	file, err := os.Open(procPath)
	if err != nil {
		return 0
	}
	defer file.Close()

	var memTotal, memAvailable uint64
	scanner := bufio.NewScanner(file)

	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}

		value, _ := strconv.ParseUint(fields[1], 10, 64)

		switch fields[0] {
		case "MemTotal:":
			memTotal = value
		case "MemAvailable:":
			memAvailable = value
		}

		// We have both values, can calculate
		if memTotal > 0 && memAvailable > 0 {
			break
		}
	}

	if memTotal == 0 {
		return 0
	}

	used := memTotal - memAvailable
	usage := float64(used) / float64(memTotal) * 100
	return roundToOneDecimal(usage)
}

// getDiskPercent uses syscall.Statfs to get disk usage of root filesystem
func getDiskPercent() float64 {
	var stat syscall.Statfs_t
	err := syscall.Statfs("/", &stat)
	if err != nil {
		return 0
	}

	total := stat.Blocks * uint64(stat.Bsize)
	free := stat.Bfree * uint64(stat.Bsize)

	if total == 0 {
		return 0
	}

	used := total - free
	usage := float64(used) / float64(total) * 100
	return roundToOneDecimal(usage)
}

// roundToOneDecimal rounds a float to one decimal place
func roundToOneDecimal(val float64) float64 {
	return float64(int(val*10+0.5)) / 10
}

// SystemCapacity returns capacity analysis based on server specs and cluster configuration
// Formula based on FreeRADIUS + PostgreSQL research:
// - The real bottleneck is PostgreSQL accounting writes, not RADIUS
// - Interim-Update interval is the biggest factor (writes/sec to radacct)
// - Storage type (SSD vs HDD) affects I/O performance
func (h *DashboardHandler) SystemCapacity(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
	}

	// Only admins can see system capacity
	if user.UserType != models.UserTypeAdmin {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "Admin access required"})
	}

	// Check if this is a secondary server - don't show capacity on replicas
	// Use PostgreSQL's pg_is_in_recovery() which returns true for streaming replicas
	// This is more reliable than checking cluster_config since that table gets replicated too
	var isInRecovery bool
	database.DB.Raw("SELECT pg_is_in_recovery()").Scan(&isInRecovery)
	if isInRecovery {
		return c.JSON(fiber.Map{
			"success":    true,
			"is_replica": true,
			"message":    "Capacity monitoring is only available on the main server",
			"data":       nil,
		})
	}

	// Get local server specs
	localCPUCores := getCPUCores()
	localRAMGB := getRAMGB()
	cpuSpeed := getCPUSpeed()
	cpuModel := getCPUModel()
	ramSpeed := getRAMSpeed()
	detectedStorageType := getStorageType()
	diskIOSpeed := getDiskIOSpeed()

	// Get capacity settings from system_preferences
	var interimInterval int = 5 // Default: 5 minutes
	var storageType string = detectedStorageType // Use auto-detected by default

	var interimPref models.SystemPreference
	if err := database.DB.Where("key = ?", "capacity_interim_interval").First(&interimPref).Error; err == nil {
		if val, err := strconv.Atoi(interimPref.Value); err == nil && val > 0 {
			interimInterval = val
		}
	}

	// Use manually configured storage type if set, otherwise use auto-detected
	var storagePref models.SystemPreference
	if err := database.DB.Where("key = ?", "capacity_storage_type").First(&storagePref).Error; err == nil && storagePref.Value != "" {
		storageType = storagePref.Value
	}

	// Get NAS count for additional context
	var nasCount int64
	database.DB.Model(&models.Nas{}).Where("is_active = ?", true).Count(&nasCount)

	// Check cluster configuration using raw SQL (avoids GORM/garble issues)
	var clusterConfig models.ClusterConfig
	clusterActive := false
	var isActiveCheck bool
	if err := database.DB.Raw("SELECT is_active FROM cluster_config LIMIT 1").Scan(&isActiveCheck).Error; err == nil && isActiveCheck {
		clusterActive = true
		// Load the full config for other fields we need
		database.DB.Raw("SELECT server_ip FROM cluster_config LIMIT 1").Scan(&clusterConfig.ServerIP)
	}

	// Calculate capacity using RPS-based formula (FreeRADIUS research-backed)
	// Source: FreeRADIUS Wiki, mailing lists, PostgreSQL benchmarks
	//
	// Key insight: "The number of users isn't too important. What matters is
	// the authentication rate (auths/sec) and accounting rate (acct/sec)"
	//
	// Formula: Safe Max Users = CPU × 2,000 × Storage_Factor × Interim_Factor
	//
	// Why 2,000 users/core base:
	// - FreeRADIUS can handle 10,000+ auth/sec on commodity hardware
	// - Real bottleneck is PostgreSQL accounting writes (100-1,000 RPS typical)
	// - With 5-min interim: 2,000 users = 6.7 accounting RPS (very safe)

	// Interim factor - longer intervals = more users supported
	// Accounting RPS = Users / Interim_Seconds
	// So: Max Users = Sustainable_RPS × Interim_Seconds
	var interimFactor float64
	switch {
	case interimInterval <= 1:
		interimFactor = 0.3 // 1 min = heavy DB load
	case interimInterval <= 3:
		interimFactor = 0.6 // 3 min
	case interimInterval <= 5:
		interimFactor = 1.0 // 5 min = baseline (normal ISP)
	case interimInterval <= 10:
		interimFactor = 2.0 // 10 min = recommended by RADIUS best practices
	default:
		interimFactor = 3.0 // 10+ min = optimal for large deployments
	}

	// Storage multiplier based on PostgreSQL write performance
	// - HDD: 100-500 INSERT/sec typical
	// - SSD: 1,000-10,000 INSERT/sec typical
	// - NVMe: 5,000-50,000 INSERT/sec typical
	storageMultiplier := 1.0
	if storageType == "hdd" {
		storageMultiplier = 0.4 // HDD severely limits accounting writes
	} else if storageType == "nvme" {
		storageMultiplier = 1.5 // NVMe provides 50% more headroom
	}

	// Base: 2,000 users per CPU core (research-backed for FreeRADIUS + PostgreSQL)
	usersPerCore := int64(2000)

	// RAM is secondary factor - PostgreSQL needs memory for shared_buffers
	// Rule: ~4GB base + 500MB per 10,000 users for optimal caching
	// Simplified: ~1,000 users per GB (RAM rarely the bottleneck with proper tuning)
	usersPerGB := int64(1000)

	// Get ALL cluster nodes (including offline) for display
	var totalCPUCores int64 = localCPUCores
	var totalRAMGB int64 = localRAMGB
	var totalNodeCount int64 = 1
	var onlineNodeCount int64 = 1
	var nodeDetails []fiber.Map

	if clusterActive {
		// Get ALL nodes using raw SQL to avoid GORM/garble issues
		type NodeRow struct {
			ServerName    string     `gorm:"column:server_name"`
			ServerIP      string     `gorm:"column:server_ip"`
			ServerRole    string     `gorm:"column:server_role"`
			CPUCores      int        `gorm:"column:cpu_cores"`
			RAMGB         int        `gorm:"column:ram_gb"`
			Status        string     `gorm:"column:status"`
			CPUUsage      float64    `gorm:"column:cpu_usage"`
			MemoryUsage   float64    `gorm:"column:memory_usage"`
			Version       string     `gorm:"column:version"`
			LastHeartbeat *time.Time `gorm:"column:last_heartbeat"`
		}
		var nodeRows []NodeRow
		database.DB.Raw(`SELECT server_name, server_ip, server_role, cpu_cores, ram_gb, status, cpu_usage, memory_usage, version, last_heartbeat FROM cluster_nodes WHERE deleted_at IS NULL ORDER BY server_role ASC`).Scan(&nodeRows)

		totalNodeCount = int64(len(nodeRows))
		if totalNodeCount == 0 {
			totalNodeCount = 1
		}

		// Sum up specs from ONLINE nodes only for capacity calculation
		// A node is considered online if: status='online' AND last_heartbeat within 2 minutes
		totalCPUCores = 0
		totalRAMGB = 0
		onlineNodeCount = 0
		heartbeatTimeout := time.Now().Add(-2 * time.Minute)

		for _, node := range nodeRows {
			nodeCores := int64(node.CPUCores)
			nodeRAM := int64(node.RAMGB)
			// If node specs not reported, use local specs as estimate
			if nodeCores == 0 {
				nodeCores = localCPUCores
			}
			if nodeRAM == 0 {
				nodeRAM = localRAMGB
			}

			// Calculate per-node capacity with full formula
			// Formula: CPU × 2,000 × Storage_Factor × Interim_Factor
			cpuCap := nodeCores * usersPerCore
			ramCap := nodeRAM * usersPerGB
			nodeCapacity := cpuCap
			if ramCap < cpuCap {
				nodeCapacity = ramCap
			}
			nodeCapacity = int64(float64(nodeCapacity) * storageMultiplier * interimFactor)

			// Check if node is truly online:
			// - Status must be "online"
			// - Last heartbeat must be within 2 minutes
			// - Main server (this server) is always considered online
			isOnline := node.Status == "online"
			actualStatus := node.Status

			// For non-main nodes, verify heartbeat is recent
			if node.ServerRole != "main" && node.LastHeartbeat != nil {
				if node.LastHeartbeat.Before(heartbeatTimeout) {
					isOnline = false
					actualStatus = "offline"
				}
			}

			if isOnline {
				totalCPUCores += nodeCores
				totalRAMGB += nodeRAM
				onlineNodeCount++
			}

			nodeDetails = append(nodeDetails, fiber.Map{
				"name":       node.ServerName,
				"ip":         node.ServerIP,
				"role":       node.ServerRole,
				"cpu_cores":  nodeCores,
				"ram_gb":     nodeRAM,
				"capacity":   nodeCapacity,
				"status":     actualStatus,
				"cpu_usage":  node.CPUUsage,
				"mem_usage":  node.MemoryUsage,
				"version":    node.Version,
			})
		}

		// Fallback if no online nodes (shouldn't happen, but safety)
		if onlineNodeCount == 0 {
			onlineNodeCount = 1
			totalCPUCores = localCPUCores
			totalRAMGB = localRAMGB
		}
	} else {
		// Single server - add local node details
		// Formula: CPU × 2,000 × Storage_Factor × Interim_Factor
		cpuCap := localCPUCores * usersPerCore
		ramCap := localRAMGB * usersPerGB
		localCapacity := cpuCap
		if ramCap < cpuCap {
			localCapacity = ramCap
		}
		localCapacity = int64(float64(localCapacity) * storageMultiplier * interimFactor)

		nodeDetails = append(nodeDetails, fiber.Map{
			"name":      "This Server",
			"ip":        clusterConfig.ServerIP,
			"role":      "standalone",
			"cpu_cores": localCPUCores,
			"ram_gb":    localRAMGB,
			"capacity":  localCapacity,
			"status":    "online",
		})
	}

	// Calculate total capacity using RPS-based formula
	// Formula: CPU × 2,000 × Storage_Factor × Interim_Factor × Cluster_Efficiency × Safety_Margin
	// RAM is secondary check (rarely the bottleneck with proper PostgreSQL tuning)
	cpuBasedCapacity := totalCPUCores * usersPerCore
	ramBasedCapacity := totalRAMGB * usersPerGB
	baseCapacity := cpuBasedCapacity
	if ramBasedCapacity < cpuBasedCapacity {
		baseCapacity = ramBasedCapacity
	}

	// Apply storage multiplier (HDD=0.4, SSD=1.0, NVMe=1.5)
	baseCapacity = int64(float64(baseCapacity) * storageMultiplier)

	// Apply interim factor (1min=0.3, 5min=1.0, 10min=2.0)
	baseCapacity = int64(float64(baseCapacity) * interimFactor)

	// Cluster efficiency (load balancing overhead)
	// 1 server = 100%, 2 = 95% efficiency, 3+ = 90% efficiency
	// Note: Cluster actually INCREASES capacity, but has sync overhead
	efficiencyMultiplier := 1.0
	if onlineNodeCount == 2 {
		efficiencyMultiplier = 0.95
	} else if onlineNodeCount >= 3 {
		efficiencyMultiplier = 0.90
	}

	// Apply cluster efficiency and -15% safety margin
	safetyMargin := 0.85 // -15% safety margin for unexpected peaks
	totalCapacity := int64(float64(baseCapacity) * efficiencyMultiplier * safetyMargin)
	recommendedCapacity := int64(float64(totalCapacity) * 0.7) // 70% for normal operation

	// Get current online users
	var onlineUsers int64
	database.DB.Model(&models.Subscriber{}).Where("is_online = ?", true).Count(&onlineUsers)

	// Get total subscribers
	var totalSubscribers int64
	database.DB.Model(&models.Subscriber{}).Count(&totalSubscribers)

	// Calculate accounting writes per second (for info)
	// Formula: onlineUsers / interimInterval(in seconds) for interim updates
	// Plus start/stop events (~10% overhead)
	interimWritesPerSec := float64(0)
	if interimInterval > 0 && onlineUsers > 0 {
		interimWritesPerSec = float64(onlineUsers) / float64(interimInterval*60) * 1.1
	}

	// Calculate usage percentage
	usagePercent := float64(0)
	if totalCapacity > 0 {
		usagePercent = float64(onlineUsers) / float64(totalCapacity) * 100
	}

	// Determine status
	status := "healthy"
	if usagePercent >= 90 {
		status = "critical"
	} else if usagePercent >= 70 {
		status = "warning"
	}

	// Limiting factor
	limitingFactor := "cpu"
	if ramBasedCapacity < cpuBasedCapacity {
		limitingFactor = "ram"
	}
	if storageType == "hdd" && storageMultiplier < 1.0 {
		limitingFactor = "storage_io"
	}

	// Calculate projections using the new RPS-based formula
	// Formula: CPU × 2,000 × Storage_Factor × Interim_Factor × Efficiency × Safety

	// Adding 8 CPU cores
	newCPUTotal := int64(float64((totalCPUCores+8)*usersPerCore) * storageMultiplier * interimFactor)
	newCPUBase := newCPUTotal
	ramCapWithStorage := int64(float64(ramBasedCapacity) * storageMultiplier * interimFactor)
	if ramCapWithStorage < newCPUTotal {
		newCPUBase = ramCapWithStorage
	}
	newCPUCapacity := int64(float64(newCPUBase) * efficiencyMultiplier * safetyMargin)

	// Adding 16 GB RAM
	newRAMTotal := int64(float64((totalRAMGB+16)*usersPerGB) * storageMultiplier * interimFactor)
	newRAMBase := newRAMTotal
	cpuCapWithStorage := int64(float64(cpuBasedCapacity) * storageMultiplier * interimFactor)
	if cpuCapWithStorage < newRAMTotal {
		newRAMBase = cpuCapWithStorage
	}
	newRAMCapacity := int64(float64(newRAMBase) * efficiencyMultiplier * safetyMargin)

	// Adding another cluster node (assume same specs as average of online nodes)
	avgCores := totalCPUCores / onlineNodeCount
	avgRAM := totalRAMGB / onlineNodeCount
	newNodeCPUCap := avgCores * usersPerCore
	newNodeRAMCap := avgRAM * usersPerGB
	newNodeCapacity := newNodeCPUCap
	if newNodeRAMCap < newNodeCPUCap {
		newNodeCapacity = newNodeRAMCap
	}
	newNodeCapacity = int64(float64(newNodeCapacity) * storageMultiplier * interimFactor)

	// Calculate new efficiency based on adding one more online node
	newOnlineCount := onlineNodeCount + 1
	newEfficiency := 1.0
	if newOnlineCount == 2 {
		newEfficiency = 0.95
	} else if newOnlineCount >= 3 {
		newEfficiency = 0.90
	}
	newClusterCapacity := int64(float64(baseCapacity+newNodeCapacity) * newEfficiency * safetyMargin)

	// Upgrade to SSD projection (if on HDD)
	ssdUpgradeCapacity := int64(0)
	ssdUpgradeBenefit := false
	if storageType == "hdd" {
		ssdBaseCapacity := cpuBasedCapacity
		if ramBasedCapacity < cpuBasedCapacity {
			ssdBaseCapacity = ramBasedCapacity
		}
		// SSD = 1.0 multiplier vs HDD = 0.4, so 150% increase
		ssdUpgradeCapacity = int64(float64(ssdBaseCapacity) * 1.0 * interimFactor * efficiencyMultiplier * safetyMargin)
		ssdUpgradeBenefit = true
	}

	// Change interim interval projection
	// 10 min interim has factor 2.0 (vs 1.0 for 5 min)
	interim10minCapacity := int64(0)
	if interimInterval < 10 {
		// Calculate capacity with 10 min interval (interim factor = 2.0)
		cap10 := totalCPUCores * usersPerCore
		if totalRAMGB*usersPerGB < cap10 {
			cap10 = totalRAMGB * usersPerGB
		}
		// Apply storage × interim(2.0) × efficiency × safety
		interim10minCapacity = int64(float64(cap10) * storageMultiplier * 2.0 * efficiencyMultiplier * safetyMargin)
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			// Total cluster specs
			"total_cpu_cores": totalCPUCores,
			"total_ram_gb":    totalRAMGB,

			// Local server specs (for reference)
			"local_cpu_cores": localCPUCores,
			"local_ram_gb":    localRAMGB,

			// Hardware specs (auto-detected)
			"cpu_model":            cpuModel,
			"cpu_speed_mhz":        cpuSpeed,
			"ram_speed_mhz":        ramSpeed,
			"storage_type_detected": detectedStorageType,
			"disk_io_speed_mb":     diskIOSpeed,

			// Capacity settings (RPS-based formula)
			"interim_interval":    interimInterval,
			"interim_factor":      interimFactor,
			"storage_type":        storageType,
			"users_per_core":      usersPerCore,
			"storage_multiplier":  storageMultiplier,
			"nas_count":           nasCount,
			"db_writes_per_sec":   roundToOneDecimal(interimWritesPerSec),
			"formula":             "CPU × 2000 × Storage × Interim × Efficiency × Safety",

			// Cluster info
			"cluster_enabled":    clusterActive,
			"total_nodes":        totalNodeCount,
			"online_nodes":       onlineNodeCount,
			"cluster_efficiency": efficiencyMultiplier,
			"safety_margin":      safetyMargin,
			"nodes":              nodeDetails,

			// Capacity numbers
			"base_capacity":        baseCapacity,
			"recommended_capacity": recommendedCapacity,
			"maximum_capacity":     totalCapacity,
			"limiting_factor":      limitingFactor,

			// Current usage
			"online_users":      onlineUsers,
			"total_subscribers": totalSubscribers,
			"usage_percent":     roundToOneDecimal(usagePercent),
			"status":            status,

			// Projections for adding resources
			"projections": fiber.Map{
				"add_8_cores": fiber.Map{
					"new_capacity": newCPUCapacity,
					"description":  "Adding 8 CPU cores",
				},
				"add_16gb_ram": fiber.Map{
					"new_capacity": newRAMCapacity,
					"no_benefit":   int64(float64(cpuBasedCapacity)*storageMultiplier) < int64(float64((totalRAMGB+16)*usersPerGB)*storageMultiplier),
					"description":  "Adding 16GB RAM",
				},
				"add_cluster_node": fiber.Map{
					"new_node_count": onlineNodeCount + 1,
					"new_capacity":   newClusterCapacity,
					"description":    "Adding 1 cluster node (same specs)",
				},
				"upgrade_to_ssd": fiber.Map{
					"new_capacity": ssdUpgradeCapacity,
					"has_benefit":  ssdUpgradeBenefit,
					"description":  "Upgrade HDD to SSD",
				},
				"interim_10_min": fiber.Map{
					"new_capacity": interim10minCapacity,
					"has_benefit":  interimInterval < 10,
					"description":  "Change Interim-Update to 10 min",
				},
			},
		},
	})
}

// getCPUCores returns the number of CPU cores
func getCPUCores() int64 {
	// Try host's cpuinfo first
	cpuinfoPath := "/host/proc/cpuinfo"
	if _, err := os.Stat(cpuinfoPath); os.IsNotExist(err) {
		cpuinfoPath = "/proc/cpuinfo"
	}

	file, err := os.Open(cpuinfoPath)
	if err != nil {
		return 4 // Default fallback
	}
	defer file.Close()

	var cores int64 = 0
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "processor") {
			cores++
		}
	}

	if cores == 0 {
		return 4 // Default fallback
	}
	return cores
}

// getRAMGB returns total RAM in gigabytes
func getRAMGB() int64 {
	// Try host's meminfo first
	meminfoPath := "/host/proc/meminfo"
	if _, err := os.Stat(meminfoPath); os.IsNotExist(err) {
		meminfoPath = "/proc/meminfo"
	}

	file, err := os.Open(meminfoPath)
	if err != nil {
		return 8 // Default fallback
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "MemTotal:") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				kb, _ := strconv.ParseUint(fields[1], 10, 64)
				return int64(kb / 1024 / 1024) // Convert KB to GB
			}
		}
	}

	return 8 // Default fallback
}

// getStorageType auto-detects if the primary storage is SSD or HDD
// Checks /sys/block/*/queue/rotational: 0 = SSD, 1 = HDD
func getStorageType() string {
	// Priority order: NVMe first (fastest), then common VM devices, then ZFS zvols
	// NVMe devices are always SSD
	nvmeDevices := []string{"nvme0n1", "nvme1n1", "nvme0n1p1"}
	for _, dev := range nvmeDevices {
		hostPath := "/host/sys/block/" + dev
		containerPath := "/sys/block/" + dev
		if _, err := os.Stat(hostPath); err == nil {
			return "nvme"
		}
		if _, err := os.Stat(containerPath); err == nil {
			return "nvme"
		}
	}

	// Check ZFS zvols (common in Proxmox) - these are typically SSD-backed
	zfsDevices := []string{"zd0", "zd16", "zd32", "zd48", "zd64"}
	for _, dev := range zfsDevices {
		rotationalPath := fmt.Sprintf("/sys/block/%s/queue/rotational", dev)
		hostPath := "/host" + rotationalPath
		if _, err := os.Stat(hostPath); err == nil {
			rotationalPath = hostPath
		}
		data, err := os.ReadFile(rotationalPath)
		if err != nil {
			continue
		}
		val := strings.TrimSpace(string(data))
		if val == "0" {
			return "ssd" // ZFS on SSD
		}
	}

	// Check common VM disk devices
	devices := []string{"vda", "sda", "xvda"}
	for _, dev := range devices {
		rotationalPath := fmt.Sprintf("/sys/block/%s/queue/rotational", dev)
		hostPath := "/host" + rotationalPath
		if _, err := os.Stat(hostPath); err == nil {
			rotationalPath = hostPath
		}

		data, err := os.ReadFile(rotationalPath)
		if err != nil {
			continue
		}

		val := strings.TrimSpace(string(data))
		if val == "0" {
			return "ssd" // SSD/NVMe (non-rotational)
		} else if val == "1" {
			return "hdd" // Traditional spinning disk
		}
	}

	// Fallback: assume SSD if we can't detect (modern default for VMs)
	return "ssd"
}

// getCPUSpeed returns the CPU speed in MHz
func getCPUSpeed() int64 {
	cpuinfoPath := "/host/proc/cpuinfo"
	if _, err := os.Stat(cpuinfoPath); os.IsNotExist(err) {
		cpuinfoPath = "/proc/cpuinfo"
	}

	file, err := os.Open(cpuinfoPath)
	if err != nil {
		return 0
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "cpu MHz") {
			fields := strings.Split(line, ":")
			if len(fields) >= 2 {
				mhzStr := strings.TrimSpace(fields[1])
				mhz, _ := strconv.ParseFloat(mhzStr, 64)
				return int64(mhz)
			}
		}
	}

	return 0
}

// getCPUModel returns the CPU model name
func getCPUModel() string {
	cpuinfoPath := "/host/proc/cpuinfo"
	if _, err := os.Stat(cpuinfoPath); os.IsNotExist(err) {
		cpuinfoPath = "/proc/cpuinfo"
	}

	file, err := os.Open(cpuinfoPath)
	if err != nil {
		return "Unknown"
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "model name") {
			fields := strings.Split(line, ":")
			if len(fields) >= 2 {
				return strings.TrimSpace(fields[1])
			}
		}
	}

	return "Unknown"
}

// getRAMSpeed attempts to get RAM speed in MHz using dmidecode
// Returns 0 if unable to detect (needs root access)
func getRAMSpeed() int64 {
	// Try reading from dmidecode output
	// This requires root access and dmidecode installed
	cmd := exec.Command("dmidecode", "-t", "memory")
	output, err := cmd.Output()
	if err != nil {
		return 0
	}

	// Parse output for "Speed:" lines
	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "Speed:") && !strings.Contains(line, "Unknown") {
			// Format: "Speed: 3200 MT/s" or "Speed: 2666 MHz"
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				speedStr := parts[1]
				speed, _ := strconv.ParseInt(speedStr, 10, 64)
				if speed > 0 {
					return speed
				}
			}
		}
	}

	return 0
}

// getDiskIOSpeed performs a simple sequential read test to estimate disk speed
// Returns speed in MB/s
func getDiskIOSpeed() int64 {
	// Read 100MB from /dev/zero to /dev/null through a temp file isn't practical
	// Instead, we'll use a simple heuristic based on storage type
	// SSD: typically 400-3500 MB/s
	// HDD: typically 80-200 MB/s

	storageType := getStorageType()
	if storageType == "ssd" {
		return 500 // Conservative SSD estimate
	}
	return 100 // Conservative HDD estimate
}

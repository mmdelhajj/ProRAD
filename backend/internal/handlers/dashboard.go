package handlers

import (
	"bufio"
	"os"
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

// Stats returns dashboard statistics
func (h *DashboardHandler) Stats(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
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

	// Subscriber stats
	subscriberQuery.Count(&stats.TotalSubscribers)
	database.DB.Model(&models.Subscriber{}).Where("is_online = ?", true).Count(&stats.OnlineSubscribers)
	stats.OfflineSubscribers = stats.TotalSubscribers - stats.OnlineSubscribers
	database.DB.Model(&models.Subscriber{}).Where("status = ?", models.SubscriberStatusActive).Count(&stats.ActiveSubscribers)
	database.DB.Model(&models.Subscriber{}).Where("status = ?", models.SubscriberStatusInactive).Count(&stats.InactiveSubscribers)
	database.DB.Model(&models.Subscriber{}).Where("expiry_date < ?", now).Count(&stats.ExpiredSubscribers)
	database.DB.Model(&models.Subscriber{}).Where("expiry_date BETWEEN ? AND ?", now, weekFromNow).Count(&stats.ExpiringSubscribers)
	database.DB.Model(&models.Subscriber{}).Where("created_at >= ?", monthStart).Count(&stats.NewSubscribers)

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

	return c.JSON(fiber.Map{
		"success": true,
		"data":    stats,
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

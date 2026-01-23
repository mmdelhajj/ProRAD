package handlers

import (
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/proisp/backend/internal/database"
	"github.com/proisp/backend/internal/models"
)

type ReportHandler struct{}

func NewReportHandler() *ReportHandler {
	return &ReportHandler{}
}

// GetSubscriberStats returns subscriber statistics
func (h *ReportHandler) GetSubscriberStats(c *fiber.Ctx) error {
	resellerID := c.QueryInt("reseller_id", 0)

	var total, active, expired, suspended, online int64

	query := database.DB.Model(&models.Subscriber{})
	if resellerID > 0 {
		query = query.Where("reseller_id = ?", resellerID)
	}

	query.Count(&total)
	database.DB.Model(&models.Subscriber{}).Where("status = ?", "active").Count(&active)
	database.DB.Model(&models.Subscriber{}).Where("status = ?", "expired").Count(&expired)
	database.DB.Model(&models.Subscriber{}).Where("status = ?", "suspended").Count(&suspended)
	database.DB.Model(&models.Session{}).Where("status = ?", "online").Count(&online)

	// New subscribers this month
	startOfMonth := time.Now().AddDate(0, 0, -time.Now().Day()+1).Truncate(24 * time.Hour)
	var newThisMonth int64
	database.DB.Model(&models.Subscriber{}).Where("created_at >= ?", startOfMonth).Count(&newThisMonth)

	// Expiring soon (next 7 days)
	var expiringSoon int64
	database.DB.Model(&models.Subscriber{}).
		Where("expiry_date BETWEEN ? AND ?", time.Now(), time.Now().AddDate(0, 0, 7)).
		Count(&expiringSoon)

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"total":         total,
			"active":        active,
			"expired":       expired,
			"suspended":     suspended,
			"online":        online,
			"newThisMonth":  newThisMonth,
			"expiringSoon":  expiringSoon,
		},
	})
}

// GetRevenueStats returns revenue statistics
func (h *ReportHandler) GetRevenueStats(c *fiber.Ctx) error {
	period := c.Query("period", "month") // day, week, month, year
	resellerID := c.QueryInt("reseller_id", 0)

	var startDate time.Time
	switch period {
	case "day":
		startDate = time.Now().Truncate(24 * time.Hour)
	case "week":
		startDate = time.Now().AddDate(0, 0, -7)
	case "year":
		startDate = time.Now().AddDate(-1, 0, 0)
	default: // month
		startDate = time.Now().AddDate(0, -1, 0)
	}

	query := database.DB.Model(&models.Payment{}).Where("created_at >= ?", startDate)
	if resellerID > 0 {
		query = query.Where("reseller_id = ?", resellerID)
	}

	// Total revenue
	type SumResult struct {
		Total float64
	}
	var totalRevenue SumResult
	query.Select("COALESCE(SUM(amount), 0) as total").Scan(&totalRevenue)

	// Count of payments
	var paymentCount int64
	query.Count(&paymentCount)

	// Revenue by payment method
	type MethodRevenue struct {
		PaymentMethod string  `json:"payment_method"`
		Amount        float64 `json:"amount"`
		Count         int64   `json:"count"`
	}
	var byMethod []MethodRevenue
	database.DB.Model(&models.Payment{}).
		Select("payment_method, COALESCE(SUM(amount), 0) as amount, COUNT(*) as count").
		Where("created_at >= ?", startDate).
		Group("payment_method").
		Scan(&byMethod)

	// Daily revenue for chart
	type DailyRevenue struct {
		Date   string  `json:"date"`
		Amount float64 `json:"amount"`
	}
	var dailyRevenue []DailyRevenue
	database.DB.Model(&models.Payment{}).
		Select("DATE(created_at) as date, COALESCE(SUM(amount), 0) as amount").
		Where("created_at >= ?", startDate).
		Group("DATE(created_at)").
		Order("date").
		Scan(&dailyRevenue)

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"totalRevenue":  totalRevenue.Total,
			"paymentCount":  paymentCount,
			"byMethod":      byMethod,
			"dailyRevenue":  dailyRevenue,
		},
	})
}

// GetServiceStats returns service plan statistics
func (h *ReportHandler) GetServiceStats(c *fiber.Ctx) error {
	type ServiceStat struct {
		ID              uint    `json:"id"`
		Name            string  `json:"name"`
		SubscriberCount int64   `json:"subscriber_count"`
		Revenue         float64 `json:"revenue"`
	}

	var stats []ServiceStat
	database.DB.Model(&models.Service{}).
		Select(`services.id, services.name,
			(SELECT COUNT(*) FROM subscribers WHERE service_id = services.id) as subscriber_count,
			(SELECT COALESCE(SUM(amount), 0) FROM payments p
			 JOIN subscribers s ON p.subscriber_id = s.id
			 WHERE s.service_id = services.id) as revenue`).
		Scan(&stats)

	return c.JSON(fiber.Map{
		"success": true,
		"data":    stats,
	})
}

// GetResellerStats returns reseller statistics
func (h *ReportHandler) GetResellerStats(c *fiber.Ctx) error {
	type ResellerStat struct {
		ID              uint    `json:"id"`
		Name            string  `json:"name"`
		Balance         float64 `json:"balance"`
		SubscriberCount int64   `json:"subscriber_count"`
		ActiveCount     int64   `json:"active_count"`
	}

	var stats []ResellerStat
	database.DB.Model(&models.Reseller{}).
		Select(`resellers.id, resellers.name, resellers.balance,
			(SELECT COUNT(*) FROM subscribers WHERE reseller_id = resellers.id) as subscriber_count,
			(SELECT COUNT(*) FROM subscribers WHERE reseller_id = resellers.id AND status = 'active') as active_count`).
		Scan(&stats)

	return c.JSON(fiber.Map{
		"success": true,
		"data":    stats,
	})
}

// GetUsageStats returns bandwidth usage statistics
func (h *ReportHandler) GetUsageStats(c *fiber.Ctx) error {
	period := c.Query("period", "day") // day, week, month

	var startDate time.Time
	switch period {
	case "week":
		startDate = time.Now().AddDate(0, 0, -7)
	case "month":
		startDate = time.Now().AddDate(0, -1, 0)
	default: // day
		startDate = time.Now().Truncate(24 * time.Hour)
	}

	// Total usage
	type UsageStat struct {
		TotalUpload   int64 `json:"total_upload"`
		TotalDownload int64 `json:"total_download"`
	}
	var totalUsage UsageStat
	database.DB.Model(&models.RadiusAccounting{}).
		Select("COALESCE(SUM(acct_input_octets), 0) as total_upload, COALESCE(SUM(acct_output_octets), 0) as total_download").
		Where("acct_start_time >= ?", startDate).
		Scan(&totalUsage)

	// Top users by usage
	type TopUser struct {
		Username string `json:"username"`
		Upload   int64  `json:"upload"`
		Download int64  `json:"download"`
	}
	var topUsers []TopUser
	database.DB.Model(&models.RadiusAccounting{}).
		Select("username, SUM(acct_input_octets) as upload, SUM(acct_output_octets) as download").
		Where("acct_start_time >= ?", startDate).
		Group("username").
		Order("download DESC").
		Limit(20).
		Scan(&topUsers)

	// Hourly usage for chart
	type HourlyUsage struct {
		Hour     int   `json:"hour"`
		Upload   int64 `json:"upload"`
		Download int64 `json:"download"`
	}
	var hourlyUsage []HourlyUsage
	database.DB.Model(&models.RadiusAccounting{}).
		Select("EXTRACT(HOUR FROM acct_start_time) as hour, SUM(acct_input_octets) as upload, SUM(acct_output_octets) as download").
		Where("acct_start_time >= ?", time.Now().Truncate(24*time.Hour)).
		Group("hour").
		Order("hour").
		Scan(&hourlyUsage)

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"totalUsage":  totalUsage,
			"topUsers":    topUsers,
			"hourlyUsage": hourlyUsage,
		},
	})
}

// GetExpiryReport returns subscribers expiring within a date range
func (h *ReportHandler) GetExpiryReport(c *fiber.Ctx) error {
	days := c.QueryInt("days", 7)
	resellerID := c.QueryInt("reseller_id", 0)

	query := database.DB.Model(&models.Subscriber{}).
		Preload("Service").
		Preload("Reseller").
		Where("expiry_date BETWEEN ? AND ?", time.Now(), time.Now().AddDate(0, 0, days))

	if resellerID > 0 {
		query = query.Where("reseller_id = ?", resellerID)
	}

	var subscribers []models.Subscriber
	query.Order("expiry_date").Find(&subscribers)

	// Group by days until expiry
	type DayGroup struct {
		Day   int   `json:"day"`
		Count int64 `json:"count"`
	}
	var dayGroups []DayGroup
	for i := 0; i <= days; i++ {
		targetDate := time.Now().AddDate(0, 0, i).Truncate(24 * time.Hour)
		var count int64
		database.DB.Model(&models.Subscriber{}).
			Where("DATE(expiry_date) = ?", targetDate.Format("2006-01-02")).
			Count(&count)
		if count > 0 {
			dayGroups = append(dayGroups, DayGroup{Day: i, Count: count})
		}
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"subscribers": subscribers,
			"byDay":       dayGroups,
			"total":       len(subscribers),
		},
	})
}

// GetTransactionReport returns transaction report
func (h *ReportHandler) GetTransactionReport(c *fiber.Ctx) error {
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 50)
	transType := c.Query("type", "")
	dateFrom := c.Query("date_from", "")
	dateTo := c.Query("date_to", "")
	resellerID := c.QueryInt("reseller_id", 0)

	if page < 1 {
		page = 1
	}
	if limit > 200 {
		limit = 200
	}
	offset := (page - 1) * limit

	query := database.DB.Model(&models.Transaction{}).Preload("Subscriber")

	if transType != "" {
		query = query.Where("type = ?", transType)
	}
	if dateFrom != "" {
		query = query.Where("created_at >= ?", dateFrom)
	}
	if dateTo != "" {
		query = query.Where("created_at <= ?", dateTo+" 23:59:59")
	}
	if resellerID > 0 {
		query = query.Where("reseller_id = ?", resellerID)
	}

	var total int64
	query.Count(&total)

	var transactions []models.Transaction
	query.Order("created_at DESC").Offset(offset).Limit(limit).Find(&transactions)

	// Summary
	type Summary struct {
		Type   string  `json:"type"`
		Amount float64 `json:"amount"`
		Count  int64   `json:"count"`
	}
	var summary []Summary
	summaryQuery := database.DB.Model(&models.Transaction{}).
		Select("type, COALESCE(SUM(amount), 0) as amount, COUNT(*) as count")
	if dateFrom != "" {
		summaryQuery = summaryQuery.Where("created_at >= ?", dateFrom)
	}
	if dateTo != "" {
		summaryQuery = summaryQuery.Where("created_at <= ?", dateTo+" 23:59:59")
	}
	summaryQuery.Group("type").Scan(&summary)

	return c.JSON(fiber.Map{
		"success": true,
		"data":    transactions,
		"summary": summary,
		"meta": fiber.Map{
			"page":       page,
			"limit":      limit,
			"total":      total,
			"totalPages": (total + int64(limit) - 1) / int64(limit),
		},
	})
}

// GetNASStats returns NAS device statistics
func (h *ReportHandler) GetNASStats(c *fiber.Ctx) error {
	type NASStat struct {
		ID            uint   `json:"id"`
		Name          string `json:"name"`
		IPAddress     string `json:"ip_address"`
		OnlineCount   int64  `json:"online_count"`
		TotalSessions int64  `json:"total_sessions"`
	}

	var stats []NASStat
	database.DB.Model(&models.Nas{}).
		Select(`nas.id, nas.name, nas.ip_address,
			(SELECT COUNT(*) FROM sessions WHERE nas_id = nas.id AND status = 'online') as online_count,
			(SELECT COUNT(*) FROM radacct WHERE nas_ip_address = nas.ip_address) as total_sessions`).
		Scan(&stats)

	return c.JSON(fiber.Map{
		"success": true,
		"data":    stats,
	})
}

// ExportReport exports report data in various formats
func (h *ReportHandler) ExportReport(c *fiber.Ctx) error {
	reportType := c.Params("type")
	format := c.Query("format", "json") // json, csv

	switch reportType {
	case "subscribers":
		var subscribers []models.Subscriber
		database.DB.Preload("Service").Preload("Reseller").Find(&subscribers)
		if format == "csv" {
			c.Set("Content-Type", "text/csv")
			c.Set("Content-Disposition", "attachment; filename=subscribers.csv")
			// Generate CSV
			csv := "ID,Username,FullName,Status,Service,ExpiryDate\n"
			for _, s := range subscribers {
				serviceName := s.Service.Name
				csv += fmt.Sprintf("%d,%s,%s,%d,%s,%s\n", s.ID, s.Username, s.FullName, s.Status, serviceName, s.ExpiryDate.Format("2006-01-02"))
			}
			return c.SendString(csv)
		}
		return c.JSON(fiber.Map{"success": true, "data": subscribers})

	case "transactions":
		var transactions []models.Transaction
		database.DB.Preload("Subscriber").Find(&transactions)
		return c.JSON(fiber.Map{"success": true, "data": transactions})

	case "invoices":
		var invoices []models.Invoice
		database.DB.Preload("Subscriber").Preload("Items").Find(&invoices)
		return c.JSON(fiber.Map{"success": true, "data": invoices})

	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid report type",
		})
	}
}

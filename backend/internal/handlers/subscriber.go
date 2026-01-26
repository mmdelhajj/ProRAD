package handlers

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/proisp/backend/internal/database"
	"github.com/proisp/backend/internal/license"
	"github.com/proisp/backend/internal/middleware"
	"github.com/proisp/backend/internal/mikrotik"
	"github.com/proisp/backend/internal/models"
	"github.com/proisp/backend/internal/radius"
	"github.com/proisp/backend/internal/security"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type SubscriberHandler struct{}

func NewSubscriberHandler() *SubscriberHandler {
	return &SubscriberHandler{}
}

// ListRequest represents list request params
type ListRequest struct {
	Page     int    `query:"page"`
	Limit    int    `query:"limit"`
	Search   string `query:"search"`
	Status   string `query:"status"`
	Service  uint   `query:"service"`
	Reseller uint   `query:"reseller"`
	Online   string `query:"online"`
	SortBy   string `query:"sort_by"`
	SortDir  string `query:"sort_dir"`
}

// List returns all subscribers with pagination
func (h *SubscriberHandler) List(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
	}

	// Parse query params
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "25"))
	search := c.Query("search", "")
	status := c.Query("status", "")
	serviceID, _ := strconv.Atoi(c.Query("service", "0"))
	online := c.Query("online", "")
	sortBy := c.Query("sort_by", "created_at")
	sortDir := c.Query("sort_dir", "desc")

	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 25
	}

	offset := (page - 1) * limit

	// Build query (no Preload - manually load relations to avoid garble/GORM issues)
	query := database.DB.Model(&models.Subscriber{})

	// Filter by reseller for non-admin users
	if user.UserType == models.UserTypeReseller && user.ResellerID != nil {
		// Get reseller and their sub-resellers
		query = query.Where("reseller_id IN (SELECT id FROM resellers WHERE id = ? OR parent_id = ?)", *user.ResellerID, *user.ResellerID)
	}

	// Search filter
	if search != "" {
		searchPattern := "%" + search + "%"
		query = query.Where(
			"username ILIKE ? OR full_name ILIKE ? OR phone ILIKE ? OR email ILIKE ? OR address ILIKE ? OR mac_address ILIKE ? OR ip_address ILIKE ?",
			searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern,
		)
	}

	// Status filter
	if status != "" {
		switch status {
		case "active":
			query = query.Where("status = ?", models.SubscriberStatusActive)
		case "inactive":
			query = query.Where("status = ?", models.SubscriberStatusInactive)
		case "expired":
			query = query.Where("expiry_date < ?", time.Now())
		case "expiring":
			query = query.Where("expiry_date BETWEEN ? AND ?", time.Now(), time.Now().AddDate(0, 0, 7))
		}
	}

	// Service filter
	if serviceID > 0 {
		query = query.Where("service_id = ?", serviceID)
	}

	// Online filter
	if online != "" {
		isOnline := online == "true" || online == "1"
		query = query.Where("is_online = ?", isOnline)
	}

	// Count total
	var total int64
	query.Count(&total)

	// Apply sorting
	allowedSortFields := map[string]bool{
		"username": true, "full_name": true, "created_at": true, "expiry_date": true, "is_online": true,
	}
	if !allowedSortFields[sortBy] {
		sortBy = "created_at"
	}
	if sortDir != "asc" && sortDir != "desc" {
		sortDir = "desc"
	}
	query = query.Order(fmt.Sprintf("%s %s", sortBy, sortDir))

	// Fetch subscribers
	var subscribers []models.Subscriber
	if err := query.Offset(offset).Limit(limit).Find(&subscribers).Error; err != nil {
		log.Printf("ERROR: Failed to fetch subscribers: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to fetch subscribers: " + err.Error(),
		})
	}
	log.Printf("DEBUG: Fetched %d subscribers", len(subscribers))

	// Manually load Service and Reseller relations (to avoid garble/GORM Preload issues)
	if len(subscribers) > 0 {
		// Collect unique IDs
		serviceIDs := make(map[uint]bool)
		resellerIDs := make(map[uint]bool)
		for _, s := range subscribers {
			if s.ServiceID > 0 {
				serviceIDs[s.ServiceID] = true
			}
			if s.ResellerID > 0 {
				resellerIDs[s.ResellerID] = true
			}
		}

		// Load services
		var services []models.Service
		if len(serviceIDs) > 0 {
			ids := make([]uint, 0, len(serviceIDs))
			for id := range serviceIDs {
				ids = append(ids, id)
			}
			if err := database.DB.Where("id IN ?", ids).Find(&services).Error; err != nil {
				log.Printf("ERROR: Failed to load services: %v", err)
			}
		}
		log.Printf("DEBUG: Loaded %d services", len(services))
		serviceMap := make(map[uint]*models.Service)
		for i := range services {
			serviceMap[services[i].ID] = &services[i]
		}

		// Load resellers
		var resellers []models.Reseller
		if len(resellerIDs) > 0 {
			ids := make([]uint, 0, len(resellerIDs))
			for id := range resellerIDs {
				ids = append(ids, id)
			}
			if err := database.DB.Where("id IN ?", ids).Find(&resellers).Error; err != nil {
				log.Printf("ERROR: Failed to load resellers: %v", err)
			}
		}
		log.Printf("DEBUG: Loaded %d resellers", len(resellers))
		resellerMap := make(map[uint]*models.Reseller)
		for i := range resellers {
			resellerMap[resellers[i].ID] = &resellers[i]
		}

		// Assign to subscribers
		for i := range subscribers {
			if svc, ok := serviceMap[subscribers[i].ServiceID]; ok {
				subscribers[i].Service = svc
			}
			if res, ok := resellerMap[subscribers[i].ResellerID]; ok {
				subscribers[i].Reseller = res
			}
		}
	}

	// Calculate stats
	var stats struct {
		Total    int64 `json:"total"`
		Online   int64 `json:"online"`
		Offline  int64 `json:"offline"`
		Active   int64 `json:"active"`
		Inactive int64 `json:"inactive"`
		Expired  int64 `json:"expired"`
		Expiring int64 `json:"expiring"`
	}

	baseQuery := database.DB.Model(&models.Subscriber{})
	if user.UserType == models.UserTypeReseller && user.ResellerID != nil {
		baseQuery = baseQuery.Where("reseller_id IN (SELECT id FROM resellers WHERE id = ? OR parent_id = ?)", *user.ResellerID, *user.ResellerID)
	}

	baseQuery.Count(&stats.Total)
	baseQuery.Where("is_online = true").Count(&stats.Online)
	stats.Offline = stats.Total - stats.Online
	baseQuery.Where("status = ?", models.SubscriberStatusActive).Count(&stats.Active)
	baseQuery.Where("status = ?", models.SubscriberStatusInactive).Count(&stats.Inactive)
	baseQuery.Where("expiry_date < ?", time.Now()).Count(&stats.Expired)
	baseQuery.Where("expiry_date BETWEEN ? AND ?", time.Now(), time.Now().AddDate(0, 0, 7)).Count(&stats.Expiring)

	return c.JSON(fiber.Map{
		"success": true,
		"data":    subscribers,
		"meta": fiber.Map{
			"page":       page,
			"limit":      limit,
			"total":      total,
			"totalPages": (total + int64(limit) - 1) / int64(limit),
		},
		"stats": stats,
	})
}

// Get returns a single subscriber
func (h *SubscriberHandler) Get(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid subscriber ID",
		})
	}

	var subscriber models.Subscriber
	if err := database.DB.First(&subscriber, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Subscriber not found",
		})
	}

	// Manually load relations (to avoid garble/GORM Preload issues)
	if subscriber.ServiceID > 0 {
		var service models.Service
		if database.DB.First(&service, subscriber.ServiceID).Error == nil {
			subscriber.Service = &service
		}
	}
	if subscriber.ResellerID > 0 {
		var reseller models.Reseller
		if database.DB.First(&reseller, subscriber.ResellerID).Error == nil {
			subscriber.Reseller = &reseller
		}
	}
	if subscriber.NasID != nil && *subscriber.NasID > 0 {
		var nas models.Nas
		if database.DB.First(&nas, *subscriber.NasID).Error == nil {
			subscriber.Nas = &nas
		}
	}
	if subscriber.SwitchID != nil && *subscriber.SwitchID > 0 {
		var sw models.Switch
		if database.DB.First(&sw, *subscriber.SwitchID).Error == nil {
			subscriber.Switch = &sw
		}
	}

	// Check access permission
	user := middleware.GetCurrentUser(c)
	if user.UserType == models.UserTypeReseller && user.ResellerID != nil {
		if subscriber.ResellerID != *user.ResellerID {
			// Check if subscriber belongs to a sub-reseller
			var count int64
			database.DB.Model(&models.Reseller{}).Where("id = ? AND parent_id = ?", subscriber.ResellerID, *user.ResellerID).Count(&count)
			if count == 0 {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
					"success": false,
					"message": "Access denied",
				})
			}
		}
	}

	// Get recent sessions from radacct
	var sessions []models.RadAcct
	if err := database.DB.Where("username = ?", subscriber.Username).Order("acct_start_time DESC").Limit(10).Find(&sessions).Error; err != nil {
		// Log error but continue - sessions are optional
		sessions = []models.RadAcct{}
	}

	// Calculate quota from radacct (persists across reconnections) + live MikroTik data
	now := time.Now()
	today := now.Format("2006-01-02")
	month := now.Format("2006-01")
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())

	// Get daily total from radacct (all sessions today, including completed ones)
	var dailyStats struct {
		TotalInput  int64
		TotalOutput int64
	}
	database.DB.Model(&models.RadAcct{}).
		Select("COALESCE(SUM(acct_input_octets), 0) as total_input, COALESCE(SUM(acct_output_octets), 0) as total_output").
		Where("username = ? AND acct_start_time >= ?", subscriber.Username, startOfDay).
		Scan(&dailyStats)

	// Get monthly total from radacct
	var monthlyStats struct {
		TotalInput  int64
		TotalOutput int64
	}
	database.DB.Model(&models.RadAcct{}).
		Select("COALESCE(SUM(acct_input_octets), 0) as total_input, COALESCE(SUM(acct_output_octets), 0) as total_output").
		Where("username = ? AND acct_start_time >= ?", subscriber.Username, startOfMonth).
		Scan(&monthlyStats)

	// Radacct: input = upload (user sends), output = download (user receives)
	dailyQuota := models.DailyQuota{
		SubscriberID: subscriber.ID,
		Date:         today,
		Download:     dailyStats.TotalOutput,
		Upload:       dailyStats.TotalInput,
		Total:        dailyStats.TotalInput + dailyStats.TotalOutput,
	}

	monthlyQuota := models.MonthlyQuota{
		SubscriberID: subscriber.ID,
		Month:        month,
		Download:     monthlyStats.TotalOutput,
		Upload:       monthlyStats.TotalInput,
		Total:        monthlyStats.TotalInput + monthlyStats.TotalOutput,
	}

	// If subscriber is online, add live traffic from MikroTik (not yet in radacct)
	if subscriber.IsOnline && subscriber.Nas != nil {
		client := mikrotik.NewClient(
			fmt.Sprintf("%s:%d", subscriber.Nas.IPAddress, subscriber.Nas.APIPort),
			subscriber.Nas.APIUsername,
			subscriber.Nas.APIPassword,
		)
		if session, err := client.GetActiveSession(subscriber.Username); err == nil {
			// MikroTik: TxBytes = client download, RxBytes = client upload
			currentDownload := session.TxBytes
			currentUpload := session.RxBytes

			// Get the current session's accounting record to find already-recorded bytes
			var currentAcct models.RadAcct
			if err := database.DB.Where("acct_session_id = ? AND username = ? AND acct_stop_time IS NULL",
				subscriber.SessionID, subscriber.Username).First(&currentAcct).Error; err == nil {
				// Add only the delta between live MikroTik data and last recorded accounting
				liveDownloadDelta := currentDownload - currentAcct.AcctOutputOctets
				liveUploadDelta := currentUpload - currentAcct.AcctInputOctets

				if liveDownloadDelta > 0 {
					dailyQuota.Download += liveDownloadDelta
					dailyQuota.Total += liveDownloadDelta
					monthlyQuota.Download += liveDownloadDelta
					monthlyQuota.Total += liveDownloadDelta
				}
				if liveUploadDelta > 0 {
					dailyQuota.Upload += liveUploadDelta
					dailyQuota.Total += liveUploadDelta
					monthlyQuota.Upload += liveUploadDelta
					monthlyQuota.Total += liveUploadDelta
				}
			}
		}
		client.Close()
	}

	// Get daily breakdown for each day of the current month
	daysInMonth := time.Date(now.Year(), now.Month()+1, 0, 0, 0, 0, 0, now.Location()).Day()
	dailyDownload := make([]int64, daysInMonth)
	dailyUpload := make([]int64, daysInMonth)

	// Query daily usage for each day of the month
	var dailyBreakdown []struct {
		Day         int
		TotalInput  int64
		TotalOutput int64
	}
	database.DB.Model(&models.RadAcct{}).
		Select("EXTRACT(DAY FROM acct_start_time)::int as day, COALESCE(SUM(acct_input_octets), 0) as total_input, COALESCE(SUM(acct_output_octets), 0) as total_output").
		Where("username = ? AND acct_start_time >= ? AND acct_start_time < ?", subscriber.Username, startOfMonth, startOfMonth.AddDate(0, 1, 0)).
		Group("EXTRACT(DAY FROM acct_start_time)").
		Scan(&dailyBreakdown)

	for _, d := range dailyBreakdown {
		if d.Day >= 1 && d.Day <= daysInMonth {
			dailyDownload[d.Day-1] = d.TotalOutput // output = download
			dailyUpload[d.Day-1] = d.TotalInput    // input = upload
		}
	}

	// Get quota limits from service
	var downloadLimit, uploadLimit, monthlyDownloadLimit, monthlyUploadLimit int64
	if subscriber.ServiceID > 0 {
		downloadLimit = subscriber.Service.DailyQuota
		uploadLimit = subscriber.Service.DailyQuota
		monthlyDownloadLimit = subscriber.Service.MonthlyQuota
		monthlyUploadLimit = subscriber.Service.MonthlyQuota
	}

	// Decrypt password for display in edit form
	subscriber.PasswordPlain = security.DecryptPassword(subscriber.PasswordPlain)

	return c.JSON(fiber.Map{
		"success":  true,
		"data":     subscriber,
		"sessions": sessions,
		"daily_quota": fiber.Map{
			"download_used":   dailyQuota.Download,
			"upload_used":     dailyQuota.Upload,
			"total_used":      dailyQuota.Total,
			"download_limit":  downloadLimit,
			"upload_limit":    uploadLimit,
			"daily_download":  dailyDownload,
			"daily_upload":    dailyUpload,
		},
		"monthly_quota": fiber.Map{
			"download_used":  monthlyQuota.Download,
			"upload_used":    monthlyQuota.Upload,
			"total_used":     monthlyQuota.Total,
			"download_limit": monthlyDownloadLimit,
			"upload_limit":   monthlyUploadLimit,
		},
	})
}

// CreateSubscriberRequest represents create request body
type CreateSubscriberRequest struct {
	Username             string  `json:"username"`
	Password             string  `json:"password"`
	FullName             string  `json:"full_name"`
	Email                string  `json:"email"`
	Phone                string  `json:"phone"`
	Address              string  `json:"address"`
	Region               string  `json:"region"`
	Building             string  `json:"building"`
	Nationality          string  `json:"nationality"`
	Note                 string  `json:"note"`
	ServiceID            uint    `json:"service_id"`
	ExpiryDays           int     `json:"expiry_days"`
	Price                float64 `json:"price"`
	OverridePrice        bool    `json:"override_price"`
	SwitchID             *uint   `json:"switch_id"`
	NasID                *uint   `json:"nas_id"`
	Latitude             float64 `json:"latitude"`
	Longitude            float64 `json:"longitude"`
	SimultaneousSessions int     `json:"simultaneous_sessions"`
	StaticIP             string  `json:"static_ip"`
	MACAddress           string  `json:"mac_address"`
	SaveMAC              bool    `json:"save_mac"`
}

// Create creates a new subscriber
func (h *SubscriberHandler) Create(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
	}

	var req CreateSubscriberRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
		})
	}

	// Validate required fields
	if req.Username == "" || req.Password == "" || req.ServiceID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Username, password, and service are required",
		})
	}

	// Check subscriber limit with license server
	var currentSubCount int64
	database.DB.Model(&models.Subscriber{}).Count(&currentSubCount)

	allowed, msg, err := license.VerifySubscriberCount(int(currentSubCount))
	if err != nil {
		log.Printf("Warning: Subscriber verification error: %v", err)
		// Fall back to local check
		allowed, _, maxSubs, _ := license.CanAddSubscriber(int(currentSubCount))
		if !allowed {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"success": false,
				"message": fmt.Sprintf("Subscriber limit reached (%d/%d). Please upgrade your license.", currentSubCount, maxSubs),
			})
		}
	} else if !allowed {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"success": false,
			"message": msg,
		})
	}

	// Check if username exists
	var existingCount int64
	database.DB.Model(&models.Subscriber{}).Where("username = ?", req.Username).Count(&existingCount)
	if existingCount > 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Username already exists",
		})
	}

	// Check if static IP is already assigned to another subscriber (check both static_ip and current ip_address)
	if req.StaticIP != "" {
		var staticIPCount int64
		database.DB.Model(&models.Subscriber{}).Where("static_ip = ?", req.StaticIP).Count(&staticIPCount)
		if staticIPCount > 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "Static IP is already assigned to another subscriber",
			})
		}
		// Also check if IP is currently in use by another subscriber
		var currentIPCount int64
		database.DB.Model(&models.Subscriber{}).Where("ip_address = ? AND is_online = ?", req.StaticIP, true).Count(&currentIPCount)
		if currentIPCount > 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "This IP is currently in use by another online subscriber",
			})
		}
	}

	// Get service
	var service models.Service
	if err := database.DB.First(&service, req.ServiceID).Error; err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Service not found",
		})
	}

	// Get reseller ID
	var resellerID uint
	if user.UserType == models.UserTypeReseller && user.ResellerID != nil {
		resellerID = *user.ResellerID

		// Check balance
		var reseller models.Reseller
		database.DB.First(&reseller, resellerID)

		price := service.Price
		if req.OverridePrice && req.Price > 0 {
			price = req.Price
		}

		if reseller.Balance < price {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "Insufficient balance",
			})
		}
	} else if user.UserType == models.UserTypeAdmin {
		// Admin can specify reseller
		resellerID = 1 // Default reseller
	}

	// Calculate expiry date
	expiryDays := req.ExpiryDays
	if expiryDays == 0 {
		if service.ExpiryUnit == models.ExpiryUnitMonths {
			expiryDays = service.ExpiryValue * 30
		} else {
			expiryDays = service.ExpiryValue
		}
	}
	expiryDate := time.Now().AddDate(0, 0, expiryDays)

	// Hash password
	hashedPassword, _ := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)

	// Set default simultaneous sessions if not provided
	simultaneousSessions := req.SimultaneousSessions
	if simultaneousSessions <= 0 {
		simultaneousSessions = 1
	}

	// Create subscriber
	subscriber := models.Subscriber{
		Username:             req.Username,
		Password:             string(hashedPassword),
		PasswordPlain:        security.EncryptPassword(req.Password), // Encrypted for RADIUS CHAP
		FullName:             req.FullName,
		Email:                req.Email,
		Phone:                req.Phone,
		Address:              req.Address,
		Region:               req.Region,
		Building:             req.Building,
		Nationality:          req.Nationality,
		Note:                 req.Note,
		ServiceID:            req.ServiceID,
		Status:               models.SubscriberStatusActive,
		ExpiryDate:           expiryDate,
		Price:                service.Price,
		OverridePrice:        req.OverridePrice,
		ResellerID:           resellerID,
		SwitchID:             req.SwitchID,
		NasID:                req.NasID,
		Latitude:             req.Latitude,
		Longitude:            req.Longitude,
		SimultaneousSessions: simultaneousSessions,
		StaticIP:             req.StaticIP,
		MACAddress:           req.MACAddress,
		SaveMAC:              req.SaveMAC,
	}

	if req.OverridePrice && req.Price > 0 {
		subscriber.Price = req.Price
	}

	if err := database.DB.Create(&subscriber).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to create subscriber",
		})
	}

	// Create RADIUS check attributes
	radCheck := []models.RadCheck{
		{Username: subscriber.Username, Attribute: "Cleartext-Password", Op: ":=", Value: req.Password},
		{Username: subscriber.Username, Attribute: "Expiration", Op: ":=", Value: expiryDate.Format("Jan 02 2006 15:04:05")},
		{Username: subscriber.Username, Attribute: "Simultaneous-Use", Op: ":=", Value: fmt.Sprintf("%d", simultaneousSessions)},
	}
	database.DB.Create(&radCheck)

	// Create RADIUS reply attributes
	var radReply []models.RadReply

	// Build rate limit string
	uploadSpeed := service.UploadSpeedStr
	downloadSpeed := service.DownloadSpeedStr
	if uploadSpeed == "" && service.UploadSpeed > 0 {
		uploadSpeed = fmt.Sprintf("%dM", service.UploadSpeed)
	}
	if downloadSpeed == "" && service.DownloadSpeed > 0 {
		downloadSpeed = fmt.Sprintf("%dM", service.DownloadSpeed)
	}
	if uploadSpeed != "" || downloadSpeed != "" {
		rateLimit := fmt.Sprintf("%s/%s", uploadSpeed, downloadSpeed)
		radReply = append(radReply, models.RadReply{Username: subscriber.Username, Attribute: "Mikrotik-Rate-Limit", Op: "=", Value: rateLimit})
	}

	if service.PoolName != "" {
		radReply = append(radReply, models.RadReply{Username: subscriber.Username, Attribute: "Framed-Pool", Op: "=", Value: service.PoolName})
	}
	if len(radReply) > 0 {
		database.DB.Create(&radReply)
	}

	// Deduct balance from reseller
	if user.UserType == models.UserTypeReseller && user.ResellerID != nil {
		database.DB.Model(&models.Reseller{}).Where("id = ?", resellerID).Update("balance", database.DB.Raw("balance - ?", subscriber.Price))

		// Create transaction
		transaction := models.Transaction{
			Type:         models.TransactionTypeNew,
			Amount:       -subscriber.Price,
			ResellerID:   resellerID,
			SubscriberID: &subscriber.ID,
			Description:  fmt.Sprintf("New subscriber: %s", subscriber.Username),
			IPAddress:    c.IP(),
			UserAgent:    c.Get("User-Agent"),
			CreatedBy:    user.ID,
		}
		database.DB.Create(&transaction)
	}

	// Create audit log
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionCreate,
		EntityType:  "subscriber",
		EntityID:    subscriber.ID,
		EntityName:  subscriber.Username,
		Description: "Created new subscriber",
		IPAddress:   c.IP(),
		UserAgent:   c.Get("User-Agent"),
	}
	database.DB.Create(&auditLog)

	// Sync static IP to MikroTik address list (for pool exclusion)
	if req.StaticIP != "" && req.NasID != nil {
		go func() {
			var nas models.Nas
			if err := database.DB.First(&nas, *req.NasID).Error; err == nil && nas.IsActive {
				client := mikrotik.NewClient(
					fmt.Sprintf("%s:%d", nas.IPAddress, nas.APIPort),
					nas.APIUsername,
					nas.APIPassword,
				)
				if err := client.AddStaticIPToAddressList(req.StaticIP, subscriber.Username); err != nil {
					log.Printf("Failed to add static IP to MikroTik address-list: %v", err)
				}
				client.Close()
			}
		}()
	}

	// Load relations for response
	database.DB.Preload("Service").First(&subscriber, subscriber.ID)

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"success": true,
		"message": "Subscriber created successfully",
		"data":    subscriber,
	})
}

// Update updates a subscriber
func (h *SubscriberHandler) Update(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid subscriber ID",
		})
	}

	var subscriber models.Subscriber
	if err := database.DB.First(&subscriber, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Subscriber not found",
		})
	}

	var req map[string]interface{}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
		})
	}

	// Check if static IP is being changed and if it's already used by another subscriber
	if staticIP, ok := req["static_ip"].(string); ok && staticIP != "" && staticIP != subscriber.StaticIP {
		var staticIPCount int64
		database.DB.Model(&models.Subscriber{}).Where("static_ip = ? AND id != ?", staticIP, id).Count(&staticIPCount)
		if staticIPCount > 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "Static IP is already assigned to another subscriber",
			})
		}
		// Also check if IP is currently in use by another online subscriber
		var currentIPCount int64
		database.DB.Model(&models.Subscriber{}).Where("ip_address = ? AND is_online = ? AND id != ?", staticIP, true, id).Count(&currentIPCount)
		if currentIPCount > 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "This IP is currently in use by another online subscriber",
			})
		}
	}

	// Update allowed fields (username and mac_address are NOT allowed to be changed after creation)
	allowedFields := []string{
		"full_name", "email", "phone", "address", "region", "building",
		"nationality", "note", "service_id", "switch_id", "nas_id",
		"latitude", "longitude", "save_mac", "auto_recharge", "auto_recharge_days",
		"status", "static_ip", "simultaneous_sessions", "expiry_date",
		"auto_renew", "reseller_id",
	}

	// Store old values for RADIUS and MikroTik updates
	oldUsername := subscriber.Username
	oldStaticIP := subscriber.StaticIP
	oldServiceID := subscriber.ServiceID

	updates := make(map[string]interface{})
	for _, field := range allowedFields {
		if val, ok := req[field]; ok {
			// Handle type conversions
			switch field {
			case "service_id", "nas_id", "reseller_id", "switch_id", "status", "simultaneous_sessions":
				// Convert float64 to int for integer fields
				if f, ok := val.(float64); ok {
					updates[field] = int(f)
				} else if str, ok := val.(string); ok && str != "" {
					// Handle string numbers
					if i, err := strconv.Atoi(str); err == nil {
						updates[field] = i
					}
				} else if val == "" || val == nil {
					// Skip empty values for optional fields
					if field != "service_id" && field != "status" {
						continue
					}
				} else {
					updates[field] = val
				}
			case "expiry_date":
				// Convert string to time.Time
				if str, ok := val.(string); ok && str != "" {
					if t, err := time.Parse("2006-01-02", str); err == nil {
						updates[field] = t
					} else if t, err := time.Parse(time.RFC3339, str); err == nil {
						updates[field] = t
					}
				}
			case "auto_renew", "save_mac", "auto_recharge":
				// Ensure boolean values
				if b, ok := val.(bool); ok {
					updates[field] = b
				}
			case "static_ip":
				// Allow empty string to clear static IP
				if str, ok := val.(string); ok {
					updates[field] = str
				}
			default:
				// Skip empty strings for optional fields
				if str, ok := val.(string); ok && str == "" {
					continue
				}
				updates[field] = val
			}
		}
	}

	// Handle password update
	var passwordToUpdate string
	if password, ok := req["password"].(string); ok && password != "" {
		// Skip if password is already encrypted (user didn't change it)
		if strings.HasPrefix(password, "ENC:") {
			// Don't update password - it's the encrypted value from the form
		} else {
			hashedPassword, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
			updates["password"] = string(hashedPassword)
			updates["password_plain"] = security.EncryptPassword(password)
			passwordToUpdate = password
		}
	}

	if err := database.DB.Model(&subscriber).Updates(updates).Error; err != nil {
		fmt.Printf("Update error: %v, updates: %+v\n", err, updates)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to update subscriber: " + err.Error(),
		})
	}

	// Determine the current username (may have been updated)
	currentUsername := oldUsername
	if newUsername, ok := req["username"].(string); ok && newUsername != "" && newUsername != oldUsername {
		// Update radcheck
		database.DB.Model(&models.RadCheck{}).Where("username = ?", oldUsername).Update("username", newUsername)
		// Update radreply
		database.DB.Model(&models.RadReply{}).Where("username = ?", oldUsername).Update("username", newUsername)
		// Update radacct (accounting records)
		database.DB.Exec("UPDATE radacct SET username = ? WHERE username = ?", newUsername, oldUsername)
		currentUsername = newUsername
	}

	// Update RADIUS password if changed
	if passwordToUpdate != "" {
		database.DB.Where("username = ? AND attribute = ?", currentUsername, "Cleartext-Password").Delete(&models.RadCheck{})
		database.DB.Create(&models.RadCheck{Username: currentUsername, Attribute: "Cleartext-Password", Op: ":=", Value: passwordToUpdate})
	}

	// Update Simultaneous-Use if changed
	if simSessions, ok := updates["simultaneous_sessions"]; ok {
		var simValue int
		switch v := simSessions.(type) {
		case int:
			simValue = v
		case float64:
			simValue = int(v)
		}
		if simValue <= 0 {
			simValue = 1
		}
		database.DB.Where("username = ? AND attribute = ?", currentUsername, "Simultaneous-Use").Delete(&models.RadCheck{})
		database.DB.Create(&models.RadCheck{Username: currentUsername, Attribute: "Simultaneous-Use", Op: ":=", Value: fmt.Sprintf("%d", simValue)})
	}

	// Create audit log
	user := middleware.GetCurrentUser(c)
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionUpdate,
		EntityType:  "subscriber",
		EntityID:    subscriber.ID,
		EntityName:  subscriber.Username,
		Description: "Updated subscriber",
		IPAddress:   c.IP(),
		UserAgent:   c.Get("User-Agent"),
	}
	database.DB.Create(&auditLog)

	// Sync static IP changes to MikroTik address list
	if newStaticIP, ok := req["static_ip"].(string); ok {
		// Reload subscriber to get the updated NAS ID
		database.DB.First(&subscriber, id)

		// If static IP changed, update MikroTik address list
		if newStaticIP != oldStaticIP && subscriber.NasID != nil {
			go func() {
				var nas models.Nas
				if err := database.DB.First(&nas, *subscriber.NasID).Error; err == nil && nas.IsActive {
					client := mikrotik.NewClient(
						fmt.Sprintf("%s:%d", nas.IPAddress, nas.APIPort),
						nas.APIUsername,
						nas.APIPassword,
					)
					// Remove old static IP if it existed
					if oldStaticIP != "" {
						if err := client.RemoveStaticIPFromAddressList(oldStaticIP); err != nil {
							log.Printf("Failed to remove old static IP from MikroTik: %v", err)
						}
					}
					// Add new static IP if set
					if newStaticIP != "" {
						if err := client.AddStaticIPToAddressList(newStaticIP, subscriber.Username); err != nil {
							log.Printf("Failed to add static IP to MikroTik address-list: %v", err)
						}
					}
					client.Close()
				}
			}()
		}
	}

	// Auto-disconnect user if service changed (so they reconnect with new pool IP)
	// Reload subscriber to get updated values
	database.DB.First(&subscriber, id)
	if subscriber.ServiceID != oldServiceID && subscriber.NasID != nil {
		// Service changed - disconnect user via MikroTik API so they reconnect with new pool
		go func(username string, nasID uint) {
			var nas models.Nas
			if err := database.DB.First(&nas, nasID).Error; err != nil {
				log.Printf("ServiceChange: Failed to find NAS %d for disconnect: %v", nasID, err)
				return
			}

			log.Printf("ServiceChange: Service changed for %s, disconnecting from NAS %s", username, nas.IPAddress)

			// Try MikroTik API first (most reliable for PPPoE)
			client := mikrotik.NewClient(
				fmt.Sprintf("%s:%d", nas.IPAddress, nas.APIPort),
				nas.APIUsername,
				nas.APIPassword,
			)
			if err := client.DisconnectUser(username); err != nil {
				log.Printf("ServiceChange: MikroTik API disconnect failed for %s: %v, trying CoA", username, err)

				// Fallback: try CoA Disconnect-Request
				coaClient := radius.NewCOAClient(nas.IPAddress, nas.CoAPort, nas.Secret)
				if err := coaClient.DisconnectUser(username, ""); err != nil {
					log.Printf("ServiceChange: CoA disconnect also failed for %s: %v", username, err)
				} else {
					log.Printf("ServiceChange: Disconnected %s via CoA (service changed)", username)
				}
			} else {
				log.Printf("ServiceChange: Disconnected %s via MikroTik API (service changed, will reconnect with new pool)", username)
			}
			client.Close()
		}(subscriber.Username, *subscriber.NasID)
	}

	database.DB.First(&subscriber, id)

	// Manually load relations
	if subscriber.ServiceID > 0 {
		var service models.Service
		if database.DB.First(&service, subscriber.ServiceID).Error == nil {
			subscriber.Service = &service
		}
	}
	if subscriber.ResellerID > 0 {
		var reseller models.Reseller
		if database.DB.First(&reseller, subscriber.ResellerID).Error == nil {
			subscriber.Reseller = &reseller
		}
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Subscriber updated successfully",
		"data":    subscriber,
	})
}

// Delete deletes a subscriber
func (h *SubscriberHandler) Delete(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid subscriber ID",
		})
	}

	var subscriber models.Subscriber
	if err := database.DB.First(&subscriber, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Subscriber not found",
		})
	}

	// Delete RADIUS attributes
	database.DB.Where("username = ?", subscriber.Username).Delete(&models.RadCheck{})
	database.DB.Where("username = ?", subscriber.Username).Delete(&models.RadReply{})
	database.DB.Where("username = ?", subscriber.Username).Delete(&models.RadUserGroup{})

	// Soft delete subscriber
	if err := database.DB.Delete(&subscriber).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to delete subscriber",
		})
	}

	// Create audit log
	user := middleware.GetCurrentUser(c)
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionDelete,
		EntityType:  "subscriber",
		EntityID:    subscriber.ID,
		EntityName:  subscriber.Username,
		Description: "Deleted subscriber",
		IPAddress:   c.IP(),
		UserAgent:   c.Get("User-Agent"),
	}
	database.DB.Create(&auditLog)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Subscriber deleted successfully",
	})
}

// Renew renews a subscriber
func (h *SubscriberHandler) Renew(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid subscriber ID"})
	}

	var subscriber models.Subscriber
	if err := database.DB.Preload("Service").First(&subscriber, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "Subscriber not found"})
	}

	user := middleware.GetCurrentUser(c)

	// Check reseller balance
	if user.UserType == models.UserTypeReseller && user.ResellerID != nil {
		var reseller models.Reseller
		database.DB.First(&reseller, *user.ResellerID)
		if reseller.Balance < subscriber.Price {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "Insufficient balance",
			})
		}
	}

	// Calculate new expiry
	var newExpiry time.Time
	if subscriber.ExpiryDate.After(time.Now()) {
		// Add days to current expiry
		if subscriber.Service.ExpiryUnit == models.ExpiryUnitMonths {
			newExpiry = subscriber.ExpiryDate.AddDate(0, subscriber.Service.ExpiryValue, 0)
		} else {
			newExpiry = subscriber.ExpiryDate.AddDate(0, 0, subscriber.Service.ExpiryValue)
		}
	} else {
		// Start from now
		if subscriber.Service.ExpiryUnit == models.ExpiryUnitMonths {
			newExpiry = time.Now().AddDate(0, subscriber.Service.ExpiryValue, 0)
		} else {
			newExpiry = time.Now().AddDate(0, 0, subscriber.Service.ExpiryValue)
		}
	}

	// Update subscriber
	subscriber.ExpiryDate = newExpiry
	subscriber.Status = models.SubscriberStatusActive

	// Reset daily and monthly FUP and usage on renewal
	now := time.Now()
	subscriber.FUPLevel = 0
	subscriber.DailyDownloadUsed = 0
	subscriber.DailyUploadUsed = 0
	subscriber.DailyQuotaUsed = 0
	subscriber.LastDailyReset = &now
	subscriber.MonthlyFUPLevel = 0
	subscriber.MonthlyDownloadUsed = 0
	subscriber.MonthlyUploadUsed = 0
	subscriber.MonthlyQuotaUsed = 0
	subscriber.LastMonthlyReset = &now

	// If user is online, update session baseline to current MikroTik values
	// This prevents QuotaSync from adding back the old usage
	if subscriber.IsOnline && subscriber.NasID != nil {
		var nas models.Nas
		if database.DB.First(&nas, *subscriber.NasID).Error == nil {
			client := mikrotik.NewClient(
				fmt.Sprintf("%s:%d", nas.IPAddress, nas.APIPort),
				nas.APIUsername,
				nas.APIPassword,
			)
			if session, err := client.GetActiveSession(subscriber.Username); err == nil {
				subscriber.LastSessionDownload = session.TxBytes
				subscriber.LastSessionUpload = session.RxBytes
				subscriber.LastQuotaSync = &now
				log.Printf("Renew: Updated session baseline for %s: dl=%d ul=%d", subscriber.Username, session.TxBytes, session.RxBytes)
			} else {
				log.Printf("Renew: Failed to get session for %s: %v", subscriber.Username, err)
			}
			client.Close()
		}
	} else {
		log.Printf("Renew: User %s is offline or no NAS, skipping session baseline update", subscriber.Username)
	}

	database.DB.Save(&subscriber)

	// Update RADIUS expiration
	database.DB.Where("username = ? AND attribute = ?", subscriber.Username, "Expiration").Delete(&models.RadCheck{})
	database.DB.Create(&models.RadCheck{
		Username:  subscriber.Username,
		Attribute: "Expiration",
		Op:        ":=",
		Value:     newExpiry.Format("Jan 02 2006 15:04:05"),
	})

	// Deduct balance
	if user.UserType == models.UserTypeReseller && user.ResellerID != nil {
		database.DB.Model(&models.Reseller{}).Where("id = ?", *user.ResellerID).Update("balance", database.DB.Raw("balance - ?", subscriber.Price))

		// Create transaction
		transaction := models.Transaction{
			Type:         models.TransactionTypeRenewal,
			Amount:       -subscriber.Price,
			ResellerID:   *user.ResellerID,
			SubscriberID: &subscriber.ID,
			Description:  fmt.Sprintf("Renewal: %s", subscriber.Username),
			IPAddress:    c.IP(),
			CreatedBy:    user.ID,
		}
		database.DB.Create(&transaction)
	}

	// Create audit log
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionRenew,
		EntityType:  "subscriber",
		EntityID:    subscriber.ID,
		EntityName:  subscriber.Username,
		Description: fmt.Sprintf("Renewed until %s", newExpiry.Format("2006-01-02")),
		IPAddress:   c.IP(),
	}
	database.DB.Create(&auditLog)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Subscriber renewed successfully",
		"data": fiber.Map{
			"new_expiry": newExpiry,
		},
	})
}

// Disconnect disconnects a subscriber
func (h *SubscriberHandler) Disconnect(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid subscriber ID"})
	}

	var subscriber models.Subscriber
	if err := database.DB.Preload("Nas").First(&subscriber, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "Subscriber not found"})
	}

	// Disconnect via MikroTik API if NAS is configured
	if subscriber.Nas != nil && subscriber.Nas.IPAddress != "" {
		client := mikrotik.NewClient(
			fmt.Sprintf("%s:%d", subscriber.Nas.IPAddress, subscriber.Nas.APIPort),
			subscriber.Nas.APIUsername,
			subscriber.Nas.APIPassword,
		)
		defer client.Close()

		if err := client.DisconnectUser(subscriber.Username); err != nil {
			// Log error but continue to update database
			fmt.Printf("MikroTik disconnect error for %s: %v\n", subscriber.Username, err)
		}
	}

	// Update subscriber status
	subscriber.IsOnline = false
	subscriber.SessionID = ""
	database.DB.Save(&subscriber)

	// Create audit log
	user := middleware.GetCurrentUser(c)
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionDisconnect,
		EntityType:  "subscriber",
		EntityID:    subscriber.ID,
		EntityName:  subscriber.Username,
		Description: "Disconnected subscriber",
		IPAddress:   c.IP(),
	}
	database.DB.Create(&auditLog)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Subscriber disconnected successfully",
	})
}

// ResetFUP resets subscriber's FUP
func (h *SubscriberHandler) ResetFUP(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid subscriber ID"})
	}

	var subscriber models.Subscriber
	if err := database.DB.Preload("Nas").Preload("Service").First(&subscriber, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "Subscriber not found"})
	}

	// Reset FUP level and daily quota counters only (not monthly)
	now := time.Now()
	updates := map[string]interface{}{
		"fup_level":           0,
		"daily_quota_used":    0,
		"daily_download_used": 0,
		"daily_upload_used":   0,
		"last_daily_reset":    now,
	}

	// If user is online, get current MikroTik session bytes as baseline
	// This prevents QuotaSync from recalculating all previous usage
	var client *mikrotik.Client
	var session *mikrotik.ActiveSession
	if subscriber.Nas != nil && subscriber.IsOnline {
		client = mikrotik.NewClient(
			fmt.Sprintf("%s:%d", subscriber.Nas.IPAddress, subscriber.Nas.APIPort),
			subscriber.Nas.APIUsername,
			subscriber.Nas.APIPassword,
		)
		defer client.Close()

		var err error
		session, err = client.GetActiveSession(subscriber.Username)
		if err != nil {
			log.Printf("ResetFUP: Failed to get session for %s: %v", subscriber.Username, err)
			// Fallback to 0 if we can't get session
			updates["last_session_download"] = 0
			updates["last_session_upload"] = 0
		} else {
			// Set current session bytes as baseline so delta will be 0
			updates["last_session_download"] = session.TxBytes
			updates["last_session_upload"] = session.RxBytes
			log.Printf("ResetFUP: Setting baseline for %s: dl=%d, ul=%d", subscriber.Username, session.TxBytes, session.RxBytes)
		}
	} else {
		updates["last_session_download"] = 0
		updates["last_session_upload"] = 0
	}

	database.DB.Model(&subscriber).Updates(updates)

	// Restore original speed in RADIUS radreply table
	if subscriber.Service.ID > 0 {
		rateLimit := fmt.Sprintf("%dM/%dM", subscriber.Service.DownloadSpeed, subscriber.Service.UploadSpeed)
		database.DB.Model(&models.RadReply{}).
			Where("username = ? AND attribute = ?", subscriber.Username, "Mikrotik-Rate-Limit").
			Update("value", rateLimit)
	}

	// Restore original speed on MikroTik using CoA
	if session != nil && subscriber.Service.ID > 0 {
		originalRateLimitK := fmt.Sprintf("%dk/%dk", subscriber.Service.DownloadSpeed*1000, subscriber.Service.UploadSpeed*1000)
		coaClient := radius.NewCOAClient(subscriber.Nas.IPAddress, subscriber.Nas.CoAPort, subscriber.Nas.Secret)
		speedRestored := false

		// Method 1: Try radclient-based CoA (most reliable)
		if err := coaClient.UpdateRateLimitViaRadclient(subscriber.Username, session.SessionID, originalRateLimitK); err != nil {
			log.Printf("ResetFUP: Radclient CoA failed for %s: %v", subscriber.Username, err)
		} else {
			log.Printf("ResetFUP: Restored %s speed via radclient CoA to %s", subscriber.Username, originalRateLimitK)
			speedRestored = true
		}

		// Method 2: Try MikroTik API as fallback
		if !speedRestored {
			if err := client.RestoreUserSpeedWithIP(subscriber.Username, session.Address, subscriber.Service.DownloadSpeed, subscriber.Service.UploadSpeed); err != nil {
				log.Printf("ResetFUP: MikroTik API restore failed for %s: %v", subscriber.Username, err)
			} else {
				log.Printf("ResetFUP: Restored %s speed via MikroTik API", subscriber.Username)
				speedRestored = true
			}
		}

		// Method 3: Try native Go CoA
		if !speedRestored {
			if err := coaClient.UpdateRateLimit(subscriber.Username, session.SessionID, originalRateLimitK); err != nil {
				log.Printf("ResetFUP: Native CoA failed for %s: %v", subscriber.Username, err)
			} else {
				log.Printf("ResetFUP: Restored %s speed via native CoA", subscriber.Username)
			}
		}
	}

	// Create audit log
	user := middleware.GetCurrentUser(c)
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionResetFUP,
		EntityType:  "subscriber",
		EntityID:    subscriber.ID,
		EntityName:  subscriber.Username,
		Description: "Reset FUP",
		IPAddress:   c.IP(),
	}
	database.DB.Create(&auditLog)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "FUP reset successfully",
	})
}

// ResetMAC resets subscriber's MAC address
func (h *SubscriberHandler) ResetMAC(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid subscriber ID"})
	}

	var subscriber models.Subscriber
	if err := database.DB.First(&subscriber, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "Subscriber not found"})
	}

	oldMAC := subscriber.MACAddress
	subscriber.MACAddress = ""
	database.DB.Save(&subscriber)

	// Remove MAC from RADIUS
	database.DB.Where("username = ? AND attribute = ?", subscriber.Username, "Calling-Station-Id").Delete(&models.RadCheck{})

	// Create audit log
	user := middleware.GetCurrentUser(c)
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionResetMAC,
		EntityType:  "subscriber",
		EntityID:    subscriber.ID,
		EntityName:  subscriber.Username,
		OldValue:    oldMAC,
		Description: "Reset MAC address",
		IPAddress:   c.IP(),
	}
	database.DB.Create(&auditLog)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "MAC address reset successfully",
	})
}

// ResetQuota resets subscriber's daily and monthly quota counters
func (h *SubscriberHandler) ResetQuota(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid subscriber ID"})
	}

	// Get quota type from query (daily, monthly, or both)
	quotaType := c.Query("type", "both")

	var subscriber models.Subscriber
	if err := database.DB.First(&subscriber, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "Subscriber not found"})
	}

	now := time.Now()
	updates := map[string]interface{}{
		"last_session_download": int64(0),
		"last_session_upload":   int64(0),
	}

	description := ""
	switch quotaType {
	case "daily":
		updates["daily_download_used"] = int64(0)
		updates["daily_upload_used"] = int64(0)
		updates["daily_quota_used"] = int64(0)
		updates["last_daily_reset"] = now
		description = "Reset daily quota"
	case "monthly":
		updates["monthly_download_used"] = int64(0)
		updates["monthly_upload_used"] = int64(0)
		updates["monthly_quota_used"] = int64(0)
		updates["last_monthly_reset"] = now
		description = "Reset monthly quota"
	default: // both
		updates["daily_download_used"] = int64(0)
		updates["daily_upload_used"] = int64(0)
		updates["daily_quota_used"] = int64(0)
		updates["monthly_download_used"] = int64(0)
		updates["monthly_upload_used"] = int64(0)
		updates["monthly_quota_used"] = int64(0)
		updates["last_daily_reset"] = now
		updates["last_monthly_reset"] = now
		description = "Reset all quota counters"
	}

	database.DB.Model(&subscriber).Updates(updates)

	// Create audit log
	user := middleware.GetCurrentUser(c)
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      "reset_quota",
		EntityType:  "subscriber",
		EntityID:    subscriber.ID,
		EntityName:  subscriber.Username,
		Description: description,
		IPAddress:   c.IP(),
	}
	database.DB.Create(&auditLog)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Quota reset successfully",
	})
}

// BulkImportResult represents result for each row
type BulkImportResult struct {
	Row      int    `json:"row"`
	Username string `json:"username"`
	Success  bool   `json:"success"`
	Message  string `json:"message"`
}

// BulkImport imports subscribers from CSV
func (h *SubscriberHandler) BulkImport(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
	}

	// Get uploaded file
	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "No file uploaded",
		})
	}

	// Open file
	f, err := file.Open()
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Failed to open file",
		})
	}
	defer f.Close()

	// Parse CSV
	reader := csv.NewReader(f)
	reader.FieldsPerRecord = -1 // Allow variable fields

	// Read header
	header, err := reader.Read()
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Failed to read CSV header",
		})
	}

	// Map header columns to indices
	colMap := make(map[string]int)
	for i, col := range header {
		colMap[strings.ToLower(strings.TrimSpace(col))] = i
	}

	// Get service ID from form
	serviceID, _ := strconv.Atoi(c.FormValue("service_id", "0"))
	if serviceID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Service ID is required",
		})
	}

	// Get service
	var service models.Service
	if err := database.DB.First(&service, serviceID).Error; err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Service not found",
		})
	}

	// Get reseller ID
	var resellerID uint
	if user.UserType == models.UserTypeReseller && user.ResellerID != nil {
		resellerID = *user.ResellerID
	} else {
		resellerID = 1
	}

	// Calculate expiry
	expiryDays := service.ExpiryValue
	if service.ExpiryUnit == models.ExpiryUnitMonths {
		expiryDays = service.ExpiryValue * 30
	}

	results := []BulkImportResult{}
	created := 0
	failed := 0
	row := 1

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		row++

		if err != nil {
			results = append(results, BulkImportResult{Row: row, Success: false, Message: "Failed to read row"})
			failed++
			continue
		}

		// Get values from record
		getValue := func(names ...string) string {
			for _, name := range names {
				if idx, ok := colMap[name]; ok && idx < len(record) {
					return strings.TrimSpace(record[idx])
				}
			}
			return ""
		}

		username := getValue("username", "user")
		password := getValue("password", "pass")
		fullName := getValue("full_name", "fullname", "name")
		email := getValue("email")
		phone := getValue("phone", "mobile")
		address := getValue("address")

		if username == "" {
			results = append(results, BulkImportResult{Row: row, Success: false, Message: "Username is required"})
			failed++
			continue
		}

		if password == "" {
			password = username // Default password = username
		}

		// Check if username exists
		var existingCount int64
		database.DB.Model(&models.Subscriber{}).Where("username = ?", username).Count(&existingCount)
		if existingCount > 0 {
			results = append(results, BulkImportResult{Row: row, Username: username, Success: false, Message: "Username already exists"})
			failed++
			continue
		}

		// Create subscriber
		hashedPassword, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		expiryDate := time.Now().AddDate(0, 0, expiryDays)

		subscriber := models.Subscriber{
			Username:      username,
			Password:      string(hashedPassword),
			PasswordPlain: security.EncryptPassword(password),
			FullName:      fullName,
			Email:         email,
			Phone:         phone,
			Address:       address,
			ServiceID:     uint(serviceID),
			Status:        models.SubscriberStatusActive,
			ExpiryDate:    expiryDate,
			Price:         service.Price,
			ResellerID:    resellerID,
		}

		if err := database.DB.Create(&subscriber).Error; err != nil {
			results = append(results, BulkImportResult{Row: row, Username: username, Success: false, Message: "Failed to create"})
			failed++
			continue
		}

		// Create RADIUS attributes
		radCheck := []models.RadCheck{
			{Username: username, Attribute: "Cleartext-Password", Op: ":=", Value: password},
			{Username: username, Attribute: "Expiration", Op: ":=", Value: expiryDate.Format("Jan 02 2006 15:04:05")},
			{Username: username, Attribute: "Simultaneous-Use", Op: ":=", Value: "1"},
		}
		database.DB.Create(&radCheck)

		radReply := []models.RadReply{
			{Username: username, Attribute: "Mikrotik-Rate-Limit", Op: "=", Value: fmt.Sprintf("%s/%s", service.UploadSpeedStr, service.DownloadSpeedStr)},
		}
		database.DB.Create(&radReply)

		results = append(results, BulkImportResult{Row: row, Username: username, Success: true, Message: "Created"})
		created++
	}

	// Create audit log
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionCreate,
		EntityType:  "subscriber",
		Description: fmt.Sprintf("Bulk imported %d subscribers (%d failed)", created, failed),
		IPAddress:   c.IP(),
		UserAgent:   c.Get("User-Agent"),
	}
	database.DB.Create(&auditLog)

	return c.JSON(fiber.Map{
		"success": true,
		"message": fmt.Sprintf("Imported %d subscribers, %d failed", created, failed),
		"data": fiber.Map{
			"created": created,
			"failed":  failed,
			"results": results,
		},
	})
}

// BulkUpdateRequest represents bulk update request
type BulkUpdateRequest struct {
	IDs     []uint                 `json:"ids"`
	Updates map[string]interface{} `json:"updates"`
}

// BulkUpdate updates multiple subscribers
func (h *SubscriberHandler) BulkUpdate(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
	}

	var req BulkUpdateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
		})
	}

	if len(req.IDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "No subscribers selected",
		})
	}

	// Filter allowed fields
	allowedFields := map[string]bool{
		"service_id": true, "status": true, "nas_id": true,
		"region": true, "note": true, "auto_recharge": true,
	}

	updates := make(map[string]interface{})
	for key, val := range req.Updates {
		if allowedFields[key] {
			updates[key] = val
		}
	}

	if len(updates) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "No valid fields to update",
		})
	}

	// Build query based on user type
	query := database.DB.Model(&models.Subscriber{}).Where("id IN ?", req.IDs)
	if user.UserType == models.UserTypeReseller && user.ResellerID != nil {
		query = query.Where("reseller_id IN (SELECT id FROM resellers WHERE id = ? OR parent_id = ?)", *user.ResellerID, *user.ResellerID)
	}

	result := query.Updates(updates)
	if result.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to update subscribers",
		})
	}

	// If service changed, update RADIUS
	if serviceID, ok := updates["service_id"]; ok {
		var service models.Service
		if database.DB.First(&service, serviceID).Error == nil {
			var subscribers []models.Subscriber
			database.DB.Where("id IN ?", req.IDs).Find(&subscribers)
			for _, sub := range subscribers {
				database.DB.Where("username = ? AND attribute = ?", sub.Username, "Mikrotik-Rate-Limit").Delete(&models.RadReply{})
				database.DB.Create(&models.RadReply{
					Username:  sub.Username,
					Attribute: "Mikrotik-Rate-Limit",
					Op:        "=",
					Value:     fmt.Sprintf("%s/%s", service.UploadSpeedStr, service.DownloadSpeedStr),
				})
			}
		}
	}

	// Create audit log
	updatesJSON, _ := json.Marshal(updates)
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionUpdate,
		EntityType:  "subscriber",
		Description: fmt.Sprintf("Bulk updated %d subscribers", result.RowsAffected),
		NewValue:    string(updatesJSON),
		IPAddress:   c.IP(),
		UserAgent:   c.Get("User-Agent"),
	}
	database.DB.Create(&auditLog)

	return c.JSON(fiber.Map{
		"success": true,
		"message": fmt.Sprintf("Updated %d subscribers", result.RowsAffected),
		"data": fiber.Map{
			"updated": result.RowsAffected,
		},
	})
}

// BulkActionRequest represents bulk action request
type BulkActionRequest struct {
	IDs    []uint `json:"ids"`
	Action string `json:"action"` // renew, disconnect, enable, disable, reset_fup
}

// BulkAction performs action on multiple subscribers
func (h *SubscriberHandler) BulkAction(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
	}

	var req BulkActionRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
		})
	}

	if len(req.IDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "No subscribers selected",
		})
	}

	// Get subscribers
	query := database.DB.Preload("Service").Where("id IN ?", req.IDs)
	if user.UserType == models.UserTypeReseller && user.ResellerID != nil {
		query = query.Where("reseller_id IN (SELECT id FROM resellers WHERE id = ? OR parent_id = ?)", *user.ResellerID, *user.ResellerID)
	}

	var subscribers []models.Subscriber
	if err := query.Find(&subscribers).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to fetch subscribers",
		})
	}

	success := 0
	failed := 0
	var actionName string

	for _, sub := range subscribers {
		switch req.Action {
		case "renew":
			actionName = "Bulk renewed"
			// Check balance for resellers
			if user.UserType == models.UserTypeReseller && user.ResellerID != nil {
				var reseller models.Reseller
				database.DB.First(&reseller, *user.ResellerID)
				if reseller.Balance < sub.Price {
					failed++
					continue
				}
				// Deduct balance
				database.DB.Model(&reseller).Update("balance", gorm.Expr("balance - ?", sub.Price))
				// Create transaction
				transaction := models.Transaction{
					Type:         models.TransactionTypeRenewal,
					Amount:       -sub.Price,
					ResellerID:   *user.ResellerID,
					SubscriberID: &sub.ID,
					Description:  fmt.Sprintf("Bulk Renewal: %s", sub.Username),
					IPAddress:    c.IP(),
					CreatedBy:    user.ID,
				}
				database.DB.Create(&transaction)
			}
			// Calculate new expiry
			var newExpiry time.Time
			if sub.ExpiryDate.After(time.Now()) {
				if sub.Service.ExpiryUnit == models.ExpiryUnitMonths {
					newExpiry = sub.ExpiryDate.AddDate(0, sub.Service.ExpiryValue, 0)
				} else {
					newExpiry = sub.ExpiryDate.AddDate(0, 0, sub.Service.ExpiryValue)
				}
			} else {
				if sub.Service.ExpiryUnit == models.ExpiryUnitMonths {
					newExpiry = time.Now().AddDate(0, sub.Service.ExpiryValue, 0)
				} else {
					newExpiry = time.Now().AddDate(0, 0, sub.Service.ExpiryValue)
				}
			}
			// Reset FUP counters on renewal
			now := time.Now()
			database.DB.Model(&sub).Updates(map[string]interface{}{
				"expiry_date":           newExpiry,
				"status":                models.SubscriberStatusActive,
				"fup_level":             0,
				"daily_download_used":   0,
				"daily_upload_used":     0,
				"daily_quota_used":      0,
				"last_daily_reset":      now,
				"monthly_fup_level":     0,
				"monthly_download_used": 0,
				"monthly_upload_used":   0,
				"monthly_quota_used":    0,
				"last_monthly_reset":    now,
			})
			// Update RADIUS expiration
			database.DB.Where("username = ? AND attribute = ?", sub.Username, "Expiration").Delete(&models.RadCheck{})
			database.DB.Create(&models.RadCheck{
				Username: sub.Username, Attribute: "Expiration", Op: ":=",
				Value: newExpiry.Format("Jan 02 2006 15:04:05"),
			})
			// Remove Auth-Type := Reject if exists (in case user was disabled)
			database.DB.Where("username = ? AND attribute = ? AND value = ?", sub.Username, "Auth-Type", "Reject").Delete(&models.RadCheck{})
			// Update RADIUS reply to reset rate limit to full speed
			// Delete existing rate limit and set to full speed
			database.DB.Where("username = ? AND attribute = ?", sub.Username, "Mikrotik-Rate-Limit").Delete(&models.RadReply{})
			fullSpeedLimit := fmt.Sprintf("%dk/%dk", sub.Service.UploadSpeed*1000, sub.Service.DownloadSpeed*1000)
			database.DB.Create(&models.RadReply{
				Username:  sub.Username,
				Attribute: "Mikrotik-Rate-Limit",
				Op:        "=",
				Value:     fullSpeedLimit,
			})
			// Reset speed via RADIUS CoA (since FUP was reset)
			if sub.NasID != nil && *sub.NasID > 0 && sub.ServiceID > 0 {
				var nas models.Nas
				if err := database.DB.First(&nas, *sub.NasID).Error; err == nil && nas.IPAddress != "" {
					// Build rate limit string: upload/download format for MikroTik
					// Speeds are in Mbps, convert to Kbps for MikroTik (multiply by 1000)
					rateLimit := fmt.Sprintf("%dk/%dk", sub.Service.UploadSpeed*1000, sub.Service.DownloadSpeed*1000)
					fmt.Printf("Renew: Resetting speed for %s via CoA to %s\n", sub.Username, rateLimit)

					// Use CoA to update rate limit
					coaClient := radius.NewCOAClient(nas.IPAddress, nas.CoAPort, nas.Secret)
					if err := coaClient.UpdateRateLimitViaRadclient(sub.Username, sub.SessionID, rateLimit); err != nil {
						fmt.Printf("Renew: CoA failed for %s: %v, trying MikroTik API\n", sub.Username, err)
						// Fallback to MikroTik API (speeds in Kbps)
						client := mikrotik.NewClient(
							fmt.Sprintf("%s:%d", nas.IPAddress, nas.APIPort),
							nas.APIUsername,
							nas.APIPassword,
						)
						if err := client.UpdateUserRateLimit(sub.Username, int(sub.Service.DownloadSpeed*1000), int(sub.Service.UploadSpeed*1000)); err != nil {
							fmt.Printf("Renew: MikroTik API also failed for %s: %v\n", sub.Username, err)
						}
						client.Close()
					} else {
						fmt.Printf("Renew: Successfully reset speed for %s via CoA\n", sub.Username)
					}
				}
			}
			success++

		case "disconnect":
			actionName = "Bulk disconnected"
			// Actually disconnect from MikroTik if NAS is configured
			if sub.NasID != nil && *sub.NasID > 0 {
				var nas models.Nas
				if err := database.DB.First(&nas, *sub.NasID).Error; err == nil && nas.IPAddress != "" {
					client := mikrotik.NewClient(
						fmt.Sprintf("%s:%d", nas.IPAddress, nas.APIPort),
						nas.APIUsername,
						nas.APIPassword,
					)
					if err := client.DisconnectUser(sub.Username); err != nil {
						fmt.Printf("MikroTik disconnect error for %s: %v\n", sub.Username, err)
					}
					client.Close()
				}
			}
			database.DB.Model(&sub).Updates(map[string]interface{}{
				"is_online":  false,
				"session_id": "",
			})
			success++

		case "enable":
			actionName = "Bulk enabled"
			database.DB.Model(&sub).Update("status", models.SubscriberStatusActive)
			// Remove Auth-Type := Reject from RADIUS if exists
			database.DB.Where("username = ? AND attribute = ? AND value = ?", sub.Username, "Auth-Type", "Reject").Delete(&models.RadCheck{})
			success++

		case "disable":
			actionName = "Bulk disabled"
			database.DB.Model(&sub).Update("status", models.SubscriberStatusInactive)
			// Add Auth-Type := Reject to RADIUS to block login
			database.DB.Where("username = ? AND attribute = ?", sub.Username, "Auth-Type").Delete(&models.RadCheck{})
			database.DB.Create(&models.RadCheck{
				Username: sub.Username, Attribute: "Auth-Type", Op: ":=", Value: "Reject",
			})
			// Disconnect from MikroTik if online
			if sub.NasID != nil && *sub.NasID > 0 {
				var nas models.Nas
				if err := database.DB.First(&nas, *sub.NasID).Error; err == nil && nas.IPAddress != "" {
					client := mikrotik.NewClient(
						fmt.Sprintf("%s:%d", nas.IPAddress, nas.APIPort),
						nas.APIUsername,
						nas.APIPassword,
					)
					client.DisconnectUser(sub.Username)
					client.Close()
				}
			}
			database.DB.Model(&sub).Updates(map[string]interface{}{
				"is_online":  false,
				"session_id": "",
			})
			success++

		case "reset_fup":
			actionName = "Bulk reset FUP"
			database.DB.Model(&sub).Updates(map[string]interface{}{
				"fup_level":             0,
				"monthly_fup_level":     0,
				"daily_quota_used":      0,
				"monthly_quota_used":    0,
				"daily_download_used":   0,
				"daily_upload_used":     0,
				"monthly_download_used": 0,
				"monthly_upload_used":   0,
			})
			// Update RADIUS reply to reset rate limit to full speed
			database.DB.Where("username = ? AND attribute = ?", sub.Username, "Mikrotik-Rate-Limit").Delete(&models.RadReply{})
			fullSpeedLimit := fmt.Sprintf("%dk/%dk", sub.Service.UploadSpeed*1000, sub.Service.DownloadSpeed*1000)
			database.DB.Create(&models.RadReply{
				Username:  sub.Username,
				Attribute: "Mikrotik-Rate-Limit",
				Op:        "=",
				Value:     fullSpeedLimit,
			})
			// Reset speed via RADIUS CoA
			if sub.NasID != nil && *sub.NasID > 0 && sub.ServiceID > 0 {
				var nas models.Nas
				if err := database.DB.First(&nas, *sub.NasID).Error; err == nil && nas.IPAddress != "" {
					// Build rate limit string: upload/download format for MikroTik
					// Speeds are in Mbps, convert to Kbps for MikroTik (multiply by 1000)
					rateLimit := fmt.Sprintf("%dk/%dk", sub.Service.UploadSpeed*1000, sub.Service.DownloadSpeed*1000)
					fmt.Printf("Reset FUP: Resetting speed for %s via CoA to %s\n", sub.Username, rateLimit)

					// Use CoA to update rate limit
					coaClient := radius.NewCOAClient(nas.IPAddress, nas.CoAPort, nas.Secret)
					if err := coaClient.UpdateRateLimitViaRadclient(sub.Username, sub.SessionID, rateLimit); err != nil {
						fmt.Printf("Reset FUP: CoA failed for %s: %v, trying MikroTik API\n", sub.Username, err)
						// Fallback to MikroTik API (speeds in Kbps)
						client := mikrotik.NewClient(
							fmt.Sprintf("%s:%d", nas.IPAddress, nas.APIPort),
							nas.APIUsername,
							nas.APIPassword,
						)
						client.UpdateUserRateLimit(sub.Username, int(sub.Service.DownloadSpeed*1000), int(sub.Service.UploadSpeed*1000))
						client.Close()
					}
				}
			}
			success++

		case "delete":
			actionName = "Bulk deleted"
			// Disconnect from MikroTik if online
			if sub.NasID != nil && *sub.NasID > 0 {
				var nas models.Nas
				if err := database.DB.First(&nas, *sub.NasID).Error; err == nil && nas.IPAddress != "" {
					client := mikrotik.NewClient(
						fmt.Sprintf("%s:%d", nas.IPAddress, nas.APIPort),
						nas.APIUsername,
						nas.APIPassword,
					)
					client.DisconnectUser(sub.Username)
					client.Close()
				}
			}
			// Delete RADIUS entries
			database.DB.Where("username = ?", sub.Username).Delete(&models.RadCheck{})
			database.DB.Where("username = ?", sub.Username).Delete(&models.RadReply{})
			database.DB.Where("username = ?", sub.Username).Delete(&models.RadAcct{})
			// Delete subscriber (soft delete if model supports it, otherwise hard delete)
			if err := database.DB.Delete(&sub).Error; err != nil {
				log.Printf("BulkAction: Failed to delete subscriber %d: %v", sub.ID, err)
				failed++
				continue
			}
			success++

		default:
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "Invalid action",
			})
		}
	}

	// Create audit log
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionUpdate,
		EntityType:  "subscriber",
		Description: fmt.Sprintf("%s %d subscribers (%d failed)", actionName, success, failed),
		IPAddress:   c.IP(),
		UserAgent:   c.Get("User-Agent"),
	}
	database.DB.Create(&auditLog)

	return c.JSON(fiber.Map{
		"success": true,
		"message": fmt.Sprintf("%s %d subscribers (%d failed)", actionName, success, failed),
		"data": fiber.Map{
			"success": success,
			"failed":  failed,
		},
	})
}

// ChangeBulkRequest represents change bulk request with filters
type ChangeBulkRequest struct {
	ResellerID        uint   `json:"reseller_id"`        // 0 = All
	ServiceID         uint   `json:"service_id"`         // 0 = All
	StatusFilter      string `json:"status_filter"`      // all, active, inactive, expired
	IncludeSubResellers bool `json:"include_sub_resellers"`
	Action            string `json:"action"`             // set_expiry, set_service, set_reseller, set_active, set_inactive, set_monthly_quota, set_daily_quota, set_price, reset_mac
	ActionValue       string `json:"action_value"`       // value for the action
	Filters           []ChangeBulkFilter `json:"filters"` // additional filters
	Preview           bool   `json:"preview"`            // if true, only return affected users
}

// ChangeBulkFilter represents a custom filter
type ChangeBulkFilter struct {
	Field    string `json:"field"`    // username, expiry, name, address, price
	Rule     string `json:"rule"`     // equal, notequal, greater, less, like
	Value    string `json:"value"`    // filter value
}

// ChangeBulk performs bulk changes on subscribers based on filters
func (h *SubscriberHandler) ChangeBulk(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
	}

	// Only admins can use ChangeBulk
	if user.UserType != models.UserTypeAdmin {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"success": false,
			"message": "Only administrators can use ChangeBulk",
		})
	}

	var req ChangeBulkRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
		})
	}

	// Build query based on filters
	query := database.DB.Model(&models.Subscriber{})

	// Filter by reseller
	if req.ResellerID > 0 {
		if req.IncludeSubResellers {
			query = query.Where("reseller_id IN (SELECT id FROM resellers WHERE id = ? OR parent_id = ?)", req.ResellerID, req.ResellerID)
		} else {
			query = query.Where("reseller_id = ?", req.ResellerID)
		}
	}

	// Filter by service
	if req.ServiceID > 0 {
		query = query.Where("service_id = ?", req.ServiceID)
	}

	// Filter by status
	switch req.StatusFilter {
	case "active":
		query = query.Where("status = ?", models.SubscriberStatusActive)
	case "inactive":
		query = query.Where("status = ?", models.SubscriberStatusInactive)
	case "expired":
		query = query.Where("expiry_date < ?", time.Now())
	case "active_inactive":
		query = query.Where("status IN ?", []models.SubscriberStatus{models.SubscriberStatusActive, models.SubscriberStatusInactive})
	}

	// Apply custom filters
	for _, filter := range req.Filters {
		var fieldName string
		switch filter.Field {
		case "username":
			fieldName = "username"
		case "expiry":
			fieldName = "expiry_date"
		case "name":
			fieldName = "full_name"
		case "address":
			fieldName = "address"
		case "price":
			fieldName = "price"
		default:
			continue
		}

		switch filter.Rule {
		case "equal":
			query = query.Where(fmt.Sprintf("%s = ?", fieldName), filter.Value)
		case "notequal":
			query = query.Where(fmt.Sprintf("%s != ?", fieldName), filter.Value)
		case "greater":
			query = query.Where(fmt.Sprintf("%s > ?", fieldName), filter.Value)
		case "less":
			query = query.Where(fmt.Sprintf("%s < ?", fieldName), filter.Value)
		case "like":
			query = query.Where(fmt.Sprintf("%s ILIKE ?", fieldName), "%"+filter.Value+"%")
		}
	}

	// Count affected subscribers
	var total int64
	query.Count(&total)

	// If preview mode, return the list of affected subscribers
	if req.Preview {
		page, _ := strconv.Atoi(c.Query("page", "1"))
		limit, _ := strconv.Atoi(c.Query("limit", "50"))
		offset := (page - 1) * limit

		var subscribers []models.Subscriber
		query.Offset(offset).Limit(limit).Find(&subscribers)

		return c.JSON(fiber.Map{
			"success": true,
			"data":    subscribers,
			"meta": fiber.Map{
				"total":      total,
				"page":       page,
				"limit":      limit,
				"totalPages": (total + int64(limit) - 1) / int64(limit),
			},
		})
	}

	// Execute action
	var subscribers []models.Subscriber
	if err := query.Find(&subscribers).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to fetch subscribers",
		})
	}

	success := 0
	failed := 0
	var actionName string

	for _, sub := range subscribers {
		switch req.Action {
		case "set_expiry":
			actionName = "Set expiry date"
			expiryDate, err := time.Parse("2006-01-02", req.ActionValue)
			if err != nil {
				failed++
				continue
			}
			database.DB.Model(&sub).Update("expiry_date", expiryDate)
			database.DB.Where("username = ? AND attribute = ?", sub.Username, "Expiration").Delete(&models.RadCheck{})
			database.DB.Create(&models.RadCheck{
				Username: sub.Username, Attribute: "Expiration", Op: ":=",
				Value: expiryDate.Format("Jan 02 2006 15:04:05"),
			})
			success++

		case "set_service":
			actionName = "Set service"
			serviceID, err := strconv.ParseUint(req.ActionValue, 10, 32)
			if err != nil {
				failed++
				continue
			}
			var service models.Service
			if err := database.DB.First(&service, serviceID).Error; err != nil {
				failed++
				continue
			}
			database.DB.Model(&sub).Updates(map[string]interface{}{
				"service_id": serviceID,
				"price":      service.Price,
			})
			success++

		case "set_reseller":
			actionName = "Set reseller"
			resellerID, err := strconv.ParseUint(req.ActionValue, 10, 32)
			if err != nil {
				failed++
				continue
			}
			database.DB.Model(&sub).Update("reseller_id", resellerID)
			success++

		case "set_active":
			actionName = "Set active"
			database.DB.Model(&sub).Update("status", models.SubscriberStatusActive)
			success++

		case "set_inactive":
			actionName = "Set inactive"
			database.DB.Model(&sub).Update("status", models.SubscriberStatusInactive)
			success++

		case "set_monthly_quota":
			actionName = "Set monthly quota"
			quotaGB, err := strconv.ParseFloat(req.ActionValue, 64)
			if err != nil {
				failed++
				continue
			}
			quotaBytes := uint64(quotaGB * 1024 * 1024 * 1024) // Convert GB to bytes
			database.DB.Model(&sub).Update("monthly_quota", quotaBytes)
			success++

		case "set_daily_quota":
			actionName = "Set daily quota"
			quotaMB, err := strconv.ParseFloat(req.ActionValue, 64)
			if err != nil {
				failed++
				continue
			}
			quotaBytes := uint64(quotaMB * 1024 * 1024) // Convert MB to bytes
			database.DB.Model(&sub).Update("daily_quota", quotaBytes)
			success++

		case "set_price":
			actionName = "Set price"
			price, err := strconv.ParseFloat(req.ActionValue, 64)
			if err != nil {
				failed++
				continue
			}
			database.DB.Model(&sub).Update("price", price)
			success++

		case "reset_mac":
			actionName = "Reset MAC"
			database.DB.Model(&sub).Update("mac_address", "")
			database.DB.Where("username = ? AND attribute = ?", sub.Username, "Calling-Station-Id").Delete(&models.RadCheck{})
			success++

		default:
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "Invalid action: " + req.Action,
			})
		}
	}

	// Create audit log
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionUpdate,
		EntityType:  "subscriber",
		Description: fmt.Sprintf("ChangeBulk: %s for %d subscribers (%d failed)", actionName, success, failed),
		IPAddress:   c.IP(),
		UserAgent:   c.Get("User-Agent"),
	}
	database.DB.Create(&auditLog)

	return c.JSON(fiber.Map{
		"success": true,
		"message": fmt.Sprintf("%s applied to %d subscribers (%d failed)", actionName, success, failed),
		"data": fiber.Map{
			"success": success,
			"failed":  failed,
			"total":   total,
		},
	})
}

// ListArchived returns archived (soft-deleted) subscribers
func (h *SubscriberHandler) ListArchived(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
	}

	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "25"))
	search := c.Query("search", "")

	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 25
	}
	offset := (page - 1) * limit

	query := database.DB.Unscoped().Model(&models.Subscriber{}).
		Where("deleted_at IS NOT NULL")

	if user.UserType == models.UserTypeReseller && user.ResellerID != nil {
		query = query.Where("reseller_id IN (SELECT id FROM resellers WHERE id = ? OR parent_id = ?)", *user.ResellerID, *user.ResellerID)
	}

	if search != "" {
		searchPattern := "%" + search + "%"
		query = query.Where("username ILIKE ? OR full_name ILIKE ?", searchPattern, searchPattern)
	}

	var total int64
	query.Count(&total)

	var subscribers []models.Subscriber
	if err := query.Offset(offset).Limit(limit).Order("deleted_at DESC").Find(&subscribers).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to fetch archived subscribers",
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    subscribers,
		"meta": fiber.Map{
			"page":       page,
			"limit":      limit,
			"total":      total,
			"totalPages": (total + int64(limit) - 1) / int64(limit),
		},
	})
}

// Restore restores a soft-deleted subscriber
func (h *SubscriberHandler) Restore(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
	}

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid subscriber ID",
		})
	}

	var subscriber models.Subscriber
	if err := database.DB.Unscoped().First(&subscriber, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Subscriber not found",
		})
	}

	if subscriber.DeletedAt.Time.IsZero() {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Subscriber is not archived",
		})
	}

	// Restore subscriber
	if err := database.DB.Unscoped().Model(&subscriber).Update("deleted_at", nil).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to restore subscriber",
		})
	}

	// Restore RADIUS attributes
	database.DB.Preload("Service").First(&subscriber, id)

	simultaneousSessions := subscriber.SimultaneousSessions
	if simultaneousSessions <= 0 {
		simultaneousSessions = 1
	}

	radCheck := []models.RadCheck{
		{Username: subscriber.Username, Attribute: "Cleartext-Password", Op: ":=", Value: subscriber.PasswordPlain},
		{Username: subscriber.Username, Attribute: "Expiration", Op: ":=", Value: subscriber.ExpiryDate.Format("Jan 02 2006 15:04:05")},
		{Username: subscriber.Username, Attribute: "Simultaneous-Use", Op: ":=", Value: fmt.Sprintf("%d", simultaneousSessions)},
	}
	database.DB.Create(&radCheck)

	if subscriber.Service.ID != 0 {
		radReply := []models.RadReply{
			{Username: subscriber.Username, Attribute: "Mikrotik-Rate-Limit", Op: "=", Value: fmt.Sprintf("%s/%s", subscriber.Service.UploadSpeedStr, subscriber.Service.DownloadSpeedStr)},
		}
		database.DB.Create(&radReply)
	}

	// Create audit log
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionUpdate,
		EntityType:  "subscriber",
		EntityID:    subscriber.ID,
		EntityName:  subscriber.Username,
		Description: "Restored archived subscriber",
		IPAddress:   c.IP(),
		UserAgent:   c.Get("User-Agent"),
	}
	database.DB.Create(&auditLog)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Subscriber restored successfully",
		"data":    subscriber,
	})
}

// PermanentDelete permanently deletes an archived subscriber
func (h *SubscriberHandler) PermanentDelete(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
	}

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid subscriber ID",
		})
	}

	var subscriber models.Subscriber
	if err := database.DB.Unscoped().First(&subscriber, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Subscriber not found",
		})
	}

	if subscriber.DeletedAt.Time.IsZero() {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Subscriber must be archived before permanent deletion",
		})
	}

	// Permanently delete
	if err := database.DB.Unscoped().Delete(&subscriber).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to delete subscriber",
		})
	}

	// Create audit log
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionDelete,
		EntityType:  "subscriber",
		EntityID:    uint(id),
		EntityName:  subscriber.Username,
		Description: "Permanently deleted subscriber",
		IPAddress:   c.IP(),
		UserAgent:   c.Get("User-Agent"),
	}
	database.DB.Create(&auditLog)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Subscriber permanently deleted",
	})
}

// RenameRequest represents rename request
type RenameRequest struct {
	NewUsername string `json:"new_username"`
	Reason      string `json:"reason"`
}

// Rename changes subscriber's username
func (h *SubscriberHandler) Rename(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
	}

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid subscriber ID"})
	}

	var req RenameRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid request body"})
	}

	if req.NewUsername == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "New username is required"})
	}

	var subscriber models.Subscriber
	if err := database.DB.First(&subscriber, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "Subscriber not found"})
	}

	oldUsername := subscriber.Username

	// Check if new username already exists
	var count int64
	database.DB.Model(&models.Subscriber{}).Where("username = ? AND id != ?", req.NewUsername, id).Count(&count)
	if count > 0 {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"success": false, "message": "Username already exists"})
	}

	// Update subscriber
	subscriber.Username = req.NewUsername
	database.DB.Save(&subscriber)

	// Update RADIUS entries
	database.DB.Model(&models.RadCheck{}).Where("username = ?", oldUsername).Update("username", req.NewUsername)
	database.DB.Model(&models.RadReply{}).Where("username = ?", oldUsername).Update("username", req.NewUsername)
	database.DB.Model(&models.RadUserGroup{}).Where("username = ?", oldUsername).Update("username", req.NewUsername)
	database.DB.Model(&models.RadAcct{}).Where("username = ?", oldUsername).Update("username", req.NewUsername)

	// Create audit log
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionUpdate,
		EntityType:  "subscriber",
		EntityID:    subscriber.ID,
		EntityName:  subscriber.Username,
		OldValue:    oldUsername,
		NewValue:    req.NewUsername,
		Description: fmt.Sprintf("Renamed from %s to %s. Reason: %s", oldUsername, req.NewUsername, req.Reason),
		IPAddress:   c.IP(),
		UserAgent:   c.Get("User-Agent"),
	}
	database.DB.Create(&auditLog)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Username changed successfully",
		"data": fiber.Map{
			"old_username": oldUsername,
			"new_username": req.NewUsername,
		},
	})
}

// AddDaysRequest represents add days request
type AddDaysRequest struct {
	Days   int    `json:"days"`
	Reason string `json:"reason"`
}

// AddDays adds or subtracts days from subscriber's expiry
func (h *SubscriberHandler) AddDays(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
	}

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid subscriber ID"})
	}

	var req AddDaysRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid request body"})
	}

	if req.Days == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Days cannot be zero"})
	}

	var subscriber models.Subscriber
	if err := database.DB.First(&subscriber, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "Subscriber not found"})
	}

	oldExpiry := subscriber.ExpiryDate
	newExpiry := subscriber.ExpiryDate.AddDate(0, 0, req.Days)

	// Update subscriber
	subscriber.ExpiryDate = newExpiry
	database.DB.Save(&subscriber)

	// Update RADIUS expiration
	database.DB.Where("username = ? AND attribute = ?", subscriber.Username, "Expiration").Delete(&models.RadCheck{})
	database.DB.Create(&models.RadCheck{
		Username:  subscriber.Username,
		Attribute: "Expiration",
		Op:        ":=",
		Value:     newExpiry.Format("Jan 02 2006 15:04:05"),
	})

	// Create audit log
	action := "Added"
	if req.Days < 0 {
		action = "Subtracted"
	}
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionUpdate,
		EntityType:  "subscriber",
		EntityID:    subscriber.ID,
		EntityName:  subscriber.Username,
		OldValue:    oldExpiry.Format("2006-01-02"),
		NewValue:    newExpiry.Format("2006-01-02"),
		Description: fmt.Sprintf("%s %d days. Reason: %s", action, abs(req.Days), req.Reason),
		IPAddress:   c.IP(),
		UserAgent:   c.Get("User-Agent"),
	}
	database.DB.Create(&auditLog)

	return c.JSON(fiber.Map{
		"success": true,
		"message": fmt.Sprintf("%s %d days successfully", action, abs(req.Days)),
		"data": fiber.Map{
			"old_expiry": oldExpiry,
			"new_expiry": newExpiry,
		},
	})
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}

// ChangeServiceRequest represents change service request
type ChangeServiceRequest struct {
	ServiceID        uint    `json:"service_id"`
	ExtendExpiry     bool    `json:"extend_expiry"`
	ResetFUP         bool    `json:"reset_fup"`
	ChargePrice      bool    `json:"charge_price"`
	ProratePrice     bool    `json:"prorate_price"`
	Reason           string  `json:"reason"`
}

// getSystemPreference retrieves a system preference value
func getSystemPreference(key string, defaultValue string) string {
	var pref models.SystemPreference
	if err := database.DB.Where("key = ?", key).First(&pref).Error; err != nil {
		return defaultValue
	}
	return pref.Value
}

// getSystemPreferenceFloat retrieves a system preference as float64
func getSystemPreferenceFloat(key string, defaultValue float64) float64 {
	val := getSystemPreference(key, "")
	if val == "" {
		return defaultValue
	}
	f, err := strconv.ParseFloat(val, 64)
	if err != nil {
		return defaultValue
	}
	return f
}

// getSystemPreferenceBool retrieves a system preference as bool
func getSystemPreferenceBool(key string, defaultValue bool) bool {
	val := getSystemPreference(key, "")
	if val == "" {
		return defaultValue
	}
	return val == "true" || val == "1"
}

// ChangeServicePriceResponse represents the price calculation response
type ChangeServicePriceResponse struct {
	RemainingDays      int     `json:"remaining_days"`
	OldDayPrice        float64 `json:"old_day_price"`
	NewDayPrice        float64 `json:"new_day_price"`
	OldCredit          float64 `json:"old_credit"`           // Credit from remaining days on old service
	NewCost            float64 `json:"new_cost"`             // Cost for remaining days on new service
	PriceDifference    float64 `json:"price_difference"`     // NewCost - OldCredit
	ChangeFee          float64 `json:"change_fee"`           // Upgrade or downgrade fee
	TotalCharge        float64 `json:"total_charge"`         // Final amount to charge (can be negative for refund)
	IsUpgrade          bool    `json:"is_upgrade"`
	IsDowngrade        bool    `json:"is_downgrade"`
	DowngradeAllowed   bool    `json:"downgrade_allowed"`
	RefundEnabled      bool    `json:"refund_enabled"`
}

// CalculateChangeServicePrice calculates the price for changing service
func (h *SubscriberHandler) CalculateChangeServicePrice(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
	}

	subscriberID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid subscriber ID"})
	}

	newServiceID, err := strconv.Atoi(c.Query("service_id"))
	if err != nil || newServiceID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Service ID is required"})
	}

	var subscriber models.Subscriber
	if err := database.DB.Preload("Service").First(&subscriber, subscriberID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "Subscriber not found"})
	}

	var newService models.Service
	if err := database.DB.First(&newService, newServiceID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "Service not found"})
	}

	oldService := subscriber.Service

	// Get system preferences
	upgradeFee := getSystemPreferenceFloat("upgrade_change_service_fee", 0)
	downgradeFee := getSystemPreferenceFloat("downgrade_change_service_fee", 0)
	allowDowngrade := getSystemPreferenceBool("allow_downgrade", true)
	refundEnabled := getSystemPreferenceBool("downgrade_refund", false)

	// Calculate remaining days until expiry
	now := time.Now()
	remainingDays := 0
	if subscriber.ExpiryDate.After(now) {
		remainingDays = int(subscriber.ExpiryDate.Sub(now).Hours() / 24)
	}

	// Get day prices (use service's day_price if set, otherwise calculate from price)
	oldDayPrice := oldService.DayPrice
	if oldDayPrice == 0 && oldService.Price > 0 {
		// Calculate day price from monthly price (assuming 30 days)
		oldDayPrice = oldService.Price / 30.0
	}

	newDayPrice := newService.DayPrice
	if newDayPrice == 0 && newService.Price > 0 {
		newDayPrice = newService.Price / 30.0
	}

	// Calculate credits and costs
	oldCredit := oldDayPrice * float64(remainingDays)
	newCost := newDayPrice * float64(remainingDays)
	priceDifference := newCost - oldCredit

	// Determine if upgrade or downgrade
	isUpgrade := newService.Price > oldService.Price
	isDowngrade := newService.Price < oldService.Price

	// Calculate total charge
	var totalCharge float64
	var changeFee float64

	if isUpgrade {
		changeFee = upgradeFee
		totalCharge = priceDifference + changeFee
		if totalCharge < 0 {
			totalCharge = changeFee // At minimum charge the upgrade fee
		}
	} else if isDowngrade {
		changeFee = downgradeFee
		if refundEnabled {
			// Refund the difference minus downgrade fee
			totalCharge = priceDifference + changeFee // priceDifference is negative here
		} else {
			// No refund, just charge the downgrade fee
			totalCharge = changeFee
		}
	} else {
		// Same price, just charge upgrade fee if any
		changeFee = upgradeFee
		totalCharge = changeFee
	}

	// Round to 2 decimal places
	totalCharge = math.Round(totalCharge*100) / 100
	oldCredit = math.Round(oldCredit*100) / 100
	newCost = math.Round(newCost*100) / 100
	priceDifference = math.Round(priceDifference*100) / 100

	return c.JSON(fiber.Map{
		"success": true,
		"data": ChangeServicePriceResponse{
			RemainingDays:    remainingDays,
			OldDayPrice:      oldDayPrice,
			NewDayPrice:      newDayPrice,
			OldCredit:        oldCredit,
			NewCost:          newCost,
			PriceDifference:  priceDifference,
			ChangeFee:        changeFee,
			TotalCharge:      totalCharge,
			IsUpgrade:        isUpgrade,
			IsDowngrade:      isDowngrade,
			DowngradeAllowed: allowDowngrade,
			RefundEnabled:    refundEnabled,
		},
	})
}

// ChangeService changes subscriber's service plan
func (h *SubscriberHandler) ChangeService(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
	}

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid subscriber ID"})
	}

	var req ChangeServiceRequest
	if err := c.BodyParser(&req); err != nil {
		log.Printf("ChangeService: Failed to parse body: %v, body: %s", err, string(c.Body()))
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid request body"})
	}

	log.Printf("ChangeService: Subscriber %d, ServiceID: %d, Request: %+v", id, req.ServiceID, req)

	if req.ServiceID == 0 {
		log.Printf("ChangeService: ServiceID is 0, rejecting")
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Service ID is required"})
	}

	var subscriber models.Subscriber
	if err := database.DB.Preload("Service").First(&subscriber, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "Subscriber not found"})
	}

	var newService models.Service
	if err := database.DB.First(&newService, req.ServiceID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "Service not found"})
	}

	oldService := subscriber.Service
	oldServiceID := subscriber.ServiceID

	// Get system preferences
	upgradeFee := getSystemPreferenceFloat("upgrade_change_service_fee", 0)
	downgradeFee := getSystemPreferenceFloat("downgrade_change_service_fee", 0)
	allowDowngrade := getSystemPreferenceBool("allow_downgrade", true)
	refundEnabled := getSystemPreferenceBool("downgrade_refund", false)

	// Determine if upgrade or downgrade
	isUpgrade := newService.Price > oldService.Price
	isDowngrade := newService.Price < oldService.Price

	// Check if downgrade is allowed
	if isDowngrade && !allowDowngrade {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Service downgrade is not allowed"})
	}

	// Calculate prorate price
	var chargeAmount float64
	var priceDescription string

	if req.ProratePrice {
		// Calculate remaining days until expiry
		now := time.Now()
		remainingDays := 0
		if subscriber.ExpiryDate.After(now) {
			remainingDays = int(subscriber.ExpiryDate.Sub(now).Hours() / 24)
		}

		// Get day prices (use service's day_price if set, otherwise calculate from price)
		oldDayPrice := oldService.DayPrice
		if oldDayPrice == 0 && oldService.Price > 0 {
			oldDayPrice = oldService.Price / 30.0
		}

		newDayPrice := newService.DayPrice
		if newDayPrice == 0 && newService.Price > 0 {
			newDayPrice = newService.Price / 30.0
		}

		// Calculate credits and costs
		oldCredit := oldDayPrice * float64(remainingDays)
		newCost := newDayPrice * float64(remainingDays)
		priceDifference := newCost - oldCredit

		if isUpgrade {
			chargeAmount = priceDifference + upgradeFee
			if chargeAmount < upgradeFee {
				chargeAmount = upgradeFee
			}
			priceDescription = fmt.Sprintf("Prorate upgrade: %d days remaining, diff: %.2f + fee: %.2f", remainingDays, priceDifference, upgradeFee)
		} else if isDowngrade {
			if refundEnabled {
				chargeAmount = priceDifference + downgradeFee // priceDifference is negative
				priceDescription = fmt.Sprintf("Prorate downgrade with refund: %d days, diff: %.2f + fee: %.2f", remainingDays, priceDifference, downgradeFee)
			} else {
				chargeAmount = downgradeFee
				priceDescription = fmt.Sprintf("Downgrade fee (no refund): %.2f", downgradeFee)
			}
		} else {
			chargeAmount = upgradeFee
			priceDescription = fmt.Sprintf("Same price change, fee: %.2f", upgradeFee)
		}

		// Round to 2 decimal places
		chargeAmount = math.Round(chargeAmount*100) / 100
		log.Printf("ChangeService: Prorate calculation - %s, Total: %.2f", priceDescription, chargeAmount)
	} else if req.ChargePrice {
		// Full price charge (legacy behavior)
		chargeAmount = newService.Price
		priceDescription = fmt.Sprintf("Full service price: %.2f", newService.Price)
	}

	// Check reseller balance if charging
	if chargeAmount > 0 && user.UserType == models.UserTypeReseller && user.ResellerID != nil {
		var reseller models.Reseller
		database.DB.First(&reseller, *user.ResellerID)
		if reseller.Balance < chargeAmount {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": fmt.Sprintf("Insufficient balance. Required: %.2f, Available: %.2f", chargeAmount, reseller.Balance),
			})
		}
	}

	// Update subscriber
	subscriber.ServiceID = req.ServiceID
	subscriber.Price = newService.Price

	if req.ExtendExpiry {
		if newService.ExpiryUnit == models.ExpiryUnitMonths {
			subscriber.ExpiryDate = subscriber.ExpiryDate.AddDate(0, newService.ExpiryValue, 0)
		} else {
			subscriber.ExpiryDate = subscriber.ExpiryDate.AddDate(0, 0, newService.ExpiryValue)
		}
	}

	if req.ResetFUP {
		subscriber.FUPLevel = 0
		subscriber.DailyQuotaUsed = 0
		subscriber.MonthlyQuotaUsed = 0
	}

	log.Printf("ChangeService: Updating subscriber %d from ServiceID %d to %d", subscriber.ID, oldServiceID, req.ServiceID)

	// Use direct update query to ensure the change is applied
	updateFields := map[string]interface{}{
		"service_id": req.ServiceID,
		"price":      newService.Price,
	}
	if req.ResetFUP {
		updateFields["fup_level"] = 0
		updateFields["daily_quota_used"] = 0
		updateFields["monthly_quota_used"] = 0
	}
	if req.ExtendExpiry {
		updateFields["expiry_date"] = subscriber.ExpiryDate
	}

	result := database.DB.Model(&models.Subscriber{}).Where("id = ?", subscriber.ID).Updates(updateFields)
	if result.Error != nil {
		log.Printf("ChangeService: Failed to update subscriber: %v", result.Error)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "Failed to update subscriber"})
	}
	log.Printf("ChangeService: Subscriber updated successfully, rows affected: %d", result.RowsAffected)

	// Update RADIUS rate limit
	database.DB.Where("username = ? AND attribute = ?", subscriber.Username, "Mikrotik-Rate-Limit").Delete(&models.RadReply{})
	database.DB.Create(&models.RadReply{
		Username:  subscriber.Username,
		Attribute: "Mikrotik-Rate-Limit",
		Op:        "=",
		Value:     fmt.Sprintf("%s/%s", newService.UploadSpeedStr, newService.DownloadSpeedStr),
	})

	if req.ExtendExpiry {
		database.DB.Where("username = ? AND attribute = ?", subscriber.Username, "Expiration").Delete(&models.RadCheck{})
		database.DB.Create(&models.RadCheck{
			Username:  subscriber.Username,
			Attribute: "Expiration",
			Op:        ":=",
			Value:     subscriber.ExpiryDate.Format("Jan 02 2006 15:04:05"),
		})
	}

	// Deduct balance if charging (prorate or full price)
	if (req.ChargePrice || req.ProratePrice) && chargeAmount != 0 && user.UserType == models.UserTypeReseller && user.ResellerID != nil {
		if chargeAmount > 0 {
			// Charge reseller
			database.DB.Model(&models.Reseller{}).Where("id = ?", *user.ResellerID).Update("balance", gorm.Expr("balance - ?", chargeAmount))
		} else {
			// Refund reseller (chargeAmount is negative)
			database.DB.Model(&models.Reseller{}).Where("id = ?", *user.ResellerID).Update("balance", gorm.Expr("balance + ?", -chargeAmount))
		}

		// Create transaction
		transaction := models.Transaction{
			Type:           models.TransactionTypeChangeService,
			Amount:         -chargeAmount, // Negative for charge, positive for refund
			ResellerID:     *user.ResellerID,
			SubscriberID:   &subscriber.ID,
			OldServiceName: oldService.Name,
			NewServiceName: newService.Name,
			Description:    fmt.Sprintf("Service change: %s -> %s. %s", oldService.Name, newService.Name, priceDescription),
			IPAddress:      c.IP(),
			CreatedBy:      user.ID,
		}
		database.DB.Create(&transaction)
	}

	// Create audit log
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionUpdate,
		EntityType:  "subscriber",
		EntityID:    subscriber.ID,
		EntityName:  subscriber.Username,
		OldValue:    fmt.Sprintf("ServiceID: %d", oldServiceID),
		NewValue:    fmt.Sprintf("ServiceID: %d, Charge: %.2f", req.ServiceID, chargeAmount),
		Description: fmt.Sprintf("Changed service from %s to %s. %s. Reason: %s", oldService.Name, newService.Name, priceDescription, req.Reason),
		IPAddress:   c.IP(),
		UserAgent:   c.Get("User-Agent"),
	}
	database.DB.Create(&auditLog)

	// Auto-disconnect user so they reconnect with new service pool IP
	// Reload subscriber to get NasID
	database.DB.First(&subscriber, id)
	if subscriber.NasID != nil {
		go func(username string, nasID uint) {
			var nas models.Nas
			if err := database.DB.First(&nas, nasID).Error; err != nil {
				log.Printf("ChangeService: Failed to find NAS %d for disconnect: %v", nasID, err)
				return
			}

			log.Printf("ChangeService: Service changed for %s, disconnecting from NAS %s", username, nas.IPAddress)

			// Try MikroTik API first (most reliable for PPPoE)
			client := mikrotik.NewClient(
				fmt.Sprintf("%s:%d", nas.IPAddress, nas.APIPort),
				nas.APIUsername,
				nas.APIPassword,
			)
			if err := client.DisconnectUser(username); err != nil {
				log.Printf("ChangeService: MikroTik API disconnect failed for %s: %v, trying CoA", username, err)

				// Fallback: try CoA Disconnect-Request
				coaClient := radius.NewCOAClient(nas.IPAddress, nas.CoAPort, nas.Secret)
				if err := coaClient.DisconnectUser(username, ""); err != nil {
					log.Printf("ChangeService: CoA disconnect also failed for %s: %v", username, err)
				} else {
					log.Printf("ChangeService: Disconnected %s via CoA", username)
				}
			} else {
				log.Printf("ChangeService: Disconnected %s via MikroTik API (will reconnect with new pool)", username)
			}
			client.Close()
		}(subscriber.Username, *subscriber.NasID)
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Service changed successfully",
		"data": fiber.Map{
			"old_service":   oldService.Name,
			"new_service":   newService.Name,
			"charge_amount": chargeAmount,
			"is_upgrade":    isUpgrade,
			"is_downgrade":  isDowngrade,
		},
	})
}

// Activate activates a subscriber
func (h *SubscriberHandler) Activate(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
	}

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid subscriber ID"})
	}

	var subscriber models.Subscriber
	if err := database.DB.First(&subscriber, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "Subscriber not found"})
	}

	oldStatus := subscriber.Status
	subscriber.Status = models.SubscriberStatusActive
	database.DB.Save(&subscriber)

	// Create audit log
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionUpdate,
		EntityType:  "subscriber",
		EntityID:    subscriber.ID,
		EntityName:  subscriber.Username,
		OldValue:    fmt.Sprintf("Status: %d", oldStatus),
		NewValue:    fmt.Sprintf("Status: %d", models.SubscriberStatusActive),
		Description: "Activated subscriber",
		IPAddress:   c.IP(),
		UserAgent:   c.Get("User-Agent"),
	}
	database.DB.Create(&auditLog)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Subscriber activated successfully",
	})
}

// Deactivate deactivates a subscriber
func (h *SubscriberHandler) Deactivate(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
	}

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid subscriber ID"})
	}

	var subscriber models.Subscriber
	if err := database.DB.First(&subscriber, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "Subscriber not found"})
	}

	oldStatus := subscriber.Status
	subscriber.Status = models.SubscriberStatusInactive
	database.DB.Save(&subscriber)

	// Disconnect if online
	if subscriber.IsOnline {
		subscriber.IsOnline = false
		subscriber.SessionID = ""
		database.DB.Save(&subscriber)
		// TODO: Send CoA disconnect to NAS
	}

	// Create audit log
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionUpdate,
		EntityType:  "subscriber",
		EntityID:    subscriber.ID,
		EntityName:  subscriber.Username,
		OldValue:    fmt.Sprintf("Status: %d", oldStatus),
		NewValue:    fmt.Sprintf("Status: %d", models.SubscriberStatusInactive),
		Description: "Deactivated subscriber",
		IPAddress:   c.IP(),
		UserAgent:   c.Get("User-Agent"),
	}
	database.DB.Create(&auditLog)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Subscriber deactivated successfully",
	})
}

// RefillRequest represents refill request
type RefillRequest struct {
	Amount float64 `json:"amount"`
	Reason string  `json:"reason"`
}

// Refill adds credit to subscriber's account
func (h *SubscriberHandler) Refill(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
	}

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid subscriber ID"})
	}

	var req RefillRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid request body"})
	}

	if req.Amount <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Amount must be positive"})
	}

	var subscriber models.Subscriber
	if err := database.DB.First(&subscriber, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "Subscriber not found"})
	}

	// Check reseller balance
	if user.UserType == models.UserTypeReseller && user.ResellerID != nil {
		var reseller models.Reseller
		database.DB.First(&reseller, *user.ResellerID)
		if reseller.Balance < req.Amount {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Insufficient balance"})
		}
		// Deduct from reseller
		database.DB.Model(&reseller).Update("balance", gorm.Expr("balance - ?", req.Amount))
	}

	// Add to subscriber credit balance (assuming we have this field)
	// For now, we'll just log it as a transaction
	if user.UserType == models.UserTypeReseller && user.ResellerID != nil {
		transaction := models.Transaction{
			Type:         models.TransactionTypeRefill,
			Amount:       -req.Amount,
			ResellerID:   *user.ResellerID,
			SubscriberID: &subscriber.ID,
			Description:  fmt.Sprintf("Refill: %s - %s", subscriber.Username, req.Reason),
			IPAddress:    c.IP(),
			CreatedBy:    user.ID,
		}
		database.DB.Create(&transaction)
	}

	// Create audit log
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionUpdate,
		EntityType:  "subscriber",
		EntityID:    subscriber.ID,
		EntityName:  subscriber.Username,
		NewValue:    fmt.Sprintf("Amount: %.2f", req.Amount),
		Description: fmt.Sprintf("Refilled account with %.2f. Reason: %s", req.Amount, req.Reason),
		IPAddress:   c.IP(),
		UserAgent:   c.Get("User-Agent"),
	}
	database.DB.Create(&auditLog)

	return c.JSON(fiber.Map{
		"success": true,
		"message": fmt.Sprintf("Refilled %.2f successfully", req.Amount),
		"data": fiber.Map{
			"amount": req.Amount,
		},
	})
}

// Ping pings subscriber's IP address
func (h *SubscriberHandler) Ping(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
	}

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid subscriber ID"})
	}

	var subscriber models.Subscriber
	if err := database.DB.First(&subscriber, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "Subscriber not found"})
	}

	// Get IP address
	ipAddress := subscriber.IPAddress
	if ipAddress == "" {
		ipAddress = subscriber.StaticIP
	}
	if ipAddress == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "No IP address available"})
	}

	// Execute ping command
	// Using -c 4 for 4 pings, -W 2 for 2 second timeout
	output, err := execPing(ipAddress)

	pingResult := fiber.Map{
		"ip":      ipAddress,
		"online":  subscriber.IsOnline,
		"output":  output,
		"success": err == nil,
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Ping completed",
		"data":    pingResult,
	})
}

// execPing executes ping command and returns output in Windows-like format
func execPing(ip string) (string, error) {
	// Execute real ping command with 10 packets, 200ms interval, 1s timeout (~3 sec total)
	cmd := exec.Command("ping", "-c", "10", "-i", "0.2", "-W", "1", ip)
	output, err := cmd.CombinedOutput()

	if err != nil {
		// If ping fails, return the error output
		return string(output), err
	}

	// Parse Linux ping output and convert to Windows-like format
	lines := strings.Split(string(output), "\n")
	var result strings.Builder

	result.WriteString(fmt.Sprintf("\nPinging %s with 32 bytes of data:\n\n", ip))

	received := 0
	var times []string

	for _, line := range lines {
		// Parse lines like: "64 bytes from 192.168.1.1: icmp_seq=1 ttl=64 time=1.23 ms"
		if strings.Contains(line, "bytes from") && strings.Contains(line, "time=") {
			received++
			// Extract time value
			timeIdx := strings.Index(line, "time=")
			if timeIdx != -1 {
				timeStr := line[timeIdx+5:]
				// Remove "ms" and any trailing content
				timeStr = strings.Split(timeStr, " ")[0]
				timeStr = strings.TrimSuffix(timeStr, "ms")
				times = append(times, timeStr)
				result.WriteString(fmt.Sprintf("Reply from %s: bytes=32 time=%sms TTL=64\n", ip, timeStr))
			}
		} else if strings.Contains(line, "Request timeout") || strings.Contains(line, "100% packet loss") {
			result.WriteString(fmt.Sprintf("Request timed out.\n"))
		}
	}

	// Add statistics
	result.WriteString(fmt.Sprintf("\nPing statistics for %s:\n", ip))
	result.WriteString(fmt.Sprintf("    Packets: Sent = 10, Received = %d, Lost = %d (%d%% loss)\n",
		received, 10-received, (10-received)*10))

	// Calculate timing statistics if we have times
	if len(times) > 0 {
		var min, max, sum float64
		min = 999999
		for _, t := range times {
			if val, err := strconv.ParseFloat(t, 64); err == nil {
				sum += val
				if val < min {
					min = val
				}
				if val > max {
					max = val
				}
			}
		}
		avg := sum / float64(len(times))
		result.WriteString(fmt.Sprintf("Approximate round trip times in milli-seconds:\n"))
		result.WriteString(fmt.Sprintf("    Minimum = %.0fms, Maximum = %.0fms, Average = %.0fms\n", min, max, avg))
	}

	return result.String(), nil
}

// CDNBandwidth represents bandwidth for a specific CDN
type CDNBandwidth struct {
	CDNID   uint    `json:"cdn_id"`
	CDNName string  `json:"cdn_name"`
	Bytes   int64   `json:"bytes"`
	Color   string  `json:"color"`
}

// BandwidthResponse represents real-time bandwidth data
type BandwidthResponse struct {
	Timestamp    int64          `json:"timestamp"`
	Download     float64        `json:"download"`   // Mbps
	Upload       float64        `json:"upload"`     // Mbps
	RxBytes      int64          `json:"rx_bytes"`
	TxBytes      int64          `json:"tx_bytes"`
	Uptime       string         `json:"uptime"`
	IPAddress    string         `json:"ip_address"`
	CallerID     string         `json:"caller_id"`
	CDNTraffic   []CDNBandwidth `json:"cdn_traffic,omitempty"`
}

// GetBandwidth returns real-time bandwidth data for a subscriber
func (h *SubscriberHandler) GetBandwidth(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
	}

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid subscriber ID"})
	}

	var subscriber models.Subscriber
	if err := database.DB.Preload("Nas").First(&subscriber, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "Subscriber not found"})
	}

	// Check if subscriber is online
	if !subscriber.IsOnline {
		return c.JSON(fiber.Map{
			"success": false,
			"message": "Subscriber is offline",
			"data": BandwidthResponse{
				Timestamp: time.Now().UnixMilli(),
			},
		})
	}

	// Check if NAS is configured
	if subscriber.Nas == nil || subscriber.Nas.IPAddress == "" {
		return c.JSON(fiber.Map{
			"success": false,
			"message": "NAS not configured",
			"data": BandwidthResponse{
				Timestamp: time.Now().UnixMilli(),
			},
		})
	}

	// Connect to MikroTik and get session info
	client := mikrotik.NewClient(
		fmt.Sprintf("%s:%d", subscriber.Nas.IPAddress, subscriber.Nas.APIPort),
		subscriber.Nas.APIUsername,
		subscriber.Nas.APIPassword,
	)
	defer client.Close()

	session, err := client.GetActiveSession(subscriber.Username)
	if err != nil {
		return c.JSON(fiber.Map{
			"success": false,
			"message": err.Error(),
			"data": BandwidthResponse{
				Timestamp: time.Now().UnixMilli(),
			},
		})
	}

	// Convert bytes/sec to Mbps (megabits per second)
	// TxRate = user download, RxRate = user upload (from interface/queue perspective)
	downloadMbps := float64(session.TxRate) * 8 / 1000000
	uploadMbps := float64(session.RxRate) * 8 / 1000000

	response := BandwidthResponse{
		Timestamp:  time.Now().UnixMilli(),
		Download:   downloadMbps,
		Upload:     uploadMbps,
		RxBytes:    session.RxBytes,
		TxBytes:    session.TxBytes,
		Uptime:     session.Uptime,
		IPAddress:  session.Address,
		CallerID:   session.CallerID,
	}

	// Get CDN traffic breakdown if subscriber has an IP address and service with CDNs
	if session.Address != "" && subscriber.ServiceID > 0 {
		// Get service CDN configurations
		var serviceCDNs []models.ServiceCDN
		database.DB.Preload("CDN").Where("service_id = ? AND is_active = ?", subscriber.ServiceID, true).Find(&serviceCDNs)

		if len(serviceCDNs) > 0 {
			log.Printf("CDN Debug: Found %d service CDNs for subscriber %s", len(serviceCDNs), subscriber.Username)

			// Build map of CDNID to color from database
			cdnColorMap := make(map[uint]string)
			defaultColor := "#EF4444" // Fallback red if no color set

			// Build CDN config list with subnets from database
			var cdnConfigs []mikrotik.CDNSubnetConfig
			for _, cdn := range serviceCDNs {
				if cdn.CDN != nil && cdn.CDN.ID > 0 && cdn.CDN.Subnets != "" {
					cdnConfigs = append(cdnConfigs, mikrotik.CDNSubnetConfig{
						ID:      cdn.CDNID,
						Name:    cdn.CDN.Name,
						Subnets: cdn.CDN.Subnets,
					})
					// Store color from database
					if cdn.CDN.Color != "" {
						cdnColorMap[cdn.CDNID] = cdn.CDN.Color
					} else {
						cdnColorMap[cdn.CDNID] = defaultColor
					}
					log.Printf("CDN Debug: CDN %s (ID=%d) subnets: %s, color: %s", cdn.CDN.Name, cdn.CDNID, cdn.CDN.Subnets, cdnColorMap[cdn.CDNID])
				}
			}

			// Get CDN traffic using connection tracking (NO MikroTik config needed!)
			cdnCounters, err := client.GetCDNTrafficForSubscriber(session.Address, cdnConfigs)
			log.Printf("CDN Debug: GetCDNTrafficForSubscriber for %s returned %d entries, err=%v", session.Address, len(cdnCounters), err)

			// Build CDN traffic response
			if err == nil {
				for _, counter := range cdnCounters {
					log.Printf("CDN Debug: CDN %s bytes=%d", counter.CDNName, counter.Bytes)
					color := cdnColorMap[counter.CDNID]
					if color == "" {
						color = defaultColor
					}
					response.CDNTraffic = append(response.CDNTraffic, CDNBandwidth{
						CDNID:   counter.CDNID,
						CDNName: counter.CDNName,
						Bytes:   counter.Bytes,
						Color:   color,
					})
				}
			} else {
				log.Printf("CDN Debug: Error getting CDN traffic: %v", err)
				// If error, still return CDNs with 0 bytes
				for _, serviceCDN := range serviceCDNs {
					if serviceCDN.CDN != nil && serviceCDN.CDN.ID > 0 {
						color := cdnColorMap[serviceCDN.CDNID]
						if color == "" {
							color = defaultColor
						}
						response.CDNTraffic = append(response.CDNTraffic, CDNBandwidth{
							CDNID:   serviceCDN.CDNID,
							CDNName: serviceCDN.CDN.Name,
							Bytes:   0,
							Color:   color,
						})
					}
				}
			}
		}
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    response,
	})
}

// TorchResponse represents the response for live torch data (like MikroTik Winbox torch)
type TorchResponse struct {
	Entries   []TorchEntry `json:"entries"`
	TotalTx   int64        `json:"total_tx"`   // Total TX bytes/sec
	TotalRx   int64        `json:"total_rx"`   // Total RX bytes/sec
	Interface string       `json:"interface"`
	FilterIP  string       `json:"filter_ip"`
	Duration  string       `json:"duration"`
}

type TorchEntry struct {
	SrcAddress  string `json:"src_address"`
	DstAddress  string `json:"dst_address"`
	SrcPort     int    `json:"src_port"`
	DstPort     int    `json:"dst_port"`
	Protocol    string `json:"protocol"`      // tcp, udp, icmp
	ProtoNum    int    `json:"proto_num"`     // 6, 17, 1
	MacProtocol string `json:"mac_protocol"`  // 800=IPv4, 86dd=IPv6
	VlanID      int    `json:"vlan_id"`
	DSCP        int    `json:"dscp"`
	TxRate      int64  `json:"tx_rate"`       // bytes/sec
	RxRate      int64  `json:"rx_rate"`       // bytes/sec
	TxPackets   int64  `json:"tx_packets"`
	RxPackets   int64  `json:"rx_packets"`
}

// GetTorch returns real-time traffic breakdown using MikroTik torch
func (h *SubscriberHandler) GetTorch(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "Unauthorized"})
	}

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid subscriber ID"})
	}

	// Get duration from query (default 3 seconds)
	duration, _ := strconv.Atoi(c.Query("duration", "3"))
	if duration <= 0 {
		duration = 3
	}
	if duration > 10 {
		duration = 10
	}

	var subscriber models.Subscriber
	if err := database.DB.Preload("Nas").First(&subscriber, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "Subscriber not found"})
	}

	// Check if subscriber is online
	if !subscriber.IsOnline {
		return c.JSON(fiber.Map{
			"success": false,
			"message": "Subscriber is offline",
		})
	}

	// Check if NAS is configured
	if subscriber.Nas == nil || subscriber.Nas.IPAddress == "" {
		return c.JSON(fiber.Map{
			"success": false,
			"message": "NAS not configured",
		})
	}

	// Get subscriber's current IP
	if subscriber.IPAddress == "" {
		return c.JSON(fiber.Map{
			"success": false,
			"message": "Subscriber has no IP address assigned",
		})
	}

	// Connect to MikroTik and run torch
	client := mikrotik.NewClient(
		fmt.Sprintf("%s:%d", subscriber.Nas.IPAddress, subscriber.Nas.APIPort),
		subscriber.Nas.APIUsername,
		subscriber.Nas.APIPassword,
	)
	defer client.Close()

	torchResult, err := client.GetLiveTorch(subscriber.IPAddress, duration)
	if err != nil {
		return c.JSON(fiber.Map{
			"success": false,
			"message": err.Error(),
		})
	}

	// Convert to response format
	response := TorchResponse{
		TotalTx:   torchResult.TotalTx,
		TotalRx:   torchResult.TotalRx,
		Interface: torchResult.Interface,
		FilterIP:  torchResult.FilterIP,
		Duration:  torchResult.Duration,
		Entries:   make([]TorchEntry, len(torchResult.Entries)),
	}

	for i, e := range torchResult.Entries {
		response.Entries[i] = TorchEntry{
			SrcAddress:  e.SrcAddress,
			DstAddress:  e.DstAddress,
			SrcPort:     e.SrcPort,
			DstPort:     e.DstPort,
			Protocol:    e.Protocol,
			ProtoNum:    e.ProtoNum,
			MacProtocol: e.MacProto,
			VlanID:      e.VlanID,
			DSCP:        e.DSCP,
			TxRate:      e.TxRate,
			RxRate:      e.RxRate,
			TxPackets:   e.TxPackets,
			RxPackets:   e.RxPackets,
		}
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    response,
	})
}

// isIPInSubnets checks if an IP address is within any of the given subnets (comma-separated CIDR notation)
func isIPInSubnets(ipStr, subnets string) bool {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return false
	}

	// Split subnets by comma or newline
	subnetList := strings.FieldsFunc(subnets, func(r rune) bool {
		return r == ',' || r == '\n' || r == '\r'
	})

	for _, subnet := range subnetList {
		subnet = strings.TrimSpace(subnet)
		if subnet == "" {
			continue
		}

		_, network, err := net.ParseCIDR(subnet)
		if err != nil {
			continue
		}

		if network.Contains(ip) {
			return true
		}
	}

	return false
}

// ============================================
// Subscriber Bandwidth Rules Handlers
// ============================================

// GetBandwidthRules returns all bandwidth rules for a subscriber
func (h *SubscriberHandler) GetBandwidthRules(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid subscriber ID"})
	}

	// Verify subscriber exists
	var subscriber models.Subscriber
	if err := database.DB.First(&subscriber, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "Subscriber not found"})
	}

	var rules []models.SubscriberBandwidthRule
	database.DB.Where("subscriber_id = ?", id).Order("priority DESC, id ASC").Find(&rules)

	return c.JSON(fiber.Map{
		"success": true,
		"data":    rules,
	})
}

// GetCDNUpgrades returns available CDN speed upgrades for a subscriber
func (h *SubscriberHandler) GetCDNUpgrades(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid subscriber ID"})
	}

	// Get subscriber with service
	var subscriber models.Subscriber
	if err := database.DB.Preload("Service").First(&subscriber, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "Subscriber not found"})
	}

	// Get current service's CDN configurations
	type ServiceCDN struct {
		ID         uint   `json:"id"`
		CDNID      uint   `json:"cdn_id"`
		CDNName    string `json:"cdn_name"`
		SpeedLimit int64  `json:"speed_limit"`
		ServiceID  uint   `json:"service_id"`
		ServiceName string `json:"service_name"`
	}

	var currentCDNs []ServiceCDN
	database.DB.Raw(`
		SELECT sc.id, sc.cdn_id, c.name as cdn_name, sc.speed_limit, sc.service_id, s.name as service_name
		FROM service_cdns sc
		JOIN cdns c ON sc.cdn_id = c.id
		JOIN services s ON sc.service_id = s.id
		WHERE sc.service_id = ? AND sc.is_active = true
	`, subscriber.ServiceID).Scan(&currentCDNs)

	// Build map of current CDN speeds
	currentSpeeds := make(map[uint]int64)
	for _, cdn := range currentCDNs {
		currentSpeeds[cdn.CDNID] = cdn.SpeedLimit
	}

	// Get all CDN upgrades (higher speeds from any service)
	var upgrades []ServiceCDN
	database.DB.Raw(`
		SELECT sc.id, sc.cdn_id, c.name as cdn_name, sc.speed_limit, sc.service_id, s.name as service_name
		FROM service_cdns sc
		JOIN cdns c ON sc.cdn_id = c.id
		JOIN services s ON sc.service_id = s.id
		WHERE sc.is_active = true AND s.is_active = true
		ORDER BY c.name, sc.speed_limit
	`).Scan(&upgrades)

	// Filter to only include upgrades (higher speeds than current)
	var availableUpgrades []map[string]interface{}
	for _, upgrade := range upgrades {
		currentSpeed, exists := currentSpeeds[upgrade.CDNID]
		// Include if: it's a higher speed, OR it's a CDN the user doesn't have yet
		if upgrade.SpeedLimit > currentSpeed || !exists {
			availableUpgrades = append(availableUpgrades, map[string]interface{}{
				"cdn_id":       upgrade.CDNID,
				"cdn_name":     upgrade.CDNName,
				"speed_limit":  upgrade.SpeedLimit,
				"service_id":   upgrade.ServiceID,
				"service_name": upgrade.ServiceName,
				"label":        fmt.Sprintf("%s - %dM (from %s)", upgrade.CDNName, upgrade.SpeedLimit, upgrade.ServiceName),
			})
		}
	}

	return c.JSON(fiber.Map{
		"success":        true,
		"current_cdns":   currentCDNs,
		"available_upgrades": availableUpgrades,
	})
}

// CreateBandwidthRule creates a new bandwidth rule for a subscriber
func (h *SubscriberHandler) CreateBandwidthRule(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid subscriber ID"})
	}

	// Verify subscriber exists
	var subscriber models.Subscriber
	if err := database.DB.First(&subscriber, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "Subscriber not found"})
	}

	var req struct {
		RuleType      string `json:"rule_type"`
		Enabled       bool   `json:"enabled"`
		DownloadSpeed int    `json:"download_speed"`
		UploadSpeed   int    `json:"upload_speed"`
		CDNID         uint   `json:"cdn_id"`
		Duration      string `json:"duration"` // "1h", "2h", "6h", "12h", "1d", "2d", "7d", "permanent"
		Priority      int    `json:"priority"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid request body"})
	}

	// Validate rule type
	if req.RuleType != "internet" && req.RuleType != "cdn" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Rule type must be 'internet' or 'cdn'"})
	}

	// Look up CDN name if cdn_id is provided
	var cdnName string
	if req.CDNID > 0 {
		var cdn models.CDN
		if err := database.DB.First(&cdn, req.CDNID).Error; err == nil {
			cdnName = cdn.Name
		}
	}

	// Calculate expires_at from duration
	var expiresAt *time.Time
	if req.Duration != "" && req.Duration != "permanent" {
		expiry, err := parseDuration(req.Duration)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid duration format"})
		}
		expiresAt = &expiry
	}

	rule := models.SubscriberBandwidthRule{
		SubscriberID:  uint(id),
		RuleType:      models.SubscriberBandwidthRuleType(req.RuleType),
		Enabled:       req.Enabled,
		DownloadSpeed: req.DownloadSpeed,
		UploadSpeed:   req.UploadSpeed,
		CDNID:         req.CDNID,
		CDNName:       cdnName,
		Duration:      req.Duration,
		ExpiresAt:     expiresAt,
		Priority:      req.Priority,
	}

	if err := database.DB.Create(&rule).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "Failed to create rule"})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Bandwidth rule created",
		"data":    rule,
	})
}

// parseDuration parses duration strings like "1h", "2h", "1d", "2d" and returns the expiry time
func parseDuration(duration string) (time.Time, error) {
	now := time.Now()

	// Handle days format (e.g., "1d", "2d", "7d")
	if strings.HasSuffix(duration, "d") {
		days, err := strconv.Atoi(strings.TrimSuffix(duration, "d"))
		if err != nil {
			return time.Time{}, err
		}
		return now.Add(time.Duration(days) * 24 * time.Hour), nil
	}

	// Handle hours format (e.g., "1h", "2h", "6h", "12h")
	if strings.HasSuffix(duration, "h") {
		hours, err := strconv.Atoi(strings.TrimSuffix(duration, "h"))
		if err != nil {
			return time.Time{}, err
		}
		return now.Add(time.Duration(hours) * time.Hour), nil
	}

	return time.Time{}, fmt.Errorf("invalid duration format: %s", duration)
}

// UpdateBandwidthRule updates a bandwidth rule
func (h *SubscriberHandler) UpdateBandwidthRule(c *fiber.Ctx) error {
	subscriberID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid subscriber ID"})
	}

	ruleID, err := strconv.Atoi(c.Params("ruleId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid rule ID"})
	}

	var rule models.SubscriberBandwidthRule
	if err := database.DB.Where("id = ? AND subscriber_id = ?", ruleID, subscriberID).First(&rule).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "Rule not found"})
	}

	var req struct {
		RuleType      string  `json:"rule_type"`
		Enabled       *bool   `json:"enabled"`
		DownloadSpeed *int    `json:"download_speed"`
		UploadSpeed   *int    `json:"upload_speed"`
		CDNID         *uint   `json:"cdn_id"`
		Duration      *string `json:"duration"` // "1h", "2h", "6h", "12h", "1d", "2d", "7d", "permanent"
		Priority      *int    `json:"priority"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid request body"})
	}

	updates := make(map[string]interface{})

	if req.RuleType != "" {
		if req.RuleType != "internet" && req.RuleType != "cdn" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Rule type must be 'internet' or 'cdn'"})
		}
		updates["rule_type"] = req.RuleType
	}
	if req.Enabled != nil {
		updates["enabled"] = *req.Enabled
	}
	if req.DownloadSpeed != nil {
		updates["download_speed"] = *req.DownloadSpeed
	}
	if req.UploadSpeed != nil {
		updates["upload_speed"] = *req.UploadSpeed
	}
	// Handle CDN ID update
	if req.CDNID != nil {
		updates["cdn_id"] = *req.CDNID
		if *req.CDNID > 0 {
			var cdn models.CDN
			if err := database.DB.First(&cdn, *req.CDNID).Error; err == nil {
				updates["cdn_name"] = cdn.Name
			}
		} else {
			updates["cdn_name"] = ""
		}
	}
	// Handle duration update
	if req.Duration != nil {
		updates["duration"] = *req.Duration
		if *req.Duration == "" || *req.Duration == "permanent" {
			updates["expires_at"] = nil
		} else {
			expiry, err := parseDuration(*req.Duration)
			if err != nil {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid duration format"})
			}
			updates["expires_at"] = expiry
		}
	}
	if req.Priority != nil {
		updates["priority"] = *req.Priority
	}

	if err := database.DB.Model(&rule).Updates(updates).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "Failed to update rule"})
	}

	// Reload rule
	database.DB.First(&rule, ruleID)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Bandwidth rule updated",
		"data":    rule,
	})
}

// DeleteBandwidthRule deletes a bandwidth rule
func (h *SubscriberHandler) DeleteBandwidthRule(c *fiber.Ctx) error {
	subscriberID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid subscriber ID"})
	}

	ruleID, err := strconv.Atoi(c.Params("ruleId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid rule ID"})
	}

	result := database.DB.Where("id = ? AND subscriber_id = ?", ruleID, subscriberID).Delete(&models.SubscriberBandwidthRule{})
	if result.RowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "Rule not found"})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Bandwidth rule deleted",
	})
}

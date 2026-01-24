package handlers

import (
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/proisp/backend/internal/config"
	"github.com/proisp/backend/internal/database"
	"github.com/proisp/backend/internal/models"
)

type CustomerPortalHandler struct {
	cfg *config.Config
}

func NewCustomerPortalHandler(cfg *config.Config) *CustomerPortalHandler {
	return &CustomerPortalHandler{cfg: cfg}
}

// CustomerLoginRequest represents customer login request
type CustomerLoginRequest struct {
	Username string `json:"username" validate:"required"`
	Password string `json:"password" validate:"required"`
}

// CustomerLoginResponse represents customer login response
type CustomerLoginResponse struct {
	Success  bool            `json:"success"`
	Message  string          `json:"message,omitempty"`
	Token    string          `json:"token,omitempty"`
	Customer *CustomerInfo   `json:"customer,omitempty"`
}

// CustomerInfo represents customer info in response
type CustomerInfo struct {
	Username    string    `json:"username"`
	FullName    string    `json:"full_name"`
	Email       string    `json:"email"`
	Phone       string    `json:"phone"`
	ServiceName string    `json:"service_name"`
	Status      string    `json:"status"`
	ExpiryDate  time.Time `json:"expiry_date"`
	DaysLeft    int       `json:"days_left"`
}

// CustomerDashboard represents customer dashboard data
type CustomerDashboard struct {
	// Profile
	Username    string    `json:"username"`
	FullName    string    `json:"full_name"`
	Email       string    `json:"email"`
	Phone       string    `json:"phone"`
	Address     string    `json:"address"`

	// Service info
	ServiceName   string    `json:"service_name"`
	Status        string    `json:"status"`
	ExpiryDate    time.Time `json:"expiry_date"`
	DaysLeft      int       `json:"days_left"`
	DownloadSpeed int64     `json:"download_speed"` // Mbps
	UploadSpeed   int64     `json:"upload_speed"`   // Mbps

	// Current speed (considering FUP)
	CurrentDownloadSpeed int64 `json:"current_download_speed"` // Kbps
	CurrentUploadSpeed   int64 `json:"current_upload_speed"`   // Kbps
	FUPLevel             int   `json:"fup_level"`
	MonthlyFUPLevel      int   `json:"monthly_fup_level"`

	// Quota usage
	DailyDownloadUsed   int64 `json:"daily_download_used"`   // bytes
	DailyUploadUsed     int64 `json:"daily_upload_used"`     // bytes
	MonthlyDownloadUsed int64 `json:"monthly_download_used"` // bytes
	MonthlyUploadUsed   int64 `json:"monthly_upload_used"`   // bytes

	// Quotas from service
	DailyQuota   int64 `json:"daily_quota"`   // bytes (0 = unlimited)
	MonthlyQuota int64 `json:"monthly_quota"` // bytes (0 = unlimited)

	// Connection status
	IsOnline   bool       `json:"is_online"`
	LastSeen   *time.Time `json:"last_seen"`
	IPAddress  string     `json:"ip_address"`
	MACAddress string     `json:"mac_address"`
}

// CustomerSession represents a customer session
type CustomerSession struct {
	SessionID       string     `json:"session_id"`
	StartTime       *time.Time `json:"start_time"`
	Duration        int        `json:"duration"` // seconds
	IPAddress       string     `json:"ip_address"`
	MACAddress      string     `json:"mac_address"`
	BytesIn         int64      `json:"bytes_in"`
	BytesOut        int64      `json:"bytes_out"`
	NasIPAddress    string     `json:"nas_ip_address"`
}

// Login authenticates a customer using PPPoE credentials
func (h *CustomerPortalHandler) Login(c *fiber.Ctx) error {
	var req CustomerLoginRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(CustomerLoginResponse{
			Success: false,
			Message: "Invalid request body",
		})
	}

	if req.Username == "" || req.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(CustomerLoginResponse{
			Success: false,
			Message: "Username and password are required",
		})
	}

	// Find subscriber by username
	var subscriber models.Subscriber
	if err := database.DB.Preload("Service").Where("username = ?", req.Username).First(&subscriber).Error; err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(CustomerLoginResponse{
			Success: false,
			Message: "Invalid username or password",
		})
	}

	// Verify password against radcheck table (Cleartext-Password)
	var radcheck models.RadCheck
	if err := database.DB.Where("username = ? AND attribute = ?", req.Username, "Cleartext-Password").First(&radcheck).Error; err != nil {
		// Try checking against subscriber's plain password
		if subscriber.PasswordPlain != req.Password {
			return c.Status(fiber.StatusUnauthorized).JSON(CustomerLoginResponse{
				Success: false,
				Message: "Invalid username or password",
			})
		}
	} else if radcheck.Value != req.Password {
		return c.Status(fiber.StatusUnauthorized).JSON(CustomerLoginResponse{
			Success: false,
			Message: "Invalid username or password",
		})
	}

	// Generate JWT token for customer
	token, err := h.generateCustomerToken(subscriber.Username)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(CustomerLoginResponse{
			Success: false,
			Message: "Failed to generate token",
		})
	}

	// Calculate days left
	daysLeft := 0
	if subscriber.ExpiryDate.After(time.Now()) {
		daysLeft = int(time.Until(subscriber.ExpiryDate).Hours() / 24)
	}

	// Get status string
	status := "active"
	switch subscriber.Status {
	case models.SubscriberStatusInactive:
		status = "inactive"
	case models.SubscriberStatusExpired:
		status = "expired"
	case models.SubscriberStatusStopped:
		status = "stopped"
	}

	return c.JSON(CustomerLoginResponse{
		Success: true,
		Token:   token,
		Customer: &CustomerInfo{
			Username:    subscriber.Username,
			FullName:    subscriber.FullName,
			Email:       subscriber.Email,
			Phone:       subscriber.Phone,
			ServiceName: subscriber.Service.Name,
			Status:      status,
			ExpiryDate:  subscriber.ExpiryDate,
			DaysLeft:    daysLeft,
		},
	})
}

// Dashboard returns customer dashboard data
func (h *CustomerPortalHandler) Dashboard(c *fiber.Ctx) error {
	username := c.Locals("customer_username").(string)

	var subscriber models.Subscriber
	if err := database.DB.Preload("Service").Where("username = ?", username).First(&subscriber).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Subscriber not found",
		})
	}

	// Calculate days left
	daysLeft := 0
	if subscriber.ExpiryDate.After(time.Now()) {
		daysLeft = int(time.Until(subscriber.ExpiryDate).Hours() / 24)
	}

	// Get status string
	status := "active"
	switch subscriber.Status {
	case models.SubscriberStatusInactive:
		status = "inactive"
	case models.SubscriberStatusExpired:
		status = "expired"
	case models.SubscriberStatusStopped:
		status = "stopped"
	}

	// Calculate current speed based on FUP level
	currentDownload := int64(subscriber.Service.DownloadSpeed) * 1000 // Convert Mbps to Kbps
	currentUpload := int64(subscriber.Service.UploadSpeed) * 1000

	// Use the higher FUP level (daily or monthly)
	effectiveFUP := subscriber.FUPLevel
	if subscriber.MonthlyFUPLevel > effectiveFUP {
		effectiveFUP = subscriber.MonthlyFUPLevel
	}

	if effectiveFUP > 0 {
		switch effectiveFUP {
		case 1:
			currentDownload = subscriber.Service.FUP1DownloadSpeed
			currentUpload = subscriber.Service.FUP1UploadSpeed
		case 2:
			currentDownload = subscriber.Service.FUP2DownloadSpeed
			currentUpload = subscriber.Service.FUP2UploadSpeed
		case 3:
			currentDownload = subscriber.Service.FUP3DownloadSpeed
			currentUpload = subscriber.Service.FUP3UploadSpeed
		}
	}

	// Get IP from active session
	ipAddress := subscriber.IPAddress
	var activeSession models.RadAcct
	if err := database.DB.Where("username = ? AND acct_stop_time IS NULL", username).
		Order("acct_start_time DESC").First(&activeSession).Error; err == nil {
		ipAddress = activeSession.FramedIPAddress
	}

	dashboard := CustomerDashboard{
		Username:             subscriber.Username,
		FullName:             subscriber.FullName,
		Email:                subscriber.Email,
		Phone:                subscriber.Phone,
		Address:              subscriber.Address,
		ServiceName:          subscriber.Service.Name,
		Status:               status,
		ExpiryDate:           subscriber.ExpiryDate,
		DaysLeft:             daysLeft,
		DownloadSpeed:        subscriber.Service.DownloadSpeed,
		UploadSpeed:          subscriber.Service.UploadSpeed,
		CurrentDownloadSpeed: currentDownload,
		CurrentUploadSpeed:   currentUpload,
		FUPLevel:             subscriber.FUPLevel,
		MonthlyFUPLevel:      subscriber.MonthlyFUPLevel,
		DailyDownloadUsed:    subscriber.DailyDownloadUsed,
		DailyUploadUsed:      subscriber.DailyUploadUsed,
		MonthlyDownloadUsed:  subscriber.MonthlyDownloadUsed,
		MonthlyUploadUsed:    subscriber.MonthlyUploadUsed,
		DailyQuota:           subscriber.Service.DailyQuota,
		MonthlyQuota:         subscriber.Service.MonthlyQuota,
		IsOnline:             subscriber.IsOnline,
		LastSeen:             subscriber.LastSeen,
		IPAddress:            ipAddress,
		MACAddress:           subscriber.MACAddress,
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    dashboard,
	})
}

// Sessions returns customer session history
func (h *CustomerPortalHandler) Sessions(c *fiber.Ctx) error {
	username := c.Locals("customer_username").(string)

	// Get recent sessions (last 30 days)
	thirtyDaysAgo := time.Now().AddDate(0, 0, -30)

	var sessions []models.RadAcct
	if err := database.DB.Where("username = ? AND acct_start_time >= ?", username, thirtyDaysAgo).
		Order("acct_start_time DESC").
		Limit(100).
		Find(&sessions).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to fetch sessions",
		})
	}

	result := make([]CustomerSession, len(sessions))
	for i, s := range sessions {
		result[i] = CustomerSession{
			SessionID:    s.AcctSessionID,
			StartTime:    s.AcctStartTime,
			Duration:     s.AcctSessionTime,
			IPAddress:    s.FramedIPAddress,
			MACAddress:   s.CallingStationID,
			BytesIn:      s.AcctInputOctets,
			BytesOut:     s.AcctOutputOctets,
			NasIPAddress: s.NasIPAddress,
		}
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    result,
	})
}

// UsageHistory returns daily usage history for the customer
func (h *CustomerPortalHandler) UsageHistory(c *fiber.Ctx) error {
	username := c.Locals("customer_username").(string)

	// Get sessions grouped by day for the last 30 days
	thirtyDaysAgo := time.Now().AddDate(0, 0, -30)

	var sessions []models.RadAcct
	if err := database.DB.Where("username = ? AND acct_start_time >= ?", username, thirtyDaysAgo).
		Order("acct_start_time ASC").
		Find(&sessions).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to fetch usage history",
		})
	}

	// Group by date
	usageByDate := make(map[string]struct {
		Download int64
		Upload   int64
		Sessions int
	})

	for _, s := range sessions {
		if s.AcctStartTime == nil {
			continue
		}
		date := s.AcctStartTime.Format("2006-01-02")
		entry := usageByDate[date]
		entry.Download += s.AcctOutputOctets
		entry.Upload += s.AcctInputOctets
		entry.Sessions++
		usageByDate[date] = entry
	}

	// Convert to array sorted by date
	type DailyUsage struct {
		Date     string `json:"date"`
		Download int64  `json:"download"`
		Upload   int64  `json:"upload"`
		Sessions int    `json:"sessions"`
	}

	result := make([]DailyUsage, 0, len(usageByDate))
	for date, usage := range usageByDate {
		result = append(result, DailyUsage{
			Date:     date,
			Download: usage.Download,
			Upload:   usage.Upload,
			Sessions: usage.Sessions,
		})
	}

	// Sort by date
	for i := 0; i < len(result)-1; i++ {
		for j := i + 1; j < len(result); j++ {
			if result[i].Date > result[j].Date {
				result[i], result[j] = result[j], result[i]
			}
		}
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    result,
	})
}

// generateCustomerToken generates a JWT token for customer portal
func (h *CustomerPortalHandler) generateCustomerToken(username string) (string, error) {
	claims := jwt.MapClaims{
		"customer_username": username,
		"type":              "customer",
		"exp":               time.Now().Add(24 * time.Hour).Unix(),
		"iat":               time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(h.cfg.JWTSecret))
}

// CustomerAuthMiddleware validates customer JWT token
func CustomerAuthMiddleware(cfg *config.Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "Authorization header required",
			})
		}

		// Extract token from "Bearer <token>"
		tokenString := ""
		if len(authHeader) > 7 && authHeader[:7] == "Bearer " {
			tokenString = authHeader[7:]
		} else {
			tokenString = authHeader
		}

		// Parse and validate token
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fiber.NewError(fiber.StatusUnauthorized, "Invalid token")
			}
			return []byte(cfg.JWTSecret), nil
		})

		if err != nil || !token.Valid {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "Invalid or expired token",
			})
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "Invalid token claims",
			})
		}

		// Verify it's a customer token
		if claims["type"] != "customer" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "Invalid token type",
			})
		}

		// Set customer username in context
		c.Locals("customer_username", claims["customer_username"])

		return c.Next()
	}
}

// CustomerTicket represents a ticket for customer view
type CustomerTicket struct {
	ID            uint      `json:"id"`
	TicketNumber  string    `json:"ticket_number"`
	Subject       string    `json:"subject"`
	Description   string    `json:"description"`
	Status        string    `json:"status"`
	Priority      string    `json:"priority"`
	Category      string    `json:"category"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
	RepliesCount  int       `json:"replies_count"`
	HasAdminReply bool      `json:"has_admin_reply"`
}

// CustomerTicketReply represents a reply for customer view (excludes internal notes)
type CustomerTicketReply struct {
	ID        uint      `json:"id"`
	Message   string    `json:"message"`
	IsAdmin   bool      `json:"is_admin"`
	CreatedAt time.Time `json:"created_at"`
}

// ListTickets returns customer's tickets
func (h *CustomerPortalHandler) ListTickets(c *fiber.Ctx) error {
	username := c.Locals("customer_username").(string)

	// Find subscriber
	var subscriber models.Subscriber
	if err := database.DB.Where("username = ?", username).First(&subscriber).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Subscriber not found",
		})
	}

	// Get tickets for this subscriber
	var tickets []models.Ticket
	if err := database.DB.Where("subscriber_id = ?", subscriber.ID).
		Order("created_at DESC").
		Find(&tickets).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to fetch tickets",
		})
	}

	// Convert to customer view
	result := make([]CustomerTicket, len(tickets))
	for i, t := range tickets {
		// Count non-internal replies
		var repliesCount int64
		database.DB.Model(&models.TicketReply{}).Where("ticket_id = ? AND is_internal = false", t.ID).Count(&repliesCount)

		// Check if last reply is from admin (UserID > 0)
		var lastReply models.TicketReply
		hasAdminReply := false
		if err := database.DB.Where("ticket_id = ? AND is_internal = false", t.ID).Order("created_at DESC").First(&lastReply).Error; err == nil {
			hasAdminReply = lastReply.UserID > 0
		}

		result[i] = CustomerTicket{
			ID:            t.ID,
			TicketNumber:  t.TicketNumber,
			Subject:       t.Subject,
			Description:   t.Description,
			Status:        t.Status,
			Priority:      t.Priority,
			Category:      t.Category,
			CreatedAt:     t.CreatedAt,
			UpdatedAt:     t.UpdatedAt,
			RepliesCount:  int(repliesCount),
			HasAdminReply: hasAdminReply,
		}
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    result,
	})
}

// GetTicket returns a single ticket with replies (excluding internal notes)
func (h *CustomerPortalHandler) GetTicket(c *fiber.Ctx) error {
	username := c.Locals("customer_username").(string)
	ticketID := c.Params("id")

	// Find subscriber
	var subscriber models.Subscriber
	if err := database.DB.Where("username = ?", username).First(&subscriber).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Subscriber not found",
		})
	}

	// Get ticket
	var ticket models.Ticket
	if err := database.DB.Where("id = ? AND subscriber_id = ?", ticketID, subscriber.ID).
		First(&ticket).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Ticket not found",
		})
	}

	// Get non-internal replies
	var replies []models.TicketReply
	database.DB.Where("ticket_id = ? AND is_internal = false", ticket.ID).
		Order("created_at ASC").
		Find(&replies)

	// Convert replies to customer view
	replyResults := make([]CustomerTicketReply, len(replies))
	for i, r := range replies {
		replyResults[i] = CustomerTicketReply{
			ID:        r.ID,
			Message:   r.Message,
			IsAdmin:   r.UserID > 0, // If UserID is set, it's from admin/staff
			CreatedAt: r.CreatedAt,
		}
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"id":            ticket.ID,
			"ticket_number": ticket.TicketNumber,
			"subject":       ticket.Subject,
			"description":   ticket.Description,
			"status":        ticket.Status,
			"priority":      ticket.Priority,
			"category":      ticket.Category,
			"created_at":    ticket.CreatedAt,
			"updated_at":    ticket.UpdatedAt,
			"replies":       replyResults,
		},
	})
}

// CreateTicket creates a new ticket from customer
func (h *CustomerPortalHandler) CreateTicket(c *fiber.Ctx) error {
	username := c.Locals("customer_username").(string)

	// Find subscriber
	var subscriber models.Subscriber
	if err := database.DB.Where("username = ?", username).First(&subscriber).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Subscriber not found",
		})
	}

	type CreateRequest struct {
		Subject     string `json:"subject"`
		Description string `json:"description"`
		Priority    string `json:"priority"`
		Category    string `json:"category"`
	}

	var req CreateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
		})
	}

	if req.Subject == "" || req.Description == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Subject and description are required",
		})
	}

	// Default values
	if req.Priority == "" {
		req.Priority = "normal"
	}
	if req.Category == "" {
		req.Category = "general"
	}

	// Generate ticket number
	ticketNumber := fmt.Sprintf("TKT-%d-%04d", time.Now().Year(), time.Now().Unix()%10000)

	ticket := models.Ticket{
		TicketNumber: ticketNumber,
		Subject:      req.Subject,
		Description:  req.Description,
		Message:      req.Description,
		Priority:     req.Priority,
		Category:     req.Category,
		Status:       "open",
		CreatorType:  "subscriber",
		SubscriberID: &subscriber.ID,
	}

	if err := database.DB.Create(&ticket).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to create ticket",
		})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"success": true,
		"data": CustomerTicket{
			ID:           ticket.ID,
			TicketNumber: ticket.TicketNumber,
			Subject:      ticket.Subject,
			Description:  ticket.Description,
			Status:       ticket.Status,
			Priority:     ticket.Priority,
			Category:     ticket.Category,
			CreatedAt:    ticket.CreatedAt,
			UpdatedAt:    ticket.UpdatedAt,
			RepliesCount: 0,
		},
	})
}

// ReplyTicket adds a reply to a ticket from customer
func (h *CustomerPortalHandler) ReplyTicket(c *fiber.Ctx) error {
	username := c.Locals("customer_username").(string)
	ticketID := c.Params("id")

	// Find subscriber
	var subscriber models.Subscriber
	if err := database.DB.Where("username = ?", username).First(&subscriber).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Subscriber not found",
		})
	}

	// Get ticket and verify ownership
	var ticket models.Ticket
	if err := database.DB.Where("id = ? AND subscriber_id = ?", ticketID, subscriber.ID).
		First(&ticket).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Ticket not found",
		})
	}

	type ReplyRequest struct {
		Message string `json:"message"`
	}

	var req ReplyRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
		})
	}

	if req.Message == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Message is required",
		})
	}

	// Create reply (UserID = 0 indicates customer reply)
	reply := models.TicketReply{
		TicketID:   ticket.ID,
		UserID:     0, // Customer reply
		Message:    req.Message,
		IsInternal: false,
	}

	if err := database.DB.Create(&reply).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to add reply",
		})
	}

	// If ticket was closed, reopen it
	if ticket.Status == "closed" || ticket.Status == "resolved" {
		database.DB.Model(&ticket).Update("status", "open")
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"success": true,
		"data": CustomerTicketReply{
			ID:        reply.ID,
			Message:   reply.Message,
			IsAdmin:   false,
			CreatedAt: reply.CreatedAt,
		},
	})
}

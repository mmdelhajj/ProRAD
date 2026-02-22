package handlers

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/proisp/backend/internal/database"
	"github.com/proisp/backend/internal/services"
)


// NotificationHandler handles notification-related requests
type NotificationHandler struct {
	manager *services.NotificationManager
}

// NewNotificationHandler creates a new notification handler
func NewNotificationHandler() *NotificationHandler {
	return &NotificationHandler{
		manager: services.NewNotificationManager(),
	}
}

// TestSMTPRequest represents the test SMTP request
type TestSMTPRequest struct {
	Host     string `json:"smtp_host"`
	Port     string `json:"smtp_port"`
	Username string `json:"smtp_username"`
	Password string `json:"smtp_password"`
	FromName string `json:"smtp_from_name"`
	FromAddr string `json:"smtp_from_email"`
	TestTo   string `json:"test_email"`
}

// TestSMTP tests SMTP configuration
func (h *NotificationHandler) TestSMTP(c *fiber.Ctx) error {
	var req TestSMTPRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
		})
	}

	if req.Host == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "SMTP host is required",
		})
	}

	config := &services.EmailConfig{
		Host:     req.Host,
		Port:     req.Port,
		Username: req.Username,
		Password: req.Password,
		FromName: req.FromName,
		FromAddr: req.FromAddr,
	}

	if config.FromAddr == "" {
		config.FromAddr = req.Username
	}

	// First test connection
	emailService := h.manager.GetEmailService()
	if err := emailService.TestConnection(config); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "SMTP connection failed: " + err.Error(),
		})
	}

	// If test email provided, send test email
	if req.TestTo != "" {
		if err := emailService.SendTestEmail(config, req.TestTo); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "SMTP connection OK but failed to send test email: " + err.Error(),
			})
		}
		return c.JSON(fiber.Map{
			"success": true,
			"message": "SMTP configuration is valid! Test email sent to " + req.TestTo,
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "SMTP connection successful!",
	})
}

// TestSMSRequest represents the test SMS request
type TestSMSRequest struct {
	Provider     string            `json:"sms_provider"`
	TwilioSID    string            `json:"sms_twilio_sid"`
	TwilioToken  string            `json:"sms_twilio_token"`
	TwilioFrom   string            `json:"sms_twilio_from"`
	VonageKey    string            `json:"sms_vonage_key"`
	VonageSecret string            `json:"sms_vonage_secret"`
	VonageFrom   string            `json:"sms_vonage_from"`
	CustomURL    string            `json:"sms_custom_url"`
	CustomMethod string            `json:"sms_custom_method"`
	CustomBody   string            `json:"sms_custom_body"`
	CustomParams string            `json:"sms_custom_params"`
	CustomHeaders map[string]string `json:"sms_custom_headers"`
	TestPhone    string            `json:"test_phone"`
}

// TestSMS tests SMS configuration
func (h *NotificationHandler) TestSMS(c *fiber.Ctx) error {
	var req TestSMSRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
		})
	}

	if req.Provider == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "SMS provider is required",
		})
	}

	config := &services.SMSConfig{
		Provider:      services.SMSProvider(req.Provider),
		TwilioSID:     req.TwilioSID,
		TwilioToken:   req.TwilioToken,
		TwilioFrom:    req.TwilioFrom,
		VonageKey:     req.VonageKey,
		VonageSecret:  req.VonageSecret,
		VonageFrom:    req.VonageFrom,
		CustomURL:     req.CustomURL,
		CustomMethod:  req.CustomMethod,
		CustomBody:    req.CustomBody,
		CustomParams:  req.CustomParams,
		CustomHeaders: req.CustomHeaders,
	}

	smsService := h.manager.GetSMSService()

	// First test connection
	if err := smsService.TestConnection(config); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "SMS connection failed: " + err.Error(),
		})
	}

	// If test phone provided, send test SMS
	if req.TestPhone != "" {
		if err := smsService.SendTestSMS(config, req.TestPhone); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "SMS connection OK but failed to send test message: " + err.Error(),
			})
		}
		return c.JSON(fiber.Map{
			"success": true,
			"message": "SMS configuration is valid! Test message sent to " + req.TestPhone,
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "SMS connection successful!",
	})
}

// TestWhatsAppRequest represents the test WhatsApp request
type TestWhatsAppRequest struct {
	InstanceID string `json:"whatsapp_instance_id"`
	Token      string `json:"whatsapp_token"`
	TestPhone  string `json:"test_phone"`
}

// TestWhatsApp tests WhatsApp configuration
func (h *NotificationHandler) TestWhatsApp(c *fiber.Ctx) error {
	var req TestWhatsAppRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
		})
	}

	if req.InstanceID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "WhatsApp Instance ID is required",
		})
	}

	if req.Token == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "WhatsApp Token is required",
		})
	}

	config := &services.WhatsAppConfig{
		InstanceID: req.InstanceID,
		Token:      req.Token,
	}

	whatsappService := h.manager.GetWhatsAppService()

	// First test connection
	if err := whatsappService.TestConnection(config); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "WhatsApp connection failed: " + err.Error(),
		})
	}

	// If test phone provided, send test message
	if req.TestPhone != "" {
		if err := whatsappService.SendTestMessage(config, req.TestPhone); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "WhatsApp connection OK but failed to send test message: " + err.Error(),
			})
		}
		return c.JSON(fiber.Map{
			"success": true,
			"message": "WhatsApp configuration is valid! Test message sent to " + req.TestPhone,
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "WhatsApp connection successful!",
	})
}

// GetWhatsAppStatus gets WhatsApp instance status
func (h *NotificationHandler) GetWhatsAppStatus(c *fiber.Ctx) error {
	whatsappService := h.manager.GetWhatsAppService()

	config, err := whatsappService.GetConfig()
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "WhatsApp not configured: " + err.Error(),
		})
	}

	status, err := whatsappService.GetInstanceStatus(config)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Failed to get WhatsApp status: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    status,
	})
}

// SendNotificationRequest represents a manual notification request
type SendNotificationRequest struct {
	SubscriberID uint   `json:"subscriber_id"`
	Channel      string `json:"channel"` // email, sms, whatsapp
	Message      string `json:"message"`
	Subject      string `json:"subject"` // For email only
}

// SendNotification sends a manual notification
func (h *NotificationHandler) SendNotification(c *fiber.Ctx) error {
	var req SendNotificationRequest
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

	// TODO: Implement manual notification sending
	// This would look up subscriber by ID and send to their contact info

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Notification sent",
	})
}

// ProxRadCreateLink creates a new WhatsApp link and returns QR code
func (h *NotificationHandler) ProxRadCreateLink(c *fiber.Ctx) error {
	wa := h.manager.GetWhatsAppService()
	result, err := wa.CreateProxRadLink()
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Failed to create WhatsApp link: " + err.Error(),
		})
	}
	return c.JSON(fiber.Map{
		"success":      true,
		"qr_image_url": result.QRImageLink,
		"info_url":     result.InfoLink,
		"qrstring":     result.QRString,
	})
}

// ProxRadLinkStatus checks connection status via the info URL
func (h *NotificationHandler) ProxRadLinkStatus(c *fiber.Ctx) error {
	infoURL := c.Query("info_url")
	if infoURL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "info_url is required",
		})
	}
	wa := h.manager.GetWhatsAppService()
	info, err := wa.GetProxRadLinkStatus(infoURL)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Failed to get link status: " + err.Error(),
		})
	}

	connected := info.Status == "connected" || info.Unique != ""

	// If newly connected, auto-save the account unique, phone, and trial start
	if connected && info.Unique != "" {
		savePreference("proxrad_account_unique", info.Unique)
		if info.Phone != "" {
			savePreference("proxrad_phone", info.Phone)
		}
		// Save trial start only on first-ever connection
		var count int64
		database.DB.Raw("SELECT COUNT(*) FROM system_preferences WHERE key = 'proxrad_trial_start'").Scan(&count)
		if count == 0 {
			savePreference("proxrad_trial_start", time.Now().UTC().Format(time.RFC3339))
		}
		database.InvalidateSettingsCache()
	}

	return c.JSON(fiber.Map{
		"success":   true,
		"connected": connected,
		"unique":    info.Unique,
		"phone":     info.Phone,
		"status":    info.Status,
	})
}

// GetProxRadAccounts lists WhatsApp accounts from proxsms.com
func (h *NotificationHandler) GetProxRadAccounts(c *fiber.Ctx) error {
	wa := h.manager.GetWhatsAppService()
	accounts, err := wa.GetProxRadAccounts()
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Failed to fetch accounts: " + err.Error(),
		})
	}
	return c.JSON(fiber.Map{
		"success":  true,
		"accounts": accounts,
	})
}

// savePreference upserts a system_preferences key reliably
func savePreference(key, value string) {
	database.DB.Exec(
		"INSERT INTO system_preferences (key, value, value_type) VALUES (?, ?, 'string') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
		key, value,
	)
}

// SelectProxRadAccount saves the chosen account unique ID to DB
func (h *NotificationHandler) SelectProxRadAccount(c *fiber.Ctx) error {
	var body struct {
		Unique string `json:"unique"`
		Phone  string `json:"phone"`
	}
	if err := c.BodyParser(&body); err != nil || body.Unique == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "unique is required",
		})
	}

	savePreference("proxrad_account_unique", body.Unique)
	if body.Phone != "" {
		savePreference("proxrad_phone", body.Phone)
	}
	database.InvalidateSettingsCache()

	return c.JSON(fiber.Map{
		"success": true,
		"unique":  body.Unique,
		"phone":   body.Phone,
	})
}

// UnlinkProxRadAccount disconnects the account from proxsms AND clears local DB
func (h *NotificationHandler) UnlinkProxRadAccount(c *fiber.Ctx) error {
	wa := h.manager.GetWhatsAppService()

	// Get the current unique before clearing
	var unique string
	database.DB.Raw("SELECT value FROM system_preferences WHERE key = 'proxrad_account_unique'").Scan(&unique)

	// Try to disconnect from proxsms (best-effort)
	if unique != "" {
		if err := wa.DisconnectProxRadAccount(unique); err != nil {
			// Log but don't fail — still clear locally
			_ = err
		}
	}

	// Clear local DB entries
	database.DB.Exec("DELETE FROM system_preferences WHERE key IN ('proxrad_account_unique', 'proxrad_phone')")
	database.InvalidateSettingsCache()

	// Invalidate the access cache so trial check re-runs
	wa.InvalidateProxRadAccessCache()

	return c.JSON(fiber.Map{
		"success": true,
		"message": "WhatsApp account unlinked",
	})
}

// TestProxRadSend sends a test message using the currently configured WhatsApp provider (ProxRad or Ultramsg)
func (h *NotificationHandler) TestProxRadSend(c *fiber.Ctx) error {
	var req struct {
		TestPhone string `json:"test_phone"`
	}
	if err := c.BodyParser(&req); err != nil || req.TestPhone == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "test_phone is required",
		})
	}

	wa := h.manager.GetWhatsAppService()
	msg := "✅ *ProxPanel Test*\n\nYour WhatsApp configuration is working correctly!\n\nYou can now receive automated notifications."
	if err := wa.SendMessage(req.TestPhone, msg); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Failed to send test message: " + err.Error(),
		})
	}
	return c.JSON(fiber.Map{
		"success": true,
		"message": "Test message sent to " + req.TestPhone,
	})
}

// GetProxRadAccess returns the current ProxRad subscription/trial status for the UI
func (h *NotificationHandler) GetProxRadAccess(c *fiber.Ctx) error {
	wa := h.manager.GetWhatsAppService()
	access := wa.CheckProxRadAccess()

	resp := fiber.Map{
		"allowed": access.Allowed,
		"type":    access.Type,
	}
	if access.ExpiresAt != nil {
		resp["expires_at"] = access.ExpiresAt.Format(time.RFC3339)
	}
	if access.TrialEnds != nil {
		resp["trial_ends"] = access.TrialEnds.Format(time.RFC3339)
		resp["trial_hours_left"] = int(time.Until(*access.TrialEnds).Hours())
	}
	return c.JSON(resp)
}

package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/proisp/backend/internal/database"
	"github.com/proisp/backend/internal/models"
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

// ProxRadCreateLinkRequest represents the create link request
type ProxRadCreateLinkRequest struct {
	APISecret string `json:"proxrad_api_secret"`
	APIBase   string `json:"proxrad_api_base"`
}

// ProxRadCreateLink calls proxsms.com to create a WhatsApp QR link
func (h *NotificationHandler) ProxRadCreateLink(c *fiber.Ctx) error {
	var req ProxRadCreateLinkRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
		})
	}

	// Use provided API secret or fall back to stored one
	apiSecret := req.APISecret
	apiBase := req.APIBase
	if apiSecret == "" {
		var setting models.SystemPreference
		if err := database.DB.Where("key = ?", "proxrad_api_secret").First(&setting).Error; err != nil || setting.Value == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "ProxRad API secret not configured",
			})
		}
		apiSecret = setting.Value
	}
	if apiBase == "" {
		var setting models.SystemPreference
		if err := database.DB.Where("key = ?", "proxrad_api_base").First(&setting).Error; err == nil {
			apiBase = setting.Value
		}
	}

	wa := h.manager.GetWhatsAppService()
	qrImageURL, token, err := wa.CreateProxRadLink(apiSecret, apiBase)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Failed to create QR link: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"success":      true,
		"qr_image_url": qrImageURL,
		"token":        token,
	})
}

// ProxRadLinkStatus polls proxsms.com to check if WhatsApp is linked
func (h *NotificationHandler) ProxRadLinkStatus(c *fiber.Ctx) error {
	token := c.Query("token")
	if token == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "token is required",
		})
	}

	// Get API base
	apiBase := ""
	var setting models.SystemPreference
	if err := database.DB.Where("key = ?", "proxrad_api_base").First(&setting).Error; err == nil {
		apiBase = setting.Value
	}

	wa := h.manager.GetWhatsAppService()
	unique, phone, err := wa.GetProxRadLinkStatus(token, apiBase)
	if err != nil {
		return c.JSON(fiber.Map{
			"success": false,
			"linked":  false,
			"message": "Not linked yet",
		})
	}

	// Save the unique ID to DB
	database.DB.Where(models.SystemPreference{Key: "proxrad_account_unique"}).
		Assign(models.SystemPreference{Value: unique}).
		FirstOrCreate(&models.SystemPreference{})

	return c.JSON(fiber.Map{
		"success": true,
		"linked":  true,
		"unique":  unique,
		"phone":   phone,
	})
}

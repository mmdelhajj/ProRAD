package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/smtp"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// NotificationHandler handles update notification operations
type NotificationHandler struct {
	DB *gorm.DB
}

// NewNotificationHandler creates a new notification handler
func NewNotificationHandler(db *gorm.DB) *NotificationHandler {
	return &NotificationHandler{DB: db}
}

// SendUpdateNotificationRequest represents the request to send notifications
type SendUpdateNotificationRequest struct {
	Version      string   `json:"version" validate:"required"`
	Priority     string   `json:"priority" validate:"required,oneof=critical important info"`
	Subject      string   `json:"subject" validate:"required"`
	Message      string   `json:"message" validate:"required"`
	Filter       string   `json:"filter" validate:"oneof=all tier outdated"` // all, tier, outdated
	FilterValue  string   `json:"filter_value"` // tier name or version number
	Channels     []string `json:"channels" validate:"required,dive,oneof=email sms in-app"`
	AutoSend     bool     `json:"auto_send"` // If true, send immediately; if false, save as draft
}

// SendUpdateNotification sends notifications to all matching customers
func (h *NotificationHandler) SendUpdateNotification(c *fiber.Ctx) error {
	var req SendUpdateNotificationRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
			"error":   err.Error(),
		})
	}

	// Get update record
	var update Update
	if err := h.DB.Where("version = ?", req.Version).First(&update).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Update version not found",
		})
	}

	// Get matching activations based on filter
	var activations []Activation
	query := h.DB.Preload("License").Preload("License.Customer")

	switch req.Filter {
	case "tier":
		// Filter by tier
		query = query.Joins("JOIN licenses ON activations.license_id = licenses.id").
			Joins("JOIN license_tiers ON licenses.tier_id = license_tiers.id").
			Where("license_tiers.name = ?", req.FilterValue)
	case "outdated":
		// Filter by version (older than specified)
		query = query.Where("version < ?", req.FilterValue)
	default:
		// All active customers
		query = query.Where("is_active = ?", true)
	}

	if err := query.Find(&activations).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to fetch customers",
			"error":   err.Error(),
		})
	}

	if len(activations) == 0 {
		return c.Status(fiber.StatusOK).JSON(fiber.Map{
			"success": true,
			"message": "No customers match the filter criteria",
			"count":   0,
		})
	}

	// Create notification records
	var notifications []UpdateNotification
	for _, activation := range activations {
		for _, channel := range req.Channels {
			notification := UpdateNotification{
				UpdateID:         update.ID,
				LicenseID:        activation.LicenseID,
				CustomerID:       activation.License.CustomerID,
				NotificationType: channel,
				Status:           "pending",
				CreatedAt:        time.Now(),
				UpdatedAt:        time.Now(),
			}
			notifications = append(notifications, notification)
		}
	}

	// Save notifications to database
	if err := h.DB.CreateInBatches(notifications, 100).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to create notifications",
			"error":   err.Error(),
		})
	}

	// Send notifications asynchronously if auto_send is true
	if req.AutoSend {
		go h.sendNotificationsAsync(notifications, update, req)
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"success":       true,
		"message":       fmt.Sprintf("Notifications queued for %d customers", len(activations)),
		"count":         len(activations),
		"notifications": len(notifications),
	})
}

// sendNotificationsAsync sends notifications in the background
func (h *NotificationHandler) sendNotificationsAsync(notifications []UpdateNotification, update Update, req SendUpdateNotificationRequest) {
	for i := range notifications {
		notification := &notifications[i]

		var err error
		switch notification.NotificationType {
		case "email":
			err = h.sendEmailNotification(notification, update, req)
		case "sms":
			err = h.sendSMSNotification(notification, update, req)
		case "in-app":
			// In-app notifications are passive (customer polls for them)
			notification.Status = "sent"
			notification.SentAt = &time.Time{}
			*notification.SentAt = time.Now()
		}

		if err != nil {
			notification.Status = "failed"
			notification.ErrorMessage = err.Error()
			log.Printf("ERROR: Failed to send notification ID %d: %v", notification.ID, err)
		} else {
			notification.Status = "sent"
			now := time.Now()
			notification.SentAt = &now
		}

		notification.UpdatedAt = time.Now()
		h.DB.Save(notification)
	}
}

// sendEmailNotification sends an email notification
func (h *NotificationHandler) sendEmailNotification(notification *UpdateNotification, update Update, req SendUpdateNotificationRequest) error {
	// Get SMTP settings from system_preferences
	smtpSettings := h.getSMTPSettings()
	if !smtpSettings["enabled"].(bool) {
		return fmt.Errorf("SMTP is not enabled")
	}

	// Get customer email
	var customer Customer
	if err := h.DB.First(&customer, notification.CustomerID).Error; err != nil {
		return fmt.Errorf("customer not found: %v", err)
	}

	if customer.Email == "" {
		return fmt.Errorf("customer has no email address")
	}

	// Build email content
	emailBody := h.buildEmailHTML(update, req, customer)

	// Send email via SMTP
	auth := smtp.PlainAuth("",
		smtpSettings["user"].(string),
		smtpSettings["password"].(string),
		smtpSettings["host"].(string),
	)

	from := fmt.Sprintf("%s <%s>", smtpSettings["from_name"].(string), smtpSettings["from_address"].(string))
	to := []string{customer.Email}
	subject := req.Subject

	msg := []byte(fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s",
		from, customer.Email, subject, emailBody))

	addr := fmt.Sprintf("%s:%s", smtpSettings["host"].(string), smtpSettings["port"].(string))
	err := smtp.SendMail(addr, auth, smtpSettings["from_address"].(string), to, msg)

	if err != nil {
		return fmt.Errorf("failed to send email: %v", err)
	}

	log.Printf("INFO: Email notification sent to %s (customer %s)", customer.Email, customer.Name)
	return nil
}

// sendSMSNotification sends an SMS notification (placeholder)
func (h *NotificationHandler) sendSMSNotification(notification *UpdateNotification, update Update, req SendUpdateNotificationRequest) error {
	// TODO: Implement SMS gateway integration (Twilio, AWS SNS, etc.)
	log.Printf("INFO: SMS notification would be sent for notification ID %d", notification.ID)
	return fmt.Errorf("SMS notifications not yet implemented")
}

// buildEmailHTML creates the HTML email template
func (h *NotificationHandler) buildEmailHTML(update Update, req SendUpdateNotificationRequest, customer Customer) string {
	priorityColor := map[string]string{
		"critical":  "#dc2626", // red
		"important": "#f59e0b", // orange
		"info":      "#3b82f6", // blue
	}
	priorityBadge := fmt.Sprintf(`<span style="background-color: %s; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase;">%s</span>`,
		priorityColor[req.Priority], req.Priority)

	html := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>%s</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #667eea 0%%, #764ba2 100%%); padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">ProxPanel Update Available</h1>
            </div>

            <!-- Body -->
            <div style="padding: 30px;">
                <div style="margin-bottom: 20px;">
                    <h2 style="color: #111827; margin: 0 0 10px 0; font-size: 20px;">Hello, %s</h2>
                    <div style="margin-bottom: 15px;">%s</div>
                </div>

                <div style="background-color: #f9fafb; border-left: 4px solid #667eea; padding: 15px; margin-bottom: 20px;">
                    <h3 style="color: #374151; margin: 0 0 10px 0; font-size: 16px;">Update Details</h3>
                    <p style="color: #6b7280; margin: 5px 0;"><strong>Version:</strong> %s</p>
                    <p style="color: #6b7280; margin: 5px 0;"><strong>Released:</strong> %s</p>
                    <p style="color: #6b7280; margin: 5px 0;"><strong>Description:</strong></p>
                    <p style="color: #4b5563; margin: 10px 0; line-height: 1.6;">%s</p>
                </div>

                <div style="text-align: center; margin: 30px 0;">
                    <a href="https://%s/settings?tab=license" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%%, #764ba2 100%%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">Update Now</a>
                </div>

                <div style="background-color: #fffbeb; border: 1px solid #fbbf24; border-radius: 6px; padding: 15px; margin-top: 20px;">
                    <h4 style="color: #92400e; margin: 0 0 10px 0; font-size: 14px;">How to Update</h4>
                    <ol style="color: #78350f; margin: 0; padding-left: 20px; line-height: 1.8;">
                        <li>Log in to your ProxPanel admin dashboard</li>
                        <li>Navigate to Settings → License</li>
                        <li>Click "Check for Updates"</li>
                        <li>Click "Install Update" when prompted</li>
                        <li>System will update automatically</li>
                    </ol>
                </div>
            </div>

            <!-- Footer -->
            <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
                <p style="color: #6b7280; margin: 0; font-size: 14px;">If you need assistance, contact support at <a href="mailto:support@proxpanel.com" style="color: #667eea; text-decoration: none;">support@proxpanel.com</a></p>
                <p style="color: #9ca3af; margin: 10px 0 0 0; font-size: 12px;">© 2026 ProxPanel. All rights reserved.</p>
            </div>
        </div>
    </div>
</body>
</html>
`, req.Subject, customer.Name, priorityBadge, update.Version, update.ReleasedAt.Format("January 2, 2006"), req.Message, customer.ServerIP)

	return html
}

// getSMTPSettings retrieves SMTP configuration from system_preferences
func (h *NotificationHandler) getSMTPSettings() map[string]interface{} {
	settings := make(map[string]interface{})

	var prefs []SystemPreference
	h.DB.Where("key LIKE 'smtp_%'").Find(&prefs)

	for _, pref := range prefs {
		key := strings.TrimPrefix(pref.Key, "smtp_")
		switch key {
		case "enabled":
			settings[key] = pref.Value == "true"
		case "port":
			settings[key] = pref.Value
		default:
			settings[key] = pref.Value
		}
	}

	// Set defaults if not found
	if _, ok := settings["enabled"]; !ok {
		settings["enabled"] = false
	}
	if _, ok := settings["from_name"]; !ok {
		settings["from_name"] = "ProxPanel"
	}
	if _, ok := settings["from_address"]; !ok {
		settings["from_address"] = "noreply@proxpanel.com"
	}

	return settings
}

// GetNotificationStatus returns the delivery status of notifications for an update
func (h *NotificationHandler) GetNotificationStatus(c *fiber.Ctx) error {
	version := c.Params("version")

	var update Update
	if err := h.DB.Where("version = ?", version).First(&update).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Update version not found",
		})
	}

	// Get notification statistics
	var stats struct {
		Total    int64 `json:"total"`
		Pending  int64 `json:"pending"`
		Sent     int64 `json:"sent"`
		Failed   int64 `json:"failed"`
		Read     int64 `json:"read"`
	}

	h.DB.Model(&UpdateNotification{}).Where("update_id = ?", update.ID).Count(&stats.Total)
	h.DB.Model(&UpdateNotification{}).Where("update_id = ? AND status = 'pending'", update.ID).Count(&stats.Pending)
	h.DB.Model(&UpdateNotification{}).Where("update_id = ? AND status = 'sent'", update.ID).Count(&stats.Sent)
	h.DB.Model(&UpdateNotification{}).Where("update_id = ? AND status = 'failed'", update.ID).Count(&stats.Failed)
	h.DB.Model(&UpdateNotification{}).Where("update_id = ? AND status = 'read'", update.ID).Count(&stats.Read)

	// Get detailed list of notifications
	var notifications []struct {
		ID               uint      `json:"id"`
		CustomerName     string    `json:"customer_name"`
		CustomerEmail    string    `json:"customer_email"`
		NotificationType string    `json:"notification_type"`
		Status           string    `json:"status"`
		SentAt           *time.Time `json:"sent_at"`
		ReadAt           *time.Time `json:"read_at"`
		ErrorMessage     string    `json:"error_message"`
	}

	h.DB.Table("update_notifications").
		Select("update_notifications.id, customers.name as customer_name, customers.email as customer_email, update_notifications.notification_type, update_notifications.status, update_notifications.sent_at, update_notifications.read_at, update_notifications.error_message").
		Joins("JOIN customers ON update_notifications.customer_id = customers.id").
		Where("update_notifications.update_id = ?", update.ID).
		Order("update_notifications.created_at DESC").
		Find(&notifications)

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"success":       true,
		"version":       version,
		"stats":         stats,
		"notifications": notifications,
	})
}

// TestNotification sends a test notification to verify configuration
func (h *NotificationHandler) TestNotification(c *fiber.Ctx) error {
	var req struct {
		Email string `json:"email" validate:"required,email"`
		Type  string `json:"type" validate:"required,oneof=email sms"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
		})
	}

	switch req.Type {
	case "email":
		// Test email
		smtpSettings := h.getSMTPSettings()
		if !smtpSettings["enabled"].(bool) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"message": "SMTP is not enabled",
			})
		}

		testHTML := `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; padding: 20px;">
    <h2 style="color: #667eea;">ProxPanel Notification Test</h2>
    <p>This is a test email to verify your SMTP configuration.</p>
    <p>If you received this email, your notification system is working correctly!</p>
    <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">Sent at: %s</p>
</body>
</html>`

		testHTML = fmt.Sprintf(testHTML, time.Now().Format(time.RFC1123))

		auth := smtp.PlainAuth("",
			smtpSettings["user"].(string),
			smtpSettings["password"].(string),
			smtpSettings["host"].(string),
		)

		from := fmt.Sprintf("%s <%s>", smtpSettings["from_name"].(string), smtpSettings["from_address"].(string))
		subject := "ProxPanel Notification Test"

		msg := []byte(fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s",
			from, req.Email, subject, testHTML))

		addr := fmt.Sprintf("%s:%s", smtpSettings["host"].(string), smtpSettings["port"].(string))
		err := smtp.SendMail(addr, auth, smtpSettings["from_address"].(string), []string{req.Email}, msg)

		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"success": false,
				"message": "Failed to send test email",
				"error":   err.Error(),
			})
		}

		return c.Status(fiber.StatusOK).JSON(fiber.Map{
			"success": true,
			"message": fmt.Sprintf("Test email sent successfully to %s", req.Email),
		})

	case "sms":
		return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{
			"success": false,
			"message": "SMS testing not yet implemented",
		})
	}

	return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
		"success": false,
		"message": "Invalid notification type",
	})
}

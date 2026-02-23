package handlers

import (
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/proisp/backend/internal/database"
	"github.com/proisp/backend/internal/middleware"
	"github.com/proisp/backend/internal/models"
	"github.com/proisp/backend/internal/services"
)

// ResellerWhatsAppHandler handles per-reseller WhatsApp settings and messaging
type ResellerWhatsAppHandler struct {
	waService *services.WhatsAppService
}

func NewResellerWhatsAppHandler() *ResellerWhatsAppHandler {
	return &ResellerWhatsAppHandler{
		waService: services.NewWhatsAppService(),
	}
}

// getReseller returns the current user's reseller record
func (h *ResellerWhatsAppHandler) getReseller(c *fiber.Ctx) (*models.Reseller, error) {
	user := middleware.GetCurrentUser(c)
	if user == nil || user.ResellerID == nil {
		return nil, fmt.Errorf("not a reseller account")
	}
	var reseller models.Reseller
	if err := database.DB.First(&reseller, *user.ResellerID).Error; err != nil {
		return nil, fmt.Errorf("reseller not found")
	}
	return &reseller, nil
}

// GetSettings returns the reseller's current WhatsApp connection status
func (h *ResellerWhatsAppHandler) GetSettings(c *fiber.Ctx) error {
	reseller, err := h.getReseller(c)
	if err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": err.Error()})
	}

	connected := reseller.WhatsAppAccountUnique != ""

	// Calculate trial info
	var trialEnds *time.Time
	var trialExpired bool
	if reseller.WhatsAppTrialStart != nil {
		ends := reseller.WhatsAppTrialStart.Add(48 * time.Hour)
		trialEnds = &ends
		trialExpired = time.Now().After(ends)
	}

	return c.JSON(fiber.Map{
		"success":        true,
		"connected":      connected,
		"phone":          reseller.WhatsAppPhone,
		"account_unique": reseller.WhatsAppAccountUnique,
		"enabled":        reseller.WhatsAppEnabled,
		"trial_ends":     trialEnds,
		"trial_expired":  trialExpired,
	})
}

// ProxRadCreateLink creates a new WhatsApp QR link for the reseller to scan
func (h *ResellerWhatsAppHandler) ProxRadCreateLink(c *fiber.Ctx) error {
	if _, err := h.getReseller(c); err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": err.Error()})
	}

	result, err := h.waService.CreateProxRadLink()
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

// ProxRadLinkStatus checks connection status and saves account to reseller record when connected
func (h *ResellerWhatsAppHandler) ProxRadLinkStatus(c *fiber.Ctx) error {
	reseller, err := h.getReseller(c)
	if err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": err.Error()})
	}

	infoURL := c.Query("info_url")
	if infoURL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "info_url is required"})
	}

	info, err := h.waService.GetProxRadLinkStatus(infoURL)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Failed to get link status: " + err.Error(),
		})
	}

	connected := info.Status == "connected" || info.Unique != ""

	// Save to reseller record when connected
	if connected && info.Unique != "" {
		updates := map[string]interface{}{
			"whatsapp_account_unique": info.Unique,
			"whatsapp_enabled":        true,
		}
		if info.Phone != "" {
			updates["whatsapp_phone"] = info.Phone
		}
		// Set trial start only on first-ever connection
		if reseller.WhatsAppTrialStart == nil {
			now := time.Now().UTC()
			updates["whatsapp_trial_start"] = now
		}
		database.DB.Model(reseller).Updates(updates)
	}

	return c.JSON(fiber.Map{
		"success":   true,
		"connected": connected,
		"unique":    info.Unique,
		"phone":     info.Phone,
		"status":    info.Status,
	})
}

// ProxRadUnlink disconnects the reseller's WhatsApp account
func (h *ResellerWhatsAppHandler) ProxRadUnlink(c *fiber.Ctx) error {
	reseller, err := h.getReseller(c)
	if err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": err.Error()})
	}

	// Try to disconnect from proxsms (best-effort)
	if reseller.WhatsAppAccountUnique != "" {
		_ = h.waService.DisconnectProxRadAccount(reseller.WhatsAppAccountUnique)
	}

	// Clear WhatsApp fields from reseller record
	database.DB.Model(reseller).Updates(map[string]interface{}{
		"whatsapp_account_unique": "",
		"whatsapp_phone":          "",
		"whatsapp_enabled":        false,
	})

	return c.JSON(fiber.Map{"success": true, "message": "WhatsApp account unlinked"})
}

// ProxRadTestSend sends a test message using the reseller's WhatsApp account
func (h *ResellerWhatsAppHandler) ProxRadTestSend(c *fiber.Ctx) error {
	reseller, err := h.getReseller(c)
	if err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": err.Error()})
	}

	if reseller.WhatsAppAccountUnique == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "WhatsApp account not linked yet",
		})
	}

	var req struct {
		TestPhone string `json:"test_phone"`
	}
	if err := c.BodyParser(&req); err != nil || req.TestPhone == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "test_phone is required"})
	}

	msg := "✅ *ProxPanel Test*\n\nYour WhatsApp configuration is working correctly!\n\nYou can now send notifications to your subscribers."
	if err := h.waService.SendMessageWithAccountUnique(reseller.WhatsAppAccountUnique, req.TestPhone, msg); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Failed to send: " + err.Error(),
		})
	}
	return c.JSON(fiber.Map{"success": true, "message": "Test message sent to " + req.TestPhone})
}

// GetSubscribers returns the reseller's subscribers with phone numbers for sending
func (h *ResellerWhatsAppHandler) GetSubscribers(c *fiber.Ctx) error {
	reseller, err := h.getReseller(c)
	if err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": err.Error()})
	}

	search := c.Query("search")
	limit := 100

	type SubRow struct {
		ID       uint   `json:"id"`
		Username string `json:"username"`
		FullName string `json:"full_name"`
		Phone    string `json:"phone"`
	}

	var subs []SubRow
	q := database.DB.Model(&models.Subscriber{}).
		Select("id, username, full_name, phone").
		Where("reseller_id = ? AND deleted_at IS NULL AND phone != '' AND phone IS NOT NULL", reseller.ID)

	if search != "" {
		like := "%" + search + "%"
		q = q.Where("username ILIKE ? OR full_name ILIKE ? OR phone ILIKE ?", like, like, like)
	}

	q.Order("username ASC").Limit(limit).Scan(&subs)

	return c.JSON(fiber.Map{"success": true, "subscribers": subs, "total": len(subs)})
}

// SendToSubscribers sends a WhatsApp message to selected subscribers
func (h *ResellerWhatsAppHandler) SendToSubscribers(c *fiber.Ctx) error {
	reseller, err := h.getReseller(c)
	if err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": err.Error()})
	}

	if reseller.WhatsAppAccountUnique == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "WhatsApp account not linked. Please connect your WhatsApp first.",
		})
	}

	if !reseller.WhatsAppEnabled {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"success": false,
			"message": "WhatsApp notifications are disabled for your account.",
		})
	}

	var req struct {
		SubscriberIDs []uint `json:"subscriber_ids"`
		Message       string `json:"message"`
		SendAll       bool   `json:"send_all"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Invalid request body"})
	}
	if req.Message == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "Message is required"})
	}

	// Get target subscribers (only reseller's own)
	type SubPhone struct {
		ID       uint   `json:"id"`
		Username string `json:"username"`
		Phone    string `json:"phone"`
		FullName string `json:"full_name"`
	}
	var targets []SubPhone

	q := database.DB.Model(&models.Subscriber{}).
		Select("id, username, phone, full_name").
		Where("reseller_id = ? AND deleted_at IS NULL AND phone != '' AND phone IS NOT NULL", reseller.ID)

	if !req.SendAll && len(req.SubscriberIDs) > 0 {
		q = q.Where("id IN ?", req.SubscriberIDs)
	} else if !req.SendAll {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "No subscribers selected"})
	}

	q.Scan(&targets)

	if len(targets) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "No subscribers with phone numbers found"})
	}

	// Send messages
	sent := 0
	failed := 0
	var errors []string

	for _, sub := range targets {
		msg := req.Message
		// Replace template variables
		msg = replaceWAVars(msg, sub.Username, sub.FullName, reseller.Name)

		if err := h.waService.SendMessageWithAccountUnique(reseller.WhatsAppAccountUnique, sub.Phone, msg); err != nil {
			failed++
			if len(errors) < 5 {
				errors = append(errors, fmt.Sprintf("%s: %v", sub.Username, err))
			}
		} else {
			sent++
		}
	}

	return c.JSON(fiber.Map{
		"success": true,
		"sent":    sent,
		"failed":  failed,
		"total":   len(targets),
		"errors":  errors,
		"message": fmt.Sprintf("Sent to %d subscribers", sent),
	})
}

// replaceWAVars replaces template variables in the message
func replaceWAVars(msg, username, fullName, resellerName string) string {
	replacer := map[string]string{
		"{username}":      username,
		"{full_name}":     fullName,
		"{reseller_name}": resellerName,
		"{{username}}":    username,
		"{{full_name}}":   fullName,
		"{{reseller_name}}": resellerName,
	}
	for k, v := range replacer {
		for i := 0; i < len(msg); i++ {
			if idx := indexOf(msg, k); idx >= 0 {
				msg = msg[:idx] + v + msg[idx+len(k):]
			} else {
				break
			}
		}
	}
	return msg
}

func indexOf(s, substr string) int {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}

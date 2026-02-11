// License Server Notification Endpoints
// File: /opt/proxpanel-license/internal/handlers/notification_endpoints.go
// These endpoints should be added to the license server main.go

package handlers

import (
	"time"

	"github.com/gofiber/fiber/v2"
)

// GetPendingNotificationsForLicense returns pending in-app notifications for a license
func (h *NotificationHandler) GetPendingNotificationsForLicense(c *fiber.Ctx) error {
	licenseKey := c.Get("X-License-Key")
	if licenseKey == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"success": false,
			"message": "Missing license key",
		})
	}

	// Get license
	var license License
	if err := h.DB.Where("license_key = ?", licenseKey).First(&license).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "License not found",
		})
	}

	// Get unread in-app notifications for this license
	var notifications []struct {
		ID          uint      `json:"id"`
		UpdateID    uint      `json:"update_id"`
		Version     string    `json:"version"`
		Priority    string    `json:"priority"`
		Title       string    `json:"title"`
		Message     string    `json:"message"`
		ReleaseDate time.Time `json:"release_date"`
		SentAt      time.Time `json:"sent_at"`
	}

	h.DB.Table("update_notifications").
		Select("update_notifications.id, updates.id as update_id, updates.version, updates.priority, updates.title, updates.description as message, updates.released_at as release_date, update_notifications.sent_at").
		Joins("JOIN updates ON update_notifications.update_id = updates.id").
		Where("update_notifications.license_id = ? AND update_notifications.notification_type = 'in-app' AND update_notifications.status = 'sent' AND update_notifications.read_at IS NULL", license.ID).
		Order("update_notifications.created_at DESC").
		Limit(10).
		Find(&notifications)

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"success":       true,
		"notifications": notifications,
	})
}

// MarkNotificationReadEndpoint marks a notification as read
func (h *NotificationHandler) MarkNotificationReadEndpoint(c *fiber.Ctx) error {
	licenseKey := c.Get("X-License-Key")
	if licenseKey == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"success": false,
			"message": "Missing license key",
		})
	}

	notificationID := c.Params("id")

	// Get license
	var license License
	if err := h.DB.Where("license_key = ?", licenseKey).First(&license).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "License not found",
		})
	}

	// Update notification
	now := time.Now()
	result := h.DB.Model(&UpdateNotification{}).
		Where("id = ? AND license_id = ?", notificationID, license.ID).
		Updates(map[string]interface{}{
			"status":     "read",
			"read_at":    &now,
			"updated_at": now,
		})

	if result.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to mark notification as read",
			"error":   result.Error.Error(),
		})
	}

	if result.RowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Notification not found",
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"success": true,
		"message": "Notification marked as read",
	})
}

// Routes to add to license server main.go:
//
// Admin routes (require admin auth):
// app.Post("/api/v1/admin/updates/:version/notify", authMiddleware, notificationHandler.SendUpdateNotification)
// app.Get("/api/v1/admin/updates/:version/notification-status", authMiddleware, notificationHandler.GetNotificationStatus)
// app.Post("/api/v1/admin/notifications/test", authMiddleware, notificationHandler.TestNotification)
//
// Public routes (require license key header):
// app.Get("/api/v1/license/notifications/pending", notificationHandler.GetPendingNotificationsForLicense)
// app.Post("/api/v1/license/notifications/:id/read", notificationHandler.MarkNotificationReadEndpoint)

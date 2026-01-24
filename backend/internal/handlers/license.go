package handlers

import (
	"os"

	"github.com/gofiber/fiber/v2"
	"github.com/proisp/backend/internal/license"
)

// LicenseHandler handles license-related requests
type LicenseHandler struct{}

// NewLicenseHandler creates a new license handler
func NewLicenseHandler() *LicenseHandler {
	return &LicenseHandler{}
}

// GetLicenseInfo returns current license information
func (h *LicenseHandler) GetLicenseInfo(c *fiber.Ctx) error {
	info := license.GetLicenseInfo()

	if info == nil {
		return c.JSON(fiber.Map{
			"success": true,
			"data": fiber.Map{
				"valid":           false,
				"license_key":     os.Getenv("LICENSE_KEY"),
				"message":         "License not initialized",
			},
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"valid":           info.Valid,
			"license_key":     os.Getenv("LICENSE_KEY"),
			"customer_name":   info.CustomerName,
			"tier":            info.Tier,
			"max_subscribers": info.MaxSubscribers,
			"features":        info.Features,
			"expires_at":      info.ExpiresAt,
			"is_lifetime":     info.IsLifetime,
			"grace_period":    info.GracePeriod,
			"days_remaining":  info.DaysRemaining,
			"message":         info.Message,
		},
	})
}

// GetLicenseStatus returns a simple license status check
func (h *LicenseHandler) GetLicenseStatus(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"success":      true,
		"valid":        license.IsValid(),
		"grace_period": license.InGracePeriod(),
	})
}

// Revalidate forces a license revalidation with the license server
func (h *LicenseHandler) Revalidate(c *fiber.Ctx) error {
	err := license.ForceValidation()
	if err != nil {
		return c.JSON(fiber.Map{
			"success": false,
			"message": err.Error(),
		})
	}

	info := license.GetLicenseInfo()
	return c.JSON(fiber.Map{
		"success": true,
		"message": "License revalidated successfully",
		"data": fiber.Map{
			"valid":           info.Valid,
			"tier":            info.Tier,
			"max_subscribers": info.MaxSubscribers,
			"expires_at":      info.ExpiresAt,
			"days_remaining":  info.DaysRemaining,
		},
	})
}

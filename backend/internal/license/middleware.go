package license

import (
	"github.com/gofiber/fiber/v2"
)

// RequireLicense middleware checks if the license is valid
func RequireLicense() fiber.Handler {
	return func(c *fiber.Ctx) error {
		if !IsValid() {
			return c.Status(fiber.StatusPaymentRequired).JSON(fiber.Map{
				"success": false,
				"message": "Invalid or expired license. Please contact support.",
				"code":    "LICENSE_INVALID",
			})
		}
		return c.Next()
	}
}

// CheckSubscriberLimit middleware checks if subscriber limit is exceeded
func CheckSubscriberLimit(getCurrentCount func() int) fiber.Handler {
	return func(c *fiber.Ctx) error {
		maxSubs := GetMaxSubscribers()
		if maxSubs == 0 {
			return c.Next() // No limit set
		}

		currentCount := getCurrentCount()
		if currentCount >= maxSubs {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"success":     false,
				"message":     "Subscriber limit exceeded. Please upgrade your license.",
				"code":        "LIMIT_EXCEEDED",
				"max_allowed": maxSubs,
				"current":     currentCount,
			})
		}

		return c.Next()
	}
}

// GracePeriodWarning adds grace period warning to responses
func GracePeriodWarning() fiber.Handler {
	return func(c *fiber.Ctx) error {
		err := c.Next()

		// Add warning header if in grace period
		if InGracePeriod() {
			c.Set("X-License-Warning", "License expired. Operating in grace period.")
			info := GetLicenseInfo()
			if info != nil && info.DaysRemaining > 0 {
				c.Set("X-License-Grace-Days", string(rune(info.DaysRemaining)))
			}
		}

		return err
	}
}

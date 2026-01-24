package middleware

import (
	"log"
	"strconv"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/proisp/backend/internal/database"
	"github.com/proisp/backend/internal/models"
)

// RateLimitEntry tracks request count per IP
type RateLimitEntry struct {
	Count     int
	ResetTime time.Time
}

var (
	rateLimitMap   = make(map[string]*RateLimitEntry)
	rateLimitMutex sync.RWMutex
)

// getRateLimitSetting gets rate limit from settings
func getRateLimitSetting() int {
	var pref models.SystemPreference
	if err := database.DB.Where("key = ?", "api_rate_limit").First(&pref).Error; err != nil {
		return 100 // Default 100 requests per minute
	}
	if val, err := strconv.Atoi(pref.Value); err == nil && val > 0 {
		return val
	}
	return 100
}

// Logger middleware for request logging
func Logger() fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Now()

		// Process request
		err := c.Next()

		// Calculate duration
		duration := time.Since(start)

		// Log the request
		log.Printf(
			"%s | %3d | %13v | %15s | %-7s %s",
			time.Now().Format("2006/01/02 - 15:04:05"),
			c.Response().StatusCode(),
			duration,
			c.IP(),
			c.Method(),
			c.Path(),
		)

		return err
	}
}

// CORS middleware for cross-origin requests
func CORS() fiber.Handler {
	return func(c *fiber.Ctx) error {
		c.Set("Access-Control-Allow-Origin", "*")
		c.Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH")
		c.Set("Access-Control-Allow-Headers", "Origin, Content-Type, Accept, Authorization, X-Requested-With")
		c.Set("Access-Control-Allow-Credentials", "true")
		c.Set("Access-Control-Max-Age", "86400")

		if c.Method() == "OPTIONS" {
			return c.SendStatus(fiber.StatusNoContent)
		}

		return c.Next()
	}
}

// RateLimiter middleware for rate limiting (simple implementation)
func RateLimiter(maxRequests int, window time.Duration) fiber.Handler {
	return func(c *fiber.Ctx) error {
		ip := c.IP()

		// Get rate limit from settings (overrides parameter if set)
		limit := getRateLimitSetting()
		if limit > 0 {
			maxRequests = limit
		}

		rateLimitMutex.Lock()

		entry, exists := rateLimitMap[ip]
		now := time.Now()

		if !exists || now.After(entry.ResetTime) {
			// New entry or window expired
			rateLimitMap[ip] = &RateLimitEntry{
				Count:     1,
				ResetTime: now.Add(window),
			}
			rateLimitMutex.Unlock()
			return c.Next()
		}

		if entry.Count >= maxRequests {
			rateLimitMutex.Unlock()
			remaining := int(entry.ResetTime.Sub(now).Seconds())
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"success": false,
				"message": "Rate limit exceeded. Try again in " + strconv.Itoa(remaining) + " seconds",
			})
		}

		entry.Count++
		rateLimitMutex.Unlock()
		return c.Next()
	}
}

// Recovery middleware to recover from panics
func Recovery() fiber.Handler {
	return func(c *fiber.Ctx) error {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("Panic recovered: %v", r)
				c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"success": false,
					"message": "Internal server error",
				})
			}
		}()
		return c.Next()
	}
}

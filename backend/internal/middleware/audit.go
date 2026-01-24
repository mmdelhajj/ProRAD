package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/proisp/backend/internal/database"
	"github.com/proisp/backend/internal/models"
)

// AuditLogger middleware logs API actions to audit log
func AuditLogger() fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Skip non-modifying requests
		method := c.Method()
		if method == "GET" || method == "HEAD" || method == "OPTIONS" {
			return c.Next()
		}

		// Skip certain paths
		path := c.Path()
		skipPaths := []string{"/api/auth/login", "/api/auth/refresh", "/health"}
		for _, skip := range skipPaths {
			if strings.HasPrefix(path, skip) {
				return c.Next()
			}
		}

		// Get user before executing (context is valid here)
		user := GetCurrentUser(c)
		ip := c.IP()
		userAgent := c.Get("User-Agent")

		// Execute the request
		err := c.Next()

		// Only log successful responses
		statusCode := c.Response().StatusCode()
		if statusCode >= 200 && statusCode < 400 && user != nil {
			logAuditEntry(user, method, path, ip, userAgent)
		}

		return err
	}
}

func logAuditEntry(user *models.User, method, path, ip, userAgent string) {
	if user == nil {
		return
	}

	// Determine action based on method
	var action models.AuditAction
	switch method {
	case "POST":
		action = models.AuditActionCreate
	case "PUT", "PATCH":
		action = models.AuditActionUpdate
	case "DELETE":
		action = models.AuditActionDelete
	default:
		return
	}

	// Determine entity type from path
	entityType := getEntityTypeFromPath(path)
	if entityType == "" {
		return
	}

	// Create audit log
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      action,
		EntityType:  entityType,
		Description: method + " " + path,
		IPAddress:   ip,
		UserAgent:   userAgent,
		OldValue:    "{}",
		NewValue:    "{}",
	}
	database.DB.Create(&auditLog)
}

func getEntityTypeFromPath(path string) string {
	parts := strings.Split(strings.TrimPrefix(path, "/api/"), "/")
	if len(parts) == 0 {
		return ""
	}

	// Map paths to entity types
	entityMap := map[string]string{
		"subscribers":   "subscriber",
		"services":      "service",
		"nas":           "nas",
		"resellers":     "reseller",
		"sessions":      "session",
		"settings":      "settings",
		"users":         "user",
		"communication": "communication",
		"prepaid":       "prepaid",
		"invoices":      "invoice",
		"tickets":       "ticket",
		"permissions":   "permission",
		"bandwidth":     "bandwidth",
		"fup":           "fup",
		"backups":       "backup",
	}

	if entity, ok := entityMap[parts[0]]; ok {
		return entity
	}
	return ""
}

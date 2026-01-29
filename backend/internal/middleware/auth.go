package middleware

import (
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/proisp/backend/internal/config"
	"github.com/proisp/backend/internal/database"
	"github.com/proisp/backend/internal/models"
)

// JWTClaims represents JWT token claims
type JWTClaims struct {
	UserID     uint            `json:"user_id"`
	Username   string          `json:"username"`
	UserType   models.UserType `json:"user_type"`
	ResellerID *uint           `json:"reseller_id,omitempty"`
	jwt.RegisteredClaims
}

// GenerateToken generates a new JWT token
func GenerateToken(user *models.User, cfg *config.Config) (string, error) {
	claims := JWTClaims{
		UserID:   user.ID,
		Username: user.Username,
		UserType: user.UserType,
		ResellerID: user.ResellerID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Duration(cfg.JWTExpireHours) * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "proisp",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(cfg.JWTSecret))
}

// AuthRequired middleware to protect routes
func AuthRequired(cfg *config.Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "Missing authorization header",
			})
		}

		// Extract token from "Bearer <token>"
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "Invalid authorization header format",
			})
		}

		tokenString := parts[1]

		// Check if token is blacklisted (user logged out)
		if database.IsTokenBlacklisted(tokenString) {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "Token has been revoked (logged out)",
			})
		}

		// Parse and validate token
		token, err := jwt.ParseWithClaims(tokenString, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
			return []byte(cfg.JWTSecret), nil
		})

		if err != nil || !token.Valid {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "Invalid or expired token",
			})
		}

		claims, ok := token.Claims.(*JWTClaims)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "Invalid token claims",
			})
		}

		// Check if user still exists and is active
		var user models.User
		if err := database.DB.First(&user, claims.UserID).Error; err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "User not found",
			})
		}

		if !user.IsActive {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"message": "User account is disabled",
			})
		}

		// Store user info in context
		c.Locals("user", &user)
		c.Locals("userID", claims.UserID)
		c.Locals("username", claims.Username)
		c.Locals("userType", claims.UserType)
		c.Locals("resellerID", claims.ResellerID)

		return c.Next()
	}
}

// AdminOnly middleware to restrict to admin users
func AdminOnly() fiber.Handler {
	return func(c *fiber.Ctx) error {
		userType := c.Locals("userType").(models.UserType)
		if userType != models.UserTypeAdmin {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"success": false,
				"message": "Admin access required",
			})
		}
		return c.Next()
	}
}

// ResellerOrAdmin middleware to restrict to reseller or admin
func ResellerOrAdmin() fiber.Handler {
	return func(c *fiber.Ctx) error {
		userType := c.Locals("userType").(models.UserType)
		if userType != models.UserTypeAdmin && userType != models.UserTypeReseller {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"success": false,
				"message": "Reseller or admin access required",
			})
		}
		return c.Next()
	}
}

// GetCurrentUser returns the current user from context
func GetCurrentUser(c *fiber.Ctx) *models.User {
	user, ok := c.Locals("user").(*models.User)
	if !ok {
		return nil
	}
	return user
}

// GetCurrentUserID returns the current user ID from context
func GetCurrentUserID(c *fiber.Ctx) uint {
	userID, ok := c.Locals("userID").(uint)
	if !ok {
		return 0
	}
	return userID
}

// GetCurrentResellerID returns the current reseller ID from context
func GetCurrentResellerID(c *fiber.Ctx) *uint {
	resellerID, ok := c.Locals("resellerID").(*uint)
	if !ok {
		return nil
	}
	return resellerID
}

// RequirePermission middleware checks if user has a specific permission
// Admins always have all permissions
// Resellers must have the permission in their permission group
func RequirePermission(permission string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userType := c.Locals("userType").(models.UserType)

		// Admins have all permissions
		if userType == models.UserTypeAdmin {
			return c.Next()
		}

		// Only resellers can have permission groups
		if userType != models.UserTypeReseller {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"success": false,
				"message": "Permission denied",
			})
		}

		// Get user from context
		user := GetCurrentUser(c)
		if user == nil || user.ResellerID == nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"success": false,
				"message": "Permission denied",
			})
		}

		// Check if reseller has the permission
		if !hasPermission(user, permission) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"success": false,
				"message": "You don't have permission to perform this action",
			})
		}

		return c.Next()
	}
}

// hasPermission checks if a user has a specific permission
func hasPermission(user *models.User, permission string) bool {
	// Get reseller's permission group
	var reseller models.Reseller
	if err := database.DB.First(&reseller, *user.ResellerID).Error; err != nil {
		return false
	}

	// If no permission group assigned, allow all (default behavior)
	if reseller.PermissionGroup == nil {
		return true
	}

	// Check if permission exists in the group
	var count int64
	database.DB.Table("permissions").
		Joins("JOIN permission_group_permissions pgp ON pgp.permission_id = permissions.id").
		Where("pgp.permission_group_id = ? AND permissions.name = ?", *reseller.PermissionGroup, permission).
		Count(&count)

	return count > 0
}

// RequireAnyPermission middleware checks if user has any of the specified permissions
func RequireAnyPermission(permissions ...string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userType := c.Locals("userType").(models.UserType)

		// Admins have all permissions
		if userType == models.UserTypeAdmin {
			return c.Next()
		}

		// Only resellers can have permission groups
		if userType != models.UserTypeReseller {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"success": false,
				"message": "Permission denied",
			})
		}

		// Get user from context
		user := GetCurrentUser(c)
		if user == nil || user.ResellerID == nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"success": false,
				"message": "Permission denied",
			})
		}

		// Check if reseller has any of the permissions
		for _, perm := range permissions {
			if hasPermission(user, perm) {
				return c.Next()
			}
		}

		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"success": false,
			"message": "You don't have permission to perform this action",
		})
	}
}

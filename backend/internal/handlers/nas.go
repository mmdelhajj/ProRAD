package handlers

import (
	"fmt"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/proisp/backend/internal/database"
	"github.com/proisp/backend/internal/middleware"
	"github.com/proisp/backend/internal/mikrotik"
	"github.com/proisp/backend/internal/models"
	"github.com/proisp/backend/internal/radius"
)

type NasHandler struct{}

func NewNasHandler() *NasHandler {
	return &NasHandler{}
}

// List returns all NAS devices (filtered by reseller assignment if user is reseller)
func (h *NasHandler) List(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)
	var nasList []models.Nas

	query := database.DB.Order("name ASC")

	// If user is a reseller, only show assigned NAS
	if user != nil && user.UserType == models.UserTypeReseller && user.ResellerID != nil {
		// Get assigned NAS IDs
		var nasIDs []uint
		database.DB.Model(&models.ResellerNAS{}).
			Where("reseller_id = ?", *user.ResellerID).
			Pluck("nas_id", &nasIDs)

		if len(nasIDs) > 0 {
			query = query.Where("id IN ?", nasIDs)
		} else {
			// If no NAS assigned, return empty list
			return c.JSON(fiber.Map{
				"success": true,
				"data":    []models.Nas{},
			})
		}
	}

	if err := query.Find(&nasList).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to fetch NAS devices",
		})
	}

	// Set computed fields for security indicators
	for i := range nasList {
		nasList[i].HasSecret = nasList[i].Secret != ""
		nasList[i].HasAPIPassword = nasList[i].APIPassword != ""
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    nasList,
	})
}

// Get returns a single NAS device
func (h *NasHandler) Get(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid NAS ID",
		})
	}

	var nas models.Nas
	if err := database.DB.First(&nas, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "NAS not found",
		})
	}

	// Get active sessions count
	var sessionCount int64
	database.DB.Model(&models.RadAcct{}).
		Where("nasipaddress = ? AND acctstoptime IS NULL", nas.IPAddress).
		Count(&sessionCount)

	// Set computed fields for security indicators
	nas.HasSecret = nas.Secret != ""
	nas.HasAPIPassword = nas.APIPassword != ""

	return c.JSON(fiber.Map{
		"success":        true,
		"data":           nas,
		"active_sessions": sessionCount,
	})
}

// CreateNasRequest represents create NAS request
type CreateNasRequest struct {
	Name        string `json:"name"`
	ShortName   string `json:"short_name"`
	IPAddress   string `json:"ip_address"`
	Type        string `json:"type"`
	Description string `json:"description"`
	Secret      string `json:"secret"`
	AuthPort    int    `json:"auth_port"`
	AcctPort    int    `json:"acct_port"`
	CoAPort     int    `json:"coa_port"`
	APIUsername string `json:"api_username"`
	APIPassword string `json:"api_password"`
	APIPort     int    `json:"api_port"`
	APISSLPort  int    `json:"api_ssl_port"`
	UseSSL      bool   `json:"use_ssl"`
}

// Create creates a new NAS device
func (h *NasHandler) Create(c *fiber.Ctx) error {
	var req CreateNasRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
		})
	}

	if req.Name == "" || req.IPAddress == "" || req.Secret == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Name, IP address, and secret are required",
		})
	}

	// Check if IP exists
	var existingCount int64
	database.DB.Model(&models.Nas{}).Where("ip_address = ?", req.IPAddress).Count(&existingCount)
	if existingCount > 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "NAS with this IP address already exists",
		})
	}

	nas := models.Nas{
		Name:        req.Name,
		ShortName:   req.ShortName,
		IPAddress:   req.IPAddress,
		Type:        models.NasType(req.Type),
		Description: req.Description,
		Secret:      req.Secret,
		AuthPort:    req.AuthPort,
		AcctPort:    req.AcctPort,
		CoAPort:     req.CoAPort,
		APIUsername: req.APIUsername,
		APIPassword: req.APIPassword,
		APIPort:     req.APIPort,
		APISSLPort:  req.APISSLPort,
		UseSSL:      req.UseSSL,
		IsActive:    true,
	}

	// Set defaults
	if nas.Type == "" {
		nas.Type = models.NasTypeMikrotik
	}
	if nas.AuthPort == 0 {
		nas.AuthPort = 1812
	}
	if nas.AcctPort == 0 {
		nas.AcctPort = 1813
	}
	if nas.CoAPort == 0 {
		nas.CoAPort = 1700
	}
	if nas.APIPort == 0 {
		nas.APIPort = 8728
	}
	if nas.APISSLPort == 0 {
		nas.APISSLPort = 8729
	}
	if nas.ShortName == "" {
		nas.ShortName = req.Name
	}

	if err := database.DB.Create(&nas).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to create NAS",
		})
	}

	// Create audit log
	user := middleware.GetCurrentUser(c)
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionCreate,
		EntityType:  "nas",
		EntityID:    nas.ID,
		EntityName:  nas.Name,
		Description: "Created new NAS",
		IPAddress:   c.IP(),
	}
	database.DB.Create(&auditLog)

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"success": true,
		"message": "NAS created successfully",
		"data":    nas,
	})
}

// Update updates a NAS device
func (h *NasHandler) Update(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid NAS ID",
		})
	}

	var nas models.Nas
	if err := database.DB.First(&nas, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "NAS not found",
		})
	}

	var req map[string]interface{}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
		})
	}

	// Map JSON field names to database column names (GORM snake_case)
	fieldMapping := map[string]string{
		"name":         "name",
		"short_name":   "short_name",
		"ip_address":   "ip_address",
		"type":         "type",
		"description":  "description",
		"secret":       "secret",
		"auth_port":    "auth_port",
		"acct_port":    "acct_port",
		"coa_port":     "coa_port",
		"api_username": "api_username",
		"api_password": "api_password",
		"api_port":     "api_port",
		"api_ssl_port": "api_ssl_port",
		"use_ssl":      "use_ssl",
		"is_active":    "is_active",
	}

	updates := make(map[string]interface{})
	for jsonField, dbColumn := range fieldMapping {
		if val, ok := req[jsonField]; ok {
			updates[dbColumn] = val
		}
	}

	// Handle type field specially - convert string to NasType
	if typeVal, ok := updates["type"]; ok {
		if typeStr, ok := typeVal.(string); ok {
			updates["type"] = models.NasType(typeStr)
		}
	}

	if err := database.DB.Model(&nas).Updates(updates).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to update NAS: " + err.Error(),
		})
	}

	// Create audit log
	user := middleware.GetCurrentUser(c)
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionUpdate,
		EntityType:  "nas",
		EntityID:    nas.ID,
		EntityName:  nas.Name,
		Description: "Updated NAS",
		IPAddress:   c.IP(),
	}
	database.DB.Create(&auditLog)

	database.DB.First(&nas, id)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "NAS updated successfully",
		"data":    nas,
	})
}

// Delete deletes a NAS device
func (h *NasHandler) Delete(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid NAS ID",
		})
	}

	var nas models.Nas
	if err := database.DB.First(&nas, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "NAS not found",
		})
	}

	// Check if NAS has subscribers
	var subscriberCount int64
	database.DB.Model(&models.Subscriber{}).Where("nas_id = ?", id).Count(&subscriberCount)
	if subscriberCount > 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Cannot delete NAS with assigned subscribers",
		})
	}

	if err := database.DB.Delete(&nas).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to delete NAS",
		})
	}

	// Create audit log
	user := middleware.GetCurrentUser(c)
	auditLog := models.AuditLog{
		UserID:      user.ID,
		Username:    user.Username,
		UserType:    user.UserType,
		Action:      models.AuditActionDelete,
		EntityType:  "nas",
		EntityID:    nas.ID,
		EntityName:  nas.Name,
		Description: "Deleted NAS",
		IPAddress:   c.IP(),
	}
	database.DB.Create(&auditLog)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "NAS deleted successfully",
	})
}

// Sync syncs NAS with Mikrotik
func (h *NasHandler) Sync(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid NAS ID",
		})
	}

	var nas models.Nas
	if err := database.DB.First(&nas, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "NAS not found",
		})
	}

	// TODO: Implement Mikrotik API sync
	// - Connect to Mikrotik
	// - Get active PPPoE sessions
	// - Sync with database

	return c.JSON(fiber.Map{
		"success": true,
		"message": "NAS sync initiated",
	})
}

// TestConnection tests NAS connectivity, API authentication, and RADIUS secret
func (h *NasHandler) TestConnection(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid NAS ID",
		})
	}

	var nas models.Nas
	if err := database.DB.First(&nas, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "NAS not found",
		})
	}

	// Test real MikroTik API authentication
	apiAddr := fmt.Sprintf("%s:%d", nas.IPAddress, nas.APIPort)
	client := mikrotik.NewClient(apiAddr, nas.APIUsername, nas.APIPassword)
	apiResult := client.TestConnection()
	defer client.Close()

	// Test RADIUS secret
	radiusResult := radius.TestSecret(nas.IPAddress, nas.AuthPort, nas.Secret)

	// Update database based on REAL authentication results
	now := time.Now()
	updates := map[string]interface{}{
		"is_online":  apiResult.APIAuth, // Only online if API auth succeeded
		"last_seen":  &now,
	}
	database.DB.Model(&nas).Updates(updates)

	// Build response
	response := fiber.Map{
		"success":       true,
		"message":       "Connection test completed",
		"is_online":     apiResult.IsOnline,     // Port reachable
		"api_auth":      apiResult.APIAuth,      // API credentials valid
		"api_ok":        apiResult.APIAuth,      // For backwards compatibility
		"router_info":   apiResult.RouterInfo,
		"secret_valid":  radiusResult.SecretValid, // RADIUS secret valid
		"radius_ok":     radiusResult.SecretValid, // Alias
	}

	if apiResult.ErrorMsg != "" {
		response["api_error"] = apiResult.ErrorMsg
	}
	if radiusResult.ErrorMsg != "" {
		response["radius_error"] = radiusResult.ErrorMsg
	}

	// Build summary message
	var status []string
	if apiResult.APIAuth {
		status = append(status, "API: OK")
	} else if apiResult.IsOnline {
		status = append(status, "API: Auth Failed")
	} else {
		status = append(status, "API: Unreachable")
	}

	if radiusResult.SecretValid {
		status = append(status, "RADIUS: OK")
	} else {
		status = append(status, "RADIUS: Secret Invalid")
	}

	response["message"] = fmt.Sprintf("%s | %s", status[0], status[1])

	return c.JSON(response)
}

// GetIPPools fetches available IP pools from a NAS device
func (h *NasHandler) GetIPPools(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid NAS ID",
		})
	}

	var nas models.Nas
	if err := database.DB.First(&nas, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "NAS not found",
		})
	}

	// Connect to MikroTik and get IP pools
	client := mikrotik.NewClient(
		fmt.Sprintf("%s:%d", nas.IPAddress, nas.APIPort),
		nas.APIUsername,
		nas.APIPassword,
	)
	defer client.Close()

	pools, err := client.GetIPPools()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": fmt.Sprintf("Failed to get IP pools: %v", err),
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    pools,
	})
}

// UpdateSubscriberPools updates the subscriber pools for a NAS device
func (h *NasHandler) UpdateSubscriberPools(c *fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid NAS ID",
		})
	}

	var nas models.Nas
	if err := database.DB.First(&nas, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "NAS not found",
		})
	}

	var input struct {
		SubscriberPools string `json:"subscriber_pools"`
	}

	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
		})
	}

	nas.SubscriberPools = input.SubscriberPools
	if err := database.DB.Save(&nas).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to update subscriber pools",
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    nas,
		"message": "Subscriber pools updated",
	})
}

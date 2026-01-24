package handlers

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/proisp/backend/internal/database"
	"github.com/proisp/backend/internal/models"
)

// Common timezone list for dropdown - organized by region
var CommonTimezones = []map[string]string{
	// UTC
	{"value": "UTC", "label": "UTC (Coordinated Universal Time)"},

	// Middle East
	{"value": "Asia/Beirut", "label": "Asia/Beirut - Lebanon (EET/EEST)"},
	{"value": "Asia/Baghdad", "label": "Asia/Baghdad - Iraq (AST)"},
	{"value": "Asia/Damascus", "label": "Asia/Damascus - Syria (EET/EEST)"},
	{"value": "Asia/Amman", "label": "Asia/Amman - Jordan (EET/EEST)"},
	{"value": "Asia/Jerusalem", "label": "Asia/Jerusalem - Israel (IST/IDT)"},
	{"value": "Asia/Riyadh", "label": "Asia/Riyadh - Saudi Arabia (AST)"},
	{"value": "Asia/Kuwait", "label": "Asia/Kuwait - Kuwait (AST)"},
	{"value": "Asia/Qatar", "label": "Asia/Qatar - Qatar (AST)"},
	{"value": "Asia/Dubai", "label": "Asia/Dubai - UAE (GST)"},
	{"value": "Asia/Muscat", "label": "Asia/Muscat - Oman (GST)"},
	{"value": "Asia/Bahrain", "label": "Asia/Bahrain - Bahrain (AST)"},
	{"value": "Asia/Tehran", "label": "Asia/Tehran - Iran (IRST/IRDT)"},

	// Europe
	{"value": "Europe/London", "label": "Europe/London - UK (GMT/BST)"},
	{"value": "Europe/Paris", "label": "Europe/Paris - France (CET/CEST)"},
	{"value": "Europe/Berlin", "label": "Europe/Berlin - Germany (CET/CEST)"},
	{"value": "Europe/Rome", "label": "Europe/Rome - Italy (CET/CEST)"},
	{"value": "Europe/Madrid", "label": "Europe/Madrid - Spain (CET/CEST)"},
	{"value": "Europe/Amsterdam", "label": "Europe/Amsterdam - Netherlands (CET/CEST)"},
	{"value": "Europe/Brussels", "label": "Europe/Brussels - Belgium (CET/CEST)"},
	{"value": "Europe/Vienna", "label": "Europe/Vienna - Austria (CET/CEST)"},
	{"value": "Europe/Warsaw", "label": "Europe/Warsaw - Poland (CET/CEST)"},
	{"value": "Europe/Prague", "label": "Europe/Prague - Czech Republic (CET/CEST)"},
	{"value": "Europe/Budapest", "label": "Europe/Budapest - Hungary (CET/CEST)"},
	{"value": "Europe/Athens", "label": "Europe/Athens - Greece (EET/EEST)"},
	{"value": "Europe/Bucharest", "label": "Europe/Bucharest - Romania (EET/EEST)"},
	{"value": "Europe/Sofia", "label": "Europe/Sofia - Bulgaria (EET/EEST)"},
	{"value": "Europe/Kiev", "label": "Europe/Kiev - Ukraine (EET/EEST)"},
	{"value": "Europe/Moscow", "label": "Europe/Moscow - Russia (MSK)"},
	{"value": "Europe/Istanbul", "label": "Europe/Istanbul - Turkey (TRT)"},
	{"value": "Europe/Helsinki", "label": "Europe/Helsinki - Finland (EET/EEST)"},
	{"value": "Europe/Stockholm", "label": "Europe/Stockholm - Sweden (CET/CEST)"},
	{"value": "Europe/Oslo", "label": "Europe/Oslo - Norway (CET/CEST)"},
	{"value": "Europe/Copenhagen", "label": "Europe/Copenhagen - Denmark (CET/CEST)"},
	{"value": "Europe/Lisbon", "label": "Europe/Lisbon - Portugal (WET/WEST)"},
	{"value": "Europe/Dublin", "label": "Europe/Dublin - Ireland (GMT/IST)"},
	{"value": "Europe/Zurich", "label": "Europe/Zurich - Switzerland (CET/CEST)"},

	// Asia
	{"value": "Asia/Karachi", "label": "Asia/Karachi - Pakistan (PKT)"},
	{"value": "Asia/Kolkata", "label": "Asia/Kolkata - India (IST)"},
	{"value": "Asia/Dhaka", "label": "Asia/Dhaka - Bangladesh (BST)"},
	{"value": "Asia/Bangkok", "label": "Asia/Bangkok - Thailand (ICT)"},
	{"value": "Asia/Ho_Chi_Minh", "label": "Asia/Ho_Chi_Minh - Vietnam (ICT)"},
	{"value": "Asia/Jakarta", "label": "Asia/Jakarta - Indonesia (WIB)"},
	{"value": "Asia/Singapore", "label": "Asia/Singapore - Singapore (SGT)"},
	{"value": "Asia/Kuala_Lumpur", "label": "Asia/Kuala_Lumpur - Malaysia (MYT)"},
	{"value": "Asia/Manila", "label": "Asia/Manila - Philippines (PHT)"},
	{"value": "Asia/Hong_Kong", "label": "Asia/Hong_Kong - Hong Kong (HKT)"},
	{"value": "Asia/Shanghai", "label": "Asia/Shanghai - China (CST)"},
	{"value": "Asia/Taipei", "label": "Asia/Taipei - Taiwan (CST)"},
	{"value": "Asia/Seoul", "label": "Asia/Seoul - South Korea (KST)"},
	{"value": "Asia/Tokyo", "label": "Asia/Tokyo - Japan (JST)"},

	// Africa
	{"value": "Africa/Cairo", "label": "Africa/Cairo - Egypt (EET)"},
	{"value": "Africa/Johannesburg", "label": "Africa/Johannesburg - South Africa (SAST)"},
	{"value": "Africa/Lagos", "label": "Africa/Lagos - Nigeria (WAT)"},
	{"value": "Africa/Nairobi", "label": "Africa/Nairobi - Kenya (EAT)"},
	{"value": "Africa/Casablanca", "label": "Africa/Casablanca - Morocco (WET/WEST)"},
	{"value": "Africa/Tunis", "label": "Africa/Tunis - Tunisia (CET)"},
	{"value": "Africa/Algiers", "label": "Africa/Algiers - Algeria (CET)"},
	{"value": "Africa/Tripoli", "label": "Africa/Tripoli - Libya (EET)"},
	{"value": "Africa/Khartoum", "label": "Africa/Khartoum - Sudan (CAT)"},
	{"value": "Africa/Addis_Ababa", "label": "Africa/Addis_Ababa - Ethiopia (EAT)"},

	// Americas
	{"value": "America/New_York", "label": "America/New_York - US Eastern (EST/EDT)"},
	{"value": "America/Chicago", "label": "America/Chicago - US Central (CST/CDT)"},
	{"value": "America/Denver", "label": "America/Denver - US Mountain (MST/MDT)"},
	{"value": "America/Los_Angeles", "label": "America/Los_Angeles - US Pacific (PST/PDT)"},
	{"value": "America/Toronto", "label": "America/Toronto - Canada Eastern (EST/EDT)"},
	{"value": "America/Vancouver", "label": "America/Vancouver - Canada Pacific (PST/PDT)"},
	{"value": "America/Mexico_City", "label": "America/Mexico_City - Mexico (CST/CDT)"},
	{"value": "America/Bogota", "label": "America/Bogota - Colombia (COT)"},
	{"value": "America/Lima", "label": "America/Lima - Peru (PET)"},
	{"value": "America/Santiago", "label": "America/Santiago - Chile (CLT/CLST)"},
	{"value": "America/Buenos_Aires", "label": "America/Buenos_Aires - Argentina (ART)"},
	{"value": "America/Sao_Paulo", "label": "America/Sao_Paulo - Brazil (BRT)"},
	{"value": "America/Caracas", "label": "America/Caracas - Venezuela (VET)"},

	// Australia & Pacific
	{"value": "Australia/Sydney", "label": "Australia/Sydney - Australia Eastern (AEST/AEDT)"},
	{"value": "Australia/Melbourne", "label": "Australia/Melbourne - Australia (AEST/AEDT)"},
	{"value": "Australia/Brisbane", "label": "Australia/Brisbane - Australia (AEST)"},
	{"value": "Australia/Perth", "label": "Australia/Perth - Australia Western (AWST)"},
	{"value": "Pacific/Auckland", "label": "Pacific/Auckland - New Zealand (NZST/NZDT)"},
	{"value": "Pacific/Fiji", "label": "Pacific/Fiji - Fiji (FJT)"},
	{"value": "Pacific/Honolulu", "label": "Pacific/Honolulu - Hawaii (HST)"},
}

type SettingsHandler struct{}

func NewSettingsHandler() *SettingsHandler {
	return &SettingsHandler{}
}

// List returns all system preferences
func (h *SettingsHandler) List(c *fiber.Ctx) error {
	var preferences []models.SystemPreference
	database.DB.Order("key").Find(&preferences)

	// Convert to map for easier frontend use
	settings := make(map[string]interface{})
	for _, p := range preferences {
		settings[p.Key] = p.Value
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    settings,
		"items":   preferences,
	})
}

// Get returns a single preference
func (h *SettingsHandler) Get(c *fiber.Ctx) error {
	key := c.Params("key")

	var pref models.SystemPreference
	if err := database.DB.Where("key = ?", key).First(&pref).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Setting not found",
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    pref,
	})
}

// Update updates or creates a preference
func (h *SettingsHandler) Update(c *fiber.Ctx) error {
	type UpdateRequest struct {
		Key       string `json:"key"`
		Value     string `json:"value"`
		ValueType string `json:"value_type"`
	}

	var req UpdateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
		})
	}

	if req.ValueType == "" {
		req.ValueType = "string"
	}

	var pref models.SystemPreference
	result := database.DB.Where("key = ?", req.Key).First(&pref)

	if result.Error != nil {
		// Create new
		pref = models.SystemPreference{
			Key:       req.Key,
			Value:     req.Value,
			ValueType: req.ValueType,
		}
		database.DB.Create(&pref)
	} else {
		// Update existing
		database.DB.Model(&pref).Updates(map[string]interface{}{
			"value":      req.Value,
			"value_type": req.ValueType,
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    pref,
	})
}

// BulkUpdate updates multiple preferences
func (h *SettingsHandler) BulkUpdate(c *fiber.Ctx) error {
	type SettingItem struct {
		Key   string `json:"key"`
		Value string `json:"value"`
	}

	type BulkRequest struct {
		Settings []SettingItem `json:"settings"`
	}

	var req BulkRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
		})
	}

	for _, item := range req.Settings {
		if item.Key == "" {
			continue
		}

		var pref models.SystemPreference
		result := database.DB.Where("key = ?", item.Key).First(&pref)

		if result.Error != nil {
			pref = models.SystemPreference{Key: item.Key, Value: item.Value, ValueType: "string"}
			database.DB.Create(&pref)
		} else {
			database.DB.Model(&pref).Update("value", item.Value)
		}
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Settings updated",
	})
}

// Delete removes a preference
func (h *SettingsHandler) Delete(c *fiber.Ctx) error {
	key := c.Params("key")

	result := database.DB.Where("key = ?", key).Delete(&models.SystemPreference{})
	if result.RowsAffected == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Setting not found",
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Setting deleted",
	})
}

// GetTimezones returns list of available timezones
func (h *SettingsHandler) GetTimezones(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"success": true,
		"data":    CommonTimezones,
	})
}

// GetServerTime returns current server time in configured timezone
func (h *SettingsHandler) GetServerTime(c *fiber.Ctx) error {
	tz := GetConfiguredTimezone()
	now := time.Now().In(tz)

	return c.JSON(fiber.Map{
		"success":  true,
		"time":     now.Format("15:04:05"),
		"date":     now.Format("2006-01-02"),
		"datetime": now.Format("2006-01-02 15:04:05"),
		"timezone": tz.String(),
		"unix":     now.Unix(),
	})
}

// GetConfiguredTimezone returns the configured timezone from system preferences
// Falls back to UTC if not configured or invalid
func GetConfiguredTimezone() *time.Location {
	var pref models.SystemPreference
	if err := database.DB.Where("key = ?", "system_timezone").First(&pref).Error; err != nil {
		return time.UTC
	}

	loc, err := time.LoadLocation(pref.Value)
	if err != nil {
		return time.UTC
	}

	return loc
}

// GetConfiguredTimezoneString returns the timezone string
func GetConfiguredTimezoneString() string {
	var pref models.SystemPreference
	if err := database.DB.Where("key = ?", "system_timezone").First(&pref).Error; err != nil {
		return "UTC"
	}
	return pref.Value
}

// GetBranding returns public branding info (no auth required)
func (h *SettingsHandler) GetBranding(c *fiber.Ctx) error {
	branding := map[string]string{
		"company_name": "ProISP",
		"company_logo": "",
		"primary_color": "#2563eb",
	}

	var preferences []models.SystemPreference
	database.DB.Where("key IN ?", []string{"company_name", "company_logo", "primary_color"}).Find(&preferences)

	for _, p := range preferences {
		if p.Value != "" {
			branding[p.Key] = p.Value
		}
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    branding,
	})
}

// UploadLogo handles logo file upload
func (h *SettingsHandler) UploadLogo(c *fiber.Ctx) error {
	file, err := c.FormFile("logo")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "No file uploaded",
		})
	}

	// Validate file type
	ext := strings.ToLower(filepath.Ext(file.Filename))
	allowedExts := map[string]bool{".png": true, ".jpg": true, ".jpeg": true, ".svg": true, ".webp": true}
	if !allowedExts[ext] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid file type. Allowed: PNG, JPG, JPEG, SVG, WEBP",
		})
	}

	// Validate file size (max 2MB)
	if file.Size > 2*1024*1024 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "File too large. Maximum size is 2MB",
		})
	}

	// Create uploads directory if not exists
	uploadDir := "/app/uploads"
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to create upload directory",
		})
	}

	// Delete old logo if exists
	var oldPref models.SystemPreference
	if err := database.DB.Where("key = ?", "company_logo").First(&oldPref).Error; err == nil {
		if oldPref.Value != "" {
			oldPath := filepath.Join(uploadDir, filepath.Base(oldPref.Value))
			os.Remove(oldPath)
		}
	}

	// Generate unique filename
	filename := fmt.Sprintf("logo_%s%s", uuid.New().String()[:8], ext)
	savePath := filepath.Join(uploadDir, filename)

	// Save file
	if err := c.SaveFile(file, savePath); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to save file",
		})
	}

	// Update setting
	logoURL := "/uploads/" + filename
	var pref models.SystemPreference
	result := database.DB.Where("key = ?", "company_logo").First(&pref)
	if result.Error != nil {
		pref = models.SystemPreference{Key: "company_logo", Value: logoURL, ValueType: "string"}
		database.DB.Create(&pref)
	} else {
		database.DB.Model(&pref).Update("value", logoURL)
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"url": logoURL,
		},
		"message": "Logo uploaded successfully",
	})
}

// DeleteLogo removes the company logo
func (h *SettingsHandler) DeleteLogo(c *fiber.Ctx) error {
	var pref models.SystemPreference
	if err := database.DB.Where("key = ?", "company_logo").First(&pref).Error; err != nil {
		return c.JSON(fiber.Map{
			"success": true,
			"message": "No logo to delete",
		})
	}

	// Delete file
	if pref.Value != "" {
		uploadDir := "/app/uploads"
		filePath := filepath.Join(uploadDir, filepath.Base(pref.Value))
		os.Remove(filePath)
	}

	// Clear setting
	database.DB.Model(&pref).Update("value", "")

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Logo deleted",
	})
}

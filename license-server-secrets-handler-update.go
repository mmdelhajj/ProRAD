// SSH Password Sync Fix - License Server Secrets Handler Update
// File: /opt/proxpanel-license/internal/handlers/secrets.go
//
// This shows the changes needed to the GetSecrets endpoint handler
// to include ssh_password in the response

// STEP 1: Update the LicenseSecrets model (if not already done)
// File: /opt/proxpanel-license/internal/models/models.go
//
// Add this field to the LicenseSecrets struct:
//
// type LicenseSecrets struct {
//     ID            uint      `gorm:"primaryKey"`
//     LicenseID     uint      `gorm:"not null;uniqueIndex" json:"license_id"`
//     DBPassword    string    `gorm:"column:db_password;size:64;not null" json:"db_password"`
//     RedisPassword string    `gorm:"column:redis_password;size:64" json:"redis_password"`
//     JWTSecret     string    `gorm:"column:jwt_secret;size:64;not null" json:"jwt_secret"`
//     EncryptionKey string    `gorm:"column:encryption_key;size:128;not null" json:"encryption_key"`
//     SSHPassword   string    `gorm:"column:ssh_password;size:64" json:"ssh_password"` // <-- ADD THIS
//     CreatedAt     time.Time `json:"created_at"`
//     UpdatedAt     time.Time `json:"updated_at"`
// }

// STEP 2: Update the GetSecrets handler
// File: /opt/proxpanel-license/internal/handlers/secrets.go
//
// Modify the GetSecrets function to include ssh_password in response:

package handlers

import (
    "crypto/rand"
    "encoding/hex"
    "github.com/gofiber/fiber/v2"
)

// generateRandomPassword generates a random password of specified length
func generateRandomPassword(length int) string {
    bytes := make([]byte, length)
    if _, err := rand.Read(bytes); err != nil {
        return ""
    }
    return hex.EncodeToString(bytes)[:length]
}

// GetSecrets returns database and service secrets for a license
// Updated to include SSH password for Remote Support
func (h *SecretsHandler) GetSecrets(c *fiber.Ctx) error {
    licenseKey := c.Get("X-License-Key")
    hardwareID := c.Get("X-Hardware-ID")

    if licenseKey == "" || hardwareID == "" {
        return c.Status(400).JSON(fiber.Map{
            "success": false,
            "message": "License key and hardware ID are required",
        })
    }

    // Find license
    var license models.License
    if err := database.DB.Where("license_key = ?", licenseKey).First(&license).Error; err != nil {
        return c.Status(404).JSON(fiber.Map{
            "success": false,
            "message": "License not found",
        })
    }

    // Verify hardware ID (basic check - full validation done elsewhere)
    if license.HardwareID != "" && !strings.HasPrefix(hardwareID, "stable_") {
        return c.Status(403).JSON(fiber.Map{
            "success": false,
            "message": "Invalid hardware ID format",
        })
    }

    // Get or create secrets
    var secrets models.LicenseSecrets
    result := database.DB.Where("license_id = ?", license.ID).First(&secrets)

    if result.Error != nil {
        // Create new secrets including SSH password
        secrets = models.LicenseSecrets{
            LicenseID:     license.ID,
            DBPassword:    generateRandomPassword(16),
            RedisPassword: generateRandomPassword(16),
            JWTSecret:     generateRandomPassword(32),
            EncryptionKey: generateRandomPassword(32),
            SSHPassword:   generateRandomPassword(16), // NEW
        }
        if err := database.DB.Create(&secrets).Error; err != nil {
            return c.Status(500).JSON(fiber.Map{
                "success": false,
                "message": "Failed to create secrets",
            })
        }
    } else if secrets.SSHPassword == "" {
        // Upgrade existing record: generate SSH password
        secrets.SSHPassword = generateRandomPassword(16)
        database.DB.Save(&secrets)
    }

    // Return secrets including SSH password
    return c.JSON(fiber.Map{
        "success":        true,
        "db_password":    secrets.DBPassword,
        "redis_password": secrets.RedisPassword,
        "jwt_secret":     secrets.JWTSecret,
        "encryption_key": secrets.EncryptionKey,
        "ssh_password":   secrets.SSHPassword, // NEW - this is what customers fetch
    })
}

// STEP 3: Rebuild the license server
//
// After making these changes, rebuild and restart:
//
// cd /opt/proxpanel-license
// docker compose build license-server
// docker compose up -d license-server
//
// Verify:
// docker logs proxpanel-license-server | tail -20

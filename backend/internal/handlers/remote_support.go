package handlers

import (
	"os"
	"os/exec"

	"github.com/gofiber/fiber/v2"
)

const remoteSupportFile = "/opt/proxpanel/remote-support-enabled"

type RemoteSupportHandler struct{}

func NewRemoteSupportHandler() *RemoteSupportHandler {
	return &RemoteSupportHandler{}
}

// GetStatus returns the current remote support status
func (h *RemoteSupportHandler) GetStatus(c *fiber.Ctx) error {
	_, err := os.Stat(remoteSupportFile)
	enabled := err == nil

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"enabled": enabled,
		},
	})
}

// Toggle enables or disables remote support
func (h *RemoteSupportHandler) Toggle(c *fiber.Ctx) error {
	var req struct {
		Enabled bool `json:"enabled"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
		})
	}

	if req.Enabled {
		// Create the control file to enable remote support
		file, err := os.Create(remoteSupportFile)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"success": false,
				"message": "Failed to enable remote support: " + err.Error(),
			})
		}
		file.Close()

		// Restart tunnel service
		exec.Command("systemctl", "restart", "proxpanel-tunnel").Run()
	} else {
		// Remove the control file to disable remote support
		os.Remove(remoteSupportFile)

		// Stop tunnel service
		exec.Command("systemctl", "stop", "proxpanel-tunnel").Run()
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Remote support " + map[bool]string{true: "enabled", false: "disabled"}[req.Enabled],
		"data": fiber.Map{
			"enabled": req.Enabled,
		},
	})
}

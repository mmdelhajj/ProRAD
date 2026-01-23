package handlers

import (
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/proisp/backend/internal/database"
	"github.com/proisp/backend/internal/mikrotik"
	"github.com/proisp/backend/internal/models"
	"github.com/proisp/backend/internal/radius"
)

type SessionHandler struct{}

func NewSessionHandler() *SessionHandler {
	return &SessionHandler{}
}

// ActiveSession represents a live PPPoE session from radacct
type ActiveSession struct {
	ID               uint       `json:"id"`
	Username         string     `json:"username"`
	FullName         string     `json:"full_name"`
	ServiceName      string     `json:"service_name"`
	NASIPAddress     string     `json:"nas_ip_address"`
	NASName          string     `json:"nas_name"`
	FramedIPAddress  string     `json:"framed_ip_address"`
	CallingStationID string     `json:"calling_station_id"` // MAC address
	AcctSessionID    string     `json:"acct_session_id"`
	AcctStartTime    *time.Time `json:"acct_start_time"`
	SessionDuration  int        `json:"session_duration"` // seconds
	AcctInputOctets  int64      `json:"acct_input_octets"`
	AcctOutputOctets int64      `json:"acct_output_octets"`
	Status           string     `json:"status"`
}

// List returns all active sessions from radacct
func (h *SessionHandler) List(c *fiber.Ctx) error {
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 50)
	status := c.Query("status", "online") // online = active sessions (no stop time)
	nasIP := c.Query("nas_ip", "")
	search := c.Query("search", "")

	if page < 1 {
		page = 1
	}
	if limit > 200 {
		limit = 200
	}
	offset := (page - 1) * limit

	// Query radacct for active sessions
	query := database.DB.Table("radacct").
		Select(`radacct.id, radacct.username, radacct.nas_ip_address, radacct.framed_ip_address,
			radacct.calling_station_id, radacct.acct_session_id, radacct.acct_start_time,
			radacct.acct_session_time, radacct.acct_input_octets, radacct.acct_output_octets,
			COALESCE(subscribers.full_name, '') as full_name,
			COALESCE(services.name, '') as service_name,
			COALESCE(nas_devices.name, radacct.nas_ip_address) as nas_name`)

	// Left join to get subscriber info
	query = query.Joins("LEFT JOIN subscribers ON radacct.username = subscribers.username")
	query = query.Joins("LEFT JOIN services ON subscribers.service_id = services.id")
	query = query.Joins("LEFT JOIN nas_devices ON radacct.nas_ip_address = nas_devices.ip_address")

	// Filter by status
	if status == "online" {
		query = query.Where("radacct.acct_stop_time IS NULL")
	} else if status == "offline" {
		query = query.Where("radacct.acct_stop_time IS NOT NULL")
	}

	// Filter by NAS
	if nasIP != "" {
		query = query.Where("radacct.nas_ip_address = ?", nasIP)
	}

	// Search
	if search != "" {
		searchPattern := "%" + search + "%"
		query = query.Where("radacct.username ILIKE ? OR radacct.framed_ip_address ILIKE ? OR radacct.calling_station_id ILIKE ?",
			searchPattern, searchPattern, searchPattern)
	}

	// Count total
	var total int64
	countQuery := database.DB.Table("radacct")
	if status == "online" {
		countQuery = countQuery.Where("acct_stop_time IS NULL")
	} else if status == "offline" {
		countQuery = countQuery.Where("acct_stop_time IS NOT NULL")
	}
	if nasIP != "" {
		countQuery = countQuery.Where("nas_ip_address = ?", nasIP)
	}
	if search != "" {
		searchPattern := "%" + search + "%"
		countQuery = countQuery.Where("username ILIKE ? OR framed_ip_address ILIKE ? OR calling_station_id ILIKE ?",
			searchPattern, searchPattern, searchPattern)
	}
	countQuery.Count(&total)

	// Fetch sessions
	var results []struct {
		ID               uint       `gorm:"column:id"`
		Username         string     `gorm:"column:username"`
		NASIPAddress     string     `gorm:"column:nas_ip_address"`
		FramedIPAddress  string     `gorm:"column:framed_ip_address"`
		CallingStationID string     `gorm:"column:calling_station_id"`
		AcctSessionID    string     `gorm:"column:acct_session_id"`
		AcctStartTime    *time.Time `gorm:"column:acct_start_time"`
		AcctSessionTime  int        `gorm:"column:acct_session_time"`
		AcctInputOctets  int64      `gorm:"column:acct_input_octets"`
		AcctOutputOctets int64      `gorm:"column:acct_output_octets"`
		FullName         string     `gorm:"column:full_name"`
		ServiceName      string     `gorm:"column:service_name"`
		NASName          string     `gorm:"column:nas_name"`
	}

	query.Order("radacct.acct_start_time DESC").Offset(offset).Limit(limit).Scan(&results)

	// Convert to response format
	sessions := make([]ActiveSession, len(results))
	for i, r := range results {
		sessions[i] = ActiveSession{
			ID:               r.ID,
			Username:         r.Username,
			FullName:         r.FullName,
			ServiceName:      r.ServiceName,
			NASIPAddress:     r.NASIPAddress,
			NASName:          r.NASName,
			FramedIPAddress:  r.FramedIPAddress,
			CallingStationID: r.CallingStationID,
			AcctSessionID:    r.AcctSessionID,
			AcctStartTime:    r.AcctStartTime,
			SessionDuration:  r.AcctSessionTime,
			AcctInputOctets:  r.AcctInputOctets,
			AcctOutputOctets: r.AcctOutputOctets,
			Status:           "online",
		}
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    sessions,
		"meta": fiber.Map{
			"page":       page,
			"limit":      limit,
			"total":      total,
			"totalPages": (total + int64(limit) - 1) / int64(limit),
		},
	})
}

// Get returns a single session
func (h *SessionHandler) Get(c *fiber.Ctx) error {
	id := c.Params("id")

	var session models.RadAcct
	if err := database.DB.First(&session, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Session not found",
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    session,
	})
}

// Disconnect disconnects an active session using RADIUS CoA
func (h *SessionHandler) Disconnect(c *fiber.Ctx) error {
	id := c.Params("id")

	// Get the session from radacct
	var session models.RadAcct
	if err := database.DB.First(&session, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Session not found",
		})
	}

	if session.AcctStopTime != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Session is already terminated",
		})
	}

	// Get NAS device info for CoA
	var nas models.Nas
	if err := database.DB.Where("ip_address = ?", session.NasIPAddress).First(&nas).Error; err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "NAS device not found",
		})
	}

	// Try MikroTik API disconnect first
	client := mikrotik.NewClient(
		fmt.Sprintf("%s:%d", nas.IPAddress, nas.APIPort),
		nas.APIUsername,
		nas.APIPassword,
	)
	defer client.Close()

	err := client.DisconnectUser(session.Username)
	if err != nil {
		// Fall back to RADIUS CoA disconnect
		coaClient := radius.NewCOAClient(nas.IPAddress, nas.CoAPort, nas.Secret)
		err = coaClient.DisconnectUser(session.Username, session.AcctSessionID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"success": false,
				"message": "Failed to disconnect: " + err.Error(),
			})
		}
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Disconnect request sent",
	})
}

// GetStats returns session statistics
func (h *SessionHandler) GetStats(c *fiber.Ctx) error {
	var online int64

	// Count active sessions from radacct
	database.DB.Table("radacct").Where("acct_stop_time IS NULL").Count(&online)

	// Sessions by NAS
	type NASSession struct {
		NASIPAddress string `json:"nas_ip_address"`
		NASName      string `json:"nas_name"`
		OnlineCount  int64  `json:"online_count"`
	}
	var byNAS []NASSession
	database.DB.Table("radacct").
		Select("nas_ip_address, COUNT(*) as online_count").
		Where("acct_stop_time IS NULL").
		Group("nas_ip_address").
		Scan(&byNAS)

	// Get NAS names
	for i := range byNAS {
		var nas models.Nas
		if err := database.DB.Where("ip_address = ?", byNAS[i].NASIPAddress).First(&nas).Error; err == nil {
			byNAS[i].NASName = nas.Name
		} else {
			byNAS[i].NASName = byNAS[i].NASIPAddress
		}
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"online": online,
			"byNAS":  byNAS,
		},
	})
}

// DisconnectByUsername disconnects all sessions for a username
func (h *SessionHandler) DisconnectByUsername(c *fiber.Ctx) error {
	username := c.Params("username")

	// Get active sessions for this user
	var sessions []models.RadAcct
	database.DB.Where("username = ? AND acct_stop_time IS NULL", username).Find(&sessions)

	if len(sessions) == 0 {
		return c.JSON(fiber.Map{
			"success": true,
			"message": "No active sessions found",
			"data": fiber.Map{
				"affected": 0,
			},
		})
	}

	// Disconnect each session
	disconnected := 0
	for _, session := range sessions {
		var nas models.Nas
		if err := database.DB.Where("ip_address = ?", session.NasIPAddress).First(&nas).Error; err != nil {
			continue
		}

		// Try MikroTik API disconnect
		client := mikrotik.NewClient(
			fmt.Sprintf("%s:%d", nas.IPAddress, nas.APIPort),
			nas.APIUsername,
			nas.APIPassword,
		)

		if err := client.DisconnectUser(username); err == nil {
			disconnected++
		} else {
			// Try CoA
			coaClient := radius.NewCOAClient(nas.IPAddress, nas.CoAPort, nas.Secret)
			if err := coaClient.DisconnectUser(username, session.AcctSessionID); err == nil {
				disconnected++
			}
		}
		client.Close()
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Disconnect requests sent",
		"data": fiber.Map{
			"affected": disconnected,
		},
	})
}

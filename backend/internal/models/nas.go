package models

import (
	"time"

	"gorm.io/gorm"
)

// NasType represents the type of NAS device
type NasType string

const (
	NasTypeMikrotik  NasType = "mikrotik"
	NasTypeCisco     NasType = "cisco"
	NasTypeHuawei    NasType = "huawei"
	NasTypeUbiquiti  NasType = "ubiquiti"
	NasTypeOther     NasType = "other"
)

// Nas represents a NAS/Router device
type Nas struct {
	ID              uint           `gorm:"primaryKey" json:"id"`
	Name            string         `gorm:"size:100;not null" json:"name"`
	ShortName       string         `gorm:"size:50;uniqueIndex" json:"short_name"`
	IPAddress       string         `gorm:"size:50;not null;uniqueIndex" json:"ip_address"`
	Type            NasType        `gorm:"size:50;default:mikrotik" json:"type"`
	Description     string         `gorm:"size:255" json:"description"`

	// RADIUS
	Secret          string         `gorm:"size:100;not null" json:"secret"`
	AuthPort        int            `gorm:"default:1812" json:"auth_port"`
	AcctPort        int            `gorm:"default:1813" json:"acct_port"`
	CoAPort         int            `gorm:"column:coa_port;default:3799" json:"coa_port"`

	// Mikrotik API
	APIUsername     string         `gorm:"size:100" json:"api_username"`
	APIPassword     string         `gorm:"size:255" json:"api_password"`
	APIPort         int            `gorm:"default:8728" json:"api_port"`
	APISSLPort      int            `gorm:"default:8729" json:"api_ssl_port"`
	UseSSL          bool           `gorm:"default:false" json:"use_ssl"`

	// PCQ/CDN Settings
	SubscriberPools string         `gorm:"size:500" json:"subscriber_pools"` // Comma-separated pool names or CIDRs for PCQ target

	// Realm Settings (for RADIUS authentication)
	AllowedRealms   string         `gorm:"size:500" json:"allowed_realms"` // Comma-separated list of allowed realms (e.g., "test.mes.net.lb,other.domain.com")

	// Status
	IsActive        bool           `gorm:"default:true" json:"is_active"`
	IsOnline        bool           `gorm:"default:false" json:"is_online"`
	LastSeen        *time.Time     `json:"last_seen"`
	Version         string         `gorm:"size:50" json:"version"`

	// Stats
	ActiveSessions  int            `gorm:"default:0" json:"active_sessions"`
	TotalUsers      int            `gorm:"default:0" json:"total_users"`

	// Timestamps
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
	DeletedAt       gorm.DeletedAt `gorm:"index" json:"-"`
}

func (Nas) TableName() string {
	return "nas_devices"
}

// GetSecretForRADIUS returns the RADIUS shared secret
func (n *Nas) GetSecretForRADIUS() []byte {
	return []byte(n.Secret)
}

package models

import (
	"fmt"
	"time"

	"gorm.io/gorm"
)

// SubscriberStatus represents the status of a subscriber
type SubscriberStatus int

const (
	SubscriberStatusActive   SubscriberStatus = 1
	SubscriberStatusInactive SubscriberStatus = 2
	SubscriberStatusExpired  SubscriberStatus = 3
	SubscriberStatusStopped  SubscriberStatus = 4
)

// Subscriber represents a PPPoE/Hotspot subscriber
type Subscriber struct {
	ID              uint             `gorm:"primaryKey" json:"id"`
	Username        string           `gorm:"uniqueIndex;size:100;not null" json:"username"`
	Password        string           `gorm:"size:255;not null" json:"-"`
	PasswordPlain   string           `gorm:"size:255" json:"password_plain"` // For RADIUS CHAP
	FullName        string           `gorm:"size:255" json:"full_name"`
	Email           string           `gorm:"size:255" json:"email"`
	Phone           string           `gorm:"size:50" json:"phone"`
	Address         string           `gorm:"size:500" json:"address"`
	Region          string           `gorm:"size:100" json:"region"`
	Building        string           `gorm:"size:100" json:"building"`
	Nationality     string           `gorm:"size:100" json:"nationality"`
	Note            string           `gorm:"type:text" json:"note"`

	// Service & Billing
	ServiceID       uint             `gorm:"not null" json:"service_id"`
	Service         Service          `gorm:"foreignKey:ServiceID" json:"service"`
	Status          SubscriberStatus `gorm:"default:1" json:"status"`
	ExpiryDate      time.Time        `json:"expiry_date"`
	DueDate         *time.Time       `json:"due_date"`
	Price           float64          `gorm:"type:decimal(15,2)" json:"price"`
	OverridePrice   bool             `gorm:"default:false" json:"override_price"`
	AutoRenew       bool             `gorm:"default:false" json:"auto_renew"`

	// Quota & FUP - stored in database for persistence
	DailyDownloadUsed   int64      `gorm:"default:0" json:"daily_download_used"`
	DailyUploadUsed     int64      `gorm:"default:0" json:"daily_upload_used"`
	MonthlyDownloadUsed int64      `gorm:"default:0" json:"monthly_download_used"`
	MonthlyUploadUsed   int64      `gorm:"default:0" json:"monthly_upload_used"`
	FUPLevel            int        `gorm:"default:0" json:"fup_level"`         // Daily FUP level (0=normal, 1-3=FUP tiers)
	MonthlyFUPLevel     int        `gorm:"default:0" json:"monthly_fup_level"` // Monthly FUP level (0=normal, 1-3=FUP tiers)
	LastDailyReset      *time.Time `json:"last_daily_reset"`
	LastMonthlyReset    *time.Time `json:"last_monthly_reset"`
	// Session tracking for quota sync (tracks current session bytes to calculate delta)
	LastSessionDownload int64      `gorm:"default:0" json:"last_session_download"`
	LastSessionUpload   int64      `gorm:"default:0" json:"last_session_upload"`
	LastQuotaSync       *time.Time `json:"last_quota_sync"`
	// CDN bypass quota tracking (tracks CDN traffic that shouldn't count against quota)
	LastBypassCDNBytes  int64      `gorm:"default:0" json:"last_bypass_cdn_bytes"`
	// Legacy fields (kept for compatibility)
	DailyQuotaUsed   int64      `gorm:"default:0" json:"daily_quota_used"`
	MonthlyQuotaUsed int64      `gorm:"default:0" json:"monthly_quota_used"`
	LastQuotaReset   *time.Time `json:"last_quota_reset"`

	// Network
	MACAddress      string  `gorm:"size:50;index" json:"mac_address"`
	IPAddress       string  `gorm:"size:50" json:"ip_address"`
	StaticIP        string  `gorm:"size:50" json:"static_ip"`
	SaveMAC         bool    `gorm:"default:true" json:"save_mac"`
	NasID           *uint   `json:"nas_id"`
	Nas             *Nas    `gorm:"foreignKey:NasID" json:"nas,omitempty"`

	// Location
	SwitchID        *uint   `json:"switch_id"`
	Switch          *Switch `gorm:"foreignKey:SwitchID" json:"switch,omitempty"`
	Latitude        float64 `gorm:"type:decimal(10,8)" json:"latitude"`
	Longitude       float64 `gorm:"type:decimal(11,8)" json:"longitude"`

	// Ownership
	ResellerID      uint     `gorm:"not null;index" json:"reseller_id"`
	Reseller        Reseller `gorm:"foreignKey:ResellerID" json:"reseller"`
	CollectorID     *uint    `json:"collector_id"`

	// Session
	IsOnline             bool       `gorm:"default:false;index" json:"is_online"`
	LastSeen             *time.Time `json:"last_seen"`
	SessionID            string     `gorm:"size:100" json:"session_id"`
	SimultaneousSessions int        `gorm:"default:1" json:"simultaneous_sessions"`

	// Auto-recharge
	AutoRecharge    bool `gorm:"default:false" json:"auto_recharge"`
	AutoRechargeDays int `gorm:"default:0" json:"auto_recharge_days"`

	// Timestamps
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
	DeletedAt       gorm.DeletedAt `gorm:"index" json:"-"`
}

// Switch represents a network switch/location
type Switch struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	Name      string         `gorm:"size:100;not null" json:"name"`
	Location  string         `gorm:"size:255" json:"location"`
	ParentID  *uint          `json:"parent_id"`
	Parent    *Switch        `gorm:"foreignKey:ParentID" json:"parent,omitempty"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// SubscriberBandwidthRuleType represents the type of bandwidth rule
type SubscriberBandwidthRuleType string

const (
	BandwidthRuleTypeInternet SubscriberBandwidthRuleType = "internet"
	BandwidthRuleTypeCDN      SubscriberBandwidthRuleType = "cdn"
)

// SubscriberBandwidthRule represents a per-subscriber bandwidth override rule
type SubscriberBandwidthRule struct {
	ID            uint                        `gorm:"primaryKey" json:"id"`
	SubscriberID  uint                        `gorm:"not null;index" json:"subscriber_id"`
	Subscriber    *Subscriber                 `gorm:"foreignKey:SubscriberID" json:"-"`
	RuleType      SubscriberBandwidthRuleType `gorm:"size:20;not null" json:"rule_type"` // "internet" or "cdn"
	Enabled       bool                        `gorm:"default:true" json:"enabled"`
	DownloadSpeed int                         `gorm:"default:0" json:"download_speed"` // in kbps
	UploadSpeed   int                         `gorm:"default:0" json:"upload_speed"`   // in kbps
	CDNID         uint                        `gorm:"default:0" json:"cdn_id"`         // CDN ID for CDN type rules
	CDNName       string                      `gorm:"size:100" json:"cdn_name"`        // CDN name for display
	Duration      string                      `gorm:"size:20" json:"duration"`         // Duration like "1h", "2h", "1d", "2d", "permanent"
	ExpiresAt     *time.Time                  `json:"expires_at"`                      // When the rule expires (calculated from duration)
	Priority      int                         `gorm:"default:0" json:"priority"`       // Higher priority rules are applied first
	CreatedAt     time.Time                   `json:"created_at"`
	UpdatedAt     time.Time                   `json:"updated_at"`
}

func (SubscriberBandwidthRule) TableName() string {
	return "subscriber_bandwidth_rules"
}

// IsActiveNow checks if the rule is currently active (not expired)
func (r *SubscriberBandwidthRule) IsActiveNow() bool {
	if !r.Enabled {
		return false
	}

	// Check expiration if set
	if r.ExpiresAt != nil && time.Now().After(*r.ExpiresAt) {
		return false
	}

	return true
}

// IsExpired checks if the rule has expired
func (r *SubscriberBandwidthRule) IsExpired() bool {
	if r.ExpiresAt == nil {
		return false // Permanent rule
	}
	return time.Now().After(*r.ExpiresAt)
}

// TimeRemaining returns the remaining time as a human-readable string
func (r *SubscriberBandwidthRule) TimeRemaining() string {
	if r.ExpiresAt == nil {
		return "Permanent"
	}
	remaining := time.Until(*r.ExpiresAt)
	if remaining <= 0 {
		return "Expired"
	}
	if remaining >= 24*time.Hour {
		days := int(remaining.Hours() / 24)
		return fmt.Sprintf("%dd %dh", days, int(remaining.Hours())%24)
	}
	return fmt.Sprintf("%dh %dm", int(remaining.Hours()), int(remaining.Minutes())%60)
}

func (Subscriber) TableName() string {
	return "subscribers"
}

func (Switch) TableName() string {
	return "switches"
}

// IsExpired returns true if the subscriber's subscription has expired
func (s *Subscriber) IsExpired() bool {
	return time.Now().After(s.ExpiryDate)
}

// DaysRemaining returns the number of days remaining in subscription
func (s *Subscriber) DaysRemaining() int {
	if s.IsExpired() {
		return 0
	}
	return int(time.Until(s.ExpiryDate).Hours() / 24)
}

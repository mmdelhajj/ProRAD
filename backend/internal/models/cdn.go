package models

import (
	"time"

	"gorm.io/gorm"
)

// CDN represents a Content Delivery Network entry
type CDN struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	Name        string         `gorm:"size:100;not null;uniqueIndex" json:"name"`
	Description string         `gorm:"size:255" json:"description"`
	Subnets     string         `gorm:"type:text" json:"subnets"` // Comma-separated subnets e.g., "185.82.96.0/24, 185.82.97.0/24"
	Color       string         `gorm:"size:20;default:#EF4444" json:"color"` // Hex color for live graph (default red)
	NASIDs      string         `gorm:"size:500" json:"nas_ids"` // Comma-separated NAS IDs to sync to (empty = all NAS)
	IsActive    bool           `gorm:"default:true" json:"is_active"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

// ServiceCDN represents the many-to-many relationship between Service and CDN
// with additional fields for speed limit and bypass settings
type ServiceCDN struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	ServiceID     uint      `gorm:"uniqueIndex:idx_service_cdn;not null" json:"service_id"`
	Service       Service   `gorm:"foreignKey:ServiceID" json:"service,omitempty"`
	CDNID         uint      `gorm:"uniqueIndex:idx_service_cdn;not null" json:"cdn_id"`
	CDN           CDN       `gorm:"foreignKey:CDNID" json:"cdn,omitempty"`
	SpeedLimit    int64     `gorm:"default:0" json:"speed_limit"`    // Speed limit in Mbps for this CDN (0 = no limit)
	BypassQuota   bool      `gorm:"default:false" json:"bypass_quota"` // If true, traffic to this CDN doesn't count against quota
	PCQEnabled    bool      `gorm:"default:false" json:"pcq_enabled"`  // If true, use PCQ queue instead of per-customer queues
	PCQLimit      int       `gorm:"default:50" json:"pcq_limit"`       // PCQ limit per connection in KiB (default 50)
	PCQTotalLimit int       `gorm:"default:2000" json:"pcq_total_limit"` // PCQ total limit in KiB (default 2000)
	PCQNASID      *uint     `gorm:"default:null" json:"pcq_nas_id"`    // NAS to apply PCQ rules to
	PCQTargetPools string   `gorm:"size:500" json:"pcq_target_pools"`  // Comma-separated pool names or CIDRs for PCQ target
	IsActive      bool      `gorm:"default:true" json:"is_active"`
	// Time-based speed control for CDN (like night-time boost)
	TimeFromHour   int  `gorm:"default:0" json:"time_from_hour"`   // Start hour (0-23)
	TimeFromMinute int  `gorm:"default:0" json:"time_from_minute"` // Start minute (0-59)
	TimeToHour     int  `gorm:"default:0" json:"time_to_hour"`     // End hour (0-23)
	TimeToMinute   int  `gorm:"default:0" json:"time_to_minute"`   // End minute (0-59)
	TimeSpeedRatio int  `gorm:"default:100" json:"time_speed_ratio"` // Speed ratio in % (100=normal, 200=double, 50=half)
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

func (CDN) TableName() string {
	return "cdns"
}

func (ServiceCDN) TableName() string {
	return "service_cdns"
}

package models

import (
	"time"

	"gorm.io/gorm"
)

// SharingDetection stores detected sharing incidents
type SharingDetection struct {
	ID                 uint           `gorm:"primaryKey" json:"id"`
	SubscriberID       uint           `gorm:"index;not null" json:"subscriber_id"`
	Subscriber         *Subscriber    `gorm:"foreignKey:SubscriberID;references:ID" json:"subscriber,omitempty"`
	Username           string         `gorm:"size:100;index" json:"username"`
	FullName           string         `gorm:"size:200" json:"full_name"`
	IPAddress          string         `gorm:"size:45" json:"ip_address"`
	ServiceName        string         `gorm:"size:100" json:"service_name"`
	NasID              *uint          `json:"nas_id"`
	NasName            string         `gorm:"size:100" json:"nas_name"`
	ConnectionCount    int            `json:"connection_count"`
	UniqueDestinations int            `json:"unique_destinations"`
	TTLValues          string         `gorm:"type:text" json:"ttl_values"` // JSON array stored as string
	TTLStatus          string         `gorm:"size:50" json:"ttl_status"`   // normal, router_detected, multiple_os, double_router
	SuspicionLevel     string         `gorm:"size:20;index" json:"suspicion_level"` // low, medium, high
	ConfidenceScore    int            `json:"confidence_score"` // 0-100
	Reasons            string         `gorm:"type:text" json:"reasons"` // JSON array stored as string
	DetectedAt         time.Time      `gorm:"index" json:"detected_at"`
	ScanType           string         `gorm:"size:20;default:'automatic'" json:"scan_type"` // automatic, manual
	CreatedAt          time.Time      `json:"created_at"`
	DeletedAt          gorm.DeletedAt `gorm:"index" json:"-"`
}

// SharingDetectionSetting stores sharing detection configuration
type SharingDetectionSetting struct {
	ID                    uint      `gorm:"primaryKey" json:"id"`
	Enabled               bool      `gorm:"default:true" json:"enabled"`
	ScanTime              string    `gorm:"size:5;default:'03:00'" json:"scan_time"` // HH:MM format
	RetentionDays         int       `gorm:"default:30" json:"retention_days"`
	MinSuspicionLevel     string    `gorm:"size:20;default:'medium'" json:"min_suspicion_level"` // Only save medium/high
	ConnectionThreshold   int       `gorm:"default:500" json:"connection_threshold"`
	NotifyOnHighRisk      bool      `gorm:"default:false" json:"notify_on_high_risk"`
	AutoSuspendRepeat     bool      `gorm:"default:false" json:"auto_suspend_repeat"` // Auto-suspend repeat offenders
	RepeatThreshold       int       `gorm:"default:5" json:"repeat_threshold"` // How many detections before action
	UpdatedAt             time.Time `json:"updated_at"`
}

func (SharingDetection) TableName() string {
	return "sharing_detections"
}

func (SharingDetectionSetting) TableName() string {
	return "sharing_detection_settings"
}

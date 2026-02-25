package models

import "time"

// CloudBackup stores metadata about a backup uploaded by a customer
type CloudBackup struct {
	ID             uint       `gorm:"primaryKey" json:"id"`
	LicenseID      uint       `gorm:"not null;index" json:"license_id"`
	BackupID       string     `gorm:"uniqueIndex;size:64" json:"backup_id"`
	Filename       string     `gorm:"size:255;not null" json:"filename"`
	FilePath       string     `gorm:"size:500;not null" json:"-"`
	SizeBytes      int64      `gorm:"not null" json:"size_bytes"`
	BackupType     string     `gorm:"size:20;default:'full'" json:"backup_type"` // full|data|config
	Status         string     `gorm:"size:20;default:'active'" json:"status"`    // active|deleted
	DownloadCount  int        `gorm:"default:0" json:"download_count"`
	LastDownloaded *time.Time `json:"last_downloaded,omitempty"`
	ExpiresAt      *time.Time `json:"expires_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

// CloudStorageUsage tracks per-license storage usage and quota
type CloudStorageUsage struct {
	LicenseID      uint       `gorm:"primaryKey" json:"license_id"`
	TotalUsedBytes int64      `gorm:"default:0" json:"total_used_bytes"`
	QuotaBytes     int64      `gorm:"default:524288000" json:"quota_bytes"` // 500MB default
	Tier           string     `gorm:"size:20;default:'free'" json:"tier"`   // free|basic|pro|enterprise
	BackupCount    int        `gorm:"default:0" json:"backup_count"`
	LastUpload     *time.Time `json:"last_upload,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

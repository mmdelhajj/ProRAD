package models

import "time"

// CloudBackup stores metadata for a customer's cloud backup file.
// NOTE: As of the time this file was generated, these models ALREADY EXIST
// in the live models.go on the license server (109.110.185.33). The live
// versions include additional fields (EncryptionKeyEncrypted, LastCleanup,
// LastUpload, Tier, License association, etc.) beyond what was originally
// specified. This file reflects the ORIGINALLY REQUESTED minimal definition.
// See README.md for reconciliation guidance.
type CloudBackup struct {
	ID               uint       `gorm:"primaryKey" json:"id"`
	LicenseID        uint       `gorm:"index;not null" json:"license_id"`
	BackupID         string     `gorm:"uniqueIndex;size:64;not null" json:"backup_id"`
	Filename         string     `gorm:"size:255;not null" json:"filename"`
	FilePath         string     `gorm:"size:500;not null" json:"-"`
	SizeBytes        int64      `gorm:"not null" json:"size_bytes"`
	CreatedAt        time.Time  `json:"created_at"`
	ExpiresAt        *time.Time `json:"expires_at"`
	DownloadCount    int        `gorm:"default:0" json:"download_count"`
	LastDownloadedAt *time.Time `json:"last_downloaded_at"`
	Status           string     `gorm:"size:20;default:'active'" json:"status"` // active|deleted
}

// CloudStorageUsage tracks storage quota per license.
// NOTE: As of the time this file was generated, this model ALREADY EXISTS
// in the live models.go on the license server (109.110.185.33). The live
// version includes additional fields (Tier, LastCleanup, LastUpload, License
// association, CreatedAt) beyond what was originally specified here.
type CloudStorageUsage struct {
	LicenseID      uint      `gorm:"primaryKey" json:"license_id"`
	TotalUsedBytes int64     `gorm:"default:0" json:"total_used_bytes"`
	QuotaBytes     int64     `gorm:"default:524288000" json:"quota_bytes"` // 500MB default
	BackupCount    int       `gorm:"default:0" json:"backup_count"`
	UpdatedAt      time.Time `json:"updated_at"`
}

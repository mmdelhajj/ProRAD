package models

import (
	"encoding/json"
	"time"

	"gorm.io/gorm"
)

// UserType represents the type of user
type UserType int

const (
	UserTypeSubscriber UserType = 1
	UserTypeReseller   UserType = 2
	UserTypeSupport    UserType = 3
	UserTypeAdmin      UserType = 4
	UserTypeCollector  UserType = 5
	UserTypeReadonly   UserType = 6
)

// MarshalJSON converts UserType to string for JSON
func (ut UserType) MarshalJSON() ([]byte, error) {
	var s string
	switch ut {
	case UserTypeSubscriber:
		s = "subscriber"
	case UserTypeReseller:
		s = "reseller"
	case UserTypeSupport:
		s = "support"
	case UserTypeAdmin:
		s = "admin"
	case UserTypeCollector:
		s = "collector"
	case UserTypeReadonly:
		s = "readonly"
	default:
		s = "unknown"
	}
	return json.Marshal(s)
}

// UnmarshalJSON converts string back to UserType for JSON parsing
func (ut *UserType) UnmarshalJSON(data []byte) error {
	var s string
	if err := json.Unmarshal(data, &s); err != nil {
		// Try as integer for backward compatibility
		var i int
		if err := json.Unmarshal(data, &i); err != nil {
			return err
		}
		*ut = UserType(i)
		return nil
	}
	switch s {
	case "subscriber":
		*ut = UserTypeSubscriber
	case "reseller":
		*ut = UserTypeReseller
	case "support":
		*ut = UserTypeSupport
	case "admin":
		*ut = UserTypeAdmin
	case "collector":
		*ut = UserTypeCollector
	case "readonly":
		*ut = UserTypeReadonly
	default:
		*ut = UserTypeSubscriber
	}
	return nil
}

// User represents a system user (admin, reseller, support, etc.)
type User struct {
	ID            uint           `gorm:"column:id;primaryKey" json:"id"`
	Username      string         `gorm:"column:username;uniqueIndex;size:100;not null" json:"username"`
	Password      string         `gorm:"column:password;size:255;not null" json:"-"`
	PasswordPlain string         `gorm:"column:password_plain;size:255" json:"password_plain,omitempty"`
	Email         string         `gorm:"column:email;size:255" json:"email"`
	Phone         string         `gorm:"column:phone;size:50" json:"phone"`
	FullName      string         `gorm:"column:full_name;size:255" json:"full_name"`
	UserType  UserType       `gorm:"column:user_type;default:1" json:"user_type"`
	IsActive  bool           `gorm:"column:is_active;default:true" json:"is_active"`
	LastLogin *time.Time     `gorm:"column:last_login" json:"last_login"`
	CreatedAt time.Time      `gorm:"column:created_at" json:"created_at"`
	UpdatedAt time.Time      `gorm:"column:updated_at" json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"column:deleted_at;index" json:"-"`

	// 2FA fields
	TwoFactorEnabled bool   `gorm:"column:two_factor_enabled;default:false" json:"two_factor_enabled"`
	TwoFactorSecret  string `gorm:"column:two_factor_secret;size:255" json:"-"`

	// Force password change on first login
	ForcePasswordChange bool `gorm:"column:force_password_change;default:false" json:"force_password_change"`

	// Relations - No FK constraint to avoid circular dependency with Reseller
	ResellerID *uint     `gorm:"column:reseller_id;index" json:"reseller_id"`
	Reseller   *Reseller `gorm:"-" json:"reseller,omitempty"`
}

// Reseller represents a reseller account
type Reseller struct {
	ID              uint           `gorm:"column:id;primaryKey" json:"id"`
	UserID          uint           `gorm:"column:user_id;uniqueIndex;not null" json:"user_id"`
	User            User           `gorm:"-" json:"user"`
	Name            string         `gorm:"column:name;size:255;not null" json:"name"`
	Balance         float64        `gorm:"column:balance;default:0;type:decimal(15,2)" json:"balance"`
	Credit          float64        `gorm:"column:credit;default:0;type:decimal(15,2)" json:"credit"`
	Address         string         `gorm:"column:address;size:500" json:"address"`
	ParentID        *uint          `gorm:"column:parent_id" json:"parent_id"`
	Parent          *Reseller      `gorm:"-" json:"parent,omitempty"`
	Children        []Reseller     `gorm:"-" json:"children,omitempty"`
	PermissionGroup *uint          `gorm:"column:permission_group" json:"permission_group"`
	BandwidthRuleID *uint          `gorm:"column:bandwidth_rule_id" json:"bandwidth_rule_id"`
	IsActive        bool           `gorm:"column:is_active;default:true" json:"is_active"`
	CreatedAt       time.Time      `gorm:"column:created_at" json:"created_at"`
	UpdatedAt       time.Time      `gorm:"column:updated_at" json:"updated_at"`
	DeletedAt       gorm.DeletedAt `gorm:"column:deleted_at;index" json:"-"`

	// Assigned NAS (many-to-many)
	NASList         []ResellerNAS  `gorm:"-" json:"nas_list,omitempty"`
}

// ResellerNAS represents the assignment of NAS to resellers
type ResellerNAS struct {
	ID         uint      `gorm:"column:id;primaryKey" json:"id"`
	ResellerID uint      `gorm:"column:reseller_id;uniqueIndex:idx_reseller_nas;not null" json:"reseller_id"`
	NASID      uint      `gorm:"column:nas_id;uniqueIndex:idx_reseller_nas;not null" json:"nas_id"`
	CreatedAt  time.Time `gorm:"column:created_at" json:"created_at"`
}

func (ResellerNAS) TableName() string {
	return "reseller_nas"
}

// Permission represents a permission
type Permission struct {
	ID          uint      `gorm:"column:id;primaryKey" json:"id"`
	Name        string    `gorm:"column:name;uniqueIndex;size:100;not null" json:"name"`
	Description string    `gorm:"column:description;size:255" json:"description"`
	CreatedAt   time.Time `gorm:"column:created_at" json:"created_at"`
}

// PermissionGroup represents a group of permissions
type PermissionGroup struct {
	ID          uint         `gorm:"column:id;primaryKey" json:"id"`
	Name        string       `gorm:"column:name;uniqueIndex;size:100;not null" json:"name"`
	Description string       `gorm:"column:description;size:255" json:"description"`
	Permissions []Permission `gorm:"-" json:"permissions"`
	CreatedAt   time.Time    `gorm:"column:created_at" json:"created_at"`
	UpdatedAt   time.Time    `gorm:"column:updated_at" json:"updated_at"`
}

func (User) TableName() string {
	return "users"
}

func (Reseller) TableName() string {
	return "resellers"
}

func (Permission) TableName() string {
	return "permissions"
}

func (PermissionGroup) TableName() string {
	return "permission_groups"
}

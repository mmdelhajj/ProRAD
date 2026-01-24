package models

import (
	"time"
)

// AuditAction represents the type of audit action
type AuditAction string

const (
	AuditActionCreate     AuditAction = "create"
	AuditActionUpdate     AuditAction = "update"
	AuditActionDelete     AuditAction = "delete"
	AuditActionLogin      AuditAction = "login"
	AuditActionLogout     AuditAction = "logout"
	AuditActionRenew      AuditAction = "renew"
	AuditActionDisconnect AuditAction = "disconnect"
	AuditActionResetFUP   AuditAction = "reset_fup"
	AuditActionResetMAC   AuditAction = "reset_mac"
	AuditActionTransfer   AuditAction = "transfer"
	AuditActionWithdraw   AuditAction = "withdraw"
)

// AuditLog represents an audit log entry
type AuditLog struct {
	ID          uint        `gorm:"primaryKey" json:"id"`
	UserID      uint        `gorm:"index" json:"user_id"`
	User        *User       `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Username    string      `gorm:"size:100" json:"username"`
	UserType    UserType    `json:"user_type"`
	Action      AuditAction `gorm:"size:50;not null;index" json:"action"`
	EntityType  string      `gorm:"size:50;index" json:"entity_type"` // subscriber, reseller, service, etc.
	EntityID    uint        `gorm:"index" json:"entity_id"`
	EntityName  string      `gorm:"size:100" json:"entity_name"`
	OldValue    string      `gorm:"type:jsonb" json:"old_value"`
	NewValue    string      `gorm:"type:jsonb" json:"new_value"`
	Description string      `gorm:"size:500" json:"description"`
	IPAddress   string      `gorm:"size:50" json:"ip_address"`
	UserAgent   string      `gorm:"size:255" json:"user_agent"`
	CreatedAt   time.Time   `gorm:"index" json:"created_at"`
}

// Notification represents a system notification
type Notification struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Title     string    `gorm:"size:255;not null" json:"title"`
	Message   string    `gorm:"type:text;not null" json:"message"`
	Type      string    `gorm:"size:50;default:info" json:"type"` // info, warning, error, success
	IsActive  bool      `gorm:"default:true" json:"is_active"`
	StartDate time.Time `json:"start_date"`
	EndDate   *time.Time `json:"end_date"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Ticket represents a support ticket
type Ticket struct {
	ID           uint         `gorm:"primaryKey" json:"id"`
	TicketNumber string       `gorm:"size:20;uniqueIndex;not null" json:"ticket_number"`
	Subject      string       `gorm:"size:255;not null" json:"subject"`
	Message      string       `gorm:"type:text;not null" json:"message"`
	Description  string       `gorm:"type:text;not null" json:"description"`
	Status       string       `gorm:"size:20;default:open;index" json:"status"` // open, pending, in_progress, resolved, closed
	Priority     string       `gorm:"size:20;default:normal" json:"priority"`   // low, normal, high, urgent
	Category     string       `gorm:"size:50" json:"category"`                  // billing, technical, general, other

	// Creator (can be subscriber, reseller, or admin)
	CreatorType  string       `gorm:"size:20" json:"creator_type"` // subscriber, reseller, admin
	SubscriberID *uint        `json:"subscriber_id"`
	Subscriber   *Subscriber  `gorm:"foreignKey:SubscriberID" json:"subscriber,omitempty"`
	ResellerID   *uint        `json:"reseller_id"`
	Reseller     *Reseller    `gorm:"foreignKey:ResellerID" json:"reseller,omitempty"`
	CreatedBy    *uint        `json:"created_by"`
	CreatedByUser *User       `gorm:"foreignKey:CreatedBy" json:"created_by_user,omitempty"`

	// Assignment
	AssignedTo   *uint        `json:"assigned_to"`
	AssignedUser *User        `gorm:"foreignKey:AssignedTo" json:"assigned_user,omitempty"`

	// Replies
	Replies      []TicketReply `gorm:"foreignKey:TicketID" json:"replies"`

	CreatedAt    time.Time    `json:"created_at"`
	UpdatedAt    time.Time    `json:"updated_at"`
	ClosedAt     *time.Time   `json:"closed_at"`
}

// TicketReply represents a reply to a ticket
type TicketReply struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	TicketID   uint      `gorm:"not null;index" json:"ticket_id"`
	Message    string    `gorm:"type:text;not null" json:"message"`
	UserID     uint      `json:"user_id"`
	User       *User     `gorm:"foreignKey:UserID" json:"user,omitempty"`
	IsInternal bool      `gorm:"default:false" json:"is_internal"` // Internal notes not visible to customer
	CreatedAt  time.Time `json:"created_at"`
}

// CommunicationTemplate represents a message template
type CommunicationTemplate struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"size:100;not null" json:"name"`
	Type      string    `gorm:"size:20;not null" json:"type"` // sms, whatsapp, email
	Subject   string    `gorm:"size:255" json:"subject"`
	Body      string    `gorm:"type:text;not null" json:"body"`
	Variables string    `gorm:"type:text" json:"variables"` // JSON array of available variables
	IsActive  bool      `gorm:"default:true" json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// CommunicationRule represents an automation rule
type CommunicationRule struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	Name           string    `gorm:"size:100;not null" json:"name"`
	TriggerEvent   string    `gorm:"column:trigger_event;size:50;not null" json:"trigger_event"` // expiry_warning, expired, quota_warning, etc
	Channel        string    `gorm:"size:20;not null;default:sms" json:"channel"`                // sms, email, whatsapp
	DaysBefore     int       `gorm:"default:0" json:"days_before"`
	Template       string    `gorm:"type:text" json:"template"` // Message template with variables
	Enabled        bool      `gorm:"default:true" json:"enabled"`
	SendToReseller bool      `gorm:"default:false" json:"send_to_reseller"`
	ResellerID     *uint     `json:"reseller_id"` // nil = global
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// CommunicationLog represents a sent message log
type CommunicationLog struct {
	ID           uint               `gorm:"primaryKey" json:"id"`
	Type         string             `gorm:"size:20;not null;index" json:"type"` // sms, whatsapp, email
	Recipient    string             `gorm:"size:255;not null" json:"recipient"`
	Subject      string             `gorm:"size:255" json:"subject"`
	Message      string             `gorm:"type:text" json:"message"`
	Status       string             `gorm:"size:20;default:pending" json:"status"` // pending, sent, failed
	ErrorMessage string             `gorm:"size:500" json:"error_message"`
	SubscriberID *uint              `gorm:"index" json:"subscriber_id"`
	Subscriber   *Subscriber        `gorm:"foreignKey:SubscriberID" json:"subscriber,omitempty"`
	ResellerID   *uint              `gorm:"index" json:"reseller_id"`
	RuleID       *uint              `json:"rule_id"`
	Rule         *CommunicationRule `gorm:"foreignKey:RuleID" json:"rule,omitempty"`
	CreatedAt    time.Time          `gorm:"index" json:"created_at"`
	SentAt       *time.Time         `json:"sent_at"`
}

func (AuditLog) TableName() string {
	return "audit_logs"
}

func (Notification) TableName() string {
	return "notifications"
}

func (Ticket) TableName() string {
	return "tickets"
}

func (TicketReply) TableName() string {
	return "ticket_replies"
}

func (CommunicationTemplate) TableName() string {
	return "communication_templates"
}

func (CommunicationRule) TableName() string {
	return "communication_rules"
}

func (CommunicationLog) TableName() string {
	return "communication_logs"
}

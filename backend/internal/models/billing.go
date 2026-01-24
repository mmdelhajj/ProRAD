package models

import (
	"time"

	"gorm.io/gorm"
)

// TransactionType represents the type of transaction
type TransactionType string

const (
	TransactionTypeRenewal      TransactionType = "renewal"
	TransactionTypeNew          TransactionType = "new"
	TransactionTypeTransfer     TransactionType = "transfer"
	TransactionTypeWithdraw     TransactionType = "withdraw"
	TransactionTypeRefund       TransactionType = "refund"
	TransactionTypeResetFUP     TransactionType = "reset_fup"
	TransactionTypeRename       TransactionType = "rename"
	TransactionTypeChangeService TransactionType = "change_service"
	TransactionTypeStaticIP     TransactionType = "static_ip"
	TransactionTypeAddon        TransactionType = "addon"
	TransactionTypePrepaidCard  TransactionType = "prepaid_card"
	TransactionTypeRefill       TransactionType = "refill"
)

// PaymentStatus represents the status of a payment
type PaymentStatus string

const (
	PaymentStatusPending   PaymentStatus = "pending"
	PaymentStatusCompleted PaymentStatus = "completed"
	PaymentStatusFailed    PaymentStatus = "failed"
	PaymentStatusRefunded  PaymentStatus = "refunded"
)

// Transaction represents a financial transaction
type Transaction struct {
	ID              uint            `gorm:"primaryKey" json:"id"`
	Type            TransactionType `gorm:"size:50;not null;index" json:"type"`
	Amount          float64         `gorm:"type:decimal(15,2);not null" json:"amount"`
	BalanceBefore   float64         `gorm:"type:decimal(15,2)" json:"balance_before"`
	BalanceAfter    float64         `gorm:"type:decimal(15,2)" json:"balance_after"`
	Description     string          `gorm:"size:500" json:"description"`

	// Service change tracking
	OldServiceName  string     `gorm:"size:100" json:"old_service_name"`
	NewServiceName  string     `gorm:"size:100" json:"new_service_name"`
	ServiceName     string     `gorm:"size:100" json:"service_name"` // For new/renewal transactions

	// Related entities
	ResellerID      uint       `gorm:"not null;index" json:"reseller_id"`
	Reseller        Reseller   `gorm:"foreignKey:ResellerID" json:"reseller"`
	SubscriberID    *uint      `gorm:"index" json:"subscriber_id"`
	Subscriber      *Subscriber `gorm:"foreignKey:SubscriberID" json:"subscriber,omitempty"`
	TargetResellerID *uint     `json:"target_reseller_id"`
	TargetReseller  *Reseller  `gorm:"foreignKey:TargetResellerID" json:"target_reseller,omitempty"`

	// Metadata
	IPAddress       string     `gorm:"size:50" json:"ip_address"`
	UserAgent       string     `gorm:"size:255" json:"user_agent"`
	CreatedBy       uint       `json:"created_by"`

	CreatedAt       time.Time  `gorm:"index" json:"created_at"`
}

// Invoice represents an invoice
type Invoice struct {
	ID              uint           `gorm:"primaryKey" json:"id"`
	InvoiceNumber   string         `gorm:"size:50;uniqueIndex;not null" json:"invoice_number"`
	SubscriberID    uint           `gorm:"not null;index" json:"subscriber_id"`
	Subscriber      Subscriber     `gorm:"foreignKey:SubscriberID" json:"subscriber"`
	ResellerID      uint           `gorm:"not null;index" json:"reseller_id"`
	Reseller        Reseller       `gorm:"foreignKey:ResellerID" json:"reseller"`

	// Amounts
	SubTotal        float64        `gorm:"type:decimal(15,2)" json:"sub_total"`
	Discount        float64        `gorm:"type:decimal(15,2);default:0" json:"discount"`
	Tax             float64        `gorm:"type:decimal(15,2);default:0" json:"tax"`
	Total           float64        `gorm:"type:decimal(15,2);not null" json:"total"`
	AmountPaid      float64        `gorm:"type:decimal(15,2);default:0" json:"amount_paid"`

	// Status
	Status          PaymentStatus  `gorm:"size:20;default:pending;index" json:"status"`
	DueDate         time.Time      `json:"due_date"`
	PaidDate        *time.Time     `json:"paid_date"`

	// Details
	Notes           string         `gorm:"type:text" json:"notes"`
	Items           []InvoiceItem  `gorm:"foreignKey:InvoiceID" json:"items"`

	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
	DeletedAt       gorm.DeletedAt `gorm:"index" json:"-"`
}

// InvoiceItem represents an item in an invoice
type InvoiceItem struct {
	ID          uint    `gorm:"primaryKey" json:"id"`
	InvoiceID   uint    `gorm:"not null;index" json:"invoice_id"`
	Description string  `gorm:"size:255;not null" json:"description"`
	Quantity    int     `gorm:"default:1" json:"quantity"`
	UnitPrice   float64 `gorm:"type:decimal(15,2);not null" json:"unit_price"`
	Total       float64 `gorm:"type:decimal(15,2);not null" json:"total"`
}

// Payment represents a payment
type Payment struct {
	ID              uint           `gorm:"primaryKey" json:"id"`
	InvoiceID       *uint          `gorm:"index" json:"invoice_id"`
	Invoice         *Invoice       `gorm:"foreignKey:InvoiceID" json:"invoice,omitempty"`
	SubscriberID    uint           `gorm:"not null;index" json:"subscriber_id"`
	Subscriber      Subscriber     `gorm:"foreignKey:SubscriberID" json:"subscriber"`
	ResellerID      uint           `gorm:"not null;index" json:"reseller_id"`
	Reseller        Reseller       `gorm:"foreignKey:ResellerID" json:"reseller"`
	CollectorID     *uint          `json:"collector_id"`

	Amount          float64        `gorm:"type:decimal(15,2);not null" json:"amount"`
	Method          string         `gorm:"size:50;default:cash" json:"method"` // cash, card, online
	Reference       string         `gorm:"size:100" json:"reference"`
	Notes           string         `gorm:"type:text" json:"notes"`
	Status          PaymentStatus  `gorm:"size:20;default:completed" json:"status"`

	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
}

// PrepaidCard represents a prepaid/voucher card
type PrepaidCard struct {
	ID              uint           `gorm:"primaryKey" json:"id"`
	Code            string         `gorm:"size:50;uniqueIndex;not null" json:"code"`
	PIN             string         `gorm:"size:20" json:"pin"`
	ServiceID       uint           `gorm:"not null" json:"service_id"`
	Service         Service        `gorm:"foreignKey:ServiceID" json:"service"`
	ResellerID      uint           `gorm:"not null;index" json:"reseller_id"`
	Reseller        Reseller       `gorm:"foreignKey:ResellerID" json:"reseller"`

	// Card details
	Value           float64        `gorm:"type:decimal(15,2);not null" json:"value"`
	Days            int            `gorm:"default:30" json:"days"`
	QuotaRefill     int64          `gorm:"default:0" json:"quota_refill"` // bytes

	// Status
	IsUsed          bool           `gorm:"default:false;index" json:"is_used"`
	UsedBy          *uint          `json:"used_by"`
	UsedAt          *time.Time     `json:"used_at"`
	IsActive        bool           `gorm:"default:true" json:"is_active"`
	ExpiryDate      *time.Time     `json:"expiry_date"`

	// Batch info
	BatchID         string         `gorm:"size:50;index" json:"batch_id"`
	BatchNumber     int            `json:"batch_number"`

	CreatedAt       time.Time      `json:"created_at"`
	CreatedBy       uint           `json:"created_by"`
}

// StaticIPPrice represents static IP pricing
type StaticIPPrice struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"size:100;not null" json:"name"`
	Price     float64   `gorm:"type:decimal(15,2);not null" json:"price"`
	Days      int       `gorm:"default:30" json:"days"`
	IsActive  bool      `gorm:"default:true" json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// StaticIPRental represents a static IP rental
type StaticIPRental struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	SubscriberID uint           `gorm:"not null;index" json:"subscriber_id"`
	Subscriber   Subscriber     `gorm:"foreignKey:SubscriberID" json:"subscriber"`
	IPAddress    string         `gorm:"size:50;not null;uniqueIndex" json:"ip_address"`
	PriceID      uint           `gorm:"not null" json:"price_id"`
	Price        StaticIPPrice  `gorm:"foreignKey:PriceID" json:"price"`
	StartDate    time.Time      `json:"start_date"`
	ExpiryDate   time.Time      `json:"expiry_date"`
	IsActive     bool           `gorm:"default:true" json:"is_active"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
}

func (Transaction) TableName() string {
	return "transactions"
}

func (Invoice) TableName() string {
	return "invoices"
}

func (InvoiceItem) TableName() string {
	return "invoice_items"
}

func (Payment) TableName() string {
	return "payments"
}

func (PrepaidCard) TableName() string {
	return "prepaid_cards"
}

func (StaticIPPrice) TableName() string {
	return "static_ip_prices"
}

func (StaticIPRental) TableName() string {
	return "static_ip_rentals"
}

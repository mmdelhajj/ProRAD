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
	ID              uint            `gorm:"column:id;primaryKey" json:"id"`
	Type            TransactionType `gorm:"column:type;size:50;not null;index" json:"type"`
	Amount          float64         `gorm:"column:amount;type:decimal(15,2);not null" json:"amount"`
	BalanceBefore   float64         `gorm:"column:balance_before;type:decimal(15,2)" json:"balance_before"`
	BalanceAfter    float64         `gorm:"column:balance_after;type:decimal(15,2)" json:"balance_after"`
	Description     string          `gorm:"column:description;size:500" json:"description"`

	// Service change tracking
	OldServiceName  string     `gorm:"column:old_service_name;size:100" json:"old_service_name"`
	NewServiceName  string     `gorm:"column:new_service_name;size:100" json:"new_service_name"`
	ServiceName     string     `gorm:"column:service_name;size:100" json:"service_name"` // For new/renewal transactions

	// Related entities
	ResellerID      uint       `gorm:"column:reseller_id;not null;index" json:"reseller_id"`
	Reseller        Reseller   `gorm:"-" json:"reseller"`
	SubscriberID    *uint      `gorm:"column:subscriber_id;index" json:"subscriber_id"`
	Subscriber      *Subscriber `gorm:"-" json:"subscriber,omitempty"`
	TargetResellerID *uint     `gorm:"column:target_reseller_id" json:"target_reseller_id"`
	TargetReseller  *Reseller  `gorm:"-" json:"target_reseller,omitempty"`

	// Metadata
	IPAddress       string     `gorm:"column:ip_address;size:50" json:"ip_address"`
	UserAgent       string     `gorm:"column:user_agent;size:255" json:"user_agent"`
	CreatedBy       uint       `gorm:"column:created_by" json:"created_by"`

	CreatedAt       time.Time  `gorm:"column:created_at;index" json:"created_at"`
}

// Invoice represents an invoice
type Invoice struct {
	ID              uint           `gorm:"column:id;primaryKey" json:"id"`
	InvoiceNumber   string         `gorm:"column:invoice_number;size:50;uniqueIndex;not null" json:"invoice_number"`
	SubscriberID    uint           `gorm:"column:subscriber_id;not null;index" json:"subscriber_id"`
	Subscriber      Subscriber     `gorm:"-" json:"subscriber"`
	ResellerID      uint           `gorm:"column:reseller_id;not null;index" json:"reseller_id"`
	Reseller        Reseller       `gorm:"-" json:"reseller"`

	// Amounts
	SubTotal        float64        `gorm:"column:sub_total;type:decimal(15,2)" json:"sub_total"`
	Discount        float64        `gorm:"column:discount;type:decimal(15,2);default:0" json:"discount"`
	Tax             float64        `gorm:"column:tax;type:decimal(15,2);default:0" json:"tax"`
	Total           float64        `gorm:"column:total;type:decimal(15,2);not null" json:"total"`
	AmountPaid      float64        `gorm:"column:amount_paid;type:decimal(15,2);default:0" json:"amount_paid"`

	// Status
	Status          PaymentStatus  `gorm:"column:status;size:20;default:pending;index" json:"status"`
	DueDate         time.Time      `gorm:"column:due_date" json:"due_date"`
	PaidDate        *time.Time     `gorm:"column:paid_date" json:"paid_date"`

	// Details
	Notes           string         `gorm:"column:notes;type:text" json:"notes"`
	Items           []InvoiceItem  `gorm:"-" json:"items"`

	CreatedAt       time.Time      `gorm:"column:created_at" json:"created_at"`
	UpdatedAt       time.Time      `gorm:"column:updated_at" json:"updated_at"`
	DeletedAt       gorm.DeletedAt `gorm:"column:deleted_at;index" json:"-"`
}

// InvoiceItem represents an item in an invoice
type InvoiceItem struct {
	ID          uint    `gorm:"column:id;primaryKey" json:"id"`
	InvoiceID   uint    `gorm:"column:invoice_id;not null;index" json:"invoice_id"`
	Description string  `gorm:"column:description;size:255;not null" json:"description"`
	Quantity    int     `gorm:"column:quantity;default:1" json:"quantity"`
	UnitPrice   float64 `gorm:"column:unit_price;type:decimal(15,2);not null" json:"unit_price"`
	Total       float64 `gorm:"column:total;type:decimal(15,2);not null" json:"total"`
}

// Payment represents a payment
type Payment struct {
	ID              uint           `gorm:"column:id;primaryKey" json:"id"`
	InvoiceID       *uint          `gorm:"column:invoice_id;index" json:"invoice_id"`
	Invoice         *Invoice       `gorm:"-" json:"invoice,omitempty"`
	SubscriberID    uint           `gorm:"column:subscriber_id;not null;index" json:"subscriber_id"`
	Subscriber      Subscriber     `gorm:"-" json:"subscriber"`
	ResellerID      uint           `gorm:"column:reseller_id;not null;index" json:"reseller_id"`
	Reseller        Reseller       `gorm:"-" json:"reseller"`
	CollectorID     *uint          `gorm:"column:collector_id" json:"collector_id"`

	Amount          float64        `gorm:"column:amount;type:decimal(15,2);not null" json:"amount"`
	Method          string         `gorm:"column:method;size:50;default:cash" json:"method"` // cash, card, online
	Reference       string         `gorm:"column:reference;size:100" json:"reference"`
	Notes           string         `gorm:"column:notes;type:text" json:"notes"`
	Status          PaymentStatus  `gorm:"column:status;size:20;default:completed" json:"status"`

	CreatedAt       time.Time      `gorm:"column:created_at" json:"created_at"`
	UpdatedAt       time.Time      `gorm:"column:updated_at" json:"updated_at"`
}

// PrepaidCard represents a prepaid/voucher card
type PrepaidCard struct {
	ID              uint           `gorm:"column:id;primaryKey" json:"id"`
	Code            string         `gorm:"column:code;size:50;uniqueIndex;not null" json:"code"`
	PIN             string         `gorm:"column:pin;size:20" json:"pin"`
	ServiceID       uint           `gorm:"column:service_id;not null" json:"service_id"`
	Service         Service        `gorm:"-" json:"service"`
	ResellerID      uint           `gorm:"column:reseller_id;not null;index" json:"reseller_id"`
	Reseller        Reseller       `gorm:"-" json:"reseller"`

	// Card details
	Value           float64        `gorm:"column:value;type:decimal(15,2);not null" json:"value"`
	Days            int            `gorm:"column:days;default:30" json:"days"`
	QuotaRefill     int64          `gorm:"column:quota_refill;default:0" json:"quota_refill"` // bytes

	// Status
	IsUsed          bool           `gorm:"column:is_used;default:false;index" json:"is_used"`
	UsedBy          *uint          `gorm:"column:used_by" json:"used_by"`
	UsedAt          *time.Time     `gorm:"column:used_at" json:"used_at"`
	IsActive        bool           `gorm:"column:is_active;default:true" json:"is_active"`
	ExpiryDate      *time.Time     `gorm:"column:expiry_date" json:"expiry_date"`

	// Batch info
	BatchID         string         `gorm:"column:batch_id;size:50;index" json:"batch_id"`
	BatchNumber     int            `gorm:"column:batch_number" json:"batch_number"`

	CreatedAt       time.Time      `gorm:"column:created_at" json:"created_at"`
	CreatedBy       uint           `gorm:"column:created_by" json:"created_by"`
}

// StaticIPPrice represents static IP pricing
type StaticIPPrice struct {
	ID        uint      `gorm:"column:id;primaryKey" json:"id"`
	Name      string    `gorm:"column:name;size:100;not null" json:"name"`
	Price     float64   `gorm:"column:price;type:decimal(15,2);not null" json:"price"`
	Days      int       `gorm:"column:days;default:30" json:"days"`
	IsActive  bool      `gorm:"column:is_active;default:true" json:"is_active"`
	CreatedAt time.Time `gorm:"column:created_at" json:"created_at"`
	UpdatedAt time.Time `gorm:"column:updated_at" json:"updated_at"`
}

// StaticIPRental represents a static IP rental
type StaticIPRental struct {
	ID           uint           `gorm:"column:id;primaryKey" json:"id"`
	SubscriberID uint           `gorm:"column:subscriber_id;not null;index" json:"subscriber_id"`
	Subscriber   Subscriber     `gorm:"-" json:"subscriber"`
	IPAddress    string         `gorm:"column:ip_address;size:50;not null;uniqueIndex" json:"ip_address"`
	PriceID      uint           `gorm:"column:price_id;not null" json:"price_id"`
	Price        StaticIPPrice  `gorm:"-" json:"price"`
	StartDate    time.Time      `gorm:"column:start_date" json:"start_date"`
	ExpiryDate   time.Time      `gorm:"column:expiry_date" json:"expiry_date"`
	IsActive     bool           `gorm:"column:is_active;default:true" json:"is_active"`
	CreatedAt    time.Time      `gorm:"column:created_at" json:"created_at"`
	UpdatedAt    time.Time      `gorm:"column:updated_at" json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"column:deleted_at;index" json:"-"`
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

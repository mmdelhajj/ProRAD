package handlers

import (
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/proisp/backend/internal/database"
	"github.com/proisp/backend/internal/middleware"
	"github.com/proisp/backend/internal/models"
)

type InvoiceHandler struct{}

func NewInvoiceHandler() *InvoiceHandler {
	return &InvoiceHandler{}
}

// List returns all invoices
func (h *InvoiceHandler) List(c *fiber.Ctx) error {
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 25)
	status := c.Query("status", "")
	subscriberID := c.QueryInt("subscriber_id", 0)

	if page < 1 {
		page = 1
	}
	if limit > 100 {
		limit = 100
	}
	offset := (page - 1) * limit

	query := database.DB.Model(&models.Invoice{}).Preload("Subscriber").Preload("Items")

	if status != "" {
		query = query.Where("status = ?", status)
	}
	if subscriberID > 0 {
		query = query.Where("subscriber_id = ?", subscriberID)
	}

	var total int64
	query.Count(&total)

	var invoices []models.Invoice
	query.Order("created_at DESC").Offset(offset).Limit(limit).Find(&invoices)

	return c.JSON(fiber.Map{
		"success": true,
		"data":    invoices,
		"meta": fiber.Map{
			"page":       page,
			"limit":      limit,
			"total":      total,
			"totalPages": (total + int64(limit) - 1) / int64(limit),
		},
	})
}

// Get returns a single invoice
func (h *InvoiceHandler) Get(c *fiber.Ctx) error {
	id := c.Params("id")

	var invoice models.Invoice
	if err := database.DB.Preload("Subscriber").Preload("Items").First(&invoice, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Invoice not found",
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    invoice,
	})
}

// Create creates a new invoice
func (h *InvoiceHandler) Create(c *fiber.Ctx) error {
	user := middleware.GetCurrentUser(c)

	type ItemRequest struct {
		Description string  `json:"description"`
		Quantity    int     `json:"quantity"`
		UnitPrice   float64 `json:"unit_price"`
	}

	type CreateRequest struct {
		SubscriberID uint          `json:"subscriber_id"`
		DueDate      string        `json:"due_date"`
		Notes        string        `json:"notes"`
		Items        []ItemRequest `json:"items"`
	}

	var req CreateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
		})
	}

	// Get subscriber to get reseller ID
	var subscriber models.Subscriber
	if err := database.DB.First(&subscriber, req.SubscriberID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Subscriber not found",
		})
	}

	// Generate invoice number
	invoiceNumber := fmt.Sprintf("INV-%d-%04d", time.Now().Year(), time.Now().Unix()%10000)

	// Calculate totals
	var subtotal float64
	for _, item := range req.Items {
		subtotal += item.UnitPrice * float64(item.Quantity)
	}

	dueDate, _ := time.Parse("2006-01-02", req.DueDate)
	if dueDate.IsZero() {
		dueDate = time.Now().AddDate(0, 0, 30)
	}

	resellerID := uint(1) // default
	if user.ResellerID != nil {
		resellerID = *user.ResellerID
	}

	invoice := models.Invoice{
		InvoiceNumber: invoiceNumber,
		SubscriberID:  req.SubscriberID,
		ResellerID:    resellerID,
		SubTotal:      subtotal,
		Tax:           0,
		Total:         subtotal,
		AmountPaid:    0,
		Status:        models.PaymentStatusPending,
		DueDate:       dueDate,
		Notes:         req.Notes,
	}

	if err := database.DB.Create(&invoice).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"message": "Failed to create invoice",
		})
	}

	// Create invoice items
	for _, item := range req.Items {
		invoiceItem := models.InvoiceItem{
			InvoiceID:   invoice.ID,
			Description: item.Description,
			Quantity:    item.Quantity,
			UnitPrice:   item.UnitPrice,
			Total:       item.UnitPrice * float64(item.Quantity),
		}
		database.DB.Create(&invoiceItem)
	}

	database.DB.Preload("Items").Preload("Subscriber").First(&invoice, invoice.ID)

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"success": true,
		"data":    invoice,
	})
}

// Update updates an invoice
func (h *InvoiceHandler) Update(c *fiber.Ctx) error {
	id := c.Params("id")

	var invoice models.Invoice
	if err := database.DB.First(&invoice, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Invoice not found",
		})
	}

	if invoice.Status == models.PaymentStatusCompleted {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Cannot update completed invoice",
		})
	}

	type UpdateRequest struct {
		DueDate string `json:"due_date"`
		Notes   string `json:"notes"`
		Status  string `json:"status"`
	}

	var req UpdateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
		})
	}

	updates := map[string]interface{}{}

	if req.DueDate != "" {
		dueDate, _ := time.Parse("2006-01-02", req.DueDate)
		updates["due_date"] = dueDate
	}
	if req.Notes != "" {
		updates["notes"] = req.Notes
	}
	if req.Status != "" {
		updates["status"] = req.Status
	}

	database.DB.Model(&invoice).Updates(updates)

	return c.JSON(fiber.Map{
		"success": true,
		"data":    invoice,
	})
}

// Delete deletes an invoice
func (h *InvoiceHandler) Delete(c *fiber.Ctx) error {
	id := c.Params("id")

	var invoice models.Invoice
	if err := database.DB.First(&invoice, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Invoice not found",
		})
	}

	if invoice.Status == models.PaymentStatusCompleted {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Cannot delete completed invoice",
		})
	}

	// Delete items first
	database.DB.Where("invoice_id = ?", id).Delete(&models.InvoiceItem{})
	database.DB.Delete(&invoice)

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Invoice deleted",
	})
}

// AddPayment adds a payment to an invoice
func (h *InvoiceHandler) AddPayment(c *fiber.Ctx) error {
	id := c.Params("id")

	var invoice models.Invoice
	if err := database.DB.First(&invoice, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"message": "Invoice not found",
		})
	}

	type PaymentRequest struct {
		Amount    float64 `json:"amount"`
		Method    string  `json:"method"`
		Reference string  `json:"reference"`
		Notes     string  `json:"notes"`
	}

	var req PaymentRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"message": "Invalid request body",
		})
	}

	// Create payment
	payment := models.Payment{
		InvoiceID:    &invoice.ID,
		SubscriberID: invoice.SubscriberID,
		ResellerID:   invoice.ResellerID,
		Amount:       req.Amount,
		Method:       req.Method,
		Reference:    req.Reference,
		Notes:        req.Notes,
		Status:       models.PaymentStatusCompleted,
	}
	database.DB.Create(&payment)

	// Update invoice
	newAmountPaid := invoice.AmountPaid + req.Amount
	var newStatus models.PaymentStatus

	if newAmountPaid >= invoice.Total {
		newStatus = models.PaymentStatusCompleted
		now := time.Now()
		database.DB.Model(&invoice).Updates(map[string]interface{}{
			"amount_paid": newAmountPaid,
			"status":      newStatus,
			"paid_date":   &now,
		})
	} else {
		newStatus = models.PaymentStatusPending // partial payment
		database.DB.Model(&invoice).Updates(map[string]interface{}{
			"amount_paid": newAmountPaid,
			"status":      newStatus,
		})
	}

	// Create transaction
	transaction := models.Transaction{
		ResellerID:   invoice.ResellerID,
		SubscriberID: &invoice.SubscriberID,
		Type:         models.TransactionTypeRenewal,
		Amount:       req.Amount,
		Description:  fmt.Sprintf("Payment for invoice %s", invoice.InvoiceNumber),
	}
	database.DB.Create(&transaction)

	return c.JSON(fiber.Map{
		"success": true,
		"data":    payment,
	})
}

// GetPayments returns payments for an invoice
func (h *InvoiceHandler) GetPayments(c *fiber.Ctx) error {
	id := c.Params("id")

	var payments []models.Payment
	database.DB.Where("invoice_id = ?", id).Order("created_at DESC").Find(&payments)

	return c.JSON(fiber.Map{
		"success": true,
		"data":    payments,
	})
}

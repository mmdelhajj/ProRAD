package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/compress"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/proisp/backend/internal/config"
	"github.com/proisp/backend/internal/database"
	"github.com/proisp/backend/internal/handlers"
	"github.com/proisp/backend/internal/license"
	"github.com/proisp/backend/internal/middleware"
	"github.com/proisp/backend/internal/models"
	"github.com/proisp/backend/internal/security"
	"github.com/proisp/backend/internal/services"
	"golang.org/x/crypto/bcrypt"
)

// Build date - set at compile time: -ldflags "-X main.buildDate=2026-01-25"
var buildDate string

// Maximum days binary can run without update
const maxBinaryAgeDays = 30

func main() {
	// Check binary expiry first
	if err := checkBinaryExpiry(); err != nil {
		log.Fatalf("Binary expired: %v - Please update to latest version", err)
	}

	// Ensure required system packages are installed (for CoA and ping features)
	ensureRequiredPackages()

	// Verify update was successful (if update was just applied)
	handlers.VerifyUpdateOnStartup()

	// Initialize security protections (anti-tamper, anti-debug, etc.)
	security.Initialize()

	// Load configuration
	cfg := config.Load()

	// Connect to database
	if err := database.Connect(cfg); err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer database.Close()

	// Run migrations
	if err := models.AutoMigrate(database.DB); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	// Create performance indexes
	database.EnsureIndexes()

	// Seed admin user if not exists
	seedAdminUser()

	// Initialize license client
	licenseServer := os.Getenv("LICENSE_SERVER")
	licenseKey := os.Getenv("LICENSE_KEY")
	// Always call Initialize - it handles dev mode internally via build flags
	if err := license.Initialize(licenseServer, licenseKey); err != nil {
		log.Printf("Warning: License initialization failed: %v", err)
	}

	// Initialize database encryption with license key
	encryptionKey := license.GetEncryptionKey()
	if encryptionKey != "" {
		if err := security.InitializeEncryption(encryptionKey); err != nil {
			log.Printf("Warning: Encryption initialization failed: %v", err)
		} else {
			log.Println("Database encryption initialized successfully")
		}
	} else {
		log.Println("Warning: No encryption key from license server - sensitive data will not be encrypted")
	}

	// Start quota sync service (syncs MikroTik bytes to database every 30 seconds)
	quotaSyncService := services.NewQuotaSyncService(30 * time.Second)
	quotaSyncService.Start()

	// Start bandwidth rule service (checks time-based bandwidth rules every minute)
	bandwidthRuleService := services.NewBandwidthRuleService(1 * time.Minute)
	bandwidthRuleService.Start()

	// Start CDN bandwidth rule service (checks time-based CDN bandwidth rules every minute)
	cdnBandwidthRuleService := services.NewCDNBandwidthRuleService(1 * time.Minute)
	cdnBandwidthRuleService.Start()

	// Sync all PCQ configurations to NAS devices on startup
	go services.SyncAllPCQOnStartup()

	// Start PCQ auto-repair service (checks every 5 minutes)
	go services.StartPCQAutoRepairService()

	// Start backup scheduler service
	backupSchedulerService := services.NewBackupSchedulerService(cfg)
	go backupSchedulerService.Start()

	// Start sharing detection service (nightly automatic scans)
	sharingDetectionService := services.NewSharingDetectionService()
	sharingDetectionService.Start()

	// Create Fiber app
	app := fiber.New(fiber.Config{
		AppName:      "ProISP API v1.0",
		ServerHeader: "ProISP",
		BodyLimit:    50 * 1024 * 1024, // 50MB
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{
				"success": false,
				"message": err.Error(),
			})
		},
	})

	// Global middleware
	app.Use(recover.New())
	app.Use(compress.New())
	app.Use(middleware.Logger())
	app.Use(middleware.CORS())
	app.Use(license.LicenseStatusMiddleware()) // Add license status headers to all responses

	// Health check
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status":  "healthy",
			"service": "proisp-api",
		})
	})

	// Initialize handlers
	authHandler := handlers.NewAuthHandler(cfg)
	subscriberHandler := handlers.NewSubscriberHandler()
	serviceHandler := handlers.NewServiceHandler()
	nasHandler := handlers.NewNasHandler()
	resellerHandler := handlers.NewResellerHandler(cfg)
	dashboardHandler := handlers.NewDashboardHandler()
	sessionHandler := handlers.NewSessionHandler()
	settingsHandler := handlers.NewSettingsHandler()
	userHandler := handlers.NewUserHandler()
	communicationHandler := handlers.NewCommunicationHandler()
	prepaidHandler := handlers.NewPrepaidHandler()
	invoiceHandler := handlers.NewInvoiceHandler()
	auditHandler := handlers.NewAuditHandler()
	ticketHandler := handlers.NewTicketHandler()
	permissionHandler := handlers.NewPermissionHandler()
	reportHandler := handlers.NewReportHandler()
	bandwidthHandler := handlers.NewBandwidthHandler(bandwidthRuleService)
	fupHandler := handlers.NewFUPHandler()
	backupHandler := handlers.NewBackupHandler(cfg)
	twoFAHandler := handlers.NewTwoFAHandler()
	sharingHandler := handlers.NewSharingDetectionHandler()
	notificationHandler := handlers.NewNotificationHandler()
	cdnHandler := handlers.NewCDNHandler()
	cdnBandwidthHandler := handlers.NewCDNBandwidthHandler(cdnBandwidthRuleService)
	licenseHandler := handlers.NewLicenseHandler()
	systemUpdateHandler := handlers.NewSystemUpdateHandler()

	// API routes
	api := app.Group("/api")

	// Apply rate limiting to API routes (100 requests per minute by default)
	api.Use(middleware.RateLimiter(100, 1*time.Minute))

	// Public routes
	api.Post("/auth/login", authHandler.Login)
	api.Get("/branding", settingsHandler.GetBranding)
	api.Get("/backups/public-download/:token", backupHandler.PublicDownload)

	// Serve uploaded files (logos, etc.)
	app.Static("/uploads", "/app/uploads")

	// Customer Portal routes (public login, protected dashboard)
	customerHandler := handlers.NewCustomerPortalHandler(cfg)
	customerPortal := api.Group("/customer")
	customerPortal.Post("/login", customerHandler.Login)
	// Protected customer routes
	customerProtected := customerPortal.Group("", handlers.CustomerAuthMiddleware(cfg))
	customerProtected.Get("/dashboard", customerHandler.Dashboard)
	customerProtected.Get("/sessions", customerHandler.Sessions)
	customerProtected.Get("/usage", customerHandler.UsageHistory)
	// Customer ticket routes
	customerProtected.Get("/tickets", customerHandler.ListTickets)
	customerProtected.Get("/tickets/:id", customerHandler.GetTicket)
	customerProtected.Post("/tickets", customerHandler.CreateTicket)
	customerProtected.Post("/tickets/:id/reply", customerHandler.ReplyTicket)

	// Critical system routes - auth only, NO license check (for fixing license/restart issues)
	criticalSystem := api.Group("", middleware.AuthRequired(cfg))
	criticalSystem.Post("/system/restart-services", middleware.AdminOnly(), settingsHandler.RestartServices)
	criticalSystem.Post("/license/revalidate", middleware.AdminOnly(), licenseHandler.RevalidateLicense)

	// Protected routes - with license write access check for non-GET requests
	protected := api.Group("", middleware.AuthRequired(cfg), license.RequireWriteAccess(), middleware.AuditLogger())

	// Auth routes
	protected.Post("/auth/logout", authHandler.Logout)
	protected.Get("/auth/me", authHandler.Me)
	protected.Post("/auth/refresh", authHandler.RefreshToken)
	protected.Put("/auth/password", authHandler.ChangePassword)
	protected.Post("/auth/change-password", authHandler.ChangePassword)

	// 2FA routes
	protected.Get("/auth/2fa/status", twoFAHandler.Status)
	protected.Post("/auth/2fa/setup", twoFAHandler.Setup)
	protected.Post("/auth/2fa/verify", twoFAHandler.Verify)
	protected.Post("/auth/2fa/disable", twoFAHandler.Disable)

	// Dashboard routes
	protected.Get("/dashboard/stats", dashboardHandler.Stats)
	protected.Get("/dashboard/chart", dashboardHandler.ChartData)
	protected.Get("/dashboard/transactions", dashboardHandler.RecentTransactions)
	protected.Get("/dashboard/resellers", dashboardHandler.TopResellers)
	protected.Get("/dashboard/sessions", dashboardHandler.Sessions)

	// Subscriber routes
	subscribers := protected.Group("/subscribers")
	subscribers.Get("/", middleware.RequirePermission("subscribers.view"), subscriberHandler.List)
	subscribers.Get("/archived", middleware.RequirePermission("subscribers.view"), subscriberHandler.ListArchived)
	subscribers.Get("/:id", middleware.RequirePermission("subscribers.view"), subscriberHandler.Get)
	subscribers.Post("/", middleware.RequirePermission("subscribers.create"), subscriberHandler.Create)
	subscribers.Post("/bulk-import", middleware.RequirePermission("subscribers.create"), subscriberHandler.BulkImport)
	subscribers.Post("/import-excel", middleware.AdminOnly(), subscriberHandler.BulkImportExcel)
	subscribers.Post("/bulk-update", middleware.RequirePermission("subscribers.edit"), subscriberHandler.BulkUpdate)
	subscribers.Post("/bulk-action", middleware.ResellerOrAdmin(), subscriberHandler.BulkAction) // BulkAction checks permissions internally per action
	subscribers.Post("/change-bulk", middleware.AdminOnly(), subscriberHandler.ChangeBulk)
	subscribers.Put("/:id", middleware.RequirePermission("subscribers.edit"), subscriberHandler.Update)
	subscribers.Delete("/:id", middleware.RequirePermission("subscribers.delete"), subscriberHandler.Delete)
	subscribers.Post("/:id/renew", middleware.RequirePermission("subscribers.renew"), subscriberHandler.Renew)
	subscribers.Post("/:id/disconnect", middleware.RequirePermission("subscribers.disconnect"), subscriberHandler.Disconnect)
	subscribers.Post("/:id/reset-fup", middleware.RequirePermission("subscribers.reset_fup"), subscriberHandler.ResetFUP)
	subscribers.Post("/:id/reset-mac", middleware.RequirePermission("subscribers.reset_mac"), subscriberHandler.ResetMAC)
	subscribers.Post("/:id/reset-quota", middleware.RequirePermission("subscribers.refill_quota"), subscriberHandler.ResetQuota)
	subscribers.Post("/:id/restore", middleware.RequirePermission("subscribers.delete"), subscriberHandler.Restore)
	subscribers.Delete("/:id/permanent", middleware.AdminOnly(), subscriberHandler.PermanentDelete)
	// New action routes
	subscribers.Post("/:id/rename", middleware.RequirePermission("subscribers.rename"), subscriberHandler.Rename)
	subscribers.Post("/:id/add-days", middleware.RequirePermission("subscribers.add_days"), subscriberHandler.AddDays)
	subscribers.Get("/:id/calculate-change-service-price", middleware.RequirePermission("subscribers.change_service"), subscriberHandler.CalculateChangeServicePrice)
	subscribers.Post("/:id/change-service", middleware.RequirePermission("subscribers.change_service"), subscriberHandler.ChangeService)
	subscribers.Post("/:id/activate", middleware.RequirePermission("subscribers.inactivate"), subscriberHandler.Activate)
	subscribers.Post("/:id/deactivate", middleware.RequirePermission("subscribers.inactivate"), subscriberHandler.Deactivate)
	subscribers.Post("/:id/refill", middleware.RequirePermission("subscribers.refill_quota"), subscriberHandler.Refill)
	subscribers.Post("/:id/ping", middleware.RequirePermission("subscribers.ping"), subscriberHandler.Ping)
	subscribers.Get("/:id/bandwidth", middleware.RequirePermission("subscribers.view_graph"), subscriberHandler.GetBandwidth)
	subscribers.Get("/:id/torch", middleware.RequirePermission("subscribers.view_graph"), subscriberHandler.GetTorch)
	// Subscriber bandwidth rules
	subscribers.Get("/:id/bandwidth-rules", middleware.RequirePermission("subscribers.view"), subscriberHandler.GetBandwidthRules)
	subscribers.Post("/:id/bandwidth-rules", middleware.RequirePermission("subscribers.edit"), subscriberHandler.CreateBandwidthRule)
	subscribers.Put("/:id/bandwidth-rules/:ruleId", middleware.RequirePermission("subscribers.edit"), subscriberHandler.UpdateBandwidthRule)
	subscribers.Delete("/:id/bandwidth-rules/:ruleId", middleware.RequirePermission("subscribers.edit"), subscriberHandler.DeleteBandwidthRule)
	subscribers.Get("/:id/cdn-upgrades", middleware.RequirePermission("subscribers.view"), subscriberHandler.GetCDNUpgrades)

	// Service routes
	services := protected.Group("/services")
	services.Get("/", serviceHandler.List)
	services.Get("/:id", serviceHandler.Get)
	services.Post("/", middleware.AdminOnly(), serviceHandler.Create)
	services.Put("/:id", middleware.AdminOnly(), serviceHandler.Update)
	services.Delete("/:id", middleware.AdminOnly(), serviceHandler.Delete)

	// NAS routes
	nas := protected.Group("/nas")
	nas.Get("/", nasHandler.List)
	nas.Get("/:id", nasHandler.Get)
	nas.Post("/", middleware.AdminOnly(), nasHandler.Create)
	nas.Put("/:id", middleware.AdminOnly(), nasHandler.Update)
	nas.Delete("/:id", middleware.AdminOnly(), nasHandler.Delete)
	nas.Post("/:id/sync", middleware.AdminOnly(), nasHandler.Sync)
	nas.Post("/:id/test", middleware.AdminOnly(), nasHandler.TestConnection)
	nas.Get("/:id/pools", middleware.AdminOnly(), nasHandler.GetIPPools)
	nas.Put("/:id/pools", middleware.AdminOnly(), nasHandler.UpdateSubscriberPools)

	// Reseller routes
	resellers := protected.Group("/resellers")
	resellers.Get("/", resellerHandler.List)
	resellers.Get("/:id", resellerHandler.Get)
	resellers.Post("/", middleware.ResellerOrAdmin(), resellerHandler.Create)
	resellers.Put("/:id", middleware.ResellerOrAdmin(), resellerHandler.Update)
	resellers.Delete("/:id", middleware.AdminOnly(), resellerHandler.Delete)
	resellers.Post("/:id/transfer", middleware.ResellerOrAdmin(), resellerHandler.Transfer)
	resellers.Post("/:id/withdraw", middleware.ResellerOrAdmin(), resellerHandler.Withdraw)
	resellers.Post("/:id/impersonate", middleware.AdminOnly(), resellerHandler.Impersonate)
	// Reseller assignments (admin only)
	resellers.Get("/:id/assigned-nas", middleware.AdminOnly(), resellerHandler.GetAssignedNAS)
	resellers.Put("/:id/assigned-nas", middleware.AdminOnly(), resellerHandler.UpdateAssignedNAS)
	resellers.Get("/:id/assigned-services", middleware.AdminOnly(), resellerHandler.GetAssignedServices)
	resellers.Put("/:id/assigned-services", middleware.AdminOnly(), resellerHandler.UpdateAssignedServices)

	// Session routes
	sessions := protected.Group("/sessions")
	sessions.Get("/", middleware.RequirePermission("sessions.view"), sessionHandler.List)
	sessions.Get("/:id", middleware.RequirePermission("sessions.view"), sessionHandler.Get)
	sessions.Post("/:id/disconnect", middleware.RequirePermission("subscribers.disconnect"), sessionHandler.Disconnect)

	// Settings routes (Admin only)
	settings := protected.Group("/settings", middleware.AdminOnly())
	settings.Get("/", settingsHandler.List)
	settings.Put("/bulk", settingsHandler.BulkUpdate)
	settings.Get("/timezones", settingsHandler.GetTimezones)
	settings.Post("/logo", settingsHandler.UploadLogo)
	settings.Delete("/logo", settingsHandler.DeleteLogo)
	settings.Get("/:key", settingsHandler.Get)
	settings.Put("/:key", settingsHandler.Update)
	settings.Delete("/:key", settingsHandler.Delete)

	// Notification test routes (Admin only)
	notifications := protected.Group("/notifications", middleware.AdminOnly())
	notifications.Post("/test-smtp", notificationHandler.TestSMTP)
	notifications.Post("/test-sms", notificationHandler.TestSMS)
	notifications.Post("/test-whatsapp", notificationHandler.TestWhatsApp)
	notifications.Get("/whatsapp-status", notificationHandler.GetWhatsAppStatus)

	// Server time (accessible to all authenticated users for clock display)
	protected.Get("/server-time", settingsHandler.GetServerTime)

	// License info (Admin only) - revalidate moved to criticalSystem group to bypass license check
	protected.Get("/license", middleware.AdminOnly(), licenseHandler.GetLicenseInfo)
	protected.Get("/license/status", licenseHandler.GetLicenseStatus)

	// System Update routes (Admin only)
	systemUpdate := protected.Group("/system/update", middleware.AdminOnly())
	systemUpdate.Get("/check", systemUpdateHandler.CheckUpdate)
	systemUpdate.Get("/status", systemUpdateHandler.GetUpdateStatus)
	systemUpdate.Post("/start", systemUpdateHandler.StartUpdate)

	// Remote Support routes (Admin only)
	remoteSupport := protected.Group("/system/remote-support", middleware.AdminOnly())
	remoteSupport.Get("/status", settingsHandler.GetRemoteSupportStatus)
	remoteSupport.Post("/toggle", settingsHandler.ToggleRemoteSupport)

	// User management routes (Admin only)
	users := protected.Group("/users", middleware.AdminOnly())
	users.Get("/", userHandler.List)
	users.Get("/:id", userHandler.Get)
	users.Post("/", userHandler.Create)
	users.Put("/:id", userHandler.Update)
	users.Delete("/:id", userHandler.Delete)

	// Communication routes
	communication := protected.Group("/communication")
	// Templates
	communication.Get("/templates", communicationHandler.ListTemplates)
	communication.Get("/templates/:id", communicationHandler.GetTemplate)
	communication.Post("/templates", middleware.AdminOnly(), communicationHandler.CreateTemplate)
	communication.Put("/templates/:id", middleware.AdminOnly(), communicationHandler.UpdateTemplate)
	communication.Delete("/templates/:id", middleware.AdminOnly(), communicationHandler.DeleteTemplate)
	// Rules
	communication.Get("/rules", communicationHandler.ListRules)
	communication.Get("/rules/:id", communicationHandler.GetRule)
	communication.Post("/rules", middleware.AdminOnly(), communicationHandler.CreateRule)
	communication.Put("/rules/:id", middleware.AdminOnly(), communicationHandler.UpdateRule)
	communication.Delete("/rules/:id", middleware.AdminOnly(), communicationHandler.DeleteRule)
	// Logs
	communication.Get("/logs", communicationHandler.ListLogs)

	// Bandwidth rules routes
	bandwidth := protected.Group("/bandwidth")
	bandwidth.Get("/rules", bandwidthHandler.ListRules)
	bandwidth.Get("/rules/:id", bandwidthHandler.GetRule)
	bandwidth.Post("/rules", middleware.AdminOnly(), bandwidthHandler.CreateRule)
	bandwidth.Put("/rules/:id", middleware.AdminOnly(), bandwidthHandler.UpdateRule)
	bandwidth.Delete("/rules/:id", middleware.AdminOnly(), bandwidthHandler.DeleteRule)
	bandwidth.Post("/rules/:id/apply", middleware.AdminOnly(), bandwidthHandler.ApplyNow)

	// FUP/Counter routes
	fup := protected.Group("/fup")
	fup.Get("/stats", fupHandler.GetStats)
	fup.Get("/quotas", fupHandler.ListQuotas)
	fup.Get("/quotas/:id/history", fupHandler.GetQuotaHistory)
	fup.Get("/top-users", fupHandler.GetTopUsers)
	fup.Post("/reset/:id", middleware.ResellerOrAdmin(), fupHandler.ResetFUP)
	fup.Post("/bulk-reset", middleware.AdminOnly(), fupHandler.BulkReset)
	fup.Post("/reset-all", middleware.AdminOnly(), fupHandler.ResetAllFUP)

	// Prepaid card routes
	prepaid := protected.Group("/prepaid")
	prepaid.Get("/", prepaidHandler.List)
	prepaid.Get("/batches", prepaidHandler.GetBatches)
	prepaid.Get("/:id", prepaidHandler.Get)
	prepaid.Post("/generate", middleware.AdminOnly(), prepaidHandler.Generate)
	prepaid.Post("/use", prepaidHandler.Use)
	prepaid.Delete("/:id", middleware.AdminOnly(), prepaidHandler.Delete)
	prepaid.Delete("/batch/:batch", middleware.AdminOnly(), prepaidHandler.DeleteBatch)

	// Invoice routes
	invoices := protected.Group("/invoices")
	invoices.Get("/", invoiceHandler.List)
	invoices.Get("/:id", invoiceHandler.Get)
	invoices.Post("/", middleware.ResellerOrAdmin(), invoiceHandler.Create)
	invoices.Put("/:id", middleware.ResellerOrAdmin(), invoiceHandler.Update)
	invoices.Delete("/:id", middleware.AdminOnly(), invoiceHandler.Delete)
	invoices.Post("/:id/payment", middleware.ResellerOrAdmin(), invoiceHandler.AddPayment)
	invoices.Get("/:id/payments", invoiceHandler.GetPayments)

	// Audit log routes (Admin only)
	audit := protected.Group("/audit", middleware.AdminOnly())
	audit.Get("/", auditHandler.List)
	audit.Get("/actions", auditHandler.GetActions)
	audit.Get("/entity-types", auditHandler.GetEntityTypes)
	audit.Get("/:id", auditHandler.Get)

	// Ticket routes
	tickets := protected.Group("/tickets")
	tickets.Get("/", ticketHandler.List)
	tickets.Get("/stats", ticketHandler.GetStats)
	tickets.Get("/:id", ticketHandler.Get)
	tickets.Post("/", ticketHandler.Create)
	tickets.Put("/:id", ticketHandler.Update)
	tickets.Delete("/:id", middleware.AdminOnly(), ticketHandler.Delete)
	tickets.Post("/:id/reply", ticketHandler.AddReply)

	// Permission routes (Admin only)
	permissions := protected.Group("/permissions", middleware.AdminOnly())
	permissions.Get("/", permissionHandler.ListPermissions)
	permissions.Post("/", permissionHandler.CreatePermission)
	permissions.Delete("/:id", permissionHandler.DeletePermission)
	permissions.Post("/seed", permissionHandler.SeedDefaultPermissions)
	// Permission groups
	permissions.Get("/groups", permissionHandler.ListGroups)
	permissions.Get("/groups/:id", permissionHandler.GetGroup)
	permissions.Post("/groups", permissionHandler.CreateGroup)
	permissions.Put("/groups/:id", permissionHandler.UpdateGroup)
	permissions.Delete("/groups/:id", permissionHandler.DeleteGroup)

	// Report routes
	reports := protected.Group("/reports")
	reports.Get("/subscribers", reportHandler.GetSubscriberStats)
	reports.Get("/revenue", reportHandler.GetRevenueStats)
	reports.Get("/services", reportHandler.GetServiceStats)
	reports.Get("/resellers", reportHandler.GetResellerStats)
	reports.Get("/usage", reportHandler.GetUsageStats)
	reports.Get("/expiry", reportHandler.GetExpiryReport)
	reports.Get("/transactions", reportHandler.GetTransactionReport)
	reports.Get("/nas", reportHandler.GetNASStats)
	reports.Get("/export/:type", reportHandler.ExportReport)

	// Backup routes (Admin only)
	backups := protected.Group("/backups", middleware.AdminOnly())
	backups.Get("/", backupHandler.List)
	backups.Post("/", backupHandler.Create)
	backups.Post("/upload", backupHandler.Upload)
	backups.Get("/:filename/download", backupHandler.Download)
	backups.Get("/:filename/token", backupHandler.GetDownloadToken)
	backups.Get("/:filename/validate", backupHandler.ValidateBackup)
	backups.Post("/:filename/restore", backupHandler.Restore)
	backups.Delete("/:filename", backupHandler.Delete)
	// Backup schedules
	backups.Get("/schedules", backupHandler.ListSchedules)
	backups.Get("/schedules/:id", backupHandler.GetSchedule)
	backups.Post("/schedules", backupHandler.CreateSchedule)
	backups.Put("/schedules/:id", backupHandler.UpdateSchedule)
	backups.Delete("/schedules/:id", backupHandler.DeleteSchedule)
	backups.Post("/schedules/:id/toggle", backupHandler.ToggleSchedule)
	backups.Post("/schedules/:id/run", backupHandler.RunScheduleNow)
	backups.Post("/test-ftp", backupHandler.TestFTP)
	backups.Get("/logs", backupHandler.ListBackupLogs)

	// Sharing Detection routes (Admin only)
	sharing := protected.Group("/sharing", middleware.AdminOnly())
	sharing.Get("/", sharingHandler.List)
	sharing.Get("/stats", sharingHandler.GetStats)
	sharing.Get("/history", sharingHandler.GetHistory)
	sharing.Get("/trends", sharingHandler.GetTrends)
	sharing.Get("/repeat-offenders", sharingHandler.GetRepeatOffenders)
	sharing.Get("/settings", sharingHandler.GetSettings)
	sharing.Put("/settings", sharingHandler.UpdateSettings)
	sharing.Post("/scan", sharingHandler.RunManualScan)
	sharing.Get("/subscriber/:id", sharingHandler.GetSubscriberDetails)
	sharing.Get("/nas-rules", sharingHandler.ListNASRuleStatus)
	sharing.Post("/nas/:nas_id/rules", sharingHandler.GenerateTTLRules)
	sharing.Delete("/nas/:nas_id/rules", sharingHandler.RemoveTTLRules)

	// CDN routes (Admin only)
	cdns := protected.Group("/cdns", middleware.AdminOnly())
	cdns.Get("/", cdnHandler.List)
	cdns.Get("/speeds", cdnHandler.GetCDNSpeeds) // Get all CDN speeds from services
	cdns.Get("/:id", cdnHandler.Get)
	cdns.Post("/", cdnHandler.Create)
	cdns.Put("/:id", cdnHandler.Update)
	cdns.Delete("/:id", cdnHandler.Delete)
	cdns.Post("/:id/sync", cdnHandler.SyncToNAS)
	cdns.Post("/sync-all", cdnHandler.SyncAllToNAS)
	cdns.Post("/:id/sync-pcq", cdnHandler.SyncPCQToNAS)
	cdns.Post("/sync-all-pcq", cdnHandler.SyncAllPCQToNAS)

	// CDN Bandwidth Rules routes (Admin only)
	cdnBandwidth := protected.Group("/cdn-bandwidth-rules", middleware.AdminOnly())
	cdnBandwidth.Get("/", cdnBandwidthHandler.ListRules)
	cdnBandwidth.Get("/:id", cdnBandwidthHandler.GetRule)
	cdnBandwidth.Post("/", cdnBandwidthHandler.CreateRule)
	cdnBandwidth.Put("/:id", cdnBandwidthHandler.UpdateRule)
	cdnBandwidth.Delete("/:id", cdnBandwidthHandler.DeleteRule)
	cdnBandwidth.Post("/:id/apply", cdnBandwidthHandler.ApplyNow)

	// Service CDN configuration routes
	services.Get("/:id/cdns", cdnHandler.ListServiceCDNs)
	services.Put("/:id/cdns", middleware.AdminOnly(), cdnHandler.UpdateServiceCDNs)
	services.Post("/:id/cdns", middleware.AdminOnly(), cdnHandler.AddServiceCDN)
	services.Delete("/:id/cdns/:cdnId", middleware.AdminOnly(), cdnHandler.DeleteServiceCDN)

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-quit
		log.Println("Shutting down server...")
		quotaSyncService.Stop()
		bandwidthRuleService.Stop()
		cdnBandwidthRuleService.Stop()
		backupSchedulerService.Stop()
		license.Stop()
		app.Shutdown()
	}()

	// Start server
	addr := fmt.Sprintf(":%d", cfg.APIPort)
	log.Printf("Starting ProISP API server on %s", addr)
	if err := app.Listen(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

func seedAdminUser() {
	var count int64
	database.DB.Model(&models.User{}).Where("user_type = ?", models.UserTypeAdmin).Count(&count)

	if count == 0 {
		log.Println("Creating default admin user...")

		// Get password from environment variable, default to admin123 if not set
		adminPassword := os.Getenv("ADMIN_PASSWORD")
		if adminPassword == "" {
			adminPassword = "admin123"
			log.Println("Warning: ADMIN_PASSWORD not set, using default password")
		}

		hashedPassword, _ := bcrypt.GenerateFromPassword([]byte(adminPassword), bcrypt.DefaultCost)

		admin := models.User{
			Username:            "admin",
			Password:            string(hashedPassword),
			Email:               "admin@proisp.local",
			FullName:            "System Administrator",
			UserType:            models.UserTypeAdmin,
			IsActive:            true,
			ForcePasswordChange: true,
		}

		if err := database.DB.Create(&admin).Error; err != nil {
			log.Printf("Failed to create admin user: %v", err)
		} else {
			log.Printf("Admin user created successfully (username: admin)")
		}

		// Create default reseller with same password
		resellerUser := models.User{
			Username:            "reseller",
			Password:            string(hashedPassword),
			Email:               "reseller@proisp.local",
			FullName:            "Default Reseller",
			UserType:            models.UserTypeReseller,
			IsActive:            true,
			ForcePasswordChange: true,
		}
		database.DB.Create(&resellerUser)

		reseller := models.Reseller{
			UserID:   resellerUser.ID,
			Name:     "Default Reseller",
			Balance:  1000,
			Credit:   0,
			IsActive: true,
		}
		database.DB.Create(&reseller)
		database.DB.Model(&resellerUser).Update("reseller_id", reseller.ID)

		log.Println("Default reseller created (username: reseller)")
	}
}

// ensureRequiredPackages installs required system packages if not present
// This runs on startup to ensure CoA (radclient) and ping features work
func ensureRequiredPackages() {
	packages := []struct {
		checkCmd string
		pkg      string
		name     string
	}{
		{"radclient", "freeradius-utils", "radclient (for CoA)"},
		{"ping", "iputils-ping", "ping"},
		{"pg_dump", "postgresql-client", "pg_dump (for backups)"},
	}

	needInstall := []string{}
	for _, p := range packages {
		if _, err := exec.LookPath(p.checkCmd); err != nil {
			log.Printf("Package %s not found, will install %s", p.name, p.pkg)
			needInstall = append(needInstall, p.pkg)
		}
	}

	if len(needInstall) == 0 {
		return
	}

	// Update apt cache
	log.Println("Installing required packages...")
	exec.Command("apt-get", "update", "-qq").Run()

	// Install missing packages
	args := append([]string{"install", "-y", "-qq"}, needInstall...)
	if err := exec.Command("apt-get", args...).Run(); err != nil {
		log.Printf("Warning: Failed to install packages: %v", err)
	} else {
		log.Printf("Successfully installed: %v", needInstall)
	}
}

// checkBinaryExpiry checks if the binary has exceeded its maximum age
func checkBinaryExpiry() error {
	if buildDate == "" {
		// No build date set - allow in dev mode
		return nil
	}

	built, err := time.Parse("2006-01-02", buildDate)
	if err != nil {
		return nil // Invalid date format - allow
	}

	daysSinceBuild := int(time.Since(built).Hours() / 24)
	if daysSinceBuild > maxBinaryAgeDays {
		return fmt.Errorf("binary built on %s has expired (%d days old, max %d days) - please update to latest version",
			buildDate, daysSinceBuild, maxBinaryAgeDays)
	}

	daysRemaining := maxBinaryAgeDays - daysSinceBuild
	if daysRemaining <= 7 {
		log.Printf("WARNING: Binary will expire in %d days. Please update soon.", daysRemaining)
	}

	return nil
}

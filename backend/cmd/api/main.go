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
	"github.com/proisp/backend/internal/mikrotik"
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

	// Ensure JWT secret is persisted (prevents session loss on restart)
	cfg.JWTSecret = database.EnsureJWTSecret(cfg)

	// Seed admin user if not exists
	seedAdminUser()

	// Auto-enable ProISP IP Pool Management for fresh installs
	enableProISPIPManagement()

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

	// Initialize MikroTik connection pool (for 30K+ users performance)
	mikrotik.InitializePool()

	// Start quota sync service (syncs MikroTik bytes to database every 30 seconds)
	quotaSyncService := services.NewQuotaSyncService(30 * time.Second)
	quotaSyncService.Start()

	// Start daily quota reset service (resets ALL users at configured time)
	dailyQuotaResetService := services.NewDailyQuotaResetService()
	dailyQuotaResetService.Start()

	// Start bandwidth rule service (checks time-based bandwidth rules every minute)
	bandwidthRuleService := services.NewBandwidthRuleService(1 * time.Minute)
	bandwidthRuleService.Start()

	// Start CDN bandwidth rule service (checks time-based CDN bandwidth rules every minute)
	cdnBandwidthRuleService := services.NewCDNBandwidthRuleService(1 * time.Minute)
	cdnBandwidthRuleService.Start()

	// Sync all PCQ configurations to NAS devices on startup
	go services.SyncAllPCQOnStartup()

	// PCQ auto-repair removed - use manual "Sync to MikroTik" button in CDN page

	// Start backup scheduler service
	backupSchedulerService := services.NewBackupSchedulerService(cfg)
	go backupSchedulerService.Start()

	// Start sharing detection service (nightly automatic scans)
	sharingDetectionService := services.NewSharingDetectionService()
	sharingDetectionService.Start()

	// Start HA Cluster service (heartbeat, replication monitoring)
	clusterService := services.NewClusterService()
	clusterService.Start()

	// Start HA Cluster failover service (monitors main server from secondary, triggers failover)
	clusterFailoverService := services.NewClusterFailover()
	clusterFailoverService.Start()

	// Start radacct archival service (keeps main table small for performance)
	radAcctArchivalService := services.NewRadAcctArchivalService(90) // Keep 90 days
	radAcctArchivalService.Start()

	// Start stale session cleanup service (closes ghost sessions every 5 min)
	staleSessionCleanupService := services.NewStaleSessionCleanupService(30) // 30 min threshold
	staleSessionCleanupService.Start()

	// Warmup subscriber cache for online users (improves RADIUS performance)
	go database.WarmupSubscriberCache()

	// Create Fiber app
	app := fiber.New(fiber.Config{
		AppName:                 "ProISP API v1.0",
		ServerHeader:            "ProISP",
		ProxyHeader:             "X-Real-IP", // Trust nginx X-Real-IP header for real client IP
		EnableTrustedProxyCheck: true,
		TrustedProxies:          []string{"172.16.0.0/12", "10.0.0.0/8", "192.168.0.0/16"}, // Docker networks
		BodyLimit:               50 * 1024 * 1024, // 50MB
		ReadTimeout:             30 * time.Second, // Request read timeout - prevents slow client attacks
		WriteTimeout:            30 * time.Second, // Response write timeout - prevents resource exhaustion
		IdleTimeout:             60 * time.Second, // Keep-alive connection timeout
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
	customerNotificationHandler := handlers.NewCustomerNotificationHandler()
	cdnHandler := handlers.NewCDNHandler()
	cdnBandwidthHandler := handlers.NewCDNBandwidthHandler(cdnBandwidthRuleService)
	licenseHandler := handlers.NewLicenseHandler()
	systemUpdateHandler := handlers.NewSystemUpdateHandler()
	networkConfigHandler := handlers.NewNetworkConfigHandler()
	diagnosticHandler := handlers.NewDiagnosticHandler()
	sslHandler := handlers.NewSSLHandler()

	// API routes
	api := app.Group("/api")

	// Apply rate limiting to API routes (100 requests per minute by default)
	api.Use(middleware.RateLimiter(100, 1*time.Minute))

	// Public routes
	api.Post("/auth/login", authHandler.Login)
	api.Post("/auth/impersonate-exchange", authHandler.ExchangeImpersonateToken) // Exchange temp token for session (no auth - uses one-time token)
	api.Get("/branding", settingsHandler.GetBranding)
	api.Get("/server-time", settingsHandler.GetServerTime) // Public - needed for timezone before auth
	api.Get("/backups/public-download/:token", backupHandler.PublicDownload)

	// HA Cluster public routes (use cluster secret for auth, not JWT)
	// Must be registered before protected group
	clusterHandler := handlers.NewClusterHandler()
	api.Post("/cluster/join", clusterHandler.JoinCluster)
	api.Post("/cluster/heartbeat", clusterHandler.Heartbeat)
	api.Post("/cluster/promote", clusterHandler.HandlePromote)
	api.Post("/cluster/notify", clusterHandler.HandleNotify)
	api.Post("/cluster/uploads", clusterHandler.GetUploads)

	// Serve uploaded files (logos, etc.)
	app.Static("/uploads", "/app/uploads")

	// Let's Encrypt ACME HTTP-01 challenge (public, no auth required)
	app.Get("/.well-known/acme-challenge/:token", sslHandler.ServeAcmeChallenge)

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
	protected.Get("/dashboard/system-metrics", dashboardHandler.SystemMetrics)
	protected.Get("/dashboard/system-capacity", dashboardHandler.SystemCapacity)
	protected.Get("/dashboard/system-info", dashboardHandler.SystemInfo)

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
	subscribers.Post("/change-bulk", middleware.RequirePermission("subscribers.change_bulk"), subscriberHandler.ChangeBulk)
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
	subscribers.Get("/:id/password", middleware.RequirePermission("subscribers.view"), subscriberHandler.GetPassword)
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
	services.Get("/", middleware.RequirePermission("services.view"), serviceHandler.List)
	services.Get("/:id", middleware.RequirePermission("services.view"), serviceHandler.Get)
	services.Post("/", middleware.RequirePermission("services.create"), serviceHandler.Create)
	services.Put("/:id", middleware.RequirePermission("services.edit"), serviceHandler.Update)
	services.Delete("/:id", middleware.RequirePermission("services.delete"), serviceHandler.Delete)

	// NAS routes
	nas := protected.Group("/nas")
	nas.Get("/", middleware.RequirePermission("nas.view"), nasHandler.List)
	nas.Get("/:id", middleware.RequirePermission("nas.view"), nasHandler.Get)
	nas.Post("/", middleware.RequirePermission("nas.create"), nasHandler.Create)
	nas.Put("/:id", middleware.RequirePermission("nas.edit"), nasHandler.Update)
	nas.Delete("/:id", middleware.RequirePermission("nas.delete"), nasHandler.Delete)
	nas.Post("/:id/sync", middleware.RequirePermission("nas.edit"), nasHandler.Sync)
	nas.Post("/:id/test", middleware.RequirePermission("nas.view"), nasHandler.TestConnection)
	nas.Get("/:id/pools", middleware.RequirePermission("nas.view"), nasHandler.GetIPPools)
	nas.Put("/:id/pools", middleware.RequirePermission("nas.edit"), nasHandler.UpdateSubscriberPools)

	// IP Pool Management routes (Admin only)
	ipPools := protected.Group("/ip-pools", middleware.AdminOnly())
	ipPools.Get("/stats", handlers.GetIPPoolStats)
	ipPools.Get("/status", handlers.GetIPManagementStatus)
	ipPools.Get("/assignments", handlers.GetIPPoolAssignments)
	ipPools.Post("/import", handlers.ImportIPPools)
	ipPools.Post("/import/:id", handlers.ImportIPPoolsFromNAS)
	ipPools.Post("/sync-sessions", handlers.SyncActiveSessions)
	ipPools.Post("/sync-sessions/:id", handlers.SyncActiveSessionsFromNAS)
	ipPools.Post("/enable", handlers.EnableProISPIPManagement)
	ipPools.Post("/disable", handlers.DisableProISPIPManagement)

	// Reseller routes
	resellers := protected.Group("/resellers")
	resellers.Get("/", resellerHandler.List)
	resellers.Get("/:id", resellerHandler.Get)
	resellers.Post("/", middleware.ResellerOrAdmin(), resellerHandler.Create)
	resellers.Put("/:id", middleware.ResellerOrAdmin(), resellerHandler.Update)
	resellers.Delete("/:id", middleware.AdminOnly(), resellerHandler.Delete)
	resellers.Delete("/:id/permanent", middleware.AdminOnly(), resellerHandler.PermanentDelete)
	resellers.Post("/:id/transfer", middleware.ResellerOrAdmin(), resellerHandler.Transfer)
	resellers.Post("/:id/withdraw", middleware.ResellerOrAdmin(), resellerHandler.Withdraw)
	resellers.Post("/:id/impersonate", middleware.AdminOnly(), resellerHandler.Impersonate)
	resellers.Post("/:id/impersonate-token", middleware.AdminOnly(), authHandler.GetImpersonateToken) // Get temp token for new tab login
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

	// Settings routes
	settings := protected.Group("/settings", middleware.RequirePermission("settings.view"))
	settings.Get("/", settingsHandler.List)
	settings.Put("/bulk", settingsHandler.BulkUpdate)
	settings.Get("/timezones", settingsHandler.GetTimezones)
	settings.Post("/logo", settingsHandler.UploadLogo)
	settings.Delete("/logo", settingsHandler.DeleteLogo)
	settings.Post("/login-background", settingsHandler.UploadLoginBackground)
	settings.Delete("/login-background", settingsHandler.DeleteLoginBackground)
	settings.Post("/favicon", settingsHandler.UploadFavicon)
	settings.Delete("/favicon", settingsHandler.DeleteFavicon)
	settings.Get("/ssl-status", sslHandler.GetSSLStatus)
	settings.Post("/ssl-stream", sslHandler.InstallSSL)
	settings.Get("/:key", settingsHandler.Get)
	settings.Put("/:key", settingsHandler.Update)
	settings.Delete("/:key", settingsHandler.Delete)

	// Notification test routes
	notifications := protected.Group("/notifications", middleware.RequirePermission("settings.edit"))
	notifications.Post("/test-smtp", notificationHandler.TestSMTP)
	notifications.Post("/test-sms", notificationHandler.TestSMS)
	notifications.Post("/test-whatsapp", notificationHandler.TestWhatsApp)
	notifications.Get("/whatsapp-status", notificationHandler.GetWhatsAppStatus)
	notifications.Post("/proxrad/create-link", notificationHandler.ProxRadCreateLink)
	notifications.Get("/proxrad/link-status", notificationHandler.ProxRadLinkStatus)

	// Customer update notification routes (accessible to all authenticated users)
	notificationRoutes := protected.Group("/notifications/updates")
	notificationRoutes.Get("/pending", customerNotificationHandler.GetPendingNotifications)
	notificationRoutes.Post("/:id/read", customerNotificationHandler.MarkNotificationRead)
	notificationRoutes.Get("/settings", customerNotificationHandler.GetNotificationSettings)
	notificationRoutes.Put("/settings", customerNotificationHandler.UpdateNotificationSettings)

	// Server time (accessible to all authenticated users for clock display)

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

	// Network Configuration routes (Admin only)
	networkConfig := protected.Group("/system/network", middleware.AdminOnly())
	networkConfig.Get("/current", networkConfigHandler.GetCurrentNetworkConfig)
	networkConfig.Get("/detect-dns", networkConfigHandler.DetectDNSMethod)
	networkConfig.Post("/test", networkConfigHandler.TestNetworkConfig)
	networkConfig.Post("/apply", networkConfigHandler.ApplyNetworkConfig)

	// Diagnostic Tools routes (Admin only)
	diagnostic := protected.Group("/diagnostic", middleware.AdminOnly())
	diagnostic.Post("/ping", diagnosticHandler.Ping)
	diagnostic.Post("/ping-stream", diagnosticHandler.PingStream)
	diagnostic.Post("/traceroute", diagnosticHandler.Traceroute)
	diagnostic.Post("/nslookup", diagnosticHandler.NSLookup)
	diagnostic.Get("/search-subscribers", diagnosticHandler.SearchSubscribers)

	// HA Cluster routes (Admin only) - clusterHandler already created in public routes section
	cluster := protected.Group("/cluster", middleware.AdminOnly())
	cluster.Get("/config", clusterHandler.GetConfig)
	cluster.Get("/status", clusterHandler.GetStatus)
	cluster.Get("/replication-status", clusterHandler.GetReplicationStatus)
	cluster.Post("/setup-main", clusterHandler.SetupMain)
	cluster.Post("/setup-secondary", clusterHandler.SetupSecondary)
	cluster.Post("/leave", clusterHandler.LeaveCluster)
	cluster.Delete("/nodes/:id", clusterHandler.RemoveNode)
	cluster.Post("/failover", clusterHandler.ManualFailover)
	cluster.Post("/test-connection", clusterHandler.TestConnection)
	cluster.Get("/check-main-status", clusterHandler.CheckMainStatus)
	cluster.Post("/promote-to-main", clusterHandler.PromoteToMain)
	cluster.Post("/test-source-connection", clusterHandler.TestSourceConnection)
	cluster.Post("/recover-from-server", clusterHandler.RecoverFromServer)

	// User management routes
	users := protected.Group("/users")
	users.Get("/", middleware.RequirePermission("users.view"), userHandler.List)
	users.Get("/:id", middleware.RequirePermission("users.view"), userHandler.Get)
	users.Post("/", middleware.RequirePermission("users.create"), userHandler.Create)
	users.Put("/:id", middleware.RequirePermission("users.edit"), userHandler.Update)
	users.Delete("/:id", middleware.RequirePermission("users.delete"), userHandler.Delete)

	// Communication routes
	communication := protected.Group("/communication")
	// Templates
	communication.Get("/templates", middleware.RequirePermission("communication.view"), communicationHandler.ListTemplates)
	communication.Get("/templates/:id", middleware.RequirePermission("communication.view"), communicationHandler.GetTemplate)
	communication.Post("/templates", middleware.RequirePermission("communication.create"), communicationHandler.CreateTemplate)
	communication.Put("/templates/:id", middleware.RequirePermission("communication.edit"), communicationHandler.UpdateTemplate)
	communication.Delete("/templates/:id", middleware.RequirePermission("communication.delete"), communicationHandler.DeleteTemplate)
	// Rules
	communication.Get("/rules", middleware.RequirePermission("communication.view"), communicationHandler.ListRules)
	communication.Get("/rules/:id", middleware.RequirePermission("communication.view"), communicationHandler.GetRule)
	communication.Post("/rules", middleware.RequirePermission("communication.create"), communicationHandler.CreateRule)
	communication.Put("/rules/:id", middleware.RequirePermission("communication.edit"), communicationHandler.UpdateRule)
	communication.Delete("/rules/:id", middleware.RequirePermission("communication.delete"), communicationHandler.DeleteRule)
	// Logs
	communication.Get("/logs", middleware.RequirePermission("communication.view"), communicationHandler.ListLogs)

	// Bandwidth rules routes
	bandwidth := protected.Group("/bandwidth")
	bandwidth.Get("/rules", middleware.RequirePermission("bandwidth.view"), bandwidthHandler.ListRules)
	bandwidth.Get("/rules/:id", middleware.RequirePermission("bandwidth.view"), bandwidthHandler.GetRule)
	bandwidth.Post("/rules", middleware.RequirePermission("bandwidth.create"), bandwidthHandler.CreateRule)
	bandwidth.Put("/rules/:id", middleware.RequirePermission("bandwidth.edit"), bandwidthHandler.UpdateRule)
	bandwidth.Delete("/rules/:id", middleware.RequirePermission("bandwidth.delete"), bandwidthHandler.DeleteRule)
	bandwidth.Post("/rules/:id/apply", middleware.RequirePermission("bandwidth.edit"), bandwidthHandler.ApplyNow)

	// FUP/Counter routes
	fup := protected.Group("/fup")
	fup.Get("/stats", middleware.RequirePermission("fup.view"), fupHandler.GetStats)
	fup.Get("/quotas", middleware.RequirePermission("fup.view"), fupHandler.ListQuotas)
	fup.Get("/quotas/:id/history", middleware.RequirePermission("fup.view"), fupHandler.GetQuotaHistory)
	fup.Get("/top-users", middleware.RequirePermission("fup.view"), fupHandler.GetTopUsers)
	fup.Post("/reset/:id", middleware.RequirePermission("fup.reset"), fupHandler.ResetFUP)
	fup.Post("/bulk-reset", middleware.RequirePermission("fup.reset"), fupHandler.BulkReset)
	fup.Post("/reset-all", middleware.RequirePermission("fup.reset"), fupHandler.ResetAllFUP)

	// Prepaid card routes
	prepaid := protected.Group("/prepaid")
	prepaid.Get("/", middleware.RequirePermission("prepaid.view"), prepaidHandler.List)
	prepaid.Get("/batches", middleware.RequirePermission("prepaid.view"), prepaidHandler.GetBatches)
	prepaid.Get("/:id", middleware.RequirePermission("prepaid.view"), prepaidHandler.Get)
	prepaid.Post("/generate", middleware.RequirePermission("prepaid.create"), prepaidHandler.Generate)
	prepaid.Post("/use", middleware.RequirePermission("prepaid.edit"), prepaidHandler.Use)
	prepaid.Delete("/:id", middleware.RequirePermission("prepaid.delete"), prepaidHandler.Delete)
	prepaid.Delete("/batch/:batch", middleware.RequirePermission("prepaid.delete"), prepaidHandler.DeleteBatch)

	// Invoice routes
	invoices := protected.Group("/invoices")
	invoices.Get("/", invoiceHandler.List)
	invoices.Get("/:id", invoiceHandler.Get)
	invoices.Post("/", middleware.ResellerOrAdmin(), invoiceHandler.Create)
	invoices.Put("/:id", middleware.ResellerOrAdmin(), invoiceHandler.Update)
	invoices.Delete("/:id", middleware.AdminOnly(), invoiceHandler.Delete)
	invoices.Post("/:id/payment", middleware.ResellerOrAdmin(), invoiceHandler.AddPayment)
	invoices.Get("/:id/payments", invoiceHandler.GetPayments)

	// Audit log routes
	audit := protected.Group("/audit", middleware.RequirePermission("audit.view"))
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

	// Permission routes
	permissions := protected.Group("/permissions")
	permissions.Get("/", middleware.RequirePermission("permissions.view"), permissionHandler.ListPermissions)
	permissions.Post("/", middleware.RequirePermission("permissions.create"), permissionHandler.CreatePermission)
	permissions.Delete("/:id", middleware.RequirePermission("permissions.delete"), permissionHandler.DeletePermission)
	permissions.Post("/seed", middleware.RequirePermission("permissions.create"), permissionHandler.SeedDefaultPermissions)
	// Permission groups
	permissions.Get("/groups", middleware.RequirePermission("permissions.view"), permissionHandler.ListGroups)
	permissions.Get("/groups/:id", middleware.RequirePermission("permissions.view"), permissionHandler.GetGroup)
	permissions.Post("/groups", middleware.RequirePermission("permissions.create"), permissionHandler.CreateGroup)
	permissions.Put("/groups/:id", middleware.RequirePermission("permissions.edit"), permissionHandler.UpdateGroup)
	permissions.Delete("/groups/:id", middleware.RequirePermission("permissions.delete"), permissionHandler.DeleteGroup)

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

	// Backup routes
	backups := protected.Group("/backups")
	backups.Get("/", middleware.RequirePermission("backups.view"), backupHandler.List)
	backups.Post("/", middleware.RequirePermission("backups.create"), backupHandler.Create)
	backups.Post("/upload", middleware.RequirePermission("backups.create"), backupHandler.Upload)
	backups.Get("/:filename/download", middleware.RequirePermission("backups.view"), backupHandler.Download)
	backups.Get("/:filename/token", middleware.RequirePermission("backups.view"), backupHandler.GetDownloadToken)
	backups.Get("/:filename/validate", middleware.RequirePermission("backups.view"), backupHandler.ValidateBackup)
	backups.Post("/:filename/restore", middleware.RequirePermission("backups.restore"), backupHandler.Restore)
	backups.Delete("/:filename", middleware.RequirePermission("backups.delete"), backupHandler.Delete)
	// Backup schedules
	backups.Get("/schedules", middleware.RequirePermission("backups.view"), backupHandler.ListSchedules)
	backups.Get("/schedules/:id", middleware.RequirePermission("backups.view"), backupHandler.GetSchedule)
	backups.Post("/schedules", middleware.RequirePermission("backups.create"), backupHandler.CreateSchedule)
	backups.Put("/schedules/:id", middleware.RequirePermission("backups.edit"), backupHandler.UpdateSchedule)
	backups.Delete("/schedules/:id", middleware.RequirePermission("backups.delete"), backupHandler.DeleteSchedule)
	backups.Post("/schedules/:id/toggle", middleware.RequirePermission("backups.edit"), backupHandler.ToggleSchedule)
	backups.Post("/schedules/:id/run", middleware.RequirePermission("backups.create"), backupHandler.RunScheduleNow)
	backups.Post("/test-ftp", middleware.RequirePermission("backups.view"), backupHandler.TestFTP)
	backups.Get("/logs", middleware.RequirePermission("backups.view"), backupHandler.ListBackupLogs)

	// Sharing Detection routes
	sharing := protected.Group("/sharing")
	sharing.Get("/", middleware.RequirePermission("sharing.view"), sharingHandler.List)
	sharing.Get("/stats", middleware.RequirePermission("sharing.view"), sharingHandler.GetStats)
	sharing.Get("/history", middleware.RequirePermission("sharing.view"), sharingHandler.GetHistory)
	sharing.Get("/trends", middleware.RequirePermission("sharing.view"), sharingHandler.GetTrends)
	sharing.Get("/repeat-offenders", middleware.RequirePermission("sharing.view"), sharingHandler.GetRepeatOffenders)
	sharing.Get("/settings", middleware.RequirePermission("sharing.view"), sharingHandler.GetSettings)
	sharing.Put("/settings", middleware.RequirePermission("sharing.settings"), sharingHandler.UpdateSettings)
	sharing.Post("/scan", middleware.RequirePermission("sharing.scan"), sharingHandler.RunManualScan)
	sharing.Get("/subscriber/:id", middleware.RequirePermission("sharing.view"), sharingHandler.GetSubscriberDetails)
	sharing.Get("/nas-rules", middleware.RequirePermission("sharing.view"), sharingHandler.ListNASRuleStatus)
	sharing.Post("/nas/:nas_id/rules", middleware.RequirePermission("sharing.settings"), sharingHandler.GenerateTTLRules)
	sharing.Delete("/nas/:nas_id/rules", middleware.RequirePermission("sharing.settings"), sharingHandler.RemoveTTLRules)

	// CDN routes
	cdns := protected.Group("/cdns")
	cdns.Get("/", middleware.RequirePermission("cdn.view"), cdnHandler.List)
	cdns.Get("/speeds", middleware.RequirePermission("cdn.view"), cdnHandler.GetCDNSpeeds) // Get all CDN speeds from services
	cdns.Get("/:id", middleware.RequirePermission("cdn.view"), cdnHandler.Get)
	cdns.Post("/", middleware.RequirePermission("cdn.create"), cdnHandler.Create)
	cdns.Put("/:id", middleware.RequirePermission("cdn.edit"), cdnHandler.Update)
	cdns.Delete("/:id", middleware.RequirePermission("cdn.delete"), cdnHandler.Delete)
	cdns.Post("/:id/sync", middleware.RequirePermission("cdn.edit"), cdnHandler.SyncToNAS)
	cdns.Post("/sync-all", middleware.RequirePermission("cdn.edit"), cdnHandler.SyncAllToNAS)
	cdns.Post("/:id/sync-pcq", middleware.RequirePermission("cdn.edit"), cdnHandler.SyncPCQToNAS)
	cdns.Post("/sync-all-pcq", middleware.RequirePermission("cdn.edit"), cdnHandler.SyncAllPCQToNAS)

	// CDN Port Rules routes
	portRules := protected.Group("/cdn-port-rules")
	portRules.Get("/", middleware.RequirePermission("cdn.view"), cdnHandler.ListPortRules)
	portRules.Post("/", middleware.RequirePermission("cdn.create"), cdnHandler.CreatePortRule)
	portRules.Put("/:id", middleware.RequirePermission("cdn.edit"), cdnHandler.UpdatePortRule)
	portRules.Delete("/:id", middleware.RequirePermission("cdn.delete"), cdnHandler.DeletePortRule)
	portRules.Post("/:id/sync", middleware.RequirePermission("cdn.edit"), cdnHandler.SyncPortRuleToNAS)
	portRules.Post("/sync-all", middleware.RequirePermission("cdn.edit"), cdnHandler.SyncAllPortRulesToNAS)

	// CDN Bandwidth Rules routes
	cdnBandwidth := protected.Group("/cdn-bandwidth-rules")
	cdnBandwidth.Get("/", middleware.RequirePermission("cdn.view"), cdnBandwidthHandler.ListRules)
	cdnBandwidth.Get("/:id", middleware.RequirePermission("cdn.view"), cdnBandwidthHandler.GetRule)
	cdnBandwidth.Post("/", middleware.RequirePermission("cdn.create"), cdnBandwidthHandler.CreateRule)
	cdnBandwidth.Put("/:id", middleware.RequirePermission("cdn.edit"), cdnBandwidthHandler.UpdateRule)
	cdnBandwidth.Delete("/:id", middleware.RequirePermission("cdn.delete"), cdnBandwidthHandler.DeleteRule)
	cdnBandwidth.Post("/:id/apply", middleware.RequirePermission("cdn.edit"), cdnBandwidthHandler.ApplyNow)

	// Service CDN configuration routes
	services.Get("/:id/cdns", middleware.RequirePermission("services.view"), cdnHandler.ListServiceCDNs)
	services.Put("/:id/cdns", middleware.RequirePermission("services.edit"), cdnHandler.UpdateServiceCDNs)
	services.Post("/:id/cdns", middleware.RequirePermission("services.edit"), cdnHandler.AddServiceCDN)
	services.Delete("/:id/cdns/:cdnId", middleware.RequirePermission("services.edit"), cdnHandler.DeleteServiceCDN)

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
		radAcctArchivalService.Stop()
		staleSessionCleanupService.Stop()
		clusterFailoverService.Stop()
		clusterService.Stop()
		mikrotik.ShutdownPool()
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
		{"traceroute", "traceroute", "traceroute (for diagnostics)"},
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

// enableProISPIPManagement auto-enables ProISP IP Pool Management on fresh installs
// This prevents duplicate IP issues by having ProISP manage all IP assignments
func enableProISPIPManagement() {
	// Check if the setting already exists
	var pref models.SystemPreference
	err := database.DB.Where("key = ?", "proisp_ip_management").First(&pref).Error

	if err != nil {
		// Setting doesn't exist - this is a fresh install, enable it
		log.Println("Fresh install detected: Enabling ProISP IP Pool Management...")
		if err := database.DB.Exec(`
			INSERT INTO system_preferences (key, value, value_type)
			VALUES ('proisp_ip_management', 'true', 'bool')
			ON CONFLICT (key) DO NOTHING
		`).Error; err != nil {
			log.Printf("Warning: Failed to enable ProISP IP Management: %v", err)
		} else {
			log.Println("ProISP IP Pool Management enabled automatically")
		}
	} else {
		// Setting exists - this is an existing installation
		if pref.Value == "true" {
			log.Println("ProISP IP Pool Management is enabled")
		} else {
			log.Println("ProISP IP Pool Management is disabled (MikroTik managing IPs)")
		}
	}
}

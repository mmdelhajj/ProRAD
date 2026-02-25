// INSTRUCTIONS: This file documents EXACTLY what to add to:
//   /opt/proxpanel-license/cmd/server/main.go
//
// DO NOT copy this file as-is. Apply each section at the correct location.
// ============================================================================
//
// BACKGROUND
// ----------
// The existing cloud_backup.go already defines:
//   - CloudBackupHandler struct + NewCloudBackupHandler()
//   - Upload, List, Download, Delete, Usage  (customer-facing)
//   - AdminListBackups(c)  → lists backups for one license (uses :license_id param)
//   - AdminSetQuota(c)     → sets quota for one license (uses :license_id param)
//
// cloud_backup_admin.go adds the following NEW methods:
//   - AdminList                 → lists ALL licenses with storage stats
//   - AdminListForLicense       → lists backups for one license (uses :license_id param, clean alias)
//   - AdminDeleteBackup         → deletes any backup by backup_id (admin, no ownership check)
//   - AdminSetQuotaByLicenseID  → sets quota using the ":id" param that matches the licenses group
//
// ============================================================================
//
// STEP 1 — Handler initialization
// --------------------------------
// Find the block that initializes other handlers (around line 86-92 in main.go):
//
//   licenseHandler := handlers.NewLicenseHandler()
//   adminHandler   := handlers.NewAdminHandler(jwtSecret)
//   ...
//   luksHandler    := handlers.NewLuksHandler()
//
// ADD immediately after luksHandler:
//
//   cloudBackupHandler := handlers.NewCloudBackupHandler()
//
// ============================================================================
//
// STEP 2 — Customer-facing cloud backup routes
// ---------------------------------------------
// Find the existing public license route group ending (around the last
// license.Post("...") line before `update := api.Group("/update")`).
//
// ADD a new group immediately after the license group:
//
//   // Cloud Backup Routes (authenticated by X-License-Key header)
//   cloudBackupRoutes := api.Group("/cloud-backup")
//   cloudBackupRoutes.Post("/upload",             cloudBackupHandler.Upload)
//   cloudBackupRoutes.Get("/list",                cloudBackupHandler.List)
//   cloudBackupRoutes.Get("/usage",               cloudBackupHandler.Usage)
//   cloudBackupRoutes.Get("/download/:backup_id", cloudBackupHandler.Download)
//   cloudBackupRoutes.Delete("/:backup_id",       cloudBackupHandler.Delete)
//
// ============================================================================
//
// STEP 3 — Add quota route to existing licenses admin group
// ----------------------------------------------------------
// Find the licenses route group inside adminProtected:
//
//   licenses := adminProtected.Group("/licenses")
//   ...
//   licenses.Post("/:id/proxrad-subscription", adminHandler.SetProxRadSubscription)
//   licenses.Delete("/:id", adminHandler.DeleteLicense)
//   ...
//
// ADD this one line after the proxrad-subscription route:
//
//   licenses.Put("/:id/quota", cloudBackupHandler.AdminSetQuotaByLicenseID)
//
// ============================================================================
//
// STEP 4 — Admin cloud backup route group
// ----------------------------------------
// Find the end of the protected admin route block — just before the static
// file serving lines:
//
//   // Serve static admin dashboard
//   app.Static("/admin", "./web/admin/dist")
//
// ADD these lines immediately BEFORE the static serving block:
//
//   // Admin Cloud Backup Routes (JWT protected via adminProtected group)
//   adminBackups := adminProtected.Group("/cloud-backups")
//   adminBackups.Get("/",                      cloudBackupHandler.AdminList)
//   adminBackups.Get("/:license_id",           cloudBackupHandler.AdminListForLicense)
//   adminBackups.Delete("/backup/:backup_id",  cloudBackupHandler.AdminDeleteBackup)
//
// NOTE: Route ordering matters for Fiber — the /backup/:backup_id DELETE must
// be registered before any /:license_id GET to avoid shadowing.  The grouping
// above is safe because DELETE and GET are different HTTP methods.
//
// ============================================================================
//
// FINAL RESULT — the relevant portion of main.go should look like this:
//
//   // Handler initialization
//   luksHandler        := handlers.NewLuksHandler()
//   cloudBackupHandler := handlers.NewCloudBackupHandler()   // NEW
//
//   ...
//
//   // Cloud Backup Routes (after license routes, before update routes)
//   cloudBackupRoutes := api.Group("/cloud-backup")
//   cloudBackupRoutes.Post("/upload",             cloudBackupHandler.Upload)
//   cloudBackupRoutes.Get("/list",                cloudBackupHandler.List)
//   cloudBackupRoutes.Get("/usage",               cloudBackupHandler.Usage)
//   cloudBackupRoutes.Get("/download/:backup_id", cloudBackupHandler.Download)
//   cloudBackupRoutes.Delete("/:backup_id",       cloudBackupHandler.Delete)
//
//   ...inside the licenses admin group...
//   licenses.Post("/:id/proxrad-subscription", adminHandler.SetProxRadSubscription)
//   licenses.Put("/:id/quota", cloudBackupHandler.AdminSetQuotaByLicenseID)   // NEW
//   licenses.Delete("/:id", adminHandler.DeleteLicense)
//
//   ...end of adminProtected block, before static serving...
//   // Admin Cloud Backup Routes
//   adminBackups := adminProtected.Group("/cloud-backups")
//   adminBackups.Get("/",                     cloudBackupHandler.AdminList)
//   adminBackups.Get("/:license_id",          cloudBackupHandler.AdminListForLicense)
//   adminBackups.Delete("/backup/:backup_id", cloudBackupHandler.AdminDeleteBackup)
//
//   // Serve static admin dashboard
//   app.Static("/admin", "./web/admin/dist")
//
// ============================================================================

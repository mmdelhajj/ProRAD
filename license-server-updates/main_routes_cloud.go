// ============================================================
// CLOUD BACKUP ROUTES — Add to /opt/proxpanel-license/cmd/server/main.go
// ============================================================
//
// 1. Import the handler (if it lives in a separate file, it is already
//    accessible via the handlers package — just add the init call below).
//
// 2. After the existing handler initialisations (around line 90 in main.go),
//    add:
//
//      cloudBackupHandler := handlers.NewCloudBackupHandler()
//
// 3. In the PUBLIC LICENSE routes section (license group), add:
//
//      // Cloud Backup — authenticated by X-License-Key header (same as all license routes)
//      cloudBackup := license.Group("/cloud-backup")
//      cloudBackup.Post("/upload",              cloudBackupHandler.Upload)
//      cloudBackup.Get("/list",                 cloudBackupHandler.List)
//      cloudBackup.Get("/usage",                cloudBackupHandler.Usage)
//      cloudBackup.Get("/download/:backup_id",  cloudBackupHandler.Download)
//      cloudBackup.Delete("/:backup_id",        cloudBackupHandler.Delete)
//
// 4. In the PROTECTED ADMIN routes section (adminProtected group), add:
//
//      // Cloud Backup admin management
//      cloudBackups := adminProtected.Group("/cloud-backups")
//      cloudBackups.Get("/",         cloudBackupHandler.AdminList)
//      cloudBackups.Delete("/:id",   cloudBackupHandler.AdminDelete)
//
//      // Set storage tier on a specific license
//      licenses.Put("/:id/cloud-tier", cloudBackupHandler.AdminSetTier)
//
// ============================================================
// FULL CONTEXT DIFF (copy the lines that begin with "+"):
// ============================================================
//
// --- a/cmd/server/main.go
// +++ b/cmd/server/main.go
//
// @@ handler initialisation block @@
//
//   buildHandler := handlers.NewBuildHandler(proisDir, updatesDir)
//   sshHandler   := handlers.NewSSHHandler(jwtSecret)
//   luksHandler  := handlers.NewLuksHandler()
// + cloudBackupHandler := handlers.NewCloudBackupHandler()
//
// @@ public license routes @@
//
//   license.Post("/store-password-hash", licenseHandler.StorePasswordHash)
// + // Cloud Backup routes (license-key authenticated)
// + cloudBackup := license.Group("/cloud-backup")
// + cloudBackup.Post("/upload",             cloudBackupHandler.Upload)
// + cloudBackup.Get("/list",                cloudBackupHandler.List)
// + cloudBackup.Get("/usage",               cloudBackupHandler.Usage)
// + cloudBackup.Get("/download/:backup_id", cloudBackupHandler.Download)
// + cloudBackup.Delete("/:backup_id",       cloudBackupHandler.Delete)
//
// @@ admin protected routes — after the licenses group @@
//
//   licenses.Post("/:id/proxrad-subscription", adminHandler.SetProxRadSubscription)
// + licenses.Put("/:id/cloud-tier",            cloudBackupHandler.AdminSetTier)
//   licenses.Delete("/:id", adminHandler.DeleteLicense)
//   ...
//   // (anywhere inside adminProtected, e.g. after the whatsappSubs group)
// + cloudBackupAdmin := adminProtected.Group("/cloud-backups")
// + cloudBackupAdmin.Get("/",       cloudBackupHandler.AdminList)
// + cloudBackupAdmin.Delete("/:id", cloudBackupHandler.AdminDelete)
//
// ============================================================
// BODY LIMIT NOTE:
// The existing app config already allows 100 MB uploads.
// If you need larger backups raise BodyLimit in fiber.Config{}.
// ============================================================

package main // This file is documentation only — it is NOT compiled.
// Delete this file after you have applied the diff above.

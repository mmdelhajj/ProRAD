// database_migration_cloud.go
// Instructions: Apply the changes below to the license server's database.go
//
// -------------------------------------------------------------------------
// STEP 1: Add the new models to the existing AutoMigrate() call.
//
// Find the AutoMigrate block (typically in InitDB or similar) and append:
//
//     err := db.AutoMigrate(
//         // ... existing models ...
//         &models.CloudBackup{},
//         &models.CloudStorageUsage{},
//     )
//
// -------------------------------------------------------------------------
// STEP 2: After the AutoMigrate call, ensure the storage directory exists.
//
// Add the following lines immediately after the AutoMigrate error check:
//
//     if err := os.MkdirAll("/opt/proxpanel-license/cloud-backups", 0755); err != nil {
//         log.Printf("WARNING: could not create cloud-backups directory: %v", err)
//     }
//
// Make sure "os" is present in the import block of database.go. If not, add it:
//
//     import (
//         // ... existing imports ...
//         "os"
//     )
//
// -------------------------------------------------------------------------
// STEP 3: Full example of what the relevant section of database.go should
//         look like after the patch (abbreviated for clarity):
//
//     func InitDB(dsn string) (*gorm.DB, error) {
//         db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
//         if err != nil {
//             return nil, err
//         }
//
//         err = db.AutoMigrate(
//             &models.License{},
//             &models.Activation{},
//             &models.Update{},
//             &models.WhatsAppSubscription{},
//             // --- ADD THESE TWO LINES ---
//             &models.CloudBackup{},
//             &models.CloudStorageUsage{},
//         )
//         if err != nil {
//             return nil, err
//         }
//
//         // --- ADD THIS BLOCK ---
//         if err := os.MkdirAll("/opt/proxpanel-license/cloud-backups", 0755); err != nil {
//             log.Printf("WARNING: could not create cloud-backups directory: %v", err)
//         }
//
//         return db, nil
//     }
//
// -------------------------------------------------------------------------
// No other changes to database.go are required.
// The two new tables will be created automatically on next service start:
//   - cloud_backups
//   - cloud_storage_usages

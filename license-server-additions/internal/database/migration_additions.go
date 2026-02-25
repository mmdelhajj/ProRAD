package database

// CloudBackupMigrations returns the models to add to AutoMigrate for cloud backup feature.
// Add these to the existing AutoMigrate call in database.go:
//   &models.CloudBackup{},
//   &models.CloudStorageUsage{},
//
// IMPORTANT: The live license server (109.110.185.33) does NOT use GORM AutoMigrate.
// Instead it uses raw SQL via the Migrate() / runMigrations() functions in database.go.
// The existing Migrate() function uses createTables() for fresh installs and
// runMigrations() for incremental ALTER TABLE / CREATE TABLE IF NOT EXISTS statements.
//
// To add cloud backup tables to an existing live database, add the following block
// inside the runMigrations() function in database.go:
//
//   // Cloud backup storage tables
//   sqlDB.Exec(`
//       CREATE TABLE IF NOT EXISTS cloud_backups (
//           id SERIAL PRIMARY KEY,
//           license_id INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
//           backup_id VARCHAR(64) UNIQUE NOT NULL,
//           filename VARCHAR(255) NOT NULL,
//           file_path VARCHAR(500) NOT NULL,
//           encryption_key_encrypted TEXT NOT NULL,
//           size_bytes BIGINT NOT NULL DEFAULT 0,
//           created_at TIMESTAMPTZ DEFAULT NOW(),
//           expires_at TIMESTAMPTZ,
//           download_count INTEGER DEFAULT 0,
//           last_downloaded TIMESTAMPTZ,
//           status VARCHAR(20) DEFAULT 'active'
//       )
//   `)
//   sqlDB.Exec(`CREATE INDEX IF NOT EXISTS idx_cloud_backups_license_id ON cloud_backups(license_id)`)
//   sqlDB.Exec(`CREATE INDEX IF NOT EXISTS idx_cloud_backups_status ON cloud_backups(status)`)
//   sqlDB.Exec(`CREATE INDEX IF NOT EXISTS idx_cloud_backups_created_at ON cloud_backups(created_at DESC)`)
//
//   sqlDB.Exec(`
//       CREATE TABLE IF NOT EXISTS cloud_storage_usage (
//           license_id INTEGER PRIMARY KEY REFERENCES licenses(id) ON DELETE CASCADE,
//           total_used_bytes BIGINT DEFAULT 0,
//           quota_bytes BIGINT DEFAULT 524288000,
//           tier VARCHAR(20) DEFAULT 'free',
//           backup_count INTEGER DEFAULT 0,
//           last_cleanup TIMESTAMPTZ,
//           last_upload TIMESTAMPTZ,
//           created_at TIMESTAMPTZ DEFAULT NOW(),
//           updated_at TIMESTAMPTZ DEFAULT NOW()
//       )
//   `)
//
//   sqlDB.Exec(`
//       CREATE TABLE IF NOT EXISTS cloud_backup_downloads (
//           id SERIAL PRIMARY KEY,
//           backup_id VARCHAR(64) NOT NULL,
//           license_id INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
//           downloaded_by_ip VARCHAR(50),
//           downloaded_by_user VARCHAR(100),
//           downloaded_at TIMESTAMPTZ DEFAULT NOW(),
//           success BOOLEAN DEFAULT true,
//           error_message TEXT
//       )
//   `)
//   sqlDB.Exec(`CREATE INDEX IF NOT EXISTS idx_cloud_backup_downloads_backup_id ON cloud_backup_downloads(backup_id)`)
//   sqlDB.Exec(`CREATE INDEX IF NOT EXISTS idx_cloud_backup_downloads_license_id ON cloud_backup_downloads(license_id)`)
//
// Also add these to the createTables() schema string for fresh installs (see migrations/cloud_backups.sql).
//
// Live status: As of 2026-02-25, the cloud backup models (CloudBackup,
// CloudStorageUsage, CloudBackupDownload) ARE ALREADY DEFINED in the live
// models.go on the license server. Verify whether the tables exist in the DB:
//   docker exec proxpanel-postgres psql -U proxpanel proxpanel_license -c "\dt cloud*"

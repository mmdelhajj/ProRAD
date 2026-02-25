-- Cloud backup tables for ProxPanel Cloud Storage feature
-- Run this if AutoMigrate is not used
--
-- NOTE: The live license server uses raw SQL migrations (not GORM AutoMigrate).
-- For existing installations, paste these statements into the runMigrations()
-- function in /opt/proxpanel-license/internal/database/database.go, wrapped
-- in sqlDB.Exec() calls (which ignore "already exists" errors safely).
--
-- For a one-time manual application on the live server:
--   docker exec proxpanel-postgres psql -U proxpanel proxpanel_license -f /path/to/this/file
--
-- Live status as of 2026-02-25: Models are defined in models.go on the license
-- server (109.110.185.33). Verify DB tables exist before applying:
--   docker exec proxpanel-postgres psql -U proxpanel proxpanel_license -c "\dt cloud*"

-- cloud_backups: one row per backup file uploaded by a customer server
CREATE TABLE IF NOT EXISTS cloud_backups (
    id SERIAL PRIMARY KEY,
    license_id INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
    backup_id VARCHAR(64) UNIQUE NOT NULL,
    filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    encryption_key_encrypted TEXT NOT NULL,          -- AES-256 key encrypted with master key; never exposed via API
    size_bytes BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    download_count INTEGER DEFAULT 0,
    last_downloaded TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'active'              -- active | expired | deleted
);

-- cloud_storage_usage: one row per license, tracks quota consumption
CREATE TABLE IF NOT EXISTS cloud_storage_usage (
    license_id INTEGER PRIMARY KEY REFERENCES licenses(id) ON DELETE CASCADE,
    total_used_bytes BIGINT DEFAULT 0,
    quota_bytes BIGINT DEFAULT 524288000,            -- 500 MB default quota
    tier VARCHAR(20) DEFAULT 'free',                 -- free | basic | pro | enterprise
    backup_count INTEGER DEFAULT 0,
    last_cleanup TIMESTAMPTZ,
    last_upload TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- cloud_backup_downloads: audit log of every download attempt
CREATE TABLE IF NOT EXISTS cloud_backup_downloads (
    id SERIAL PRIMARY KEY,
    backup_id VARCHAR(64) NOT NULL,
    license_id INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
    downloaded_by_ip VARCHAR(50),
    downloaded_by_user VARCHAR(100),
    downloaded_at TIMESTAMPTZ DEFAULT NOW(),
    success BOOLEAN DEFAULT true,
    error_message TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cloud_backups_license_id ON cloud_backups(license_id);
CREATE INDEX IF NOT EXISTS idx_cloud_backups_status ON cloud_backups(status);
CREATE INDEX IF NOT EXISTS idx_cloud_backups_created_at ON cloud_backups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cloud_backup_downloads_backup_id ON cloud_backup_downloads(backup_id);
CREATE INDEX IF NOT EXISTS idx_cloud_backup_downloads_license_id ON cloud_backup_downloads(license_id);

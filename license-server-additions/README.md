# ProxPanel License Server — Cloud Backup Additions

## Current Status (as of 2026-02-25)

**The Go model structs for cloud backup are ALREADY present in the live codebase.**
When the SSH files were read from `109.110.185.33:/opt/proxpanel-license/internal/models/models.go`,
the following models were found to already be defined:

- `CloudBackup` (with `EncryptionKeyEncrypted`, `LastDownloaded`, `Status`, License FK)
- `CloudStorageUsage` (with `Tier`, `LastCleanup`, `LastUpload`, `CreatedAt`, License FK)
- `CloudBackupDownload` (download audit log)

**What is NOT yet done:** The database tables may not exist yet. The license server
uses raw SQL migrations (not GORM AutoMigrate), so adding a model to `models.go`
alone does not create the table.

---

## File Inventory

```
license-server-additions/
├── README.md                                    ← this file
├── migrations/
│   └── cloud_backups.sql                        ← SQL to create the 3 tables + indexes
└── internal/
    ├── models/
    │   └── models_additions.go                  ← reference Go structs (already live; see note)
    └── database/
        └── migration_additions.go               ← commented instructions for database.go
```

---

## What Goes Where on the License Server

### 1. Verify tables exist first

SSH into the license server and check:

```bash
ssh root@109.110.185.33
docker exec proxpanel-postgres psql -U proxpanel proxpanel_license -c "\dt cloud*"
```

If the tables already exist, no further action is required for the DB layer.

### 2. If tables do NOT exist — apply SQL migration

**Option A (one-shot manual apply):**
```bash
scp migrations/cloud_backups.sql root@109.110.185.33:/tmp/
ssh root@109.110.185.33 "docker exec -i proxpanel-postgres psql -U proxpanel proxpanel_license < /tmp/cloud_backups.sql"
```

**Option B (integrate into database.go for future fresh installs):**

Open `/opt/proxpanel-license/internal/database/database.go` on the license server.

Inside `runMigrations(sqlDB *sql.DB)`, add the `sqlDB.Exec(...)` blocks shown in
`internal/database/migration_additions.go` in this staging directory.

Inside `createTables(sqlDB *sql.DB)`, append the same SQL to the `schema` string
so fresh installations also get the tables.

### 3. Rebuild the Docker image after any Go code changes

The license server runs compiled Go (with garble obfuscation). After editing
`.go` files, rebuild and restart:

```bash
ssh root@109.110.185.33
cd /opt/proxpanel-license
docker compose build
docker compose up -d
```

---

## AutoMigrate Note

The license server does NOT call `gorm.DB.AutoMigrate()`. All schema changes
are applied via explicit `sqlDB.Exec()` calls in:

- `runMigrations()` — for incremental changes to existing databases
- `createTables()` — for fresh installs

If you ever switch to AutoMigrate, add to the AutoMigrate call:

```go
db.AutoMigrate(
    // ... existing models ...
    &models.CloudBackup{},
    &models.CloudStorageUsage{},
    &models.CloudBackupDownload{},
)
```

---

## Live Model vs. Originally Requested Model — Differences

The originally requested minimal model had:

```go
type CloudBackup struct {
    ID               uint
    LicenseID        uint
    BackupID         string
    Filename         string
    FilePath         string
    SizeBytes        int64
    CreatedAt        time.Time
    ExpiresAt        *time.Time
    DownloadCount    int
    LastDownloadedAt *time.Time
    Status           string    // active|deleted
}
```

The live model on the server additionally has:
- `License *License` (FK association for preloading)
- `EncryptionKeyEncrypted string` (AES key stored encrypted; critical for security)
- `LastDownloaded *time.Time` (renamed from `LastDownloadedAt`)
- `status` default is `'active'` without quotes (Postgres-level default)

For `CloudStorageUsage`, the live model additionally has:
- `License *License` (FK association)
- `Tier string` (free/basic/pro/enterprise quota tier)
- `LastCleanup *time.Time`
- `LastUpload *time.Time`
- `CreatedAt time.Time`

The live model is more complete. Use the live model definition as the source of truth.

---

## Backup Server Sync

After any change to the license server code or DB schema, sync to the backup server:

```bash
ssh root@109.110.185.33 "cd /opt/proxpanel-license && git push"
ssh root@188.93.113.5 "cd /opt/proxpanel-license && git pull && docker compose build && docker compose up -d"
```

Also apply the SQL migration on the backup server's PostgreSQL:
```bash
ssh root@188.93.113.5 "docker exec -i proxpanel-postgres psql -U proxpanel proxpanel_license" < migrations/cloud_backups.sql
```

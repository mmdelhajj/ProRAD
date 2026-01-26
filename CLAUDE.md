# ProISP Project Context

## Overview
Enterprise ISP Billing & RADIUS Management System for 30,000+ subscribers.

## Server Infrastructure (IMPORTANT)

| Server | IP | Purpose |
|--------|-----|---------|
| **License Server** | 109.110.185.33 | License validation, admin panel, SSH tunnels to customers |
| **Main/Dev Server** | 109.110.185.115 | Development, ProISP main application |
| **Customer Servers** | Various (e.g., 10.0.0.203) | Customer installations |

**CRITICAL NOTES:**
- The License Server runs ONLY on 109.110.185.33 - NEVER deploy license server containers on .115
- `license.proxpanel.com` DNS points to 109.110.185.33
- License server uses `network_mode: host` for direct tunnel port access
- SSH tunnels are managed automatically by the TunnelManager service (no manual scripts needed)

### License Server Access (on 109.110.185.33)
```bash
# SSH to license server
ssh root@109.110.185.33

# Check license server containers
docker ps | grep license

# Access license database
docker exec -it proxpanel-license-db psql -U proxpanel -d proxpanel_license

# View activations
docker exec proxpanel-license-db psql -U proxpanel -d proxpanel_license -c "SELECT a.*, c.name FROM activations a JOIN licenses l ON a.license_id = l.id JOIN customers c ON l.customer_id = c.id;"

# Test SSH tunnel to customer (port = tunnel_port from activations table)
sshpass -p 'PASSWORD' ssh -p TUNNEL_PORT root@127.0.0.1 "hostname"
```

## Tech Stack
- **Backend**: Go 1.21+, Fiber v2.52, GORM, PostgreSQL 16, Redis 7
- **Frontend**: React 18, Vite, Tailwind CSS, TanStack Query, Zustand
- **Infrastructure**: Docker, Nginx, Custom RADIUS server
- **MikroTik**: RouterOS API integration

## Project Structure
```
/root/proisp/
├── backend/
│   ├── cmd/
│   │   ├── api/main.go        # API server (port 8080)
│   │   └── radius/main.go     # RADIUS server (1812/1813)
│   ├── internal/
│   │   ├── config/            # Environment config
│   │   ├── database/          # PostgreSQL + Redis
│   │   ├── handlers/          # 30+ API handlers
│   │   ├── middleware/        # Auth, audit, rate limiting
│   │   ├── mikrotik/          # RouterOS API client
│   │   ├── models/            # GORM models
│   │   ├── radius/            # RADIUS server + CoA
│   │   └── services/          # Background services
│   └── pkg/
├── frontend/
│   ├── src/
│   │   ├── pages/             # 30+ pages
│   │   ├── components/        # Reusable components
│   │   ├── services/api.js    # API client
│   │   └── store/             # Zustand state
├── automation/                 # E2E testing scripts
├── docker-compose.yml
└── nginx.conf
```

## Key Files

### Backend Services
- `internal/services/quota_sync.go` - Syncs bandwidth every 30s, enforces FUP
- `internal/services/bandwidth_rule_service.go` - Time-based speed rules
- `internal/mikrotik/client.go` - MikroTik API client
- `internal/radius/server.go` - RADIUS auth/acct (MS-CHAPv2, PAP)
- `internal/radius/coa.go` - Change-of-Authorization

### Key Handlers
- `internal/handlers/subscriber.go` - Subscriber CRUD + actions
- `internal/handlers/service.go` - Service plans
- `internal/handlers/nas.go` - NAS/Router management
- `internal/handlers/session.go` - Active sessions

### Models
- `internal/models/subscriber.go` - PPPoE users, quota tracking
- `internal/models/service.go` - Plans with FUP tiers
- `internal/models/nas.go` - MikroTik devices
- `internal/models/billing.go` - Transactions, invoices

## Docker Containers
| Container | Port | Purpose |
|-----------|------|---------|
| proisp-api | 8080 | Go API server |
| proisp-db | 5432 | PostgreSQL |
| proisp-redis | 6379 | Redis cache |
| proisp-radius | 1812/1813 UDP | RADIUS server |
| proisp-frontend | 3000 | React app |
| proisp-nginx | 80/443 | Reverse proxy |

## Common Commands
```bash
# Build and restart API
docker-compose build api && docker-compose up -d api

# View API logs
docker logs -f proisp-api

# View RADIUS logs
docker logs -f proisp-radius

# Database access
docker exec -it proisp-db psql -U proisp -d proisp

# Check running containers
docker ps | grep proisp

# Restart all services
docker-compose down && docker-compose up -d
```

## Key Database Tables
- `subscribers` - Users (username, password, quota, is_online, fup_level)
- `services` - Plans (speed, daily/monthly FUP tiers)
- `nas_devices` - MikroTik devices (ip, api credentials, radius secret) - renamed from `nas` in v1.0.58+
- `rad_check` / `rad_reply` - RADIUS attributes
- `rad_acct` - Accounting records
- `transactions` - Billing history
- `users` - Admin/reseller accounts

## System Features
- Multi-tier FUP (3 daily + 3 monthly levels)
- Time-based speed windows (free hours)
- Reseller hierarchy with balance management
- Prepaid card system
- Account sharing detection (TTL analysis)
- Customer self-service portal
- Automated invoicing
- Audit logging

## Recent Work
- **QuotaSync Service Fix** (Jan 2025): Fixed issue where users weren't being marked offline when PPPoE session ended. The QuotaSync service now properly updates `is_online` status in the subscribers table.
- **Remote Support Endpoints** (Jan 2026): Added `/api/system/remote-support/status` (GET) and `/api/system/remote-support/toggle` (POST) endpoints to `internal/handlers/settings.go` for frontend remote support toggle functionality.
- **Remote Support Security Fix** (Jan 2026): When Remote Support is disabled, SSH credentials are now properly cleared from license server using DELETE `/api/v1/license/ssh-credentials` endpoint.
- **Automatic TunnelManager** (Jan 2026): Implemented automatic SSH tunnel management service. No manual scripts needed - tunnels are created/destroyed automatically based on Remote Support status.
- **Tier Management CRUD** (Jan 2026): Added full CRUD for license tiers in admin panel (`/admin/tiers`). Can now edit tier name, display_name, max_subscribers, prices, and duration_days.
- **Update System Fix v1.0.53** (Jan 2026): Fixed 500 error after updates. Root cause: API container couldn't run `docker restart` (no docker CLI). Solution: Uses Docker Engine API via Unix socket + host-level systemd fallback service.
- **Tier Duration Auto-Extend** (Jan 2026): When changing a license's tier, the expiration date now automatically extends based on `tier.duration_days`.
- **Tunnel Port Auto-Assignment** (Jan 2026): Fixed tunnel port not being assigned on fresh installs. The `UpdateSSHCredentials` handler now auto-assigns tunnel_port (starting from 20000) when SSH credentials are saved if no port was previously assigned.
- **Tier Expiration Priority Fix** (Jan 2026): Fixed issue where tier expiration was being overwritten by frontend. Added `tierExpirySet` flag in admin.go - when a tier is selected, its `duration_days` takes priority over any manually sent `expires_at` value from frontend.
- **Update Publish Feature** (Jan 2026): Added ability to publish any version as the current update for customers. Admin can click "Publish" on any version in the Updates page to make it the active update. Useful for rolling back to older versions if issues are found with new releases. Added `is_published` column to updates table.
- **Build Auto-Version Suggestion** (Jan 2026): Build page now automatically suggests the next version number. If latest version is v1.0.56, it pre-fills v1.0.57. Shows "Latest version: X" below the input field.
- **Build Page Publish Button** (Jan 2026): Added "Publish to Customers" button directly on the Build page. After a successful build, a green publish button appears so admin doesn't need to go to Updates page separately.
- **Frontend Build Source Lock** (Jan 2026): License server build system uses pre-built frontend from `/root/proisp/frontend/dist`. This ensures consistent design across all builds. The v1.0.54 frontend is the stable version used for all new builds.
- **Database Schema Migration Fix** (Jan 2026): Fixed schema incompatibility when upgrading older installations. The v1.0.58+ code expects `nas_devices` table (not `nas`) with additional columns. Migration steps documented in Troubleshooting section.
- **GORM Relation Fix** (Jan 2026): Fixed "unsupported relations" error causing subscriber list to return 500. Changed Subscriber model relations (`Service`, `Nas`, `Switch`, `Reseller`) from `gorm:"-"` to proper `gorm:"foreignKey:..."` tags. This allows GORM Preload to work correctly.
- **CoA Port Default Changed** (Jan 2026): Changed default CoA port from 3799 to 1700 (MikroTik default). Updated in backend model, handler, and frontend form.
- **radclient Requirement** (Jan 2026): The API container needs `freeradius-utils` installed for CoA to work. Without it, TimeSpeed service disconnects users when trying to apply rate limits. Install with: `docker exec proxpanel-api apt-get install -y freeradius-utils`
- **Ping Requirement** (Jan 2026): The API container needs `iputils-ping` installed for subscriber ping feature to work. Install with: `docker exec proxpanel-api apt-get install -y iputils-ping`
- **Build System Auto-Install Packages** (Jan 2026): Updated build system to include `freeradius-utils` and `iputils-ping` in docker-compose.yml. New builds will auto-install these packages when API container starts.
- **API Auto-Install Packages on Startup** (Jan 2026): Added `ensureRequiredPackages()` function to `cmd/api/main.go` that automatically installs `freeradius-utils`, `iputils-ping`, and `postgresql-client` if not present. This ensures UPDATE customers (who only get new binaries, not new docker-compose.yml) also get these packages installed.
- **QuotaSync Pointer Fix** (Jan 2026): Fixed build errors in `quota_sync.go` after changing Subscriber's `Service` field from value to pointer type. Added nil checks before accessing `sub.Service` in `restoreOriginalSpeedIfNeeded`, `checkAndEnforceFUP`, and `checkAndApplyTimeBasedSpeed` functions.
- **Auto-Disconnect on Service Change** (Jan 2026): When a subscriber's service is changed, if they're online, they are automatically disconnected via CoA (with MikroTik API fallback) so they reconnect and get a new IP from the new service's pool. This is necessary because IP addresses are assigned at PPPoE connection time and cannot be changed mid-session. **Important:** This is implemented in both the regular Update handler AND the ChangeService handler.
- **GORM Explicit Foreign Key Fix** (Jan 2026): Fixed "unsupported relations for schema Subscriber" error that broke QuotaSync, Preload, and subscriber list. The issue was using `gorm:"-"` which tells GORM to ignore the relation entirely. Fix: Use explicit foreign key tags like `gorm:"foreignKey:ServiceID;references:ID"` which work with garble obfuscation because the relationship is fully specified without relying on reflection.
- **Enterprise Security Stack** (Jan 2026): Implemented comprehensive security protection:
  - **Encrypted Backups**: All backups use AES-256-GCM encryption with license-derived key. Customers cannot read backup files without the encryption key.
  - **Database Encryption**: Sensitive fields encrypted with license server key. Key fetched on startup and cached 24h.
  - **Anti-Debug Protection**: Detects debuggers (gdb, lldb, strace, etc.) and terminates if found.
  - **Anti-Tamper**: Binary integrity checks detect modifications.
  - **License-Bound Encryption**: Encryption key provided by license server - different key per customer.
  - Files: `internal/security/encryption.go`, `internal/security/antidebug.go`, `internal/security/antitamper.go`
- **Token-Based Backup Download** (Jan 2026): Fixed "Missing authorization header" error when downloading backups from browser. The browser's `window.open()` doesn't include auth headers, so implemented a token-based system:
  - Frontend requests temporary download token via `GET /api/backups/:filename/token` (authenticated)
  - Backend returns one-time-use token valid for 5 minutes
  - Frontend opens `GET /api/backups/public-download/:token` (no auth required)
  - Files: `internal/handlers/backup.go` (GetDownloadToken, PublicDownload), `frontend/src/pages/Backups.jsx`, `frontend/src/services/api.js`
- **Restart Services Button** (Jan 2026): Added "Service Management" section to Settings → License tab with buttons to restart API or all services. Allows customers to fix issues themselves without contacting support.
  - Restart API - restarts just the API container
  - Restart All Services - restarts API, RADIUS, and Frontend containers
  - Uses Docker Engine API via Unix socket with CLI fallback
  - Files: `internal/handlers/settings.go` (RestartServices), `frontend/src/pages/Settings.jsx`
- **Critical System Routes Bypass License** (Jan 2026): Created `criticalSystem` route group that requires auth but bypasses license checks. This allows admins to restart services and revalidate license even when license is blocked/expired. Routes: `POST /api/system/restart-services`, `POST /api/license/revalidate`
- **NAS ID Fix for Service Change Disconnect** (Jan 2026): Fixed issue where users weren't being disconnected after service change because `nas_id` wasn't set on PPPoE session start. Modified RADIUS accounting handler to look up NAS by IP and set `nas_id` when session starts.
- **Bulk Delete Subscribers** (Jan 2026): Added "delete" action to subscriber bulk action handler. Admin can now select multiple subscribers and delete them at once.
- **RADIUS License Enforcement** (Jan 2026): RADIUS server now requires valid license to start. Checks license every hour and shuts down if license becomes invalid. File: `cmd/radius/main.go`
- **Binary Expiry Protection** (Jan 2026): Binaries expire 30 days after build date. Set at compile time with `-ldflags "-X main.buildDate=YYYY-MM-DD"`. Prevents use of old/stolen binaries indefinitely.
- **Telemetry Alerts System** (Jan 2026): License server heartbeat now detects suspicious activity and creates alerts:
  - Multi-IP detection (same license from different IPs)
  - Subscriber limit exceeded
  - Outdated software versions
  - Admin can view/resolve alerts at `/admin/alerts`
  - Files: `internal/handlers/license.go` (checkAndCreateAlerts), `internal/handlers/admin.go` (GetAlerts, ResolveAlert)
- **Subscriber Count Enforcement** (Jan 2026): License server verifies subscriber count before allowing new subscribers. Functions: `license.CanAddSubscriber()`, `license.VerifySubscriberCount()`. Endpoint: `POST /api/v1/license/verify-subscriber`
- **Security Alerts Page** (Jan 2026): Added `/admin/alerts` page to license server admin panel. Shows security alerts with severity colors, filtering by type/severity, and resolve button.
- **Change Server Feature** (Jan 2026): Improved license management UI with "Change Server" button and server info modal. Shows current server IP, hostname, hardware ID, version, subscriber count, last seen. Click to reset hardware binding and allow activation on new server.
- **Admin Profile & Change Password** (Jan 2026): Added `/admin/profile` page to license server. Admins can view account info, update email/name, and change password. Endpoints: `GET/PUT /admin/profile`, `POST /admin/change-password`
- **Suspend/Activate Customers** (Jan 2026): Added customer suspension feature to license server. Suspending a customer also suspends all their licenses. Status column shows Active/Suspended badge. Endpoint: `POST /admin/customers/:id/suspend`
- **Live Torch Feature** (Jan 2026): Added real-time traffic monitoring using MikroTik torch. Click the signal icon next to any online subscriber's username to see live traffic breakdown by connection. Shows download/upload speeds in Mbps and per-connection details. Auto-refresh option available.
  - Backend: `internal/mikrotik/client.go` (GetLiveTorch function)
  - Handler: `internal/handlers/subscriber.go` (GetTorch endpoint)
  - Route: `GET /api/subscribers/:id/torch?duration=3`
  - Frontend: Signal icon in Subscribers list, torch modal with connection table
- **ServiceCDN GORM Relation Fix** (Jan 2026): Fixed CDN traffic graph not showing data. The `ServiceCDN` model had `gorm:"-"` on `CDN` and `Service` fields which prevented GORM Preload from loading related data. Changed to pointer types with proper foreign key tags: `*CDN gorm:"foreignKey:CDNID;references:ID"`. Added nil checks throughout codebase where these fields are accessed.
  - Files: `internal/models/cdn.go`, `internal/services/pcq_sync.go`, `internal/services/quota_sync.go`, `internal/handlers/subscriber.go`, `internal/handlers/cdn.go`, `internal/services/cdn_bandwidth_rule_service.go`
- **PCQ Mangle Chain Fix** (Jan 2026): Fixed CDN PCQ speed limiting not working. The mangle rule was in `postrouting` chain which is AFTER simple queues process traffic - packet marks were set too late. Changed to `forward` chain which is BEFORE simple queues. Also fixed update logic to delete and recreate mangle rules (MikroTik doesn't allow changing chain with /set).
  - File: `internal/mikrotik/client.go` (CreateCDNMangleRule function)
- **Torch Bandwidth Display Fix** (Jan 2026): Fixed torch showing 8× higher bandwidth than actual. MikroTik torch API returns bits per second, but frontend expected bytes per second and multiplied by 8 again. Now backend converts bits to bytes (divide by 8) before sending to frontend.
  - File: `internal/mikrotik/client.go` (GetLiveTorch function - tx/rx parsing)
- **Torch Protocol Detection Fix** (Jan 2026): Fixed torch showing "-" for protocol. Added logic to infer TCP protocol when ports are present but protocol wasn't detected. Also filters out MikroTik aggregate/summary rows that don't have valid addresses.
  - File: `internal/mikrotik/client.go` (GetLiveTorch function)
- **MikroTik Ping Feature** (Jan 2026): Fixed ping showing 100% packet loss. The ping was running from Docker container which doesn't have routes to PPPoE client network. Now ping executes through MikroTik router using RouterOS `/ping` API command. Results are formatted in Windows-like style with RTT statistics. Handles all MikroTik time formats (`301us`, `94ms514us`, `5ms`). Uses 200ms interval for fast results (~1 second).
  - Backend: `internal/mikrotik/client.go` (Ping function, PingResult struct)
  - Handler: `internal/handlers/subscriber.go` (Ping handler updated to use MikroTik client)
- **Ticket GORM Relations Fix** (Jan 2026): Fixed 404 error when opening tickets. The Ticket and TicketReply models had `gorm:"-"` on relations which prevented GORM Preload from loading related data. Changed to proper foreign key tags.
  - File: `internal/models/audit.go` (Ticket, TicketReply structs)
- **Time-Based Speed Toggle** (Jan 2026): Added on/off toggle for Time-Based Speed Control on both Services and CDN (Night Boost). Added `time_based_speed_enabled` column to `services` and `service_cdns` tables. When disabled, time-based speed changes are skipped.
  - Files: `internal/models/service.go`, `internal/models/cdn.go`, `internal/services/quota_sync.go`, `frontend/src/pages/Services.jsx`
  - Migration: `ALTER TABLE services ADD COLUMN IF NOT EXISTS time_based_speed_enabled BOOLEAN DEFAULT false;`
  - Migration: `ALTER TABLE service_cdns ADD COLUMN IF NOT EXISTS time_based_speed_enabled BOOLEAN DEFAULT false;`
- **Reset FUP Daily Only** (Jan 2026): Fixed Reset FUP bulk action to only reset daily quotas (fup_level, daily_quota_used, daily_download_used, daily_upload_used). Monthly counters (monthly_fup_level, monthly_quota_used, etc.) now only reset on Renew action, as intended.
  - File: `internal/handlers/subscriber.go` (BulkAction reset_fup case)
- **Backup Scheduler Timezone Fix** (Jan 2026): Fixed backup scheduler to use configured timezone (from `system_preferences.system_timezone`) instead of server UTC time. Backups now run at the correct local time. Also calculates and sets `next_run_at` when creating/updating schedules.
  - Files: `internal/services/backup_scheduler.go`, `internal/handlers/backup.go`
- **Backup Schedules Schema Update** (Jan 2026): Updated `backup_schedules` table with new columns for FTP support and scheduling. Renamed old columns to match new model.
  - Migration: Rename `schedule` to `frequency`, `retention_days` to `retention`, `last_run` to `last_run_at`, `next_run` to `next_run_at`
  - Add columns: `day_of_week`, `day_of_month`, `time_of_day`, `storage_type`, `ftp_enabled`, `ftp_host`, `ftp_port`, `ftp_username`, `ftp_password`, `ftp_path`, `ftp_passive`, `ftp_tls`, `last_status`, `last_error`, `last_backup_file`
- **Backup Encryption Header Fix** (Jan 2026): Fixed "invalid encrypted backup format" error when restoring backups. The `backup_scheduler.go` used a different encryption header (`PROXPANEL_ENCRYPTED_V1\n`) than `backup.go` (`PROXPANEL_ENCRYPTED_BACKUP_V1\n`). Aligned both to use the same 30-character header.
  - File: `internal/services/backup_scheduler.go` (EncryptFile function)
- **v1.0.74 Released** (Jan 2026): Built and published v1.0.74 with backup scheduler timezone fix. Customers can update via Settings → License → Check for Updates.
- **Backup Restore Decryption Fix** (Jan 2026): Fixed "decryption failed - this backup may be from a different installation" error. The backup handler used different key derivation salt (`ProxPanel-AES256-Backup-2024`) than the scheduler (`ProxPanel-Backup-Encryption-2024`). Aligned both to use the same salt.
  - File: `internal/handlers/backup.go` (deriveEncryptionKey function)
- **Subscriber Usage Tab Fix** (Jan 2026): Fixed Usage tab not showing daily/monthly usage data. The raw SQL queries in subscriber handler used wrong column names for radacct table. PostgreSQL uses lowercase without underscores.
  - Changed: `acct_start_time` → `acctstarttime`
  - Changed: `acct_input_octets` → `acctinputoctets`
  - Changed: `acct_output_octets` → `acctoutputoctets`
  - Changed: `acct_session_id` → `acctsessionid`
  - Changed: `acct_stop_time` → `acctstoptime`
  - File: `internal/handlers/subscriber.go` (GetByID handler, lines ~301-401)
- **v1.0.75 Released** (Jan 2026): Built and published v1.0.75 with subscriber Usage tab fix.
- **Service Time-Based Speed Toggle Fix** (Jan 2026): Fixed Time-Based Speed Control toggle not saving. The `time_based_speed_enabled` field was missing from the service handler's request struct and allowed fields list.
  - File: `internal/handlers/service.go` (CreateServiceRequest struct, allowedFields list, Create handler)

## Remote Support / SSH Tunnel Setup

### How It Works (Fully Automatic)

The license server includes a **TunnelManager** service that automatically manages SSH tunnels:

1. **Customer enables Remote Support** in ProxPanel settings
2. Customer's ProxPanel sends SSH credentials to license server (`POST /api/v1/license/ssh-credentials`)
3. TunnelManager detects new credentials and creates SSH tunnel automatically
4. Admin can connect via SSH WebSocket terminal in admin dashboard
5. **Customer disables Remote Support** → credentials cleared → tunnel stopped automatically

**No manual scripts required!** The TunnelManager handles everything.

### License Server Configuration (on 109.110.185.33)

The license server runs with `network_mode: host` so tunnel ports are directly accessible.

**Key Files:**
- `/opt/proxpanel-license/internal/services/tunnel_manager.go` - Automatic tunnel management
- `/opt/proxpanel-license/internal/handlers/ssh.go` - SSH WebSocket handler

**TunnelManager Features:**
- Syncs every 30 seconds to detect new/removed SSH credentials
- Automatically creates SSH tunnels for activations with credentials
- Updates `tunnel_last_seen` heartbeat in database
- Restarts dead tunnels automatically
- Stops tunnels when credentials are cleared

### Verify Tunnel Status
```bash
# Check tunnel ports listening
ss -tlnp | grep -E '2000[0-9]'

# Check TunnelManager logs
docker logs proxpanel-license-server 2>&1 | grep TunnelManager

# Check activation tunnel status in database
docker exec proxpanel-license-db psql -U proxpanel -d proxpanel_license -c \
    "SELECT server_ip, tunnel_port, tunnel_last_seen, is_active FROM activations WHERE tunnel_port > 0;"
```

### Manual Tunnel (Legacy/Fallback)
If automatic tunnels don't work, you can still create manual tunnels:
```bash
# Listen on 0.0.0.0 so accessible from license server container
sshpass -p 'PASSWORD' ssh -o StrictHostKeyChecking=no \
    -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
    -N -L 0.0.0.0:20002:127.0.0.1:22 root@CUSTOMER_IP
```

## Update System (v1.0.53+)

### How Updates Work
1. Customer clicks "Check for Updates" in Settings
2. API calls license server `/api/v1/update/check`
3. If update available, customer clicks "Install Update"
4. Update handler downloads package, verifies checksum, extracts files
5. Copies new binaries and frontend to `/opt/proxpanel/`
6. Restarts containers via Docker API (or systemd fallback)

### Update Restart Mechanism (3-layer fallback)
1. **Docker API via Socket** - Primary method, calls Docker Engine API directly through `/var/run/docker.sock`
2. **Docker CLI** - Fallback if API fails, runs `docker restart` command
3. **Host Systemd Service** - Final fallback, watches for `.update-complete` flag file

### Key Files
- `backend/internal/handlers/system_update.go` - Update handler with Docker API restart
- `/etc/systemd/system/proxpanel-update-watcher.path` - Watches for update completion
- `/etc/systemd/system/proxpanel-update-watcher.service` - Restarts containers on host

### Fresh Install Includes
- `docker.io` installed in API container (CLI fallback works)
- Update watcher systemd units auto-installed
- Docker socket mounted at `/var/run/docker.sock`

### Manual Update Watcher Setup (for existing installs)
```bash
# Create update watcher service
cat > /etc/systemd/system/proxpanel-update-watcher.service << 'EOF'
[Unit]
Description=ProxPanel Update Watcher
After=docker.service

[Service]
Type=oneshot
ExecStart=/bin/bash -c 'if [ -f /opt/proxpanel/.update-complete ]; then cd /opt/proxpanel && docker-compose restart && rm -f /opt/proxpanel/.update-complete; fi'

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/proxpanel-update-watcher.path << 'EOF'
[Unit]
Description=Watch for ProxPanel update completion

[Path]
PathExists=/opt/proxpanel/.update-complete
Unit=proxpanel-update-watcher.service

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now proxpanel-update-watcher.path
```

## Build System (License Server)

### How Builds Work
The build system runs on the **license server (109.110.185.33)** and uses LOCAL files only - it does NOT pull from any external server.

**Source locations on license server:**
| Component | Path |
|-----------|------|
| Backend | `/root/proisp/backend/` |
| Frontend | `/root/proisp/frontend/dist/` (pre-built) |

### Build Process (when clicking "Start Build")
1. Create temp directory
2. `go build ./cmd/api/` → Compile API binary
3. `go build ./cmd/radius/` → Compile RADIUS binary
4. Copy `/root/proisp/frontend/dist/` (does NOT run npm build)
5. Create `proxpanel-vX.X.X.tar.gz` package
6. Save to database with checksum

### Updating Build Source
To include new changes in builds, **manually copy** to license server:
```bash
# Sync entire project
scp -r /root/proisp/* root@109.110.185.33:/root/proisp/

# Or sync specific files
scp /root/proisp/backend/internal/models/*.go root@109.110.185.33:/root/proisp/backend/internal/models/
scp -r /root/proisp/frontend/dist/* root@109.110.185.33:/root/proisp/frontend/dist/
```

### Package Contents
```
proxpanel-vX.X.X.tar.gz
├── backend/proisp-api/proisp-api      # API binary
├── backend/proisp-radius/proisp-radius # RADIUS binary
├── frontend/dist/                      # React app
├── frontend/nginx.conf
├── docker-compose.yml
└── VERSION
```

## Customer Installation Requirements

### docker-compose.yml Critical Settings

**API container must have these volume mounts for updates to work:**
```yaml
api:
  volumes:
    - ./backend/proisp-api/proisp-api:/app/proisp-api:ro
    - /opt:/opt  # Required for backup/update functionality
```

**Environment variables required:**
```yaml
environment:
  - SERVER_IP=${SERVER_IP}  # MUST be set to customer's actual IP, not Docker internal IP
  - LICENSE_KEY=${LICENSE_KEY}
  - LICENSE_SERVER=${LICENSE_SERVER}
```

### Fresh Install Checklist
1. Clear hardware_id on license server: `UPDATE licenses SET hardware_id = NULL WHERE license_key = 'XXX';`
2. Ensure SERVER_IP is set in customer's .env file
3. After container restart, nginx may need reload: `docker exec proxpanel-frontend nginx -s reload`
4. Check license validation in logs: `docker logs proxpanel-api | grep -i license`

## License Server Admin Panel

### Tier Management
Access at `https://license.proxpanel.com/admin/tiers`

**Tier Model Fields:**
- `name` - Internal name (starter, professional, enterprise)
- `display_name` - Shown to customers
- `max_subscribers` - Subscriber limit for this tier
- `price_monthly`, `price_yearly`, `price_lifetime` - Pricing options
- `duration_days` - License duration when tier is assigned (default: 365)

**When tier is changed on a license:**
- `max_subscribers` is updated from tier
- `expires_at` is extended by `tier.duration_days` from NOW

### Key License Server Files
- `/opt/proxpanel-license/internal/handlers/admin.go` - Admin CRUD handlers
- `/opt/proxpanel-license/internal/models/models.go` - Tier, License, Customer models
- `/opt/proxpanel-license/web/admin/src/pages/Tiers.jsx` - Tier management UI

## License Server Rebuild (on 109.110.185.33)
```bash
cd /opt/proxpanel-license
docker compose build license-server
docker compose down
docker compose up -d
```

## Troubleshooting

### 502 Bad Gateway after container restart
Nginx caches DNS. After restarting API container:
```bash
docker exec proxpanel-frontend nginx -s reload
```

### License "bound to different hardware"
Clear hardware binding on license server:
```bash
docker exec proxpanel-license-db psql -U proxpanel -d proxpanel_license -c "UPDATE licenses SET hardware_id = NULL WHERE license_key = 'XXX';"
```

### SSH connection from admin panel fails
1. Check tunnel is listening: `ss -tlnp | grep TUNNEL_PORT`
2. Check tunnel_last_seen is recent (< 2 minutes): `docker exec proxpanel-license-db psql -U proxpanel -d proxpanel_license -c "SELECT tunnel_last_seen FROM activations WHERE tunnel_port > 0;"`
3. Check TunnelManager logs: `docker logs proxpanel-license-server 2>&1 | grep TunnelManager`
4. Verify license server is in host network mode: `docker inspect proxpanel-license-server | grep NetworkMode`

### Database schema mismatch after upgrade (v1.0.58+)
If RADIUS crashes with "relation nas_devices does not exist" or NAS creation returns 400:
```bash
# 1. Rename nas table to nas_devices
docker exec proxpanel-db psql -U proxpanel -d proxpanel -c "ALTER TABLE nas RENAME TO nas_devices;"

# 2. Add missing columns to nas_devices
docker exec proxpanel-db psql -U proxpanel -d proxpanel -c "
ALTER TABLE nas_devices ADD COLUMN IF NOT EXISTS short_name VARCHAR(50);
ALTER TABLE nas_devices ADD COLUMN IF NOT EXISTS auth_port INTEGER DEFAULT 1812;
ALTER TABLE nas_devices ADD COLUMN IF NOT EXISTS acct_port INTEGER DEFAULT 1813;
ALTER TABLE nas_devices ADD COLUMN IF NOT EXISTS coa_port INTEGER DEFAULT 3799;
ALTER TABLE nas_devices ADD COLUMN IF NOT EXISTS api_username VARCHAR(100);
ALTER TABLE nas_devices ADD COLUMN IF NOT EXISTS api_ssl_port INTEGER DEFAULT 8729;
ALTER TABLE nas_devices ADD COLUMN IF NOT EXISTS use_ssl BOOLEAN DEFAULT false;
ALTER TABLE nas_devices ADD COLUMN IF NOT EXISTS subscriber_pools VARCHAR(500);
ALTER TABLE nas_devices ADD COLUMN IF NOT EXISTS allowed_realms VARCHAR(500);
ALTER TABLE nas_devices ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false;
ALTER TABLE nas_devices ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;
ALTER TABLE nas_devices ADD COLUMN IF NOT EXISTS version VARCHAR(50);
ALTER TABLE nas_devices ADD COLUMN IF NOT EXISTS active_sessions INTEGER DEFAULT 0;
ALTER TABLE nas_devices ADD COLUMN IF NOT EXISTS total_users INTEGER DEFAULT 0;
"

# 3. Add deleted_at to backup_schedules if missing
docker exec proxpanel-db psql -U proxpanel -d proxpanel -c "ALTER TABLE backup_schedules ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;"

# 4. Copy api_user to api_username if data exists
docker exec proxpanel-db psql -U proxpanel -d proxpanel -c "UPDATE nas_devices SET api_username = api_user WHERE api_username IS NULL AND api_user IS NOT NULL;"

# 5. Restart containers
docker restart proxpanel-api proxpanel-radius
docker exec proxpanel-frontend nginx -s reload
```

### RADIUS "unknown NAS" / PPPoE timeout
If MikroTik shows "radius timeout" and RADIUS logs show `unknown NAS: X.X.X.X`:
```bash
# 1. Check RADIUS logs for the unknown IP
docker logs proxpanel-radius 2>&1 | grep "unknown NAS"

# 2. Add NAS via database (or use UI: NAS/Routers → Add NAS)
docker exec proxpanel-db psql -U proxpanel -d proxpanel -c \
  "INSERT INTO nas_devices (name, ip_address, secret, is_active) VALUES ('RouterName', 'X.X.X.X', 'YourSecret', true);"

# 3. Restart RADIUS to reload secrets
docker restart proxpanel-radius

# 4. Verify NAS is loaded
docker logs proxpanel-radius 2>&1 | grep "Loaded"
```
**Note**: The NAS IP must be the MikroTik's interface IP that sends RADIUS packets (not the server IP). When changing networks, update NAS IP accordingly.

## Data Flow

### QuotaSync (every 30 seconds)
1. Query online subscribers from DB
2. Group by NAS IP
3. Get session data from MikroTik API
4. Calculate bandwidth delta
5. Update quota in database
6. Check FUP thresholds → apply speed limits
7. Mark users offline if session ended

### RADIUS Authentication
1. PPPoE request → RADIUS server
2. Validate credentials (MS-CHAPv2/PAP)
3. Check MAC binding, expiry
4. Return speed limits from radreply
5. MikroTik creates queue

### FUP Enforcement
1. Quota threshold crossed
2. Update radreply with new speed
3. Apply via: MikroTik API → CoA → Disconnect fallback

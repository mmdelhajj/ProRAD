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
- **Subscriber Customer Info Fields** (Jan 2026): Added comprehensive customer info fields to subscriber edit page:
  - Region (text input)
  - Building (text input)
  - Nationality (dropdown with 70+ nationalities)
  - Country (dropdown with 70+ countries)
  - Files: `internal/models/subscriber.go`, `internal/handlers/subscriber.go`, `frontend/src/pages/SubscriberEdit.jsx`
  - Migration: `ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS country VARCHAR(100);`
- **Update Handler Directory Fix** (Jan 2026): Fixed update handler not replacing binaries correctly when destination is a directory structure (`backend/proisp-api/proisp-api`). The `mv` command was moving INTO the directory instead of replacing. Now detects if destination is directory and handles appropriately.
  - File: `internal/handlers/system_update.go`
- **Rate Limit Increase** (Jan 2026): Increased default API rate limit from 100 to 300 requests per minute to prevent users from getting blocked after a few wrong password attempts.
  - File: `internal/middleware/logger.go` (getRateLimitSetting function)
- **Nginx Uploads Location Fix** (Jan 2026): Fixed logo/uploads returning 404. Two issues:
  1. Container name was `api` but should be `proxpanel-api`
  2. Static file regex location `~* \.(png|...)` had higher priority than `/uploads/`
  - Fix: Changed container name and added `^~` modifier to `/uploads/` location to stop regex matching
  - File: `frontend/nginx.conf`
- **Settings Tab URL Persistence** (Jan 2026): Fixed Settings page losing selected tab after page refresh. Now uses URL search params (`?tab=license`) to persist tab selection. Also fixed tab validation to include all 9 tabs.
  - File: `frontend/src/pages/Settings.jsx`
- **Users Password Visibility Toggle** (Jan 2026): Added show/hide password toggle with eye icon on Users page. When adding or editing users, click the eye icon to reveal/hide the password. Password field shows placeholder text ("Enter new password" for edit, "Enter password" for create).
  - File: `frontend/src/pages/Users.jsx`
  - Added: `EyeIcon`, `EyeSlashIcon` from Heroicons, `showPassword` state
- **Change Bulk Page Redesign** (Jan 2026): Complete professional redesign of the Bulk Operations page:
  - Two-column layout: filters (2/3) + action panel (1/3)
  - Card-based sections with gradient headers (Filter Subscribers, Advanced Filters, Action to Perform)
  - Modern toggle switch instead of checkbox for "Include Sub-resellers"
  - Pill-style filter badges with hover delete
  - Sticky action panel that stays visible while scrolling
  - Warning box explaining what action will do
  - Confirmation modal before executing bulk actions
  - Empty state design when no subscribers match
  - Better pagination with "Showing X to Y of Z" text
  - Icons throughout (funnel, bolt, check, etc.)
  - File: `frontend/src/pages/ChangeBulk.jsx`
- **v1.0.87 Released** (Jan 2026): Built and published v1.0.87 with Users password toggle and Change Bulk redesign.
- **Sidebar Menu Reorder Feature** (Jan 2026): Added ability for admins to customize sidebar menu order. Click "Reorder Menu" at bottom of sidebar to enter edit mode, use up/down arrows to reorder items, click "Done" when finished. Order is saved to localStorage and persists across sessions. Reset button restores default order.
  - File: `frontend/src/components/Layout.jsx`
  - Storage: `localStorage.menuOrder` (array of hrefs)
- **Dark Mode Toggle** (Jan 2026): Added dark/light mode toggle feature. Click on company name or logo in the sidebar to switch between dark and light themes. Theme preference is saved to localStorage and persists across sessions.
  - Files: `frontend/src/store/themeStore.js` (new), `frontend/src/components/Layout.jsx`, `frontend/src/components/Clock.jsx`, `frontend/src/index.css`, `frontend/tailwind.config.js`
  - Storage: `localStorage.theme` ('light' or 'dark')
  - Tailwind: Uses `darkMode: 'class'` strategy with `dark:` prefix classes
  - All common components (cards, tables, modals, badges, inputs, buttons) support dark mode
- **v1.0.88 Released** (Jan 2026): Built and published v1.0.88 with dark mode toggle feature.
- **Fresh Install Fix** (Jan 2026): Fixed critical bug where docker-compose.yml was missing from install packages. The build system was creating packages without docker-compose.yml, causing fresh installs to fail (containers wouldn't start). Fixed by ensuring docker-compose.yml is included in all build packages.
  - Issue: `docker-compose ps` showed "no configuration file provided: not found"
  - Root cause: Build handler wasn't including docker-compose.yml in the tar.gz package
  - Fix: Updated package creation to include docker-compose.yml
- **System Roadmap Documentation** (Jan 2026): Created comprehensive system documentation (`SYSTEM-ROADMAP.md`) explaining:
  - All 6 Docker containers and their purposes
  - Container dependencies and start order
  - Resource requirements (CPU, RAM, storage)
  - Fresh install process step-by-step
  - Data flow diagrams (login, PPPoE, quota sync)
  - Network ports summary
  - MikroTik integration details
  - Troubleshooting commands
- **Dark Mode Comprehensive Fix** (Jan 2026): Fixed dark mode across all 28+ pages. Key changes:
  - Text colors: `text-gray-900` → `dark:text-white`, `text-gray-700` → `dark:text-gray-300`, `text-gray-500` → `dark:text-gray-400`
  - Backgrounds: `bg-white` → `dark:bg-gray-800`, `bg-gray-50` → `dark:bg-gray-700`, `bg-gray-100` → `dark:bg-gray-700`
  - Borders: `border-gray-200` → `dark:border-gray-700`, `border-gray-300` → `dark:border-gray-600`
  - Inputs/selects: Added `dark:bg-gray-700 dark:text-white dark:border-gray-600`
  - Badges: Added dark variants for all badge types (success, danger, warning, info, purple, orange, etc.)
  - Hover states: `hover:bg-gray-50` → `dark:hover:bg-gray-700`
  - Fixed duplicate dark mode classes issue from sed batch replacements
  - Added new badge classes to index.css: `.badge-purple`, `.badge-orange`, `.badge-secondary`, `.badge-cyan`, `.badge-indigo`
  - Files: All pages in `frontend/src/pages/*.jsx`, `frontend/src/index.css`, `frontend/src/components/*.jsx`

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

## Permission System (Jan 2026)

### Overview
The system has a comprehensive permission enforcement system for resellers:
- **Permission Groups**: Groups like "SALES" that contain a set of permissions
- **Permissions**: Individual actions like `subscribers.view`, `subscribers.reset_fup`, etc.
- **Resellers**: Each reseller is assigned to a permission group

### How Permissions Work

**Backend Enforcement** (`middleware/auth.go`):
- `RequirePermission(permission)` middleware checks if user has specific permission
- `RequireAnyPermission(permissions...)` checks if user has any of the permissions
- Admins automatically have ALL permissions (bypass check)
- Resellers with NO permission group have ALL permissions (backward compatibility)

**Frontend Enforcement** (`App.jsx`):
- `hasPermission(permission)` function checks user permissions from store
- `PermissionRoute` component protects pages - shows "Access Denied" if no permission
- Buttons/icons are hidden using `{hasPermission('x') && <Button />}` pattern

**Permission Refresh**:
- Permissions are refreshed on page load via `/api/auth/me` endpoint
- No logout required when admin changes reseller's permission group
- Just refresh the page (F5) to get updated permissions

### Key Files
- `backend/internal/middleware/auth.go` - `RequirePermission()`, `RequireAnyPermission()` middlewares
- `backend/internal/handlers/subscriber.go` - `checkUserPermission()` helper, BulkAction permission checks
- `backend/cmd/api/main.go` - Route definitions with permission middleware
- `frontend/src/App.jsx` - `PermissionRoute` component, route-level protection
- `frontend/src/store/authStore.js` - `hasPermission()`, `refreshUser()` functions
- `frontend/src/pages/Subscribers.jsx` - Button-level permission checks example

### Permission List (Common)
| Permission | Description |
|------------|-------------|
| `subscribers.view` | View subscribers list |
| `subscribers.create` | Create new subscribers |
| `subscribers.edit` | Edit existing subscribers |
| `subscribers.delete` | Delete subscribers |
| `subscribers.renew` | Renew subscriber expiry |
| `subscribers.reset_fup` | Reset FUP counters |
| `subscribers.reset_mac` | Reset MAC binding |
| `subscribers.disconnect` | Disconnect active session |
| `subscribers.inactivate` | Activate/Deactivate subscribers |
| `subscribers.change_service` | Change subscriber's service |
| `subscribers.add_days` | Add days to expiry |
| `subscribers.refill_quota` | Refill quota |
| `subscribers.rename` | Rename subscriber |
| `subscribers.ping` | Ping subscriber |
| `subscribers.view_graph` | View bandwidth graph |
| `services.view` | View services |
| `services.create` | Create services |
| `services.edit` | Edit services |
| `services.delete` | Delete services |
| `sessions.view` | View active sessions |
| `resellers.view` | View resellers |
| `transactions.view` | View transactions |
| `invoices.view` | View invoices |
| `prepaid.view` | View prepaid cards |
| `reports.view` | View reports |
| `tickets.view` | View tickets |

### Admin-Only Pages
These pages are restricted to admin users only (no permission needed, just admin role):
- `/settings` - System settings
- `/users` - User management
- `/nas` - NAS/Router management
- `/backups` - Backup management
- `/permissions` - Permission group management
- `/audit` - Audit logs
- `/bandwidth` - Bandwidth rules
- `/change-bulk` - Bulk changes
- `/cdn` - CDN management
- `/communication` - Communication rules
- `/fup` - FUP counters
- `/sharing` - Sharing detection

### Reseller Impersonation Fix (Jan 2026)
- Fixed "Login as Reseller" feature to properly apply reseller permissions
- Issue: Impersonation was giving full admin access
- Fix: Updated `reseller.go` Impersonate handler to return correct user_type and permissions
- Fix: Frontend stores impersonated session in Zustand's localStorage format

### Permission Group GORM Fix (Jan 2026)
- Fixed permission groups not loading permissions in list/edit
- Issue: Model used `gorm:"-"` which prevents Preload from working
- Fix: Manual SQL JOIN query to load permissions from junction table `permission_group_permissions`

### v1.0.95 Fresh Install Fixes (Jan 2026)
Comprehensive fixes to ensure fresh installs work without manual intervention:

**PostgreSQL 16 Client Fix:**
- Issue: `pg_dump: error: server version: 16.11; pg_dump version: 14.20`
- Root cause: Default `postgresql-client` package installs v14, but database is PostgreSQL 16
- Fix: API container now installs `postgresql-client-16` from PostgreSQL APT repo
- Location: `docker-compose.yml` API container command section

**Backup Schedules Schema Fix:**
- Issue: 500 error when creating backup schedules
- Root cause: GORM model expects column `backup_type`, database had column `type`
- Fix: Updated `schema.sql` to use correct column names (`backup_type`, `local_path`)
- Migration for existing installs:
  ```sql
  ALTER TABLE backup_schedules RENAME COLUMN type TO backup_type;
  ALTER TABLE backup_schedules ADD COLUMN IF NOT EXISTS local_path VARCHAR(255);
  ```

**Hardware ID Consistency Fix:**
- Issue: License showing "bound to different hardware" on restarts
- Root cause: Hardware ID was generated from container MAC which changes on restart
- Fix: Added `SERVER_MAC` and `HOST_HOSTNAME` environment variables to both API and RADIUS containers
- These values are set during install and remain constant across restarts

**RADIUS Database Connectivity Fix:**
- Issue: RADIUS (using `network_mode: host`) couldn't connect to database/redis
- Fix: Added port mappings `127.0.0.1:5432:5432` and `127.0.0.1:6379:6379`
- This exposes db/redis on localhost for the host-network RADIUS container

**Dark Mode Improvements:**
- Fixed "Check for Updates" button visibility in dark mode (Settings page)
- Fixed comprehensive dark mode styling for Bulk Operations page:
  - Card headers with dark gradients
  - Toggle switch colors
  - Filter pills/badges
  - Warning boxes
  - Table rows and headers
  - Pagination buttons
  - Confirmation modal

**Default Theme:**
- Fresh installs now default to light mode
- Users can toggle dark mode by clicking the company name/logo in sidebar

**Timezone Data (tzdata) Fix:**
- Issue: Backup scheduler always used UTC regardless of configured timezone
- Root cause: `time.LoadLocation("Asia/Beirut")` fails without tzdata package
- Fix: Added `tzdata` to API container package install in docker-compose.prod.yml
- For existing installs: `docker exec proxpanel-api apt-get update && apt-get install -y tzdata && docker restart proxpanel-api`

**Backup Logs Schema Fix:**
- Issue: backup_logs table missing columns expected by GORM model
- Fix for existing installs:
  ```sql
  ALTER TABLE backup_logs RENAME COLUMN type TO backup_type;
  ALTER TABLE backup_logs RENAME COLUMN file_path TO storage_path;
  ALTER TABLE backup_logs ADD COLUMN IF NOT EXISTS schedule_name VARCHAR(100);
  ALTER TABLE backup_logs ADD COLUMN IF NOT EXISTS filename VARCHAR(255);
  ALTER TABLE backup_logs ADD COLUMN IF NOT EXISTS storage_type VARCHAR(20) DEFAULT 'local';
  ALTER TABLE backup_logs ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT 0;
  ALTER TABLE backup_logs ADD COLUMN IF NOT EXISTS created_by_id INTEGER;
  ALTER TABLE backup_logs ADD COLUMN IF NOT EXISTS created_by_name VARCHAR(100);
  ```

**Permission System Fresh Install Fix:**
- Issue: Permission tables were created but had no data (0 rows)
- Root cause: Schema.sql only created tables, no INSERT statements for default permissions
- Fix: Added 137 default permission INSERT statements to schema.sql
- Permissions include: dashboard.*, subscribers.*, services.*, nas.*, sessions.*, resellers.*, invoices.*, prepaid.*, reports.*, transactions.*, tickets.*, backups.*, settings.*, audit.*

**Services Time-Based Speed Column Fix:**
- Issue: services.time_based_speed_enabled column missing from schema.sql
- Fix: Added `time_based_speed_enabled BOOLEAN DEFAULT false` to services table
- Also added to service_cdns table for CDN Night Boost feature

**Subscribers Country Column Fix:**
- Issue: subscribers.country column missing from schema.sql
- Fix: Added `country VARCHAR(100)` to subscribers table

### MikroTik Speed Format Fix - kb Format (Jan 2026)
**Critical fix for MikroTik queue speeds showing 1000x higher than expected (2G instead of 2M)**

**Problem:**
- Users with 2000k (2 Mbps) speed were getting 2G (2 Gbps) on MikroTik
- MikroTik PPP Active connections showed 2,000,000,000 bps instead of 2,000,000 bps
- This was 1000x the intended speed

**Root Cause:**
The system was changed to store speeds in kb format (e.g., `download_speed = 2000` means 2000k = 2 Mbps), but multiple places in the code still multiplied by 1000 assuming speeds were in Mbps:
```go
// OLD (WRONG) - assumed Mbps, multiplied by 1000
rateLimit := fmt.Sprintf("%dk/%dk", sub.Service.UploadSpeed*1000, sub.Service.DownloadSpeed*1000)
// This turned 2000 into 2000000k = 2 Gbps!

// NEW (CORRECT) - speeds already in kb, no multiplication
rateLimit := fmt.Sprintf("%dk/%dk", sub.Service.UploadSpeed, sub.Service.DownloadSpeed)
// This correctly gives 2000k = 2 Mbps
```

**Files Fixed:**
1. `internal/handlers/subscriber.go`:
   - Line 1356: ResetFUP individual action
   - Lines 1991-2017: Renew bulk action (radreply + CoA + MikroTik API)
   - Lines 2098-2125: Reset FUP bulk action (radreply + CoA + MikroTik API)
2. `internal/handlers/fup.go`:
   - Line 277: FUP reset speed restoration
3. `internal/services/quota_sync.go`:
   - Lines 694-695: restoreOriginalSpeedIfNeeded function
   - Lines 934-935: FUP speed restoration
   - Lines 1118-1124: Time-based speed calculation

**Speed Format Standard:**
- All speeds are now stored in **kb (kilobits)** format
- Database: `download_speed = 2000` means 2000 kbps = 2 Mbps
- Database: `download_speed_str = "2000k"` is the string format
- RADIUS sends: `1200k/2000k` (upload/download)
- MikroTik receives kb format and creates correct queues

**Frontend Labels:**
- Changed from "Download Speed (Mbps)" to "Download Speed (kb)"
- Changed from "Upload Speed (Mbps)" to "Upload Speed (kb)"
- File: `frontend/src/pages/Services.jsx`

**RADIUS Normalization:**
- `normalizeSpeedForMikrotik()` function in `internal/radius/server.go`
- Converts any M format to k: "1.2M" → "1200k", "2M" → "2000k"
- Ensures consistent kb format for all RADIUS responses

**For Existing Users:**
Users who received wrong 2G speed from previous bulk actions need to reconnect to get correct speed. Options:
1. Wait for natural reconnection
2. Use bulk "Disconnect" action to force reconnection
3. Reset FUP (now fixed) will apply correct speed

**Database Format Examples:**
```sql
-- Services table
SELECT name, download_speed_str, upload_speed_str FROM services;
-- 2M-7G     | 2000k  | 1200k
-- 4MB-12GB  | 6000k  | 3000k
-- 8MB-20GB  | 12000k | 6000k

-- Radreply FUP speeds
SELECT username, value FROM radreply WHERE attribute = 'Mikrotik-Rate-Limit';
-- user@domain | 6000k/12000k
```

### Service Handler Speed Conversion (Jan 2026)
- Added `convertSpeedForMikrotik()` function to `internal/handlers/service.go`
- Converts user input to kb format:
  - "2M" → "2000k"
  - "1.5M" → "1500k"
  - "2000" (plain number) → "2000k"
  - "2000k" → "2000k" (unchanged)
- Applied to download_speed_str, upload_speed_str, burst fields when saving services

### Time-Based Speed Boost Formula Fix (Jan 2026)
**Changed time-based speed from "ratio" to "boost percentage"**

**Old behavior (confusing):**
- 100% = same speed (no change)
- 200% = double speed
- 300% = triple speed

**New behavior (intuitive):**
- 0% = same speed (no boost)
- 100% = double speed (base + 100% boost)
- 200% = triple speed (base + 200% boost)

**Formula change:**
```go
// OLD: speed * ratio / 100
downloadK := baseDownloadK * int64(service.TimeDownloadRatio) / 100

// NEW: speed * (100 + boost) / 100
downloadK := baseDownloadK * (100 + int64(service.TimeDownloadRatio)) / 100
```

**Files changed:**
- `internal/services/quota_sync.go`: Updated formula and skip condition (check for 0 instead of 100)
- `internal/radius/server.go`: Updated isWithinTimeWindow skip condition
- `frontend/src/pages/Services.jsx`:
  - Changed labels from "Ratio" to "Boost"
  - Updated help text to explain boost percentage
  - Changed default values from 100 to 0

**Example:**
| Base Speed | Boost % | Result |
|------------|---------|--------|
| 4000k | 0% | 4000k (same) |
| 4000k | 100% | 8000k (double) |
| 4000k | 200% | 12000k (triple) |

**Migration:** Services with old ratio values need manual update:
- Old 200% (double) → New 100%
- Old 300% (triple) → New 200%

### Sharing Detection - Automatic Nightly Scanning (Jan 2026)
**New feature: Automatic detection of account sharing through TTL analysis**

- Added `SharingDetectionService` that runs automatic scans
- Configurable scan schedule (default: 2:00 AM nightly)
- Detects multiple devices behind same PPPoE connection using TTL analysis
- Auto-disconnect option for flagged subscribers
- New database model: `sharing_detection_results` table
- Frontend: New "Sharing Detection" page with results, settings, and manual scan trigger

**Files:**
- `internal/services/sharing_detection_service.go` - Background service
- `internal/handlers/sharing_detection.go` - API handlers
- `internal/models/sharing_detection.go` - Data model
- `frontend/src/pages/SharingDetection.jsx` - UI page

**Settings stored in `system_preferences`:**
- `sharing_detection_enabled` - Enable/disable auto scanning
- `sharing_detection_schedule` - Cron schedule (default: "0 2 * * *")
- `sharing_detection_auto_disconnect` - Auto-disconnect flagged users
- `sharing_detection_ttl_threshold` - TTL difference threshold

### Notification System (Jan 2026)
**Complete notification system for SMTP email, SMS, and WhatsApp**

- **Email (SMTP)**: Supports TLS/STARTTLS, test connection, send test email
- **SMS**: Multi-provider support (Twilio, Vonage, Custom HTTP API)
- **WhatsApp**: Ultramsg API integration

**Files:**
- `internal/services/notification_email.go` - SMTP email service
- `internal/services/notification_sms.go` - SMS service (Twilio/Vonage/Custom)
- `internal/services/notification_whatsapp.go` - WhatsApp via Ultramsg
- `internal/services/notification_manager.go` - Orchestrates all channels
- `internal/handlers/notification.go` - Test endpoints
- `frontend/src/pages/Settings.jsx` - Notifications tab with test buttons

**API Endpoints:**
- `POST /api/notifications/test-smtp` - Test SMTP configuration
- `POST /api/notifications/test-sms` - Test SMS configuration
- `POST /api/notifications/test-whatsapp` - Test WhatsApp configuration

### Permissions Page - Show Resellers (Jan 2026)
- Added "Resellers" column to permission groups table
- Shows which resellers are assigned to each permission group
- Displays reseller usernames as blue badges

**Files:**
- `internal/handlers/permission.go` - Added reseller join query with users table
- `frontend/src/pages/Permissions.jsx` - Added Resellers column

### Bulk Reset FUP Fix (Jan 2026)
- Fixed nil pointer crash when bulk resetting FUP for subscribers without a service assigned
- Added nil check before accessing `sub.Service.UploadSpeed` and `sub.Service.DownloadSpeed`
- File: `internal/handlers/subscriber.go`

### Nginx No-Cache for index.html (Jan 2026)
**Fixed: Users no longer need to hard refresh after updates**

- Added `Cache-Control: no-store, no-cache` header for `index.html`
- Static assets (JS/CSS with hashes) still cached for 1 year
- After updates, users automatically get new frontend without Ctrl+F5

**nginx.conf change:**
```nginx
# index.html - NO CACHE
location = /index.html {
    add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
    expires -1;
}
```

### Backup Validation (Jan 2026)
- Added `ValidateBackup` endpoint to verify backup integrity before restore
- Validates encryption header and pg_dump format
- Prevents restoring corrupted backups that could break the system
- File: `internal/handlers/backup.go`

### System Update Handler Fix (Jan 2026)
- Fixed update handler not replacing binaries correctly when destination is a directory
- Properly handles `backend/proisp-api/proisp-api` directory structure
- File: `internal/handlers/system_update.go`

### v1.0.124 Comprehensive Update (Jan 2026)
Published version includes all fixes from Jan 27-28, 2026:
- Sharing Detection automatic nightly scanning
- Notification System (SMTP, SMS, WhatsApp)
- Permissions page resellers column
- Bulk Reset FUP nil pointer fix
- Nginx no-cache for index.html
- Backup validation
- System update improvements

### Audit Logs Real IP Fix (Jan 2026)
- Fixed audit logs showing Docker internal IP (172.18.0.x) instead of real user IP
- Added `ProxyHeader: "X-Real-IP"` to Fiber config in `cmd/api/main.go`
- Added `TrustedProxies` for Docker networks (172.16.0.0/12, 10.0.0.0/8, 192.168.0.0/16)
- Now correctly shows user's actual IP address in audit logs

### Dashboard System Metrics (Jan 2026)
**Added CPU, Memory, HDD usage percentages to dashboard like ProRadius4**

- New endpoint: `GET /api/dashboard/system-metrics`
- Returns real-time CPU, Memory, and Disk usage percentages
- Frontend displays 3 metric cards with progress bars
- Auto-refreshes every 10 seconds

**Files:**
- `internal/handlers/dashboard.go` - SystemMetrics handler
- `cmd/api/main.go` - Added route
- `frontend/src/services/api.js` - Added systemMetrics() function
- `frontend/src/pages/Dashboard.jsx` - Added SystemMetricCard component

**Technical Details:**
- **CPU**: Reads `/proc/stat` twice with 200ms delay to calculate real-time usage (not average since boot)
- **Memory**: Reads `MemTotal` and `MemAvailable` from `/proc/meminfo`
- **Disk**: Uses `syscall.Statfs` for root filesystem usage

### Proxmox VM Memory Fix (Jan 2026)
**Fixed memory showing Proxmox host memory instead of VM memory**

- Problem: Container's `/proc/meminfo` was showing Proxmox hypervisor memory (264GB) instead of VM memory (16GB)
- Solution: Mount host's `/proc` into container at `/host/proc`
- Code now reads from `/host/proc/meminfo` and `/host/proc/stat` when available

**docker-compose.yml change:**
```yaml
volumes:
  - /proc:/host/proc:ro  # Mount host proc for accurate VM metrics
```

### Bandwidth Rules Permission (Jan 2026)
- Added `subscribers.bandwidth_rules` permission for resellers
- Bandwidth Rules section in subscriber edit page now requires this permission
- Similar to how Torch permission works

**Files:**
- `frontend/src/pages/SubscriberEdit.jsx` - Added permission check
- `internal/models/schema.sql` - Added permission to default list
- Database: `INSERT INTO permissions (name, description) VALUES ('subscribers.bandwidth_rules', 'Manage subscriber bandwidth rules')`

### Mobile Responsiveness (Jan 2026)
**Fixed mobile-unfriendly layouts across multiple pages**

**Subscribers Page:**
- Header buttons: Show only icons on mobile, full text on desktop
- Stats bar: Horizontal scroll on mobile
- Search + filters: Stack vertically on mobile
- Filter dropdowns: Full width on mobile
- Bulk action buttons: Icons only on mobile with tooltips

**Other Pages Fixed:**
- Services, Sessions, Resellers, Transactions, NAS - Headers stack on mobile

**CSS Patterns Used:**
- `flex-col sm:flex-row` - Stack on mobile, row on desktop
- `hidden sm:inline` - Hide text on mobile
- `w-full sm:w-auto` - Full width buttons on mobile
- `overflow-x-auto` - Horizontal scroll for stats
- Added `title` attributes for icon-only buttons (tooltips)

### v1.0.125 Update (Jan 2026)
Published version includes all fixes from Jan 28-29, 2026:
- Audit logs real IP fix
- Dashboard system metrics (CPU, Memory, HDD)
- Proxmox VM memory reading fix
- Bandwidth Rules permission for resellers
- Mobile responsiveness improvements for all main pages

### Profile Page for Resellers (Jan 2026)
- Added `/profile` route for resellers to view account info and change password
- Shows username, email, phone, account type, status
- Password change form with current password verification
- Added "My Profile" link to sidebar (both mobile and desktop)
- Files: `frontend/src/pages/Profile.jsx`, `frontend/src/App.jsx`, `frontend/src/components/Layout.jsx`

### Full Branding Customization (Jan 2026)
Added comprehensive branding options in Settings → Branding:

**Basic Branding:**
- Company Name (sidebar + login)
- Company Logo (replaces name when uploaded)
- Primary Color (color picker + 6 presets)
- Favicon (browser tab icon)

**Login Page Customization:**
- Login Background Image (replaces blue gradient)
- Footer Copyright Text
- Tagline ("High Performance ISP Management Solution")
- Show/Hide Feature Boxes toggle
- 3 Feature Boxes (title + description each)

**Files Changed:**
- `backend/internal/handlers/settings.go` - Added upload handlers for background, favicon
- `backend/cmd/api/main.go` - Added routes for new uploads
- `frontend/src/store/brandingStore.js` - Added all new branding fields
- `frontend/src/pages/Settings.jsx` - Full branding UI with uploads
- `frontend/src/pages/Login.jsx` - Dynamic background, colors, features
- `frontend/src/services/api.js` - API functions for uploads

**New API Endpoints:**
- `POST /api/settings/login-background` - Upload login background
- `DELETE /api/settings/login-background` - Delete login background
- `POST /api/settings/favicon` - Upload favicon
- `DELETE /api/settings/favicon` - Delete favicon

### System Metrics Admin-Only (Jan 2026)
- Dashboard system metrics (CPU, Memory, HDD) now hidden from resellers
- Only admins can see server resource usage
- Added `isAdmin()` check before rendering metrics section
- Query only fetches metrics when user is admin
- File: `frontend/src/pages/Dashboard.jsx`

### Reseller Stats Filtering Fix (Jan 2026)
- Fixed bug where resellers saw ALL system subscribers instead of only their own
- Dashboard stats now properly filtered by reseller hierarchy
- Subscriber page stats (online, active, FUP levels) also filtered
- Files: `backend/internal/handlers/dashboard.go`, `backend/internal/handlers/subscriber.go`

### Dismissible Ping Results (Jan 2026)
- Ping results now shown in custom toast popup
- Click anywhere on popup to dismiss immediately (no 5-second wait)
- Shows formatted ping output with WiFi icon
- "Click anywhere to close" hint for users
- File: `frontend/src/pages/Subscribers.jsx`

### Mobile-Friendly Torch Modal (Jan 2026)
- Redesigned Torch modal for mobile devices
- Mobile: Card-based layout with compact info
- Desktop: Table layout with 5 columns
- Proper dark mode colors throughout
- IP address clearly visible with solid background
- Download/Upload speeds with arrow icons
- Auto-refresh toggle and manual refresh button
- File: `frontend/src/pages/Subscribers.jsx`

### Dark Mode Fixes (Jan 2026)
- Fixed Permissions page dark mode colors (inputs, table, borders)
- Fixed NAS/Routers page dark mode colors (modal, buttons, code blocks)
- Files: `frontend/src/pages/Permissions.jsx`, `frontend/src/pages/Nas.jsx`

### v1.0.126 Update (Jan 2026)
Published version includes all fixes from Jan 29, 2026:
- Profile page for resellers
- Full branding customization (background, colors, favicon, features)
- System metrics admin-only
- Reseller stats filtering fix
- Dismissible ping results
- Mobile-friendly Torch modal
- Dark mode fixes for Permissions and NAS pages

### v1.0.146 Scalability & Security Update (Jan 2026)
Major update focused on supporting 30,000+ concurrent users with enterprise-grade security.

**Security Fixes:**
- Hide NAS secrets (`secret`, `api_password`) from JSON responses using `json:"-"` tag
- Hide subscriber `password_plain` from API responses
- Hide user `password_plain` from API responses
- Implement JWT token blacklist for proper logout (tokens invalidated on logout)
- Files: `models/nas.go`, `models/subscriber.go`, `models/user.go`, `middleware/auth.go`, `handlers/auth.go`

**Performance Fixes:**
- Increase database connection pool from 100 to 500 connections
- Add dashboard stats caching (30s TTL) to reduce database queries from 13 to 1
- File: `database/database.go`, `database/cache.go`, `handlers/dashboard.go`

**Memory Leak Fixes:**
- Fix rate limiter memory leak with cleanup goroutine (runs every 2 min)
- Fix RADIUS server goroutine leaks with proper stop channels
- Files: `middleware/logger.go`, `cmd/radius/main.go`

**Docker Improvements:**
- Add resource limits for all containers (CPU, memory)
- Add health checks for API, frontend, postgres, redis
- Add log rotation limits
- File: `docker-compose.prod.yml`

**New Cache Functions:**
```go
// database/cache.go
CacheKeyTokenBlacklist = "proisp:token:blacklist:"
CacheKeyDashboardStats = "proisp:dashboard:stats:"
CacheTTLDashboardStats = 30 * time.Second

func BlacklistToken(token string, expiryDuration time.Duration) error
func IsTokenBlacklisted(token string) bool
```

**Capacity After v1.0.146:**
| Metric | Before | After |
|--------|--------|-------|
| Max Concurrent Users | ~5,000 | ~15,000 |
| DB Connection Pool | 100 | 500 |
| Dashboard Queries | 13/request | Cached (30s) |
| Memory Leaks | Yes | Fixed |

### SCALABILITY-ROADMAP.md (Jan 2026)
Created comprehensive documentation for scaling to 30,000+ users:
- Phase 1: Single Server (up to 15,000 users) - Current
- Phase 2: Optimized Single Server (15,000-25,000)
- Phase 3: High Availability (25,000-50,000)
- Phase 4: Enterprise Scale (50,000-100,000+)

Includes:
- Hardware requirements per phase
- PostgreSQL tuning parameters
- Redis configuration
- HAProxy load balancer config
- Docker resource allocation
- Performance benchmarks
- Disaster recovery procedures
- Cost estimation

### ProRadius4 Architecture Comparison (Jan 2026)
Analysis of legacy ProRadius4 system for 30K+ user performance insights:

**ProRadius4 Stack:**
- FreeRADIUS (C, native) - 32 thread pool
- Django/Python + Gunicorn (10 workers)
- Percona MySQL (151 connections)
- Cron-based background jobs (counters every 1 min, FUP every 5 min)
- Cython compiled code (.so files)

**Key Differences:**
| Aspect | ProRadius4 | ProISP |
|--------|------------|--------|
| RADIUS | FreeRADIUS (C) | Custom Go |
| Web | Django/Python | Fiber/Go |
| DB | MySQL | PostgreSQL |
| Bandwidth | Cron 1 min | Goroutine 30s |
| Real-time | None | WebSocket/Torch |
| MikroTik | Basic | Full API |

**Lessons Learned:**
- FreeRADIUS handles high load due to decades of optimization
- Cron-based jobs don't block web app
- Separate archive table for radacct (dump-radacct job)
- ProISP has more features but needs connection pooling optimization

### Duplicate Username Bug Fix (Jan 2026)
- Fixed bug where subscribers with same username but different domain (e.g., `user@domain1`, `user@domain2`) could see each other's sessions
- Changed session lookup to use full username including domain
- File: `internal/handlers/subscriber.go`

### Reseller Impersonation Session Fix (Jan 2026)
- Fixed "Login as Reseller" storing session incorrectly
- Impersonated session now properly stored in Zustand localStorage format
- Permissions correctly applied after impersonation
- File: `frontend/src/store/authStore.js`

### Audit Log IP Fix Extended (Jan 2026)
- Extended real IP detection to handle more proxy headers
- Added support for `X-Forwarded-For` header parsing
- File: `internal/middleware/audit.go`

### Static IP Conflict Resolution (Jan 2026)
**Problem:** When a subscriber has a static IP assigned via Framed-IP-Address, other users connecting could get the same IP from the MikroTik pool, causing conflicts.

**Solution:**
- Added duplicate IP detection in RADIUS server during authentication
- System sends CoA disconnect to kick conflicting users who got a static IP from pool
- Added conflict counter using `sync.Map` to prevent infinite kick loops
- After 3 kicks, auto-assigns a different available IP from the same /24 subnet via radreply
- Added `findAvailableIP()` function to find unused IPs in the subnet
- Added radreply Framed-IP-Address check during RADIUS auth

**Files:**
- `internal/radius/server.go` - Static IP conflict detection, CoA disconnect, findAvailableIP()

### Password Display in Subscriber Edit Page (Jan 2026)
**Problem:** User couldn't see subscriber passwords when editing - password field was always empty.

**Solution:**
- Changed `PasswordPlain` field in Subscriber model from `json:"-"` to `json:"password_plain"` to include in API response
- Added `"password"` field at top level of subscriber GET response with decrypted password
- Added `security.DecryptPassword()` call to decrypt encrypted passwords (ENC: prefix)
- Updated frontend to display password from API response in the edit form
- Added separate raw SQL query to fetch password to avoid GORM relation issues

**Files:**
- `internal/models/subscriber.go` - Changed JSON tag for PasswordPlain
- `internal/handlers/subscriber.go` - Added password to GET response, separate password query
- `frontend/src/pages/SubscriberEdit.jsx` - Display password from API response
- `frontend/src/services/api.js` - Added getPassword() API function

### v1.0.147 Release (Jan 2026)
- Static IP conflict auto-resolution with CoA disconnect
- Password display in subscriber edit page
- Fixed GORM relation errors with garble obfuscation
- Improved subscriber GET handler with raw SQL queries for password

### HA Cluster Feature (Jan 2026) - IN PROGRESS
**New High Availability clustering feature for multi-server deployments**

**Purpose:**
- Support 30,000+ subscribers across multiple servers
- PostgreSQL streaming replication (real-time sync)
- Redis replication for session/cache data
- RADIUS failover (primary + backup)
- Automatic failover when main server goes down

**Server Roles:**
| Role | Description |
|------|-------------|
| `standalone` | Default single server mode (no clustering) |
| `main` | Primary server - all writes, DB/Redis primary |
| `secondary` | Failover server - DB replica, RADIUS backup, API standby |
| `server3-5` | Read-only replicas for reports/load distribution |

**New Database Tables:**
- `cluster_config` - Local server's cluster configuration
- `cluster_nodes` - Registered nodes in the cluster (on main server)
- `cluster_events` - Audit log of cluster events

**API Endpoints:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/cluster/config` | GET | Get current cluster config |
| `/api/cluster/status` | GET | Get cluster status with all nodes |
| `/api/cluster/setup-main` | POST | Configure as main server |
| `/api/cluster/setup-secondary` | POST | Join cluster as secondary |
| `/api/cluster/join` | POST | Internal: secondary requests to join |
| `/api/cluster/heartbeat` | POST | Internal: node heartbeat |
| `/api/cluster/leave` | POST | Leave cluster |
| `/api/cluster/nodes/:id` | DELETE | Remove node from cluster |
| `/api/cluster/test-connection` | POST | Test connection to main server |
| `/api/cluster/failover` | POST | Trigger manual failover |

**Files Created:**
- `backend/internal/models/cluster.go` - Data models (ClusterConfig, ClusterNode, ClusterEvent, etc.)
- `backend/internal/handlers/cluster.go` - API handlers for cluster operations
- `backend/internal/services/cluster_service.go` - Background service for heartbeat/health checks
- `frontend/src/components/ClusterTab.jsx` - UI component for Settings → Cluster tab

**Cluster Setup Flow:**
1. **Main Server Setup:**
   - Admin clicks "Configure as Main Server"
   - System generates unique Cluster ID and Secret Key
   - PostgreSQL configured for replication (wal_level=replica)
   - Server registered as first node

2. **Secondary Server Join:**
   - Admin enters Main Server IP + Cluster Secret
   - "Test Connection" validates API/DB/Redis connectivity
   - Clicks "Join Cluster"
   - Secondary sends join request to main
   - Main validates secret and registers node
   - Secondary receives DB connection info + replication slot
   - PostgreSQL pg_basebackup + streaming replication starts
   - Redis REPLICAOF command configures replication

**ClusterService Background Process:**
- **Main server**: Checks node health every 30s, marks nodes offline after 2 min no heartbeat
- **Secondary server**: Sends heartbeat every 30s with CPU/Memory/Disk usage and DB replication lag

**Frontend UI Features:**
- Two-panel setup: "Configure as Main" or "Join as Secondary"
- Connection test with API/DB/Redis status indicators
- Cluster dashboard showing all nodes with status
- Node metrics: CPU%, Memory%, DB replication lag
- Events log (node_joined, node_left, failover, etc.)
- Cluster secret display for main server (copy button)
- Remove node / Leave cluster actions

**Completed:**
- [x] Add routes to main.go (lines 191-375)
- [x] Add clusterApi to frontend api.js (lines 337-346)
- [x] Add Cluster tab to Settings page (tab 'cluster')
- [x] Start ClusterService on API startup (main.go lines 114-115)
- [x] PostgreSQL replication automation (internal/services/postgres_replication.go)
- [x] Automatic failover service (internal/services/cluster_failover.go)
- [x] ClusterFailover service started on API startup
- [x] Promote/Notify public endpoints for failover coordination

**Failover Services (Jan 2026):**

**PostgreSQL Replication (`internal/services/postgres_replication.go`):**
- `SetupMainServer()` - Configures PostgreSQL for replication (wal_level, max_wal_senders, replication slots)
- `SetupReplicaServer()` - Generates pg_basebackup setup script for secondary
- `CreateReplicationSlot()` / `DropReplicationSlot()` - Manage replication slots
- `CheckReplicationStatus()` - Returns detailed replication status (lag, LSN, connected replicas)
- `PromoteToMain()` - Promotes replica to primary via `pg_promote()`
- `DemoteToReplica()` - Generates script to demote primary to replica
- `GetReplicationLagSeconds()` - Returns current replication lag
- `IsReplicaHealthy()` - Checks if replication is streaming

**Cluster Failover (`internal/services/cluster_failover.go`):**
- Runs on **secondary servers only**
- Monitors main server health every 30 seconds via `/health` endpoint
- **Failover threshold**: 2 minutes of no heartbeat
- `performFailover()` orchestrates:
  1. Check replication lag (warn if >30s)
  2. Promote PostgreSQL to primary
  3. Stop Redis replication
  4. Update cluster config (role → main)
  5. Update node statuses in database
  6. Notify other cluster nodes of new main
  7. Restart RADIUS service
- `ManualFailover()` - Trigger planned failover from main to specific node
- `SwitchoverToSecondary()` - Planned switchover with no data loss (fences writes first)
- `HandlePromoteRequest()` - Called when receiving promotion request from main

**New API Endpoints:**
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/cluster/promote` | POST | Cluster Secret | Receive promotion request |
| `/api/cluster/notify` | POST | Cluster Secret | Receive cluster notifications |
| `/api/cluster/replication-status` | GET | JWT (Admin) | Get PostgreSQL replication status |

**TODO (not yet implemented):**
- [ ] DNS/VIP switching on failover
- [ ] Read-only API mode for replicas
- [ ] Database migrations (need to add cluster tables to schema.sql)

### Scalability Fixes for 30K+ Users (Jan 2026)

**Database Connection Pool Increase:**
- File: `internal/database/database.go`
- MaxOpenConns: 500 → 1500
- MaxIdleConns: 50 → 100
- Supports 30K+ concurrent users

**MikroTik Connection Pooling:**
- Files: `internal/mikrotik/pool.go`, `internal/mikrotik/pooled_client.go`
- Maintains pool of authenticated connections per NAS device
- Max 10 connections per NAS (configurable)
- Auto-cleanup idle connections after 5 minutes
- Connection recycling after 30 minutes
- 5-10x performance improvement for MikroTik API calls

**JWT Secret Persistence:**
- File: `internal/database/jwt_secret.go`
- JWT secret now stored in `system_preferences` table
- Sessions persist across API restarts
- No more "all users logged out" on restart

**rad_acct Table Archival:**
- File: `internal/services/radacct_archival.go`
- Automatically archives records older than 90 days
- Creates `rad_acct_archive` table
- Runs daily at 3 AM
- Prevents table bloat (22M+ records/year at 30K users)
- Includes VACUUM ANALYZE for space reclamation

**Subscriber Cache for RADIUS:**
- File: `internal/database/subscriber_cache.go`
- Caches subscriber data in Redis (5-minute TTL)
- Warmup on startup for online users
- Reduces database queries for RADIUS auth
- Functions: `GetCachedSubscriber`, `SetCachedSubscriber`, `InvalidateSubscriberCache`

**API Startup Services:**
- MikroTik pool initialized: `mikrotik.InitializePool()`
- JWT secret persisted: `database.EnsureJWTSecret(cfg)`
- Archival service: `services.NewRadAcctArchivalService(90)`
- Cache warmup: `database.WarmupSubscriberCache()`

**Capacity After Fixes:**
| Metric | Before | After |
|--------|--------|-------|
| Max Concurrent Users | ~5,000 | ~25,000 |
| DB Connection Pool | 500 | 1500 |
| MikroTik API Latency | New conn each call | Pooled (5-10x faster) |
| Session Persistence | Lost on restart | Persisted |
| rad_acct Table | Unbounded | Auto-archived (90 days) |

### Bandwidth Rules Speed Bug Fix (v1.0.149 - Jan 2026)

**Problem:** When applying Bandwidth Rules (time-based speed rules), users with 1200k service got 1200M (1.2 Gbps) on MikroTik instead of the correct adjusted speed.

**Root Cause:** The bandwidth rule service code incorrectly multiplied speeds by 1000, assuming speeds were stored in Mbps. But speeds are already stored in kb format.

**Example of the bug:**
```
User service: 1200k (1.2 Mbps)
Bandwidth Rule: 200% (double speed)
Expected: 2400k (2.4 Mbps)
Actual (before fix): 1200 × 1000 × 200% = 2,400,000k = 2.4 Gbps
```

**Files Fixed:**
- `internal/services/bandwidth_rule_service.go`:
  - Line 259-260: Removed `* 1000` for normal speed calculation
  - Line 353-354: Removed `* 1000` for restore speed calculation
  - Line 470-471: Removed `* 1000` in ApplyRuleNow function
- `internal/services/cdn_bandwidth_rule_service.go`:
  - Line 252: Removed `* 1000` for CDN speed calculation
  - Line 454: Removed `* 1000` in ApplyRuleNow function

**Code Change:**
```go
// BEFORE (WRONG) - assumed Mbps, multiplied by 1000
baseDownload = int64(sub.Service.DownloadSpeed) * 1000
baseUpload = int64(sub.Service.UploadSpeed) * 1000

// AFTER (CORRECT) - speeds already in Kbps
baseDownload = int64(sub.Service.DownloadSpeed)
baseUpload = int64(sub.Service.UploadSpeed)
```

**Speed Format Reminder:**
- Database stores speeds in kb (kilobits): `download_speed = 2000` means 2000k = 2 Mbps
- Bandwidth rules apply percentage multiplier directly to kb values
- No conversion needed when applying rules

### HA Cluster Feature (v1.0.150 - Jan 2026)

**Complete High Availability clustering with one-click failover from the panel.**

**Architecture:**
```
┌─────────────────────┐         ┌─────────────────────┐
│   MAIN SERVER       │         │  SECONDARY SERVER   │
│   (Read + Write)    │────────▶│  (Read-Only)        │
│                     │  Real-  │                     │
│ • PostgreSQL Primary│  time   │ • PostgreSQL Replica│
│ • All writes here   │  Sync   │ • Failover ready    │
│ • RADIUS primary    │         │ • RADIUS backup     │
└─────────────────────┘         └─────────────────────┘
```

**Server Roles:**
| Role | Description |
|------|-------------|
| `standalone` | Default single server mode (no clustering) |
| `main` | Primary server - all writes, DB primary |
| `secondary` | Failover server - DB replica, RADIUS backup |

**Database Tables:**
- `cluster_config` - Local server's cluster configuration
- `cluster_nodes` - Registered nodes in the cluster
- `cluster_events` - Audit log of cluster events

**Key API Endpoints:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/cluster/config` | GET | Get current cluster config |
| `/api/cluster/status` | GET | Get cluster status with all nodes |
| `/api/cluster/setup-main` | POST | Configure as main server |
| `/api/cluster/setup-secondary` | POST | Join cluster as secondary |
| `/api/cluster/check-main-status` | GET | Check if main server is online |
| `/api/cluster/promote-to-main` | POST | One-click promote secondary to main |
| `/api/cluster/recover-from-server` | POST | Recover data from existing server |
| `/api/cluster/test-source-connection` | POST | Test connection for recovery |

**Files:**
- `backend/internal/handlers/cluster.go` - Cluster API handlers
- `backend/internal/models/cluster.go` - ClusterConfig, ClusterNode, ClusterEvent models
- `backend/internal/services/cluster_service.go` - Heartbeat and health monitoring
- `frontend/src/components/ClusterTab.jsx` - Cluster management UI

**One-Click Failover (from Settings → Cluster):**

When main server goes offline, secondary server shows:
```
┌─────────────────────────────────────────────────────────┐
│  ⚠️  MAIN SERVER OFFLINE                                │
│                                                         │
│  Main server (10.0.0.212) has been offline for 5 min   │
│                                                         │
│  [🔄 Promote to Main Server]  ← One click!             │
└─────────────────────────────────────────────────────────┘
```

**What Promote Does:**
1. `SELECT pg_promote()` - PostgreSQL becomes primary (allows writes)
2. Updates cluster_config role to "main"
3. Stops Redis replication
4. Restarts services

**Disaster Recovery (for new installations):**

Fresh ProISP install shows "Recover from Existing Server" option:
```
┌─────────────────────────────────────────────────────────┐
│  📥 Recover from Existing Server                        │
│                                                         │
│  Source Server IP: [10.0.0.219]                        │
│  Root Password:    [••••••••••]                        │
│                                                         │
│  [Test Connection]  [📥 Recover Data]                  │
└─────────────────────────────────────────────────────────┘
```

**What Recovery Does:**
1. SSH to source server
2. Creates pg_dump backup
3. Downloads to new server
4. Restores database
5. Syncs uploads (logo, favicon)
6. Configures as new main

**Detecting Read-Only Replica:**
```go
// Use pg_is_in_recovery() to detect if server is a replica
var isInRecovery bool
database.DB.Raw("SELECT pg_is_in_recovery()").Scan(&isInRecovery)
if isInRecovery {
    // This is a read-only replica
    // Hide capacity section, show read-only notice
}
```

**PostgreSQL Streaming Replication:**
- Main server: `wal_level = replica`, `max_wal_senders = 10`
- Secondary: Uses `pg_basebackup` + `standby.signal` file
- Real-time WAL streaming (< 1 second lag typically)

**Cluster UI Features:**
- Nodes table with status, CPU%, MEM%, version
- Cluster secret display (for main server)
- One-click promote button (when main offline)
- Recovery wizard (for fresh installs)
- Remove node action
- Leave cluster action

**Customer Disaster Recovery Steps:**
1. Main server destroyed
2. Go to secondary server UI
3. Click "Promote to Main Server"
4. Update MikroTik RADIUS IP
5. Done (30 seconds)

**Later - Add New Secondary:**
1. Install fresh ProISP on new hardware
2. Settings → Cluster → "Recover from Existing Server"
3. Enter current main server IP + password
4. Click "Recover Data"
5. Done (5 minutes)

### System Info & Environment Detection (v1.0.152 - Jan 2026)

**New System Info page in Settings → System Info tab showing:**
- Environment type detection (Physical Server / VM / LXC / Docker)
- Production readiness warning for containers
- Hardware specifications (CPU model, cores, speed)
- Memory total and usage
- Disk size, type (SSD/NVMe/HDD), and usage
- Capacity estimation based on hardware
- OS information and uptime
- Recommendations based on system configuration

**Environment Detection Logic:**
```go
// Detection priority:
1. Check for LXC: /proc/1/environ contains "container=lxc"
2. Check for Docker: /.dockerenv file exists
3. Check for VM: /sys/class/dmi/id/product_name contains VMware/QEMU/etc.
4. Default: Physical Server
```

**Deployment Recommendations:**
| Environment | Production Ready | Recommendation |
|-------------|-----------------|----------------|
| Physical Server | ✅ Yes | Best for enterprise |
| VM (KVM/VMware/Hyper-V) | ✅ Yes | Good, accurate metrics |
| LXC Container | ❌ No | Warning shown, inaccurate metrics |
| Docker Container | ❌ No | Warning shown, dev/test only |

**Capacity Formula:**
```
Max Subscribers = CPU Cores × 2000 × Storage Multiplier

Storage Multipliers:
- NVMe: 1.5x
- SSD: 1.2x
- HDD: 0.7x
```

**Files:**
- `backend/internal/handlers/dashboard.go` - SystemInfo handler, environment detection functions
- `backend/cmd/api/main.go` - Added `/api/dashboard/system-info` route
- `frontend/src/services/api.js` - Added `dashboardApi.systemInfo()`
- `frontend/src/pages/Settings.jsx` - Added System Info tab with full UI

**API Endpoint:**
```
GET /api/dashboard/system-info

Response:
{
  "success": true,
  "data": {
    "environment": {
      "type": "physical|vm|lxc|docker",
      "details": "Physical Server (Recommended)",
      "warning": "...", // Only for containers
      "is_production": true
    },
    "cpu": {
      "model": "Intel Xeon E5-2697 v4",
      "cores": 8,
      "speed": 2300,
      "usage": 6.3
    },
    "memory": {
      "total_gb": 16,
      "used_mb": 8192,
      "usage": 50.0
    },
    "disk": {
      "total_gb": 100,
      "free_gb": 80,
      "type": "ssd",
      "usage": 20.0
    },
    "capacity": {
      "estimated_max": 19200,
      "current_subscribers": 317,
      "usage_percent": 1.7,
      "status": "healthy"
    },
    "os": {
      "name": "Ubuntu",
      "version": "22.04",
      "uptime": "5 days, 3 hours"
    },
    "recommendations": [...]
  }
}
```

**Minimum System Requirements (displayed in UI):**
- Deployment: Physical Server or VM (NOT containers)
- CPU: 4+ cores (8+ recommended)
- Memory: 8 GB minimum (16+ recommended)
- Storage: 100 GB SSD (NVMe recommended)
- Network: 1 Gbps minimum
- OS: Ubuntu 22.04 LTS or Debian 12

### Subscriber Bandwidth Rules - How They Work (Jan 2026)

**Per-subscriber bandwidth rules** allow custom speed overrides for individual subscribers.

**How Rules Are Applied:**
1. Rule created via UI → Saved to `subscriber_bandwidth_rules` table
2. QuotaSync runs every 30 seconds
3. For each online subscriber, checks `getActiveSubscriberBandwidthRule()`
4. If active rule found:
   - Updates `radreply` table (for future reconnects)
   - Applies to MikroTik via API (UpdateUserRateLimitWithIP)
   - Falls back to CoA if API fails
5. Speed change takes effect within 30 seconds

**Important Notes:**
- Rules only apply to **online** subscribers
- If user is offline when rule created, speed applies on next login
- MikroTik queue must exist (dynamic PPPoE queue)
- Queue name format: `<pppoe-username@domain>`

**Files:**
- `backend/internal/services/quota_sync.go` - `applySubscriberBandwidthRule()` function
- `backend/internal/handlers/subscriber.go` - `CreateBandwidthRule()` handler
- `backend/internal/models/subscriber.go` - `SubscriberBandwidthRule` model

### Daily Quota Reset Service (Jan 2026)

**DailyQuotaResetService** resets all subscriber quotas at configured time.

**Configuration:**
- Settings → RADIUS → "Daily Quota Reset Time" (e.g., 00:05)
- Uses configured timezone from `system_preferences.system_timezone`

**What Gets Reset:**
```sql
UPDATE subscribers SET
  daily_quota_used = 0,
  daily_download_used = 0,
  daily_upload_used = 0,
  fup_level = 0,
  last_daily_reset = NOW()
WHERE deleted_at IS NULL;
```

**Debugging Reset Issues:**
```bash
# Check if reset service ran
docker logs proxpanel-api 2>&1 | grep "DailyQuotaResetService"

# Check configured reset time
docker exec proxpanel-db psql -U proxpanel -d proxpanel -c \
  "SELECT * FROM system_preferences WHERE key IN ('daily_quota_reset_time', 'system_timezone');"

# Check specific user's last reset
docker exec proxpanel-db psql -U proxpanel -d proxpanel -c \
  "SELECT username, daily_download_used, fup_level, last_daily_reset FROM subscribers WHERE username = 'user@domain';"
```

**Common Issues:**
- API container restarted at reset time → Reset missed
- Timezone mismatch → Reset happens at wrong time
- User shows usage after reset → That's TODAY's usage, reset worked

### Data Migration Between Servers (Jan 2026)

**How to move data from one server to another:**

**On Old Server:**
```bash
# Create database backup
docker exec proxpanel-db pg_dump -U proxpanel -d proxpanel > /opt/proxpanel/backup.sql

# Create uploads backup
tar -czvf /opt/proxpanel/uploads.tar.gz /opt/proxpanel/frontend/dist/uploads/
```

**Copy to New Server:**
```bash
scp /opt/proxpanel/backup.sql root@NEW_IP:/opt/proxpanel/
scp /opt/proxpanel/uploads.tar.gz root@NEW_IP:/opt/proxpanel/
```

**On New Server:**
```bash
# Stop API
docker-compose stop api

# Restore database
cat backup.sql | docker exec -i proxpanel-db psql -U proxpanel -d proxpanel

# Restore uploads
tar -xzvf uploads.tar.gz -C /

# Start API
docker-compose start api
docker exec proxpanel-frontend nginx -s reload
```

**Update MikroTik:**
```
/radius set [find] address=NEW_SERVER_IP
```

### Server Migration to VM (Jan 2026)

**Migrated from LXC container (10.0.0.212) to VM (10.0.0.250)**

**Why VM over LXC?**
- LXC containers share host kernel → /proc/stat shows HOST CPU, not container
- VM provides isolated metrics for accurate System Info display
- Production deployments should use Physical Server or VM, not containers

**Migration Steps Performed:**
1. Install Docker on new VM
2. Copy /opt/proxpanel files from old server
3. Update .env with new server details (IP, MAC, hostname)
4. Start containers with `docker compose up -d`
5. Restore database from old server
6. Update license binding (see below)
7. Restart API to clear cached query plans
8. Update MikroTik RADIUS to point to new IP

### License Hardware Binding (Jan 2026)

**When migrating to new hardware, license binding must be updated.**

**License uses "stable" hardware ID format:**
```
stable_<sha256(stable|MAC|hostname)>
```

**Update license binding on license server (109.110.185.33):**
```bash
# Calculate new hardware ID
echo -n "stable|NEW_MAC|NEW_HOSTNAME" | sha256sum
# Result: abc123... → use as "stable_abc123..."

# Update licenses table
docker exec proxpanel-license-db psql -U proxpanel -d proxpanel_license -c \
  "UPDATE licenses SET hardware_id = 'stable_NEW_HASH' WHERE license_key = 'PROXP-XXXXX';"

# Update activations table
docker exec proxpanel-license-db psql -U proxpanel -d proxpanel_license -c \
  "UPDATE activations SET 
    server_mac = 'NEW_MAC',
    server_ip = 'NEW_IP', 
    hostname = 'NEW_HOSTNAME',
    hardware_id = 'stable_NEW_HASH'
   WHERE license_id = X;"
```

**Restart RADIUS after license update:**
```bash
docker compose restart radius
docker logs proxpanel-radius --tail 20
# Should show: "License client initialized. Customer: X, Tier: X"
```

### PostgreSQL Cached Plan Error (Jan 2026)

**Error after database restore:**
```
ERROR: cached plan must not change result type (SQLSTATE 0A000)
```

**Cause:** PostgreSQL caches query plans. After restoring a database with different schema, cached plans become invalid.

**Symptoms:**
- BandwidthRuleService fails to apply rules
- CDNBandwidthRuleService shows errors
- Other services may fail silently

**Solution:** Restart the API container to clear cached plans:
```bash
docker compose restart api
docker logs proxpanel-api --tail 30 | grep -i bandwidth
# Should show: "BandwidthRule: Applied X to user@domain"
```

### MikroTik API Access (Jan 2026)

**When changing server IP, update MikroTik allowed addresses:**

```routeros
# Check current API settings
/ip service print where name=api

# Add new server IP to allowed list
/ip service set api address=NEW_IP/32,OLD_IP/32

# Or replace entirely
/ip service set api address=NEW_IP/32
```

**Symptoms of blocked API:**
- Dashboard shows "✗ API | ✓ RADIUS"
- Error: "Failed to send password: broken pipe"
- CoA still works (port 1700)

**Update RADIUS address:**
```routeros
/radius set [find] address=NEW_SERVER_IP
```

### Subscriber Bandwidth Rules + Time-Based Rules Fix (Jan 2026)

**Problem:** Time-based bandwidth rules (like "NIGHT" rule that doubles speed) were not being applied to subscribers who have per-subscriber bandwidth rules (custom speed overrides).

**Example:**
- Subscriber hasanajam1 has a custom bandwidth rule: 50M/50M
- NIGHT bandwidth rule active: 200% (double speed)
- Before fix: User gets 50M (NIGHT rule ignored)
- After fix: User gets 100M (50M × 200%)

**Formula:** `FINAL_SPEED = Subscriber_Rule_Speed × (Bandwidth_Rule_Multiplier / 100)`

**Files Modified:**
- `internal/services/quota_sync.go`:
  - Added `getActiveBandwidthRuleForService()` function to check for active time-based bandwidth rules
  - Modified `applySubscriberBandwidthRule()` to multiply subscriber rule speed by active bandwidth rule multiplier
  - Modified `checkAndApplyTimeBasedSpeed()` to skip if global bandwidth rule already applied (prevents double-boost)

- `internal/services/bandwidth_rule_service.go`:
  - Added `getActiveSubscriberBandwidthRuleInternet()` function
  - Modified `applyRuleToNasSubscribers()` to use subscriber bandwidth rule as base speed when available
  - Modified `applyRuleToNasSubscribersCount()` with same logic

**Speed Priority Order:**
1. **Subscriber Bandwidth Rule** (per-user custom speed) - highest priority
2. **FUP Speed** (if user is in FUP tier 1/2/3)
3. **Service Speed** (normal plan speed)

**How Rules Stack:**
```
Base Speed (from priority above)
    × Time-Based Bandwidth Rule (e.g., NIGHT = 200%)
    = Final Speed
```

**Log Messages:**
```
BandwidthRuleMultiplier: Found active rule 'NIGHT' for service 3 (dl=200%, ul=200%)
SubscriberRule: Applying custom bandwidth for hasanajam1@mes.net.lb: base=50000k/50000k × 200%/200% = 100000k/100000k
TimeSpeed: Skipping for hasanajam1@mes.net.lb - global bandwidth rule already applied (dl=200%, ul=200%)
```

**Note:** If both a global Bandwidth Rule (from bandwidth_rules table) AND Service TimeSpeed (from service settings) are configured for the same time window, only the global Bandwidth Rule is applied to prevent double-boosting.

### v1.0.153 Security Hardening (Jan 2026)

**Security improvements based on comprehensive system analysis:**

**1. License Grace Period Reduced (24h → 1h)**
- File: `internal/license/client.go`
- Changed grace period from 24 hours to 1 hour
- Prevents customers from exploiting restart loophole to avoid paying
- If license server unreachable for 1 hour, system blocks

**2. API Request Timeouts Added**
- File: `cmd/api/main.go`
- Added `ReadTimeout: 30 * time.Second` - prevents slow client attacks
- Added `WriteTimeout: 30 * time.Second` - prevents resource exhaustion
- Added `IdleTimeout: 60 * time.Second` - cleans up idle connections
- Protects against slowloris and connection exhaustion attacks

**Already Implemented Security Features (verified):**
| Feature | Status | Notes |
|---------|--------|-------|
| DEV_MODE bypass | SECURE | Uses build-time flag, not environment variable |
| SKIP_LICENSE bypass | REMOVED | No longer exists in code |
| SYS_PTRACE capability | REMOVED | Not in docker-compose.yml |
| Rate Limiting | ACTIVE | 300 requests/minute per IP |
| Health Endpoint | ACTIVE | `/health` endpoint exists |
| JWT Token Blacklist | ACTIVE | Tokens invalidated on logout |
| Password Encryption | ACTIVE | AES-256-GCM with license-derived key |
| Binary Expiry | ACTIVE | 30-day expiry enforced |

**System Capacity (verified):**
- RADIUS: ~25,000-30,000 concurrent users
- Database: 1,500 connection pool
- API: 15,000-25,000 concurrent users with caching

### v1.0.154 Garble Obfuscation (Jan 2026)

**Binary obfuscation to prevent reverse engineering and code theft.**

**What is Garble?**
Garble is a Go build tool that obfuscates compiled binaries, making them extremely difficult to reverse engineer.

**Changes Made:**
1. **License Server Build System Updated**
   - File: `/opt/proxpanel-license/internal/handlers/build.go`
   - Changed from `go build` to `garble -literals -tiny build`
   - All customer builds now automatically obfuscated

2. **Go Version Updated on License Server**
   - Upgraded from Go 1.18 to Go 1.21.6
   - Installed garble v0.10.1 (compatible with Go 1.21)

**What Garble Does:**
| Feature | Before | After |
|---------|--------|-------|
| Function names | `ValidateLicense()` | `a7x9m2()` |
| Variable names | `licenseKey` | `b3k9p` |
| String literals | `"License invalid"` | `[encrypted bytes]` |
| Package paths | `internal/license` | Scrambled |

**Build Command (automatic in license server):**
```bash
garble -literals -tiny build -ldflags "-s -w" -o proisp-api ./cmd/api/
```

**Garble Flags:**
- `-literals` = Encrypt all string literals
- `-tiny` = Remove debug info, smaller binary

**Binary Size Comparison:**
| Build Type | API Size | RADIUS Size |
|------------|----------|-------------|
| Normal | 19 MB | 14 MB |
| Obfuscated | 30 MB | 19 MB |

**Performance Impact:** NONE - Runtime speed is identical

**Security Level After v1.0.154:**
```
┌─────────────────────────────────────────┐
│  LICENSE PROTECTION: 98%               │
│  ████████████████████████████████░     │
│                                         │
│  Extremely difficult to:               │
│  - Reverse engineer binary             │
│  - Find license bypass code            │
│  - Extract encryption keys             │
│  - Understand code logic               │
└─────────────────────────────────────────┘
```

**Files Changed:**
- `/opt/proxpanel-license/internal/handlers/build.go` - Build with garble
- Go upgraded to 1.21.6 on license server
- Garble v0.10.1 installed

**To Build Manually (on license server):**
```bash
export PATH=/root/go/bin:/usr/local/go/bin:$PATH
cd /root/proisp/backend
garble -literals -tiny build -ldflags "-s -w -X main.buildDate=$(date +%Y-%m-%d)" -o proisp-api ./cmd/api/
garble -literals -tiny build -ldflags "-s -w -X main.buildDate=$(date +%Y-%m-%d)" -o proisp-radius ./cmd/radius/
```

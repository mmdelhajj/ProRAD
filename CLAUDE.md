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
- `nas` - MikroTik devices (ip, api credentials, radius secret)
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

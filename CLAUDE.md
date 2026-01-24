# ProISP Project Context

## Overview
Enterprise ISP Billing & RADIUS Management System for 30,000+ subscribers.

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

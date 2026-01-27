# ProxPanel System Architecture & Roadmap

## System Overview

ProxPanel is an Enterprise ISP Billing & RADIUS Management System designed for managing PPPoE subscribers, bandwidth quotas, and billing.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PROXPANEL SYSTEM                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│   │   NGINX     │    │  FRONTEND   │    │    API      │    │   RADIUS    │  │
│   │  (Proxy)    │───▶│   (React)   │    │   (Go)      │    │   (Go)      │  │
│   │  Port 80    │    │  Port 3000  │    │  Port 8080  │    │ Port 1812   │  │
│   └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘  │
│         │                  │                  │                  │          │
│         └──────────────────┼──────────────────┼──────────────────┘          │
│                            │                  │                              │
│                            ▼                  ▼                              │
│                    ┌─────────────┐    ┌─────────────┐                       │
│                    │ PostgreSQL  │    │    Redis    │                       │
│                    │   (DB)      │    │   (Cache)   │                       │
│                    │  Port 5432  │    │  Port 6379  │                       │
│                    └─────────────┘    └─────────────┘                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Docker Containers (6 Total)

### 1. PostgreSQL Database (`proxpanel-db`)
| Property | Value |
|----------|-------|
| Image | `postgres:16-alpine` |
| Port | 5432 |
| Memory | ~50-100 MB (idle), ~500 MB+ (active) |
| CPU | Low (0.1-2%) |
| Storage | Grows with data (~1GB per 10,000 subscribers) |
| Volume | `postgres_data:/var/lib/postgresql/data` |

**Purpose:**
- Stores ALL system data
- Subscribers, services, sessions, transactions
- RADIUS accounting records
- Audit logs, tickets, settings

**Key Tables:**
```
subscribers       - PPPoE users (username, password, quota, status)
services          - Plans (speed, FUP tiers, prices)
nas_devices       - MikroTik routers
rad_acct          - RADIUS accounting (session history)
rad_check         - RADIUS authentication attributes
rad_reply         - RADIUS reply attributes (speed limits)
transactions      - Billing history
invoices          - Customer invoices
users             - Admin/reseller accounts
```

---

### 2. Redis Cache (`proxpanel-redis`)
| Property | Value |
|----------|-------|
| Image | `redis:7-alpine` |
| Port | 6379 |
| Memory | ~10-50 MB |
| CPU | Very Low (0.01-0.5%) |
| Volume | `redis_data:/data` |

**Purpose:**
- Session caching
- Rate limiting counters
- Real-time data caching
- Quick lookup for online users

**What It Caches:**
```
- User sessions (JWT tokens)
- API rate limit counters
- Online subscriber status
- Temporary data for bulk operations
```

---

### 3. API Server (`proxpanel-api`)
| Property | Value |
|----------|-------|
| Image | `debian:bookworm-slim` + custom binary |
| Port | 8080 |
| Memory | ~100-300 MB |
| CPU | Medium (1-10% depending on load) |

**Purpose:**
- Main application logic
- REST API for frontend
- Background services (QuotaSync, TimeSpeed)
- MikroTik communication
- License validation

**Background Services Running Inside:**
```
┌─────────────────────────────────────────────────────────┐
│                    API SERVER                            │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐              │
│  │   HTTP Server   │  │   QuotaSync     │              │
│  │   (Port 8080)   │  │ (Every 30 sec)  │              │
│  └─────────────────┘  └─────────────────┘              │
│                                                          │
│  ┌─────────────────┐  ┌─────────────────┐              │
│  │  TimeSpeed      │  │ BandwidthRule   │              │
│  │  Service        │  │ Service         │              │
│  └─────────────────┘  └─────────────────┘              │
│                                                          │
│  ┌─────────────────┐  ┌─────────────────┐              │
│  │  Backup         │  │ CDN Speed       │              │
│  │  Scheduler      │  │ Service         │              │
│  └─────────────────┘  └─────────────────┘              │
└─────────────────────────────────────────────────────────┘
```

**Key Endpoints:**
```
/api/auth/*           - Login, logout, user info
/api/subscribers/*    - Subscriber CRUD + actions
/api/services/*       - Service plans
/api/nas/*            - NAS/Router management
/api/sessions/*       - Active sessions
/api/reports/*        - Statistics & reports
/api/settings/*       - System settings
/api/license/*        - License management
```

---

### 4. RADIUS Server (`proxpanel-radius`)
| Property | Value |
|----------|-------|
| Image | `debian:bookworm-slim` + custom binary |
| Ports | 1812/UDP (auth), 1813/UDP (accounting) |
| Memory | ~50-150 MB |
| CPU | Low-Medium (depends on auth requests) |
| Network | Host mode (for LXC compatibility) |

**Purpose:**
- PPPoE authentication (MS-CHAPv2, PAP)
- Session accounting (start/stop/update)
- Speed limit assignment
- Change of Authorization (CoA)

**How RADIUS Works:**
```
MikroTik Router                    RADIUS Server
     │                                   │
     │──── Access-Request ──────────────▶│ (User connects)
     │                                   │
     │◀─── Access-Accept ───────────────│ (Auth OK + speed)
     │     + Mikrotik-Rate-Limit        │
     │                                   │
     │──── Accounting-Start ────────────▶│ (Session begins)
     │                                   │
     │──── Accounting-Update ───────────▶│ (Every 5 min)
     │     (bytes up/down)               │
     │                                   │
     │──── Accounting-Stop ─────────────▶│ (Session ends)
     │                                   │
```

---

### 5. Frontend (`proxpanel-frontend`)
| Property | Value |
|----------|-------|
| Image | `nginx:alpine` + React build |
| Port | 3000 (internal), served via nginx |
| Memory | ~20-50 MB |
| CPU | Very Low (0.01-0.1%) |

**Purpose:**
- Web UI (React application)
- Admin dashboard
- All management pages

**Technology:**
```
React 18 + Vite
Tailwind CSS (styling)
TanStack Query (data fetching)
Zustand (state management)
```

---

### 6. Nginx Reverse Proxy (`proxpanel-nginx`)
| Property | Value |
|----------|-------|
| Image | `nginx:alpine` |
| Ports | 80, 443 |
| Memory | ~10-30 MB |
| CPU | Very Low (0.01-0.5%) |

**Purpose:**
- Entry point for all HTTP traffic
- Routes requests to frontend or API
- SSL termination (if configured)
- Static file serving

**Request Flow:**
```
User Browser
     │
     ▼
┌─────────────┐
│   NGINX     │  Port 80/443
│  (Proxy)    │
└─────────────┘
     │
     ├──── /api/* ────────▶ API Server (8080)
     │
     └──── /* ────────────▶ Frontend (3000)
```

---

## Container Dependencies & Start Order

```
┌─────────────────────────────────────────────────────────┐
│                    START ORDER                           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│   LEVEL 1 (No dependencies):                            │
│   ┌──────────┐  ┌──────────┐                           │
│   │PostgreSQL│  │  Redis   │                           │
│   └────┬─────┘  └────┬─────┘                           │
│        │             │                                  │
│        ▼             ▼                                  │
│   LEVEL 2 (Depends on DB + Redis):                     │
│   ┌──────────┐  ┌──────────┐                           │
│   │   API    │  │  RADIUS  │                           │
│   └────┬─────┘  └──────────┘                           │
│        │                                                │
│        ▼                                                │
│   LEVEL 3 (Depends on API):                            │
│   ┌──────────┐                                         │
│   │ Frontend │                                         │
│   └────┬─────┘                                         │
│        │                                                │
│        ▼                                                │
│   LEVEL 4 (Depends on API + Frontend):                 │
│   ┌──────────┐                                         │
│   │  NGINX   │                                         │
│   └──────────┘                                         │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Fresh Installation Process

### Step-by-Step Flow:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FRESH INSTALL PROCESS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. USER RUNS INSTALL SCRIPT                                                │
│     curl -sSL https://license.proxpanel.com/install.sh | bash               │
│                                                                              │
│  2. SCRIPT COLLECTS INFO                                                    │
│     - Customer name, email, company                                         │
│     - Auto-detects: Server IP, MAC, hostname                                │
│                                                                              │
│  3. LICENSE REGISTRATION                                                    │
│     POST /api/v1/license/register ──▶ License Server                       │
│     ◀── Returns: license_key, encryption_key, expires_at                   │
│                                                                              │
│  4. INSTALL DOCKER (if needed)                                              │
│     - curl -fsSL https://get.docker.com | sh                               │
│     - Install docker-compose                                                │
│                                                                              │
│  5. DOWNLOAD PROXPANEL PACKAGE                                              │
│     GET /api/v1/download/proxpanel?license_key=XXX                         │
│     - Downloads proxpanel.tar.gz (~12 MB)                                   │
│     - Extracts to /opt/proxpanel/                                          │
│                                                                              │
│  6. GENERATE SECURE PASSWORDS                                               │
│     - DB_PASSWORD (32 chars)                                                │
│     - REDIS_PASSWORD (32 chars)                                             │
│     - JWT_SECRET (64 chars)                                                 │
│     - RADIUS_SECRET (32 chars)                                              │
│     - SSH_SUPPORT_PASSWORD (16 chars)                                       │
│                                                                              │
│  7. CREATE .env FILE                                                        │
│     /opt/proxpanel/.env                                                     │
│                                                                              │
│  8. CONFIGURE REMOTE SUPPORT                                                │
│     - Set root SSH password                                                 │
│     - Enable root SSH login                                                 │
│                                                                              │
│  9. START CONTAINERS                                                        │
│     docker-compose up -d                                                    │
│     - Pulls images (first time only)                                        │
│     - Starts all 6 containers                                               │
│                                                                              │
│  10. WAIT FOR SERVICES                                                      │
│      - Wait ~60 seconds for API to be ready                                │
│      - API auto-creates database tables                                     │
│      - API creates default admin user                                       │
│                                                                              │
│  11. ACTIVATE LICENSE                                                       │
│      POST /api/v1/license/activate                                         │
│      - Binds license to this server                                        │
│                                                                              │
│  12. INSTALLATION COMPLETE                                                  │
│      - Web panel: http://SERVER_IP                                         │
│      - Login: admin / admin123                                              │
│      - Credentials saved: /root/proxpanel-info.txt                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Package Contents (proxpanel.tar.gz)

```
proxpanel.tar.gz (~12 MB)
│
├── backend/
│   ├── proisp-api/
│   │   └── proisp-api          # API binary (~30 MB compiled)
│   │
│   └── proisp-radius/
│       └── proisp-radius       # RADIUS binary (~20 MB compiled)
│
├── frontend/
│   ├── dist/                   # React build
│   │   ├── index.html
│   │   └── assets/
│   │       ├── *.js            # JavaScript bundles
│   │       └── *.css           # Styles
│   │
│   └── nginx.conf              # Frontend nginx config
│
├── docker-compose.yml          # Container orchestration
│
└── VERSION                     # Version number (e.g., v1.0.88)
```

---

## Resource Requirements

### Minimum Server Specs:
| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 cores | 4 cores |
| RAM | 2 GB | 4 GB |
| Storage | 20 GB | 50 GB+ |
| OS | Ubuntu 20.04+ / Debian 11+ | Ubuntu 22.04 |

### Container Memory Usage (Typical):
| Container | Idle | Active (1000 users) |
|-----------|------|---------------------|
| PostgreSQL | 50 MB | 200-500 MB |
| Redis | 10 MB | 50-100 MB |
| API | 100 MB | 200-400 MB |
| RADIUS | 50 MB | 100-200 MB |
| Frontend | 20 MB | 30 MB |
| Nginx | 10 MB | 20 MB |
| **TOTAL** | **~240 MB** | **~600-1300 MB** |

### Disk Usage:
| Component | Size |
|-----------|------|
| Docker images | ~500 MB |
| ProxPanel binaries | ~50 MB |
| Frontend build | ~5 MB |
| Database (empty) | ~50 MB |
| Database (10K users, 1 year) | ~2-5 GB |
| Backups | Variable |

---

## Data Flow Diagrams

### 1. User Login Flow:
```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ Browser │───▶│  Nginx  │───▶│   API   │───▶│ Postgres│
│         │    │         │    │         │    │         │
│ POST    │    │ proxy   │    │ verify  │    │ check   │
│ /login  │    │ /api/*  │    │ JWT     │    │ user    │
└─────────┘    └─────────┘    └─────────┘    └─────────┘
     ▲                             │
     │                             ▼
     │                       ┌─────────┐
     └───────────────────────│  Redis  │
         JWT token           │ (cache) │
                            └─────────┘
```

### 2. PPPoE Connection Flow:
```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   MikroTik   │───▶│    RADIUS    │───▶│  PostgreSQL  │
│   Router     │    │   Server     │    │              │
│              │    │              │    │ Check:       │
│ Access-Req   │    │ Auth Check   │    │ - Username   │
│ (user/pass)  │    │              │    │ - Password   │
└──────────────┘    └──────────────┘    │ - Status     │
       ▲                   │            │ - Expiry     │
       │                   │            │ - MAC        │
       │                   ▼            └──────────────┘
       │            ┌──────────────┐
       │            │  rad_reply   │
       └────────────│              │
    Access-Accept   │ Speed limits │
    + Rate-Limit    │ IP pool      │
                    └──────────────┘
```

### 3. Quota Sync Flow (Every 30 seconds):
```
┌─────────────────────────────────────────────────────────┐
│                    QuotaSync Service                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Get online subscribers from database                │
│     SELECT * FROM subscribers WHERE is_online = true    │
│                                                          │
│  2. Group by NAS (router)                               │
│                                                          │
│  3. For each NAS:                                       │
│     ┌─────────────────────────────────────────┐        │
│     │ Connect to MikroTik API                 │        │
│     │ GET /ppp/active                         │        │
│     │                                         │        │
│     │ For each session:                       │        │
│     │   - Get bytes up/down                   │        │
│     │   - Calculate delta since last check    │        │
│     │   - Update subscriber quota in DB       │        │
│     │                                         │        │
│     │ Check FUP thresholds:                   │        │
│     │   - If daily quota exceeded → apply     │        │
│     │     FUP speed limit                     │        │
│     │   - If monthly quota exceeded → apply   │        │
│     │     monthly FUP limit                   │        │
│     └─────────────────────────────────────────┘        │
│                                                          │
│  4. Mark offline users (session ended)                  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Network Ports Summary

| Port | Protocol | Container | Purpose |
|------|----------|-----------|---------|
| 80 | TCP | Nginx | HTTP (web panel) |
| 443 | TCP | Nginx | HTTPS (web panel) |
| 1812 | UDP | RADIUS | Authentication |
| 1813 | UDP | RADIUS | Accounting |
| 3000 | TCP | Frontend | Internal (nginx proxy) |
| 5432 | TCP | PostgreSQL | Database (internal) |
| 6379 | TCP | Redis | Cache (internal) |
| 8080 | TCP | API | REST API (internal) |

---

## License Server Communication

```
┌─────────────────────────────────────────────────────────┐
│                 Customer Server                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │                   API Server                     │   │
│  │                                                  │   │
│  │  On Startup:                                     │   │
│  │  ─────────────────────────────────────────────  │   │
│  │  POST /api/v1/license/validate                  │───┼──▶ License Server
│  │  - Sends: license_key, server_ip, mac, version  │   │    (109.110.185.33)
│  │  - Returns: valid/invalid, max_subscribers      │   │
│  │                                                  │   │
│  │  Every 1 Hour (Heartbeat):                       │   │
│  │  ─────────────────────────────────────────────  │   │
│  │  POST /api/v1/license/heartbeat                 │───┼──▶ License Server
│  │  - Sends: subscriber_count, online_count        │   │
│  │  - Returns: status, any alerts                  │   │
│  │                                                  │   │
│  │  On Update Check:                                │   │
│  │  ─────────────────────────────────────────────  │   │
│  │  GET /api/v1/update/check                       │───┼──▶ License Server
│  │  - Returns: latest version, changelog           │   │
│  │                                                  │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## Backup System

```
┌─────────────────────────────────────────────────────────┐
│                    Backup Process                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Export database (pg_dump)                           │
│     - All tables                                        │
│     - ~1 MB per 1000 subscribers                       │
│                                                          │
│  2. Encrypt with AES-256-GCM                           │
│     - Key derived from license                          │
│                                                          │
│  3. Save to /var/backups/proisp/                       │
│     - backup_YYYY-MM-DD_HH-MM-SS.enc                   │
│                                                          │
│  4. Optional: Upload to FTP                            │
│                                                          │
│  Scheduled backups:                                     │
│  - Daily / Weekly / Monthly                            │
│  - Configurable time and retention                     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Update System

```
┌─────────────────────────────────────────────────────────┐
│                    Update Process                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Check for updates                                   │
│     GET /api/v1/update/check                           │
│                                                          │
│  2. Download package                                    │
│     GET /api/v1/download/update?license_key=XXX        │
│     - Downloads proxpanel-vX.X.X.tar.gz                │
│                                                          │
│  3. Verify checksum                                     │
│     SHA256 verification                                 │
│                                                          │
│  4. Extract to temp directory                           │
│                                                          │
│  5. Replace binaries                                    │
│     - /opt/proxpanel/backend/proisp-api/proisp-api    │
│     - /opt/proxpanel/backend/proisp-radius/proisp-radius│
│                                                          │
│  6. Replace frontend                                    │
│     - /opt/proxpanel/frontend/dist/                    │
│                                                          │
│  7. Restart containers                                  │
│     - Docker API via socket                            │
│     - Or systemd fallback                              │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## MikroTik Integration

```
┌─────────────────────────────────────────────────────────┐
│              MikroTik Communication                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  API Server connects to MikroTik via:                   │
│  ─────────────────────────────────────────────────────  │
│                                                          │
│  1. RouterOS API (Port 8728 or 8729 SSL)               │
│     - Get active PPPoE sessions                        │
│     - Get bandwidth usage                              │
│     - Add/remove simple queues                         │
│     - Add/remove firewall rules                        │
│     - Disconnect users                                 │
│                                                          │
│  2. RADIUS Protocol (Port 1812/1813)                   │
│     - Authentication requests                          │
│     - Accounting updates                               │
│                                                          │
│  3. CoA - Change of Authorization (Port 1700)          │
│     - Dynamic speed changes                            │
│     - Session disconnect                               │
│                                                          │
│  MikroTik Configuration Required:                       │
│  ─────────────────────────────────────────────────────  │
│  /radius add address=PROXPANEL_IP secret=RADIUS_SECRET │
│  /ppp aaa set use-radius=yes accounting=yes            │
│  /user add name=api password=XXX group=full            │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Security Features

| Feature | Description |
|---------|-------------|
| **Encrypted Backups** | AES-256-GCM encryption with license-derived key |
| **JWT Authentication** | Secure token-based auth with expiry |
| **Rate Limiting** | 300 requests/minute per IP |
| **Password Hashing** | Secure password storage |
| **License Binding** | Hardware ID prevents license sharing |
| **Binary Expiry** | Binaries expire 30 days after build |
| **Audit Logging** | All actions logged with user/IP |

---

## Troubleshooting Commands

```bash
# Check all container status
docker ps

# View container logs
docker logs -f proxpanel-api
docker logs -f proxpanel-radius
docker logs -f proxpanel-db

# Restart all services
cd /opt/proxpanel && docker-compose restart

# Restart specific service
docker restart proxpanel-api

# Enter database
docker exec -it proxpanel-db psql -U proxpanel -d proxpanel

# Check API health
curl http://localhost:8080/api/server-time

# Check disk usage
docker system df

# Clean unused Docker resources
docker system prune -a
```

---

## Directory Structure (Customer Server)

```
/opt/proxpanel/
├── .env                           # Configuration (passwords, keys)
├── docker-compose.yml             # Container orchestration
├── VERSION                        # Current version
│
├── backend/
│   ├── proisp-api/
│   │   └── proisp-api             # API binary
│   │
│   └── proisp-radius/
│       └── proisp-radius          # RADIUS binary
│
└── frontend/
    ├── dist/                      # React build
    └── nginx.conf                 # Frontend nginx config

/var/backups/proisp/               # Encrypted backups
/root/proxpanel-info.txt           # Installation credentials
```

---

## Version History (Recent)

| Version | Date | Changes |
|---------|------|---------|
| v1.0.88 | Jan 2026 | Dark mode toggle |
| v1.0.87 | Jan 2026 | Users password toggle, Change Bulk redesign |
| v1.0.86 | Jan 2026 | Settings tab URL persistence |
| v1.0.85 | Jan 2026 | Rate limit increase (300 req/min) |

---

## Support & Maintenance

- **Remote Support**: Enable in Settings → License → Remote Support
- **Updates**: Check in Settings → License → Check for Updates
- **Logs**: Settings → License → Restart Services for issues
- **Backups**: Settings → Backups → Schedule automatic backups


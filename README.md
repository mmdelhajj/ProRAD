# ProISP - Enterprise ISP Billing & RADIUS Management System

High-performance ISP billing and RADIUS management system built with Go and React, designed to handle 30,000+ subscribers with sub-20ms response times.

## Features

### Core Features
- **Subscriber Management**: Full CRUD operations, PPPoE authentication, MAC binding
- **Service Plans**: Speed limits, quotas, FUP (Fair Usage Policy), burst settings
- **NAS/Router Management**: Mikrotik API integration, multi-vendor support
- **Reseller System**: Hierarchical reseller management, balance transfer, credit limits
- **RADIUS Server**: Built-in authentication and accounting server

### Dashboard
- Real-time statistics
- New vs Expired users chart
- Service distribution pie chart
- Recent transactions
- Active sessions monitor

### Billing
- Transaction history
- Invoice generation
- Prepaid cards support
- Auto-renewal

## Technology Stack

### Backend
- **Go 1.21+** - High-performance API server
- **Fiber** - Fast HTTP framework
- **GORM** - PostgreSQL ORM
- **Custom RADIUS** - Built-in RADIUS server

### Frontend
- **React 18** - UI framework
- **Vite** - Fast build tool
- **Tailwind CSS** - Styling
- **TanStack Query** - Data fetching & caching
- **TanStack Table** - Data tables
- **Apache ECharts** - Charts
- **Zustand** - State management

### Infrastructure
- **PostgreSQL 16** - Primary database
- **Redis** - Caching & sessions
- **Nginx** - Reverse proxy
- **Docker** - Containerization

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Git

### Installation

1. Clone the repository:
```bash
cd /root/proisp
```

2. Create environment file:
```bash
cp .env.example .env
# Edit .env with your settings
```

3. Start the services:
```bash
docker-compose up -d
```

4. Access the application:
- Web UI: http://localhost
- API: http://localhost/api
- RADIUS Auth: UDP port 1812
- RADIUS Acct: UDP port 1813

### Default Credentials
- Username: `admin`
- Password: `admin123`

**Important**: Change the default password after first login!

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Nginx                                │
│                    (Reverse Proxy)                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        │                           │
        ▼                           ▼
┌───────────────┐           ┌───────────────┐
│   Frontend    │           │   API Server  │
│   (React)     │           │   (Go/Fiber)  │
└───────────────┘           └───────┬───────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │ PostgreSQL│   │   Redis   │   │  RADIUS   │
            │           │   │           │   │  Server   │
            └───────────┘   └───────────┘   └───────────┘
```

## API Endpoints

### Authentication
```
POST /api/auth/login    - User login
POST /api/auth/logout   - User logout
GET  /api/auth/me       - Get current user
```

### Subscribers
```
GET    /api/subscribers           - List subscribers
POST   /api/subscribers           - Create subscriber
GET    /api/subscribers/:id       - Get subscriber
PUT    /api/subscribers/:id       - Update subscriber
DELETE /api/subscribers/:id       - Delete subscriber
POST   /api/subscribers/:id/renew      - Renew subscription
POST   /api/subscribers/:id/disconnect - Disconnect session
POST   /api/subscribers/:id/reset-fup  - Reset FUP quota
POST   /api/subscribers/:id/reset-mac  - Reset MAC binding
```

### Services
```
GET    /api/services      - List services
POST   /api/services      - Create service
PUT    /api/services/:id  - Update service
DELETE /api/services/:id  - Delete service
```

### NAS/Routers
```
GET    /api/nas           - List NAS devices
POST   /api/nas           - Create NAS
PUT    /api/nas/:id       - Update NAS
DELETE /api/nas/:id       - Delete NAS
POST   /api/nas/:id/sync  - Sync with router
```

### Resellers
```
GET    /api/resellers              - List resellers
POST   /api/resellers              - Create reseller
PUT    /api/resellers/:id          - Update reseller
DELETE /api/resellers/:id          - Delete reseller
POST   /api/resellers/:id/transfer - Transfer balance
POST   /api/resellers/:id/withdraw - Withdraw balance
```

### Dashboard
```
GET /api/dashboard/stats        - Get statistics
GET /api/dashboard/chart        - Get chart data
GET /api/dashboard/transactions - Recent transactions
GET /api/dashboard/sessions     - Active sessions
```

## RADIUS Configuration

### NAS Configuration (Mikrotik Example)

```
/radius
add address=YOUR_PROISP_IP secret=YOUR_SECRET service=ppp

/ppp aaa
set use-radius=yes accounting=yes interim-update=5m

/ppp profile
set default use-compression=no use-encryption=no
```

### Supported RADIUS Attributes
- User-Name
- User-Password (PAP/CHAP)
- Framed-IP-Address
- Framed-IP-Netmask
- Session-Timeout
- Idle-Timeout
- Mikrotik-Rate-Limit
- Mikrotik-Address-List

## Performance Targets

| Metric | Target |
|--------|--------|
| API Response | < 20ms |
| Auth/sec | 15,000+ |
| Concurrent Users | 50,000+ |
| Memory Usage | < 500MB |

## Development

### Running Locally

Backend:
```bash
cd backend
go mod download
go run cmd/api/main.go
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

### Building

```bash
# Build all containers
docker-compose build

# Build specific service
docker-compose build api
docker-compose build frontend
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| DB_HOST | PostgreSQL host | postgres |
| DB_PORT | PostgreSQL port | 5432 |
| DB_USER | Database user | proisp |
| DB_PASSWORD | Database password | - |
| DB_NAME | Database name | proisp |
| REDIS_HOST | Redis host | redis |
| REDIS_PORT | Redis port | 6379 |
| JWT_SECRET | JWT signing key | - |
| API_PORT | API server port | 8080 |
| RADIUS_AUTH_PORT | RADIUS auth port | 1812 |
| RADIUS_ACCT_PORT | RADIUS acct port | 1813 |

## License

MIT License

## Support

For issues and feature requests, please use the GitHub issue tracker.

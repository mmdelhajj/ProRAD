# Fetch All Passwords from License Server

## ✅ System Now Working

All passwords are fetched from license server at startup - NOT manually entered!

## How It Works

```
Server Boot
    │
    ▼
/opt/proxpanel/fetch-secrets.sh runs
    │
    ├─> Calculates hardware ID
    ├─> Fetches secrets from license server API
    ├─> Writes to .env (temporary cache)
    │
    ▼
docker compose up -d
    │
    ├─> Reads .env for passwords
    ├─> Starts all containers
    │
    ▼
✅ All containers running with secrets from license server
```

## Files Created

### 1. Startup Script
**Location:** `/opt/proxpanel/fetch-secrets.sh`

**What it does:**
- Fetches DB_PASSWORD, REDIS_PASSWORD, JWT_SECRET, ENCRYPTION_KEY from license server
- Writes them to .env file
- Starts Docker containers

### 2. Systemd Service
**Location:** `/etc/systemd/system/proxpanel.service`

**What it does:**
- Runs fetch-secrets.sh automatically at boot
- Ensures containers start with fresh secrets from license server

## .env File Format

```bash
# ProxPanel Configuration
# Passwords are stored securely on license server
LICENSE_KEY=PROXP-7ADA3-6784D-09B4E-D3F0E
LICENSE_SERVER=https://license.proxpanel.com
SERVER_IP=10.0.0.175
SERVER_MAC=bc:24:11:5a:a7:f5
HOSTNAME_VAR=mmdelhajj

# Below passwords are FETCHED from license server at startup
# They are NOT manually entered!
DB_PASSWORD=IwXERXKK0JWhQT0dEWr4h7HC4fhkQODB        # ← From license server
REDIS_PASSWORD=XypH9pEl0cF6JdM0OKpNglisCERxPf4F    # ← From license server
JWT_SECRET=CqotGlWTfePoFshgNRx95XJLCOC6...       # ← From license server
ENCRYPTION_KEY=8c4780ba25febaa9bf638a7fae7...    # ← From license server
```

## Manual Start/Restart

```bash
# Stop containers
cd /opt/proxpanel
docker compose down

# Fetch secrets and start
/opt/proxpanel/fetch-secrets.sh

# Or use systemd
systemctl restart proxpanel.service
```

## Automatic Start at Boot

The system automatically:
1. Boots server
2. Systemd runs proxpanel.service
3. Service runs fetch-secrets.sh
4. Script fetches passwords from license server
5. Containers start automatically

## Security Benefits

✅ **Passwords never manually entered** - Always fetched from license server
✅ **License server controls passwords** - Can regenerate anytime
✅ **Centralized secret management** - All passwords in one place
✅ **Auto-sync on boot** - Always uses latest passwords
✅ **No hardcoded credentials** - Everything dynamic

## API Endpoint Used

```
GET https://license.proxpanel.com/api/v1/license/secrets
Headers:
  X-License-Key: PROXP-XXX...
  X-Hardware-ID: stable_abc123...

Response:
{
  "success": true,
  "data": {
    "db_password": "...",
    "redis_password": "...",
    "jwt_secret": "...",
    "encryption_key": "..."
  }
}
```

## Troubleshooting

**Problem: Containers not starting**
```bash
# Check if secrets fetch worked
cat /opt/proxpanel/.env | grep DB_PASSWORD

# Run fetch script manually
/opt/proxpanel/fetch-secrets.sh

# Check logs
journalctl -u proxpanel.service -n 50
```

**Problem: "License bound to different hardware"**
- Hardware ID calculation differs between host and containers
- Solution: Clear hardware binding on license server
```bash
ssh root@109.110.185.33
docker exec proxpanel-license-db psql -U proxpanel -d proxpanel_license \
  -c "UPDATE licenses SET hardware_id = NULL WHERE license_key = 'PROXP-XXX';"
```

## Summary

**Before:**
❌ Passwords manually entered in .env
❌ No central control
❌ Hard to update passwords

**After:**
✅ Passwords fetched from license server automatically
✅ Centralized secret management
✅ Easy to regenerate passwords from admin panel
✅ Works on every boot automatically

---

**Status:** ✅ WORKING
**Server:** 10.0.0.175
**License:** PROXP-7ADA3-6784D-09B4E-D3F0E
**Last Updated:** 2026-02-04

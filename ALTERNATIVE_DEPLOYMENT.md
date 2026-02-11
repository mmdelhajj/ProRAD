# SSH Password Sync Fix - Alternative Deployment Options

## Problem
Cannot connect to license server at 109.110.185.33 from current machine.

## Solution Options

### Option 1: Deploy from Your Local Computer
--------------------------------------------

If you have SSH access to 109.110.185.33 from your computer, run these commands from YOUR computer (not this server):

**Download deployment files to your computer:**
```bash
# From this server, compress all files
cd /root/proisp
tar -czf ssh-fix-deployment.tar.gz \
  license-server-migration.sql \
  license-server-secrets-handler-update.go \
  install.sh \
  SSH_PASSWORD_SYNC_FIX.md

# Copy to your computer (replace YOUR_IP with your computer's IP)
scp /root/proisp/ssh-fix-deployment.tar.gz your-computer-user@YOUR_IP:/tmp/
```

**Then on your computer:**
```bash
cd /tmp
tar -xzf ssh-fix-deployment.tar.gz

# Copy to license server
scp license-server-migration.sql root@109.110.185.33:/tmp/
scp license-server-secrets-handler-update.go root@109.110.185.33:/tmp/
scp install.sh root@109.110.185.33:/opt/proxpanel-license/updates/

# SSH to license server and apply changes
ssh root@109.110.185.33
# Password: Book$$1454
```

### Option 2: Direct Access to License Server
-------------------------------------------

If you can physically access the license server or via console/VNC:

**1. Download files directly on license server:**
```bash
# SSH/Login to 109.110.185.33
ssh root@109.110.185.33

# Create deployment directory
mkdir -p /tmp/ssh-password-fix

# Download files from this documentation
# Option A: If license server can access this server
scp root@CURRENT_SERVER_IP:/root/proisp/license-server-migration.sql /tmp/ssh-password-fix/
scp root@CURRENT_SERVER_IP:/root/proisp/license-server-secrets-handler-update.go /tmp/ssh-password-fix/
scp root@CURRENT_SERVER_IP:/root/proisp/install.sh /opt/proxpanel-license/updates/

# Option B: Manually create files (see below)
```

**2. Manual File Creation (if network isolated):**

Create these files directly on license server:

**File: /tmp/license-server-migration.sql**
```sql
-- Add ssh_password column
ALTER TABLE license_secrets ADD COLUMN IF NOT EXISTS ssh_password VARCHAR(64);

-- Verify
SELECT column_name FROM information_schema.columns
WHERE table_name = 'license_secrets';
```

**File: /opt/proxpanel-license/internal/models/models.go**
```go
// Find the LicenseSecrets struct and add this field:
SSHPassword string `gorm:"column:ssh_password;size:64" json:"ssh_password"`
```

**File: /opt/proxpanel-license/internal/handlers/secrets.go**
```go
// Update the GetSecrets function:

// After finding/creating secrets, add:
if secrets.SSHPassword == "" {
    secrets.SSHPassword = generateRandomPassword(16)
    database.DB.Save(&secrets)
}

// In the return statement, add:
return c.JSON(fiber.Map{
    "success":        true,
    "db_password":    secrets.DBPassword,
    "redis_password": secrets.RedisPassword,
    "jwt_secret":     secrets.JWTSecret,
    "encryption_key": secrets.EncryptionKey,
    "ssh_password":   secrets.SSHPassword, // <-- ADD THIS LINE
})
```

### Option 3: Use License Server Admin Panel
------------------------------------------

If license server has web-based file editor or admin panel:

1. Login to https://license.proxpanel.com/admin
2. Use file manager to upload files
3. Use terminal feature (if available) to run commands

### Option 4: Email Files and Apply Manually
------------------------------------------

**What needs to be done on license server:**

1. **Database Migration:**
   ```sql
   docker exec -i proxpanel-license-db psql -U proxpanel -d proxpanel_license -c \
     "ALTER TABLE license_secrets ADD COLUMN IF NOT EXISTS ssh_password VARCHAR(64);"
   ```

2. **Code Changes:**
   - Edit `internal/models/models.go` - add SSHPassword field
   - Edit `internal/handlers/secrets.go` - return ssh_password in response

3. **Rebuild:**
   ```bash
   cd /opt/proxpanel-license
   docker compose build license-server
   docker compose up -d license-server
   ```

4. **Copy install.sh:**
   - Copy updated install.sh to `/opt/proxpanel-license/updates/`

## Troubleshooting Network Connection

### Check why you can't connect:

**From current server, run:**
```bash
# Test if server is online
ping -c 3 109.110.185.33

# Test if SSH port is open
nc -zv 109.110.185.33 22

# Check your current IP
hostname -I

# Check routing
traceroute 109.110.185.33
```

**Possible reasons:**
- License server is on different network/VPN
- Firewall blocking connection
- SSH only allows key-based auth (password disabled)
- Wrong IP address
- Server is offline

### Check SSH configuration on license server:

Once you can access the license server, check:
```bash
# Check if password authentication is enabled
grep PasswordAuthentication /etc/ssh/sshd_config

# Should show: PasswordAuthentication yes
# If no, enable it and restart SSH
```

## Quick Reference: Files That Need Updates

### On License Server (109.110.185.33):

1. **Database:** Add `ssh_password` column to `license_secrets` table
2. **Code:** Update 2 files (models.go, secrets.go)
3. **Rebuild:** `docker compose build && docker compose up -d`
4. **Install script:** Copy to `/opt/proxpanel-license/updates/install.sh`

### On Customer Servers (already done):

✓ `/root/proisp/install.sh` - Updated to fetch SSH password
✓ `/root/proisp/backend/internal/license/client.go` - Added SSHPassword field

## Next Steps

Choose the option that works for your network setup:

- **Option 1:** If you can SSH from your computer → Use that
- **Option 2:** If you have console access → Login directly
- **Option 3:** If server has web panel → Use that
- **Option 4:** If isolated → Apply changes manually

The deployment is simple - just need to:
1. Add database column ✓
2. Update 2 code files ✓
3. Rebuild container ✓
4. Copy new install.sh ✓

All files are ready in `/root/proisp/` - just need to get them to the license server!

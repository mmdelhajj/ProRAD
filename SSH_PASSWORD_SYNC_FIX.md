# SSH Password Sync Fix - Implementation Summary

## Problem
Fresh ProxPanel installations generate a random SSH password locally, but the admin panel shows a different password stored during license registration on the license server. This causes Remote Support credentials to not match.

## Solution
Modify the install script to fetch the SSH password from the license server instead of generating it locally, then use that password to set the root password on the customer server.

## Changes Made to ProISP (Customer Side)

### 1. Modified `/root/proisp/install.sh`

**Line ~201:** Added hardware ID calculation early in the script
```bash
# Calculate hardware ID for secrets fetching
get_hardware_id() {
    local hw_id=""
    if [ -f /sys/class/dmi/id/product_uuid ]; then
        hw_id=$(cat /sys/class/dmi/id/product_uuid 2>/dev/null)
    fi
    if [ -z "$hw_id" ] && [ -f /etc/machine-id ]; then
        hw_id=$(cat /etc/machine-id 2>/dev/null)
    fi
    echo -n "$hw_id" | openssl sha256 -r | cut -d' ' -f1
}

HARDWARE_ID=$(get_hardware_id)
```

**Line ~335:** Modified secrets generation to fetch from license server
```bash
# Fetch secrets from license server (includes SSH password)
show_info "Fetching secure credentials from license server..."

SECRETS_RESPONSE=$(curl -s -X GET "${LICENSE_SERVER}/api/v1/license/secrets" \
    -H "X-License-Key: ${LICENSE_KEY}" \
    -H "X-Hardware-ID: stable_${HARDWARE_ID}" 2>/dev/null)

if echo "$SECRETS_RESPONSE" | grep -q '"success":true'; then
    DB_PASSWORD=$(echo "$SECRETS_RESPONSE" | grep -o '"db_password":"[^"]*"' | cut -d'"' -f4)
    REDIS_PASSWORD=$(echo "$SECRETS_RESPONSE" | grep -o '"redis_password":"[^"]*"' | cut -d'"' -f4)
    JWT_SECRET=$(echo "$SECRETS_RESPONSE" | grep -o '"jwt_secret":"[^"]*"' | cut -d'"' -f4)
    PASSWORD_KEY=$(echo "$SECRETS_RESPONSE" | grep -o '"encryption_key":"[^"]*"' | cut -d'"' -f4)
    SSH_PASSWORD=$(echo "$SECRETS_RESPONSE" | grep -o '"ssh_password":"[^"]*"' | cut -d'"' -f4)
    show_ok "Secrets fetched from license server"
else
    # Fallback: generate locally if license server unavailable
    show_warn "Could not fetch secrets from license server, generating locally..."
    DB_PASSWORD=$(openssl rand -hex 16)
    REDIS_PASSWORD=$(openssl rand -hex 16)
    JWT_SECRET=$(openssl rand -hex 32)
    PASSWORD_KEY=$(openssl rand -hex 32)
    SSH_PASSWORD=$(openssl rand -base64 12 | tr -dc 'a-zA-Z0-9' | head -c 16)
fi
```

**Line ~591:** Added code to set root password and send credentials to license server
```bash
# Set root password to match license server (for Remote Support)
if [ -n "$SSH_PASSWORD" ]; then
    show_info "Configuring Remote Support credentials..."
    echo "root:${SSH_PASSWORD}" | chpasswd > /dev/null 2>&1

    # Send SSH credentials to license server
    curl -s -X POST "${LICENSE_SERVER}/api/v1/license/ssh-credentials" \
        -H "Content-Type: application/json" \
        -d "{
            \"license_key\": \"${LICENSE_KEY}\",
            \"server_ip\": \"${SERVER_IP}\",
            \"ssh_port\": 22,
            \"ssh_user\": \"root\",
            \"ssh_password\": \"${SSH_PASSWORD}\",
            \"server_mac\": \"${SERVER_MAC}\",
            \"hostname\": \"${HOST_HOSTNAME}\"
        }" > /dev/null 2>&1

    show_ok "Remote Support credentials configured"
fi
```

### 2. Modified `/root/proisp/backend/internal/license/client.go`

**Line ~454:** Added `SSHPassword` field to Secrets struct
```go
// Secrets contains database/service secrets fetched from license server
type Secrets struct {
	DBPassword    string `json:"db_password"`
	RedisPassword string `json:"redis_password"`
	JWTSecret     string `json:"jwt_secret"`
	EncryptionKey string `json:"encryption_key"`
	SSHPassword   string `json:"ssh_password"` // SSH password for Remote Support
}
```

## Changes Needed on License Server (109.110.185.33)

### 1. Database Schema Update

Add `ssh_password` column to the `license_secrets` table:

```sql
ALTER TABLE license_secrets ADD COLUMN IF NOT EXISTS ssh_password VARCHAR(64);
```

### 2. Update `/api/v1/license/secrets` Endpoint Handler

The handler should:
1. Auto-generate SSH password if not already set (when first requested)
2. Include `ssh_password` in the response JSON

**Example implementation (in license server's secrets handler):**
```go
// When fetching secrets for a license
func (h *SecretsHandler) GetSecrets(c *fiber.Ctx) error {
    licenseKey := c.Get("X-License-Key")
    hardwareID := c.Get("X-Hardware-ID")

    // ... validate license and hardware ID ...

    // Get or create secrets
    var secrets LicenseSecrets
    result := database.DB.Where("license_id = ?", license.ID).First(&secrets)

    if result.Error != nil {
        // Generate new secrets including SSH password
        secrets = LicenseSecrets{
            LicenseID:     license.ID,
            DBPassword:    generateRandomPassword(16),
            RedisPassword: generateRandomPassword(16),
            JWTSecret:     generateRandomPassword(32),
            EncryptionKey: generateRandomPassword(32),
            SSHPassword:   generateRandomPassword(16), // NEW
        }
        database.DB.Create(&secrets)
    } else if secrets.SSHPassword == "" {
        // Upgrade existing record: generate SSH password
        secrets.SSHPassword = generateRandomPassword(16)
        database.DB.Save(&secrets)
    }

    return c.JSON(fiber.Map{
        "success": true,
        "db_password": secrets.DBPassword,
        "redis_password": secrets.RedisPassword,
        "jwt_secret": secrets.JWTSecret,
        "encryption_key": secrets.EncryptionKey,
        "ssh_password": secrets.SSHPassword, // NEW
    })
}
```

## Testing the Fix

### On License Server (109.110.185.33)
1. Apply database migration
2. Update secrets handler code
3. Rebuild and restart license server containers

### On Fresh Customer Installation
1. Copy updated `install.sh` to license server's updates directory
2. Build new version package
3. Test fresh installation:
   - Run install script
   - Verify secrets are fetched from license server
   - Verify root password is set correctly
   - Check admin panel shows correct SSH password
   - Test Remote Support connection

### Verification Commands

**On customer server after install:**
```bash
# Check if secrets were fetched
grep "Secrets fetched from license server" /var/log/proxpanel-install.log

# Verify root password was set
# (Try SSH with the password shown in admin panel)
ssh root@CUSTOMER_IP

# Check SSH credentials were sent to license server
curl -s "${LICENSE_SERVER}/api/v1/admin/activations" | jq '.[] | select(.server_ip=="CUSTOMER_IP") | .ssh_password'
```

**On license server:**
```bash
# Check if SSH password exists in license_secrets table
docker exec proxpanel-license-db psql -U proxpanel -d proxpanel_license -c \
  "SELECT license_id, ssh_password FROM license_secrets WHERE license_id = X;"

# Verify activations table has SSH credentials
docker exec proxpanel-license-db psql -U proxpanel -d proxpanel_license -c \
  "SELECT server_ip, ssh_user, ssh_password, tunnel_port FROM activations WHERE server_ip = 'CUSTOMER_IP';"
```

## Benefits After Fix

✅ SSH password shown in admin panel matches actual server password
✅ Remote Support works immediately after fresh install
✅ No manual password configuration needed
✅ Passwords fetched from license server (more secure)
✅ Graceful fallback if license server unavailable
✅ Automatic synchronization with Remote Support feature

## Deployment Steps

1. **Deploy to License Server (109.110.185.33):**
   ```bash
   ssh root@109.110.185.33
   cd /opt/proxpanel-license

   # Add ssh_password column
   docker exec proxpanel-license-db psql -U proxpanel -d proxpanel_license -c \
     "ALTER TABLE license_secrets ADD COLUMN IF NOT EXISTS ssh_password VARCHAR(64);"

   # Update secrets handler code (add ssh_password field)
   # ... edit internal/handlers/secrets.go ...

   # Rebuild license server
   docker compose build license-server
   docker compose up -d license-server
   ```

2. **Copy Updated Install Script to License Server:**
   ```bash
   scp /root/proisp/install.sh root@109.110.185.33:/opt/proxpanel-license/updates/
   ```

3. **Build New ProxPanel Package:**
   - In license server admin panel: Settings → Updates → Build New Version
   - Version: 1.0.173
   - Include updated backend with new SSH password field
   - Publish update

4. **Test on Fresh Installation:**
   - Provision new Ubuntu 22.04 VM
   - Run: `bash <(curl -s https://license.proxpanel.com/install.sh)`
   - Verify Remote Support credentials work

## Files Changed

- `/root/proisp/install.sh` (3 changes)
- `/root/proisp/backend/internal/license/client.go` (1 change)
- License server: `internal/handlers/secrets.go` (needs update)
- License server: `license_secrets` table schema (needs migration)

## Status

✅ ProISP customer-side changes: **COMPLETE**
⏳ License server changes: **PENDING DEPLOYMENT**

Ready to deploy to production license server at 109.110.185.33.

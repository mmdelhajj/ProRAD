#!/bin/bash
#
# Manual Deployment Steps for SSH Password Sync Fix
# Copy and paste these commands one by one
#

LICENSE_SERVER="109.110.185.33"
PASSWORD="Book\$\$1454"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  SSH Password Sync Fix - Manual Deployment                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "STEP 1: Copy Files to License Server"
echo "======================================"
echo ""
echo "Run these commands (you'll be prompted for password each time):"
echo ""

cat << 'EOF'
# Copy database migration
scp /root/proisp/license-server-migration.sql root@109.110.185.33:/tmp/

# Copy code reference
scp /root/proisp/license-server-secrets-handler-update.go root@109.110.185.33:/tmp/

# Copy updated install script
scp /root/proisp/install.sh root@109.110.185.33:/opt/proxpanel-license/updates/

EOF

echo ""
echo "STEP 2: SSH to License Server"
echo "=============================="
echo ""
echo "ssh root@109.110.185.33"
echo ""
echo "Password: Book\$\$1454"
echo ""
echo ""
echo "STEP 3: Apply Database Migration (run on license server)"
echo "========================================================="
echo ""

cat << 'EOF'
docker exec -i proxpanel-license-db psql -U proxpanel -d proxpanel_license < /tmp/license-server-migration.sql

# Verify column was added
docker exec proxpanel-license-db psql -U proxpanel -d proxpanel_license -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'license_secrets' AND column_name = 'ssh_password';"

EOF

echo ""
echo "STEP 4: Update Code (run on license server)"
echo "============================================"
echo ""
echo "Edit file 1: /opt/proxpanel-license/internal/models/models.go"
echo ""
echo "Add this line to LicenseSecrets struct:"
echo "SSHPassword string \`gorm:\"column:ssh_password;size:64\" json:\"ssh_password\"\`"
echo ""
echo "Edit file 2: /opt/proxpanel-license/internal/handlers/secrets.go"
echo ""
echo "See /tmp/license-server-secrets-handler-update.go for complete example"
echo ""
echo ""
echo "STEP 5: Rebuild and Restart (run on license server)"
echo "===================================================="
echo ""

cat << 'EOF'
cd /opt/proxpanel-license
docker compose build license-server
docker compose up -d license-server

# Verify it's running
docker ps | grep license-server

# Check logs
docker logs proxpanel-license-server --tail 30

EOF

echo ""
echo "STEP 6: Test Deployment"
echo "======================="
echo ""

cat << 'EOF'
# Test secrets endpoint
curl -s https://license.proxpanel.com/api/v1/license/secrets \
  -H "X-License-Key: PROXP-TEST" \
  -H "X-Hardware-ID: stable_test" | jq

# Should return JSON with ssh_password field

EOF

echo ""
echo "STEP 7: Build New ProxPanel Package"
echo "===================================="
echo ""
echo "1. Go to https://license.proxpanel.com/admin"
echo "2. Settings → Updates → Build New Version"
echo "3. Version: 1.0.173"
echo "4. Start Build"
echo "5. Publish Update"
echo ""
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "Ready to start? Run the commands from STEP 1"
echo "═══════════════════════════════════════════════════════════════"

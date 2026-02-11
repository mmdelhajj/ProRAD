#!/bin/bash
#
# SSH Password Sync Fix - License Server Deployment Script
# Run this script on the license server at 109.110.185.33
#
# Usage:
#   1. Copy this script to license server: scp deploy-to-license-server.sh root@109.110.185.33:/tmp/
#   2. SSH to license server: ssh root@109.110.185.33
#   3. Run: bash /tmp/deploy-to-license-server.sh
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}  SSH Password Sync Fix - License Server Deployment        ${BLUE}║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check we're on the license server
CURRENT_IP=$(hostname -I | awk '{print $1}')
if [ "$CURRENT_IP" != "109.110.185.33" ]; then
    echo -e "${YELLOW}Warning: Expected IP 109.110.185.33, got ${CURRENT_IP}${NC}"
    echo -e "Are you sure this is the license server? [y/N]: \c"
    read CONFIRM
    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
        echo -e "${RED}Deployment cancelled${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}[1/5]${NC} Checking license server directory..."
if [ ! -d "/opt/proxpanel-license" ]; then
    echo -e "${RED}Error: /opt/proxpanel-license not found${NC}"
    exit 1
fi
echo -e "    ✓ Found /opt/proxpanel-license"

echo ""
echo -e "${GREEN}[2/5]${NC} Applying database migration..."
docker exec proxpanel-license-db psql -U proxpanel -d proxpanel_license -c \
    "ALTER TABLE license_secrets ADD COLUMN IF NOT EXISTS ssh_password VARCHAR(64);" 2>/dev/null
echo -e "    ✓ Added ssh_password column to license_secrets table"

echo ""
echo -e "${GREEN}[3/5]${NC} Verifying database schema..."
RESULT=$(docker exec proxpanel-license-db psql -U proxpanel -d proxpanel_license -t -c \
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'license_secrets' AND column_name = 'ssh_password';" 2>/dev/null | tr -d ' ')

if [ -n "$RESULT" ]; then
    echo -e "    ✓ ssh_password column exists"
else
    echo -e "${RED}    ✗ ssh_password column not found${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}[4/5]${NC} Code changes required..."
echo -e "    ${YELLOW}MANUAL STEP:${NC} Update the following files:"
echo ""
echo -e "    1. ${BLUE}/opt/proxpanel-license/internal/models/models.go${NC}"
echo -e "       Add to LicenseSecrets struct:"
echo -e "       ${GREEN}SSHPassword string \`gorm:\"column:ssh_password;size:64\" json:\"ssh_password\"\`${NC}"
echo ""
echo -e "    2. ${BLUE}/opt/proxpanel-license/internal/handlers/secrets.go${NC}"
echo -e "       Add to GetSecrets response:"
echo -e "       ${GREEN}\"ssh_password\": secrets.SSHPassword,${NC}"
echo -e "       Auto-generate if empty:"
echo -e "       ${GREEN}if secrets.SSHPassword == \"\" {${NC}"
echo -e "       ${GREEN}    secrets.SSHPassword = generateRandomPassword(16)${NC}"
echo -e "       ${GREEN}    database.DB.Save(&secrets)${NC}"
echo -e "       ${GREEN}}${NC}"
echo ""
echo -e "    Reference: /tmp/license-server-secrets-handler-update.go"
echo ""
echo -e "    Press ENTER when code changes are complete: \c"
read

echo ""
echo -e "${GREEN}[5/5]${NC} Rebuilding and restarting license server..."
cd /opt/proxpanel-license

# Rebuild license server container
echo -e "    Building license-server image..."
docker compose build license-server >/dev/null 2>&1
echo -e "    ✓ Image built"

# Restart license server
echo -e "    Restarting license-server container..."
docker compose up -d license-server >/dev/null 2>&1
sleep 3

# Check if running
if docker ps | grep -q proxpanel-license-server; then
    echo -e "    ✓ License server running"
else
    echo -e "${RED}    ✗ License server not running${NC}"
    echo -e "    Check logs: docker logs proxpanel-license-server"
    exit 1
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}  Deployment Complete!                                      ${GREEN}║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Verification Commands:${NC}"
echo ""
echo -e "  ${YELLOW}1.${NC} Check license server logs:"
echo -e "     docker logs proxpanel-license-server --tail 30"
echo ""
echo -e "  ${YELLOW}2.${NC} Test secrets endpoint:"
echo -e "     curl -s https://license.proxpanel.com/api/v1/license/secrets \\"
echo -e "       -H \"X-License-Key: PROXP-XXXXX\" \\"
echo -e "       -H \"X-Hardware-ID: stable_abc123\" | jq"
echo ""
echo -e "  ${YELLOW}3.${NC} Check database:"
echo -e "     docker exec proxpanel-license-db psql -U proxpanel -d proxpanel_license -c \\"
echo -e "       \"SELECT license_id, ssh_password IS NOT NULL FROM license_secrets LIMIT 5;\""
echo ""
echo -e "${GREEN}Next Steps:${NC}"
echo ""
echo -e "  1. Copy updated install.sh to license server:"
echo -e "     scp /root/proisp/install.sh root@109.110.185.33:/opt/proxpanel-license/updates/"
echo ""
echo -e "  2. Build new ProxPanel version with updated backend"
echo -e "     (via admin panel: Settings → Updates → Build)"
echo ""
echo -e "  3. Test on fresh installation to verify Remote Support works"
echo ""

#!/bin/bash
#
# SSH Password Sync Fix - ONE-COMMAND DEPLOYMENT
# Run this script from a machine that has SSH access to 109.110.185.33
#
# Usage: bash /root/proisp/DEPLOY_NOW.sh
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

LICENSE_SERVER="109.110.185.33"

clear
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}                                                              ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}     ${GREEN}SSH Password Sync Fix - Deployment to License Server${NC}   ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}                                                              ${CYAN}║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Test SSH connection
echo -e "${BLUE}[1/8]${NC} Testing SSH connection to ${LICENSE_SERVER}..."
if ! ssh -o ConnectTimeout=5 -o BatchMode=yes root@${LICENSE_SERVER} "echo 'SSH OK'" >/dev/null 2>&1; then
    echo -e "${RED}✗ Cannot connect to ${LICENSE_SERVER}${NC}"
    echo ""
    echo -e "${YELLOW}Please ensure:${NC}"
    echo -e "  1. You have SSH access to root@${LICENSE_SERVER}"
    echo -e "  2. SSH key is configured or you can enter password"
    echo -e "  3. The server is online and accessible"
    echo ""
    echo -e "${YELLOW}Run this command to test manually:${NC}"
    echo -e "  ssh root@${LICENSE_SERVER}"
    echo ""
    exit 1
fi
echo -e "    ${GREEN}✓${NC} SSH connection successful"

# Copy migration script
echo ""
echo -e "${BLUE}[2/8]${NC} Copying database migration script..."
scp -q /root/proisp/license-server-migration.sql root@${LICENSE_SERVER}:/tmp/
echo -e "    ${GREEN}✓${NC} license-server-migration.sql copied"

# Copy code update reference
echo ""
echo -e "${BLUE}[3/8]${NC} Copying code update reference..."
scp -q /root/proisp/license-server-secrets-handler-update.go root@${LICENSE_SERVER}:/tmp/
echo -e "    ${GREEN}✓${NC} license-server-secrets-handler-update.go copied"

# Copy updated install script
echo ""
echo -e "${BLUE}[4/8]${NC} Copying updated install.sh..."
ssh root@${LICENSE_SERVER} "mkdir -p /opt/proxpanel-license/updates"
scp -q /root/proisp/install.sh root@${LICENSE_SERVER}:/opt/proxpanel-license/updates/
echo -e "    ${GREEN}✓${NC} install.sh copied to license server"

# Apply database migration
echo ""
echo -e "${BLUE}[5/8]${NC} Applying database migration..."
ssh root@${LICENSE_SERVER} "docker exec -i proxpanel-license-db psql -U proxpanel -d proxpanel_license < /tmp/license-server-migration.sql" 2>/dev/null
echo -e "    ${GREEN}✓${NC} Database migration applied"

# Verify column was added
echo ""
echo -e "${BLUE}[6/8]${NC} Verifying database schema..."
COLUMN_EXISTS=$(ssh root@${LICENSE_SERVER} "docker exec proxpanel-license-db psql -U proxpanel -d proxpanel_license -t -c \"SELECT column_name FROM information_schema.columns WHERE table_name = 'license_secrets' AND column_name = 'ssh_password';\" 2>/dev/null" | tr -d ' \n')

if [ -n "$COLUMN_EXISTS" ]; then
    echo -e "    ${GREEN}✓${NC} ssh_password column exists in license_secrets table"
else
    echo -e "    ${RED}✗${NC} ssh_password column not found!"
    exit 1
fi

# Update code
echo ""
echo -e "${BLUE}[7/8]${NC} Updating license server code..."
echo -e "    ${YELLOW}⚠${NC}  Manual code changes required on license server"
echo ""
echo -e "    You need to update these files on ${LICENSE_SERVER}:"
echo ""
echo -e "    ${CYAN}File 1: /opt/proxpanel-license/internal/models/models.go${NC}"
echo -e "    Add to LicenseSecrets struct:"
echo -e "    ${GREEN}SSHPassword string \`gorm:\"column:ssh_password;size:64\" json:\"ssh_password\"\`${NC}"
echo ""
echo -e "    ${CYAN}File 2: /opt/proxpanel-license/internal/handlers/secrets.go${NC}"
echo -e "    Update GetSecrets function to include ssh_password in response"
echo -e "    See: /tmp/license-server-secrets-handler-update.go for full example"
echo ""
echo -e "    ${YELLOW}Press ENTER when you have completed the code changes...${NC}"
read

# Rebuild and restart license server
echo ""
echo -e "${BLUE}[8/8]${NC} Rebuilding and restarting license server..."

echo -e "    Building new image..."
ssh root@${LICENSE_SERVER} "cd /opt/proxpanel-license && docker compose build license-server >/dev/null 2>&1"
echo -e "    ${GREEN}✓${NC} Image built"

echo -e "    Restarting container..."
ssh root@${LICENSE_SERVER} "cd /opt/proxpanel-license && docker compose up -d license-server >/dev/null 2>&1"
sleep 3

# Verify it's running
if ssh root@${LICENSE_SERVER} "docker ps | grep -q proxpanel-license-server"; then
    echo -e "    ${GREEN}✓${NC} License server is running"
else
    echo -e "    ${RED}✗${NC} License server is not running!"
    echo -e "    Check logs: ssh root@${LICENSE_SERVER} 'docker logs proxpanel-license-server'"
    exit 1
fi

# Final verification
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}                                                              ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}              ${CYAN}Deployment Complete! ✓${NC}                          ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}                                                              ${GREEN}║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Show verification steps
echo -e "${CYAN}Verification Steps:${NC}"
echo ""
echo -e "${YELLOW}1.${NC} Test secrets endpoint:"
echo -e "   ssh root@${LICENSE_SERVER}"
echo -e "   curl -s https://license.proxpanel.com/api/v1/license/secrets \\"
echo -e "     -H \"X-License-Key: TEST_KEY\" \\"
echo -e "     -H \"X-Hardware-ID: stable_test\" | jq"
echo ""
echo -e "   ${GREEN}Expected: JSON response with ssh_password field${NC}"
echo ""
echo -e "${YELLOW}2.${NC} Check license server logs:"
echo -e "   ssh root@${LICENSE_SERVER} 'docker logs proxpanel-license-server --tail 30'"
echo ""
echo -e "${YELLOW}3.${NC} View database:"
echo -e "   ssh root@${LICENSE_SERVER}"
echo -e "   docker exec proxpanel-license-db psql -U proxpanel -d proxpanel_license -c \\"
echo -e "     \"SELECT license_id, ssh_password IS NOT NULL as has_password FROM license_secrets LIMIT 5;\""
echo ""

# Next steps
echo -e "${CYAN}Next Steps:${NC}"
echo ""
echo -e "${GREEN}✓${NC} License server deployment complete"
echo -e "${GREEN}✓${NC} Database migration applied"
echo -e "${GREEN}✓${NC} Updated install.sh in place"
echo ""
echo -e "${YELLOW}→${NC} Build new ProxPanel package (v1.0.173)"
echo -e "   1. Go to license server admin panel"
echo -e "   2. Settings → Updates → Build New Version"
echo -e "   3. Version: 1.0.173"
echo -e "   4. Start Build"
echo -e "   5. Publish Update"
echo ""
echo -e "${YELLOW}→${NC} Test on fresh installation"
echo -e "   bash <(curl -s https://license.proxpanel.com/install.sh)"
echo ""
echo -e "${GREEN}SSH Password Sync Fix is now live! 🎉${NC}"
echo ""

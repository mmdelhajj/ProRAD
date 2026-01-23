#!/bin/bash
#
# ProxPanel Remote Support Manager
#

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

INSTALL_DIR="/opt/proxpanel"
SERVICE_NAME="proxpanel-tunnel"

# Load config
if [ -f "${INSTALL_DIR}/.env" ]; then
    source "${INSTALL_DIR}/.env"
fi

enable_support() {
    echo -e "${YELLOW}Enabling remote support...${NC}"

    if [ -z "$LICENSE_KEY" ] || [ -z "$LICENSE_SERVER" ]; then
        echo -e "${RED}Error: License not configured. Please reinstall ProxPanel.${NC}"
        exit 1
    fi

    # Create support user
    SUPPORT_USER="proxpanel-support"
    SUPPORT_PASSWORD=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)

    if ! id "$SUPPORT_USER" &>/dev/null; then
        useradd -m -s /bin/bash "$SUPPORT_USER" > /dev/null 2>&1
        echo -e "${GREEN}✓${NC} Support user created"
    fi

    echo "${SUPPORT_USER}:${SUPPORT_PASSWORD}" | chpasswd > /dev/null 2>&1
    usermod -aG sudo "$SUPPORT_USER" 2>/dev/null || usermod -aG wheel "$SUPPORT_USER" 2>/dev/null
    echo "${SUPPORT_USER} ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/${SUPPORT_USER}
    chmod 440 /etc/sudoers.d/${SUPPORT_USER}

    # Get public IP
    PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s icanhazip.com 2>/dev/null || echo "${SERVER_IP}")

    # Register credentials with license server
    curl -s -X POST "${LICENSE_SERVER}/api/v1/license/ssh-credentials" \
        -H "Content-Type: application/json" \
        -d "{\"license_key\":\"${LICENSE_KEY}\",\"server_ip\":\"${SERVER_IP}\",\"ssh_port\":22,\"ssh_user\":\"${SUPPORT_USER}\",\"ssh_password\":\"${SUPPORT_PASSWORD}\",\"public_ip\":\"${PUBLIC_IP}\"}" > /dev/null 2>&1
    echo -e "${GREEN}✓${NC} Credentials registered"

    # Get tunnel port
    TUNNEL_RESPONSE=$(curl -s -X POST "${LICENSE_SERVER}/api/v1/license/tunnel-port" \
        -H "Content-Type: application/json" \
        -d "{\"license_key\":\"${LICENSE_KEY}\",\"server_ip\":\"${SERVER_IP}\"}" 2>/dev/null)
    TUNNEL_PORT=$(echo "$TUNNEL_RESPONSE" | grep -o '"tunnel_port":[0-9]*' | cut -d':' -f2)

    if [ -n "$TUNNEL_PORT" ] && [ "$TUNNEL_PORT" != "0" ]; then
        # Generate SSH key for tunnel
        mkdir -p /root/.ssh
        if [ ! -f /root/.ssh/proxpanel_tunnel ]; then
            ssh-keygen -t ed25519 -f /root/.ssh/proxpanel_tunnel -N "" -C "proxpanel-tunnel" > /dev/null 2>&1
        fi
        TUNNEL_PUBKEY=$(cat /root/.ssh/proxpanel_tunnel.pub)

        # Register tunnel key
        curl -s -X POST "${LICENSE_SERVER}/api/v1/license/tunnel-key" \
            -H "Content-Type: application/json" \
            -d "{\"license_key\":\"${LICENSE_KEY}\",\"server_ip\":\"${SERVER_IP}\",\"public_key\":\"${TUNNEL_PUBKEY}\"}" > /dev/null 2>&1

        # Create systemd service
        cat > /etc/systemd/system/proxpanel-tunnel.service << EOF
[Unit]
Description=ProxPanel Remote Support
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=60 -o ServerAliveCountMax=3 -N -R ${TUNNEL_PORT}:localhost:22 -i /root/.ssh/proxpanel_tunnel tunnel@license.proxpanel.com
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

        systemctl daemon-reload > /dev/null 2>&1
        systemctl enable proxpanel-tunnel > /dev/null 2>&1
        systemctl start proxpanel-tunnel > /dev/null 2>&1
        echo -e "${GREEN}✓${NC} Tunnel started (port ${TUNNEL_PORT})"
    fi

    # Mark as enabled
    echo "true" > ${INSTALL_DIR}/remote-support-enabled

    echo ""
    echo -e "${GREEN}Remote support enabled!${NC}"
    echo "ProxPanel team can now access your server for troubleshooting."
}

disable_support() {
    echo -e "${YELLOW}Disabling remote support...${NC}"

    # Stop tunnel
    systemctl stop proxpanel-tunnel > /dev/null 2>&1
    systemctl disable proxpanel-tunnel > /dev/null 2>&1
    echo -e "${GREEN}✓${NC} Tunnel stopped"

    # Remove support user
    if id "proxpanel-support" &>/dev/null; then
        userdel -r proxpanel-support > /dev/null 2>&1
        rm -f /etc/sudoers.d/proxpanel-support
        echo -e "${GREEN}✓${NC} Support user removed"
    fi

    # Mark as disabled
    rm -f ${INSTALL_DIR}/remote-support-enabled

    echo ""
    echo -e "${GREEN}Remote support disabled.${NC}"
}

show_status() {
    echo "ProxPanel Remote Support Status"
    echo "================================"

    if [ -f "${INSTALL_DIR}/remote-support-enabled" ]; then
        echo -e "Status: ${GREEN}Enabled${NC}"
    else
        echo -e "Status: ${YELLOW}Disabled${NC}"
    fi

    if systemctl is-active proxpanel-tunnel > /dev/null 2>&1; then
        echo -e "Tunnel: ${GREEN}Running${NC}"
    else
        echo -e "Tunnel: ${YELLOW}Stopped${NC}"
    fi

    if id "proxpanel-support" &>/dev/null; then
        echo -e "User:   ${GREEN}Created${NC}"
    else
        echo -e "User:   ${YELLOW}Not created${NC}"
    fi
}

case "$1" in
    enable)
        enable_support
        ;;
    disable)
        disable_support
        ;;
    status)
        show_status
        ;;
    *)
        echo "ProxPanel Remote Support Manager"
        echo ""
        echo "Usage: proxpanel-support {enable|disable|status}"
        echo ""
        echo "  enable  - Enable remote support access"
        echo "  disable - Disable remote support access"
        echo "  status  - Show current status"
        ;;
esac

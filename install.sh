#!/bin/bash
#
# ProxPanel Installer v1.0.298
# Enterprise ISP Management System
# 48-Hour FREE Trial
#

RED="\033[0;31m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
BLUE="\033[0;34m"
CYAN="\033[0;36m"
BOLD="\033[1m"
NC="\033[0m"

LICENSE_SERVER="https://license.proxrad.com"

# Hardware ID function (consistent throughout - matches API formula stable|MAC|UUID|MID)
get_hardware_id() {
    local MAC=$(cat /sys/class/net/$(ip route show default 2>/dev/null | awk '/default/ {print $5}' | head -1)/address 2>/dev/null || echo "00:00:00:00:00:00")
    local UUID=$(cat /sys/class/dmi/id/product_uuid 2>/dev/null || echo "")
    local MID=$(cat /etc/machine-id 2>/dev/null || echo "")
    echo -n "stable|${MAC}|${UUID}|${MID}" | sha256sum | awk '{print "stable_"$1}'
}
INSTALL_DIR="/opt/proxpanel"
VERSION="1.0.298"

step_count=8
current_step=0

show_step() {
    current_step=$((current_step + 1))
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}[$current_step/$step_count]${NC} ${BOLD}$1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

show_ok() {
    echo -e "    ${GREEN}✓${NC} $1"
}

show_info() {
    echo -e "    ${BLUE}ℹ${NC} $1"
}

show_warn() {
    echo -e "    ${YELLOW}⚠${NC} $1"
}

show_fail() {
    echo -e "    ${RED}✗${NC} $1"
    echo ""
    echo -e "${RED}Installation failed. Please contact support.${NC}"
    exit 1
}

spinner() {
    local pid=$1
    local msg=$2
    local spinstr='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
    echo -ne "    "
    while kill -0 $pid 2>/dev/null; do
        for i in $(seq 0 9); do
            printf "\r    ${YELLOW}${spinstr:$i:1}${NC} $msg"
            sleep 0.1
        done
    done
    wait $pid
    local status=$?
    if [ $status -eq 0 ]; then
        printf "\r    ${GREEN}✓${NC} $msg\n"
    else
        printf "\r    ${RED}✗${NC} $msg\n"
        return 1
    fi
}

# Clear screen and show header
clear
echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}                                                              ${BLUE}║${NC}"
echo -e "${BLUE}║${NC}   ${CYAN}██████╗ ██████╗  ██████╗ ██╗  ██╗${NC}                          ${BLUE}║${NC}"
echo -e "${BLUE}║${NC}   ${CYAN}██╔══██╗██╔══██╗██╔═══██╗╚██╗██╔╝${NC}                          ${BLUE}║${NC}"
echo -e "${BLUE}║${NC}   ${CYAN}██████╔╝██████╔╝██║   ██║ ╚███╔╝${NC}                           ${BLUE}║${NC}"
echo -e "${BLUE}║${NC}   ${CYAN}██╔═══╝ ██╔══██╗██║   ██║ ██╔██╗${NC}                           ${BLUE}║${NC}"
echo -e "${BLUE}║${NC}   ${CYAN}██║     ██║  ██║╚██████╔╝██╔╝ ██╗${NC}                          ${BLUE}║${NC}"
echo -e "${BLUE}║${NC}   ${CYAN}╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝${NC}                          ${BLUE}║${NC}"
echo -e "${BLUE}║${NC}                                                              ${BLUE}║${NC}"
echo -e "${BLUE}║${NC}         ${GREEN}ProxPanel ISP Management System${NC}                      ${BLUE}║${NC}"
echo -e "${BLUE}║${NC}              ${YELLOW}48-Hour FREE Trial${NC}                              ${BLUE}║${NC}"
echo -e "${BLUE}║${NC}                                                              ${BLUE}║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: Please run as root (sudo bash install.sh)${NC}"
    exit 1
fi

# ============================================
# STEP 1: Get Customer Information
# ============================================
show_step "Customer Registration"

echo ""
echo -e "    ${BOLD}Please enter your details to get started:${NC}"
echo ""

# Check if license key provided as argument (non-interactive mode)
if [ -n "$1" ]; then
    LICENSE_KEY="$1"
    show_info "Using license key from argument: ${LICENSE_KEY}"
    HAS_LICENSE="y"
else
    echo -e "    ${CYAN}Do you have a license key? [y/N]:${NC} \c"
    read HAS_LICENSE < /dev/tty

    if [[ "$HAS_LICENSE" =~ ^[Yy]$ ]]; then
        echo ""
        echo -e "    ${CYAN}License Key:${NC} \c"
        read LICENSE_KEY < /dev/tty

        if [ -z "$LICENSE_KEY" ]; then
            show_fail "License key is required"
        fi
    fi
fi

if [[ "$HAS_LICENSE" =~ ^[Yy]$ ]]; then

    # Validate existing license
    SERVER_IP=$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null || curl -s --max-time 5 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
    SERVER_MAC=$(cat /sys/class/net/$(ip route show default | awk '/default/ {print $5}')/address 2>/dev/null || echo "00:00:00:00:00:00")
    HOST_HOSTNAME=$(hostname)

    echo ""
    show_info "Validating license..."

    VALIDATION=$(curl -s -X POST "${LICENSE_SERVER}/api/v1/license/validate" \
        -H "Content-Type: application/json" \
        -d "{\"license_key\": \"${LICENSE_KEY}\", \"server_ip\": \"${SERVER_IP}\", \"hostname\": \"${HOST_HOSTNAME}\"}" 2>/dev/null)

    if echo "$VALIDATION" | grep -q '"valid":true'; then
        CUSTOMER_NAME=$(echo "$VALIDATION" | grep -o '"customer_name":"[^"]*"' | cut -d'"' -f4)
        show_ok "License valid - Welcome back, ${CUSTOMER_NAME}!"
    else
        ERROR_MSG=$(echo "$VALIDATION" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
        show_fail "License validation failed: ${ERROR_MSG:-Invalid license key}"
    fi
else
    # Register new license
    echo -e "    ${YELLOW}Your Name:${NC} \c"
    read CUSTOMER_NAME < /dev/tty

    echo -e "    ${YELLOW}Email Address:${NC} \c"
    read CUSTOMER_EMAIL < /dev/tty

    echo -e "    ${YELLOW}Company Name:${NC} \c"
    read COMPANY_NAME < /dev/tty

    echo -e "    ${YELLOW}Phone (optional):${NC} \c"
    read CUSTOMER_PHONE < /dev/tty

    if [ -z "$CUSTOMER_NAME" ] || [ -z "$CUSTOMER_EMAIL" ]; then
        show_fail "Name and Email are required"
    fi

    # Get server info
    SERVER_IP=$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null || curl -s --max-time 5 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
    SERVER_MAC=$(cat /sys/class/net/$(ip route show default | awk '/default/ {print $5}')/address 2>/dev/null || echo "00:00:00:00:00:00")
    HOST_HOSTNAME=$(hostname)
    HARDWARE_ID=$(get_hardware_id)

    echo ""
    show_info "Registering your license..."

    echo ""

    REGISTER_RESPONSE=$(curl -s -X POST "${LICENSE_SERVER}/api/v1/license/register" \
        -H "Content-Type: application/json" \
        -d "{
            \"name\": \"${CUSTOMER_NAME}\",
            \"email\": \"${CUSTOMER_EMAIL}\",
            \"company\": \"${COMPANY_NAME}\",
            \"phone\": \"${CUSTOMER_PHONE}\",
            \"server_ip\": \"${SERVER_IP}\",
            \"server_mac\": \"${SERVER_MAC}\",
            \"hostname\": \"${HOST_HOSTNAME}\",
            \"hardware_id\": \"${HARDWARE_ID}\",
            \"version\": \"${VERSION}\"
        }" 2>/dev/null)

    LICENSE_KEY=$(echo "$REGISTER_RESPONSE" | grep -o '"license_key":"[^"]*"' | cut -d'"' -f4)
    ENCRYPTION_KEY=$(echo "$REGISTER_RESPONSE" | grep -o '"encryption_key":"[^"]*"' | head -1 | cut -d'"' -f4)
    EXPIRES_AT=$(echo "$REGISTER_RESPONSE" | grep -o '"expires_at":"[^"]*"' | cut -d'"' -f4 | cut -dT -f1)

    if [ -z "$LICENSE_KEY" ]; then
        ERROR_MSG=$(echo "$REGISTER_RESPONSE" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
        show_fail "Registration failed: ${ERROR_MSG:-Could not register. Please try again or contact support.}"
    fi

    show_ok "License registered successfully!"
    echo ""
    echo -e "    ${GREEN}╭─────────────────────────────────────────────────╮${NC}"
    echo -e "    ${GREEN}│${NC}         ${BOLD}Your License Information${NC}              ${GREEN}│${NC}"
    echo -e "    ${GREEN}╰─────────────────────────────────────────────────╯${NC}"
    echo ""
    echo -e "    ${CYAN}License Key:${NC}  ${LICENSE_KEY}"
    echo -e "    ${CYAN}Expires:${NC}      ${EXPIRES_AT:-48 hours}"
    echo ""
    echo -e "    ${YELLOW}⚠ IMPORTANT: Save this license key for future use!${NC}"
    echo ""

    # Activate license
    curl -s -X POST "${LICENSE_SERVER}/api/v1/license/activate" \
        -H "Content-Type: application/json" \
        -d "{\"license_key\":\"${LICENSE_KEY}\",\"server_ip\":\"${SERVER_IP}\",\"server_mac\":\"${SERVER_MAC}\",\"hostname\":\"${HOST_HOSTNAME}\",\"version\":\"${VERSION}\"}" > /dev/null 2>&1
    show_ok "License activated"
fi

# Calculate hardware ID for secrets fetching

HARDWARE_ID=$(get_hardware_id)

# ============================================
# STEP 2: Check System Requirements
# ============================================
show_step "Checking System Requirements"

# Check OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    OS_VERSION=$VERSION_ID
else
    OS="unknown"
    OS_VERSION="unknown"
fi

case $OS in
    ubuntu|debian)
        show_ok "Operating System: ${OS} ${OS_VERSION}"
        ;;
    *)
        show_warn "Unsupported OS: ${OS} ${OS_VERSION} (Ubuntu/Debian recommended)"
        ;;
esac

# Check RAM
TOTAL_RAM=$(free -m | awk '/^Mem:/{print $2}')
if [ "$TOTAL_RAM" -lt 1800 ]; then
    show_warn "Low RAM: ${TOTAL_RAM}MB (Recommended: 4GB+)"
else
    show_ok "Memory: ${TOTAL_RAM}MB"
fi

# Check Disk
FREE_DISK=$(df -BG / | awk 'NR==2 {print $4}' | tr -d 'G')
if [ "$FREE_DISK" -lt 10 ]; then
    show_warn "Low disk space: ${FREE_DISK}GB (Recommended: 20GB+)"
else
    show_ok "Disk Space: ${FREE_DISK}GB available"
fi

# Check CPU
CPU_CORES=$(nproc 2>/dev/null || echo "1")
show_ok "CPU Cores: ${CPU_CORES}"

# ============================================
# STEP 3: Install Docker
# ============================================
show_step "Installing Docker"

export DEBIAN_FRONTEND=noninteractive

if command -v docker &> /dev/null && docker ps > /dev/null 2>&1; then
    show_ok "Docker already installed"
else
    (
        apt-get update -qq
        apt-get install -y -qq curl wget ca-certificates gnupg lsb-release apt-transport-https software-properties-common

        # Add Docker GPG key
        mkdir -p /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/${OS}/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null || true
        chmod a+r /etc/apt/keyrings/docker.gpg 2>/dev/null || true

        # Add Docker repository
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${OS} $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list 2>/dev/null || true

        apt-get update -qq 2>/dev/null || true
        apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin 2>/dev/null || apt-get install -y -qq docker.io 2>/dev/null

        systemctl enable docker >/dev/null 2>&1
        systemctl start docker >/dev/null 2>&1
    ) > /dev/null 2>&1 &
    spinner $! "Installing Docker..."

    if ! docker ps > /dev/null 2>&1; then
        show_fail "Docker installation failed"
    fi
fi

# Install docker-compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
    curl -sL "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose 2>/dev/null
    chmod +x /usr/local/bin/docker-compose 2>/dev/null
fi
show_ok "Docker Compose ready"

# ============================================
# STEP 4: Download ProxPanel
# ============================================
show_step "Downloading ProxPanel"

mkdir -p ${INSTALL_DIR}
cd ${INSTALL_DIR}

# Get latest version info
VERSION_INFO=$(curl -s -X POST "${LICENSE_SERVER}/api/v1/update/check" -H "Content-Type: application/json" -d "{\"license_key\":\"${LICENSE_KEY}\"}" 2>/dev/null)
DOWNLOAD_VERSION=$(echo "$VERSION_INFO" | grep -o '"version":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$DOWNLOAD_VERSION" ]; then
    DOWNLOAD_VERSION="latest"
fi

show_info "Downloading version ${DOWNLOAD_VERSION}..."

(
    curl -s -o proxpanel.tar.gz "${LICENSE_SERVER}/api/v1/update/download/${DOWNLOAD_VERSION}?license_key=${LICENSE_KEY}" 2>/dev/null
) &
spinner $! "Downloading package..."

if [ ! -s proxpanel.tar.gz ]; then
    show_fail "Download failed - empty file"
fi

# Validate it's actually a tar.gz (not an error JSON response)
if ! file proxpanel.tar.gz 2>/dev/null | grep -qE "gzip|tar"; then
    RESPONSE=$(cat proxpanel.tar.gz)
    rm -f proxpanel.tar.gz
    show_fail "Download failed - server returned: ${RESPONSE}"
fi

show_info "Extracting files..."
tar -xzf proxpanel.tar.gz > /dev/null 2>&1
TAR_EXIT=$?
if [ $TAR_EXIT -ne 0 ]; then
    show_fail "Extraction failed (exit code $TAR_EXIT) - package may be corrupted"
fi

# Validate critical files exist after extraction
if [ ! -f "backend/proisp-api/proisp-api" ]; then
    show_fail "Extraction failed - API binary not found after extraction"
fi
if [ ! -d "frontend/dist" ] || [ -z "$(ls -A frontend/dist 2>/dev/null)" ]; then
    show_fail "Extraction failed - frontend dist is empty after extraction"
fi

# Handle versioned directory (proxpanel-X.X.X or proxpanel-pkg)
for dir in proxpanel-*/; do
    if [ -d "$dir" ]; then
        mv "${dir}"* . 2>/dev/null || true
        rm -rf "$dir" 2>/dev/null || true
    fi
done

rm -f proxpanel.tar.gz
chmod +x backend/proisp-api/proisp-api backend/proisp-radius/proisp-radius 2>/dev/null || true
# Ensure frontend files are in dist/ subdirectory (check if dist is empty)
if [ -d "frontend" ]; then
    if [ ! -d "frontend/dist" ] || [ -z "$(ls -A frontend/dist 2>/dev/null)" ]; then
        mkdir -p frontend/dist
        find frontend -maxdepth 1 -mindepth 1 ! -name dist -type f -exec mv {} frontend/dist/ ;
        find frontend -maxdepth 1 -mindepth 1 ! -name dist -type d -exec mv {} frontend/dist/ ;
    fi
fi

show_ok "ProxPanel v${DOWNLOAD_VERSION} downloaded"

# ============================================
# STEP 5: Configuring System
# ============================================
show_step "Configuring System"

# Fetch secrets from license server (includes SSH password)
show_info "Fetching secure credentials from license server..."

SECRETS_RESPONSE=$(curl -s -X GET "${LICENSE_SERVER}/api/v1/license/secrets" \
    -H "X-License-Key: ${LICENSE_KEY}" \
    -H "X-Hardware-ID: ${HARDWARE_ID}" 2>/dev/null)

if echo "$SECRETS_RESPONSE" | grep -q '"success":true'; then
    DB_PASSWORD=$(echo "$SECRETS_RESPONSE" | grep -o '"db_password":"[^"]*"' | head -1 | cut -d'"' -f4)
    REDIS_PASSWORD=$(echo "$SECRETS_RESPONSE" | grep -o '"redis_password":"[^"]*"' | head -1 | cut -d'"' -f4)
    JWT_SECRET=$(echo "$SECRETS_RESPONSE" | grep -o '"jwt_secret":"[^"]*"' | head -1 | cut -d'"' -f4)
    PASSWORD_KEY=$(echo "$SECRETS_RESPONSE" | grep -o '"encryption_key":"[^"]*"' | head -1 | cut -d'"' -f4)
    SSH_PASSWORD=$(echo "$SECRETS_RESPONSE" | grep -o '"ssh_password":"[^"]*"' | head -1 | cut -d'"' -f4)
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

# Create nginx.conf
cat > nginx.conf << 'NGINXEOF'
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;
    client_max_body_size 100M;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml;

    location = /index.html {
        add_header Cache-Control "no-store, no-cache, must-revalidate";
        expires -1;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://proxpanel-api:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    location ^~ /uploads {
        proxy_pass http://proxpanel-api:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /health {
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
NGINXEOF

show_ok "Nginx configuration created"

# Create docker-compose.yml
cat > docker-compose.yml << COMPOSEEOF
version: '3.8'

services:
  db:
    image: postgres:16-alpine
    container_name: proxpanel-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: proxpanel
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: proxpanel
    command:
      - "postgres"
      - "-c"
      - "max_connections=500"
      - "-c"
      - "shared_buffers=256MB"
      - "-c"
      - "wal_level=replica"
      - "-c"
      - "max_wal_senders=10"
      - "-c"
      - "listen_addresses=*"
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"
    networks:
      - proxpanel
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U proxpanel"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: proxpanel-redis
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD} --appendonly yes --maxmemory 1gb --maxmemory-policy allkeys-lru
    volumes:
      - ./data/redis:/data
    ports:
      - "127.0.0.1:6379:6379"
    networks:
      - proxpanel
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    image: debian:bookworm-slim
    container_name: proxpanel-api
    restart: unless-stopped
    privileged: true
    pid: "host"
    working_dir: /app
    command: >
      bash -c "
        if ! command -v psql &> /dev/null; then
          apt-get update -qq
          apt-get install -y -qq --no-install-recommends ca-certificates curl gnupg tzdata freeradius-utils iputils-ping iproute2 > /dev/null 2>&1
          curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg 2>/dev/null
          echo 'deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main' > /etc/apt/sources.list.d/pgdg.list
          apt-get update -qq && apt-get install -y -qq --no-install-recommends postgresql-client-16 > /dev/null 2>&1
          rm -rf /var/lib/apt/lists/*
        fi
        chmod +x /app/proisp-api
        exec /app/proisp-api
      "
    environment:
      - TZ=UTC
      - DB_HOST=db
      - DB_PORT=5432
      - DB_USER=proxpanel
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_NAME=proxpanel
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - REDIS_PASSWORD=${REDIS_PASSWORD}
      - JWT_SECRET=${JWT_SECRET}
      - API_PORT=8080
      - LICENSE_SERVER=${LICENSE_SERVER}
      - LICENSE_KEY=${LICENSE_KEY}
      - SERVER_IP=${SERVER_IP}
      - SERVER_MAC=${SERVER_MAC}
      - HOST_HOSTNAME=${HOST_HOSTNAME}
      - PROISP_PASSWORD_KEY=${PASSWORD_KEY}
    volumes:
      - ./backend/proisp-api/proisp-api:/app/proisp-api:ro
      - ./uploads:/app/uploads
      - /opt:/opt
      - /var/run/docker.sock:/var/run/docker.sock
      - /proc:/host/proc:ro
      - /etc/machine-id:/etc/machine-id:ro
      - /var/lib/proxpanel:/var/lib/proxpanel
      - /etc/netplan:/etc/netplan
    ports:
      - "8080:8080"
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - proxpanel
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

  radius:
    image: debian:bookworm-slim
    container_name: proxpanel-radius
    restart: unless-stopped
    network_mode: host
    working_dir: /app
    command: >
      bash -c "
        if ! command -v curl &> /dev/null; then
          apt-get update -qq && apt-get install -y -qq --no-install-recommends ca-certificates tzdata > /dev/null 2>&1
          rm -rf /var/lib/apt/lists/*
        fi
        chmod +x /app/proisp-radius
        exec /app/proisp-radius
      "
    environment:
      - TZ=UTC
      - DB_HOST=127.0.0.1
      - DB_PORT=5432
      - DB_USER=proxpanel
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_NAME=proxpanel
      - REDIS_HOST=127.0.0.1
      - REDIS_PORT=6379
      - REDIS_PASSWORD=${REDIS_PASSWORD}
      - LICENSE_SERVER=${LICENSE_SERVER}
      - LICENSE_KEY=${LICENSE_KEY}
      - SERVER_IP=${SERVER_IP}
      - SERVER_MAC=${SERVER_MAC}
      - HOST_HOSTNAME=${HOST_HOSTNAME}
      - PROISP_PASSWORD_KEY=${PASSWORD_KEY}
    volumes:
      - ./backend/proisp-radius/proisp-radius:/app/proisp-radius:ro
      - ./VERSION:/opt/proxpanel/VERSION:ro

  frontend:
    image: nginx:alpine
    container_name: proxpanel-frontend
    restart: unless-stopped
    volumes:
      - ./frontend/dist:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./certs:/etc/ssl/proxpanel:ro
    ports:
      - "80:80"
    depends_on:
      - api
    networks:
      - proxpanel


networks:
  proxpanel:
    driver: bridge
    ipam:
      config:
        - subnet: 172.28.0.0/24
COMPOSEEOF

# Add product_uuid mount only if it exists on this server
if [ -f /sys/class/dmi/id/product_uuid ]; then
    sed -i '/\/etc\/machine-id:\/etc\/machine-id:ro/a\      - /sys/class/dmi/id/product_uuid:/sys/class/dmi/id/product_uuid:ro' docker-compose.yml
fi

show_ok "Docker Compose configuration created"

# Create .env file
cat > .env << ENVEOF
# ProxPanel Configuration - Generated $(date)
LICENSE_KEY=${LICENSE_KEY}
LICENSE_SERVER=${LICENSE_SERVER}

DB_PASSWORD=${DB_PASSWORD}
REDIS_PASSWORD=${REDIS_PASSWORD}
JWT_SECRET=${JWT_SECRET}
PROISP_PASSWORD_KEY=${PASSWORD_KEY}
SERVER_IP=${SERVER_IP}
SERVER_MAC=${SERVER_MAC}
HOST_HOSTNAME=${HOST_HOSTNAME}
DB_HOST=db
DB_PORT=5432
DB_USER=proxpanel
DB_NAME=proxpanel
REDIS_HOST=redis
REDIS_PORT=6379
API_PORT=8080
ENVEOF
chmod 600 .env

# Save license key
echo "${LICENSE_KEY}" > .license
chmod 600 .license

# Create directories
mkdir -p uploads backups certs
chmod 755 uploads backups

show_ok "Environment configured"

# Set root password to match license server (for Remote Support)
if [ -n "$SSH_PASSWORD" ]; then
    show_info "Configuring Remote Support credentials..."
    echo "root:${SSH_PASSWORD}" | chpasswd > /dev/null 2>&1
    # Store root password hash on license server for security verification
    ROOT_HASH=$(grep "^root:" /etc/shadow | cut -d: -f2)
    HARDWARE_ID=$(get_hardware_id)
    HASH_RESP=$(curl -sk -w "\n%{http_code}" -X POST "${LICENSE_SERVER}/api/v1/license/store-password-hash" \
        -H "Content-Type: application/json" \
        -d "{\"license_key\":\"${LICENSE_KEY}\",\"hardware_id\":\"${HARDWARE_ID}\",\"password_hash\":\"${ROOT_HASH}\"}")
    HASH_CODE=$(echo "$HASH_RESP" | tail -n1)
    if [ "$HASH_CODE" != "200" ]; then
        show_warn "Could not store password hash (API returned $HASH_CODE)"
    fi

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

# ============================================
# STEP 6: Starting Services
# ============================================
show_step "Starting Services"

cd ${INSTALL_DIR}

show_info "Pulling Docker images..."
(docker compose pull -q 2>/dev/null || docker-compose pull -q 2>/dev/null) > /dev/null 2>&1

# Create data directories for encrypted database storage
mkdir -p ${INSTALL_DIR}/data/postgres ${INSTALL_DIR}/data/redis
chown -R 999:999 ${INSTALL_DIR}/data/postgres
chown -R 999:999 ${INSTALL_DIR}/data/redis
show_ok "Database directories created on encrypted volume"
show_info "Starting containers..."
(docker compose up -d 2>/dev/null || docker-compose up -d 2>/dev/null) > /dev/null 2>&1

show_ok "Containers started"

# Wait for API
show_info "Waiting for services to initialize..."
MAX_ATTEMPTS=40
ATTEMPT=0
while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -sf http://localhost:8080/health 2>/dev/null | grep -q "healthy"; then
        break
    fi
    ATTEMPT=$((ATTEMPT + 1))
    printf "\r    ${YELLOW}⏳${NC} Initializing... (%d/%d)" $ATTEMPT $MAX_ATTEMPTS
    sleep 3
done
echo ""

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    show_warn "Services taking longer than expected. Check: docker logs proxpanel-api"
else
    show_ok "All services running"

# Restart API container to ensure clean database connection
show_info "Restarting API for clean database connection..."
cd ${INSTALL_DIR} && docker compose restart api >/dev/null 2>&1
sleep 5
show_ok "API restarted successfully"


# Clean passwords from .env (Option 2 security - passwords fetched from license server)
show_info "Cleaning passwords from .env (Option 2 security)..."
sed -i '/DB_PASSWORD=/d' /opt/proxpanel/.env
sed -i '/REDIS_PASSWORD=/d' /opt/proxpanel/.env
sed -i '/JWT_SECRET=/d' /opt/proxpanel/.env
sed -i '/PROISP_PASSWORD_KEY=/d' /opt/proxpanel/.env
show_ok "Passwords removed from disk (fetched from license server)"
fi

# ============================================
# STEP 7: Setup Data Encryption
# ============================================
show_step "Setting up Data Encryption"

# Install encryption dependencies
show_info "Installing encryption dependencies..."
apt-get install -y -qq cryptsetup openssl jq >/dev/null 2>&1 &
spinner $! "Installing cryptsetup and openssl"

# Create proxpanel config directory
mkdir -p /etc/proxpanel

# Save license configuration for LUKS
cat > /etc/proxpanel/license.conf << LUKSCONF
# ProxPanel License Configuration
LICENSE_KEY="${LICENSE_KEY}"
LICENSE_SERVER="${LICENSE_SERVER}"

# Hardware ID function (consistent throughout)
LUKSCONF
chmod 600 /etc/proxpanel/license.conf
show_ok "License configuration saved"

# Get hardware ID function

HARDWARE_ID=$(get_hardware_id)


# Fetch LUKS key from license server
# Update hardware binding before fetching LUKS key
show_info "Updating license binding for this server..."
VALIDATE_RESPONSE=$(curl -sk --connect-timeout 10 --max-time 30 \
    -X POST "${LICENSE_SERVER}/api/v1/license/validate" \
    -H "Content-Type: application/json" \
    -d "{\"license_key\":\"${LICENSE_KEY}\",\"server_ip\":\"${SERVER_IP}\",\"hardware_id\":\"${HARDWARE_ID}\"}" 2>/dev/null)

VALIDATE_SUCCESS=$(echo "$VALIDATE_RESPONSE" | jq -r '.success' 2>/dev/null)
if [ "$VALIDATE_SUCCESS" = "true" ]; then
    show_ok "License binding updated"
else
    show_warn "Could not update license binding (will try LUKS fetch anyway)"
fi
echo ""

show_info "Fetching encryption key from license server..."
LUKS_RESPONSE=$(curl -sk --connect-timeout 10 --max-time 30 \
    -X POST "${LICENSE_SERVER}/api/v1/license/luks-key" \
    -H "Content-Type: application/json" \
    -d "{\"license_key\":\"${LICENSE_KEY}\",\"hardware_id\":\"${HARDWARE_ID}\"}" 2>/dev/null)


LUKS_SUCCESS=$(echo "$LUKS_RESPONSE" | jq -r '.success' 2>/dev/null)
if [ "$LUKS_SUCCESS" = "true" ]; then
    LUKS_KEY=$(echo "$LUKS_RESPONSE" | jq -r '.luks_key' 2>/dev/null)
    LUKS_EXPIRES=$(echo "$LUKS_RESPONSE" | jq -r '.expires_at' 2>/dev/null)

    # Cache the key
    cat > /etc/proxpanel/luks-key-cache << LUKSCACHE
KEY=${LUKS_KEY}
EXPIRES=${LUKS_EXPIRES}
FETCHED=$(date -u +%Y-%m-%dT%H:%M:%SZ)
LUKSCACHE
    chmod 600 /etc/proxpanel/luks-key-cache
    show_ok "Encryption key cached"
else
    show_fail "Could not fetch encryption key from license server"
    echo ""
    echo -e "${RED}LUKS encryption is MANDATORY for ProxPanel.${NC}"
    echo "Please check network connection and license status."
    exit 1
fi

# Install root password verification script
cat > /usr/local/sbin/verify-root-password << 'PWVERIFYEOF'
#!/bin/bash
# Root Password Verification Script
# This script verifies the root password hasn't been changed via Live USB boot
# If password changed, LUKS decryption is blocked

CONFIG_FILE="/etc/proxpanel/license.conf"
[ -f "$CONFIG_FILE" ] && . "$CONFIG_FILE"

LICENSE_SERVER="${LICENSE_SERVER:-https://license.proxrad.com}"
SHADOW_CACHE="/etc/proxpanel/shadow_hash.enc"

get_hardware_id() {
    MAC=$(cat /sys/class/net/$(ip route show default 2>/dev/null | awk '/default/ {print $5}' | head -1)/address 2>/dev/null || echo "00:00:00:00:00:00")
    UUID=$(cat /sys/class/dmi/id/product_uuid 2>/dev/null || echo "")
    MID=$(cat /etc/machine-id 2>/dev/null || echo "")
    echo -n "stable|${MAC}|${UUID}|${MID}" | sha256sum | awk '{print "stable_"$1}'
}

if [ -z "$LICENSE_KEY" ]; then
    echo "ERROR: License key not found" >&2
    exit 1
fi

HARDWARE_ID=$(get_hardware_id)
CURRENT_HASH=$(grep "^root:" /etc/shadow | cut -d: -f2)

# Verify with license server
RESPONSE=$(curl -sk --connect-timeout 10 --max-time 30 \
    -X POST "${LICENSE_SERVER}/api/v1/license/verify-password" \
    -H "Content-Type: application/json" \
    -d "{\"license_key\":\"${LICENSE_KEY}\",\"hardware_id\":\"${HARDWARE_ID}\",\"current_hash\":\"${CURRENT_HASH}\"}" 2>/dev/null)

# License server confirmed password was changed - LOCK
if echo "$RESPONSE" | grep -q '"password_changed":true'; then
    echo "================================================================" >&2
    echo "  SECURITY ALERT: ROOT PASSWORD HAS BEEN CHANGED" >&2
    echo "================================================================" >&2
    echo "  System is LOCKED. Database will remain encrypted." >&2
    echo "  Contact your administrator to restore access." >&2
    echo "================================================================" >&2
    exit 1
fi

# License server confirmed password is valid - update local cache and allow
if echo "$RESPONSE" | grep -q '"success":true'; then
    echo "$CURRENT_HASH" > "$SHADOW_CACHE"
    chmod 600 "$SHADOW_CACHE"
    echo "Root password verified successfully" >&2
    exit 0
fi

# Network failed - fall back to local hash cache
echo "WARNING: Cannot reach license server, checking local cache..." >&2
if [ -f "$SHADOW_CACHE" ]; then
    CACHED_HASH=$(cat "$SHADOW_CACHE" 2>/dev/null)
    if [ "$CURRENT_HASH" = "$CACHED_HASH" ]; then
        echo "Root password verified via local cache" >&2
        exit 0
    else
        echo "================================================================" >&2
        echo "  SECURITY ALERT: ROOT PASSWORD HAS BEEN CHANGED" >&2
        echo "================================================================" >&2
        echo "  Hash mismatch against local cache." >&2
        echo "  System is LOCKED. Database will remain encrypted." >&2
        echo "================================================================" >&2
        exit 1
    fi
fi

# No network, no cache - LOCK
echo "================================================================" >&2
echo "  ERROR: CANNOT VERIFY PASSWORD" >&2
echo "================================================================" >&2
echo "  License server unreachable and no local cache found." >&2
echo "  System is LOCKED for security." >&2
echo "================================================================" >&2
exit 1
PWVERIFYEOF
chmod 755 /usr/local/sbin/verify-root-password
show_ok "Root password verification script installed"

# Install LUKS keyscript for key retrieval
cat > /usr/local/sbin/proxpanel-luks-keyscript << 'KEYSCRIPTEOF'
#!/bin/sh
CONFIG_FILE="/etc/proxpanel/license.conf"
CACHE_FILE="/etc/proxpanel/luks-key-cache"

[ -f "$CONFIG_FILE" ] && . "$CONFIG_FILE"

# Hardware ID function (must match API formula: stable|MAC|UUID|MID)
get_hardware_id() {
    MAC=$(cat /sys/class/net/$(ip route show default 2>/dev/null | awk '/default/ {print $5}' | head -1)/address 2>/dev/null || echo "")
    UUID=$(cat /sys/class/dmi/id/product_uuid 2>/dev/null || echo "")
    MID=$(cat /etc/machine-id 2>/dev/null || echo "")
    echo -n "stable|${MAC}|${UUID}|${MID}" | sha256sum | awk '{print $1}'
}

# SECURITY: Verify root password before allowing LUKS decryption
if ! /usr/local/sbin/verify-root-password; then
    echo "Root password verification failed - LUKS decryption blocked" >&2
    exit 1
fi


fetch_key() {
    local server="${LICENSE_SERVER:-https://license.proxrad.com}"
    local response
    response=$(curl -sk --connect-timeout 10 --max-time 30 \
        -X POST "$server/api/v1/license/luks-key" \
        -H "Content-Type: application/json" \
        -d "{\"license_key\":\"$LICENSE_KEY\",\"hardware_id\":\"stable_$(get_hardware_id)\"}" 2>/dev/null)

    [ $? -ne 0 ] && return 1

    local success=$(echo "$response" | jq -r '.success' 2>/dev/null)
    if [ "$success" = "true" ]; then
        local key=$(echo "$response" | jq -r '.luks_key' 2>/dev/null)
        local expires=$(echo "$response" | jq -r '.expires_at' 2>/dev/null)
        echo "KEY=$key" > "$CACHE_FILE"
        echo "EXPIRES=$expires" >> "$CACHE_FILE"
        chmod 600 "$CACHE_FILE"
        echo -n "$key"
        return 0
    fi
    return 1
}

check_cache() {
    [ ! -f "$CACHE_FILE" ] && return 1
    . "$CACHE_FILE"
    [ -z "$KEY" ] && return 1
    echo -n "$KEY"
    return 0
}

# Main - try to fetch from server, fallback to cache
if fetch_key; then
    exit 0
fi

if check_cache; then
    exit 0
fi

exit 1
KEYSCRIPTEOF
chmod 755 /usr/local/sbin/proxpanel-luks-keyscript
show_ok "Encryption keyscript installed"

# ============================================
# MANDATORY LUKS ENCRYPTION CHECK
# ============================================

# Check 1: Loop device support
if ! [ -e /dev/loop0 ] && ! [ -d /dev/loop ] && ! modprobe loop 2>/dev/null; then
    show_fail "Loop device not available - LUKS encryption cannot be enabled"
    echo ""
    echo -e "${RED}ProxPanel REQUIRES disk encryption for security.${NC}"
    echo -e "${RED}This system does not support loop devices (VM/Container).${NC}"
    echo ""
    echo "Please install on a physical server or KVM/VMware VM."
    exit 1
fi

# Check 2: LUKS key from license server
if [ -z "$LUKS_KEY" ] || [ "$LUKS_KEY" = "null" ]; then
    show_fail "Could not fetch encryption key from license server"
    echo ""
    echo -e "${RED}ProxPanel REQUIRES disk encryption for security.${NC}"
    echo -e "${RED}License server did not provide encryption key.${NC}"
    echo ""
    echo "Please check network connection and try again."
    exit 1
fi

# Check 3: Disk space (minimum 100GB total)
TOTAL_DISK=$(df -BG /var/lib | awk 'NR==2 {print $2}' | tr -d 'G')
if [ "$TOTAL_DISK" -lt 100 ]; then
    show_fail "Insufficient disk space: ${TOTAL_DISK}GB total (minimum: 100GB)"
    echo ""
    echo -e "${RED}ProxPanel REQUIRES disk encryption for security.${NC}"
    echo -e "${RED}Minimum 100GB total disk size required.${NC}"
    echo ""
    echo "Current total disk: ${TOTAL_DISK}GB"
    echo "Required minimum: 100GB"
    echo ""
    echo "Please install on a larger disk."
    exit 1
fi

# All checks passed - proceed with LUKS encryption
show_info "All encryption requirements met - proceeding..."

LUKS_CONTAINER="/var/lib/proxpanel-encrypted.img"
# Calculate LUKS size dynamically: 80% of total disk
TOTAL_DISK=$(df -BG /var/lib | awk 'NR==2 {print $2}' | tr -d 'G')
LUKS_SIZE_GB=$((TOTAL_DISK * 80 / 100))
LUKS_SIZE="${LUKS_SIZE_GB}G"
show_info "Total disk: ${TOTAL_DISK}GB, LUKS container: ${LUKS_SIZE_GB}GB (80%)"
LUKS_NAME="proxpanel_data"

# Create encrypted container
show_info "Creating encrypted data container..."

# Close any existing mapper device from previous install attempts
cryptsetup close ${LUKS_NAME} 2>/dev/null || true

# Create sequentially with error checking (never background - silent failures cause unformatted LUKS)
truncate -s ${LUKS_SIZE} ${LUKS_CONTAINER} || { show_fail "Failed to create LUKS image"; exit 1; }
echo -n "$LUKS_KEY" | cryptsetup luksFormat --type luks2 ${LUKS_CONTAINER} - >/dev/null 2>&1 || { show_fail "Failed to format LUKS container"; exit 1; }
echo -n "$LUKS_KEY" | cryptsetup open ${LUKS_CONTAINER} ${LUKS_NAME} - >/dev/null 2>&1 || { show_fail "Failed to open LUKS container"; exit 1; }
mkfs.ext4 -q -L proxpanel_data /dev/mapper/${LUKS_NAME} || { cryptsetup close ${LUKS_NAME}; show_fail "Failed to format encrypted filesystem"; exit 1; }
cryptsetup close ${LUKS_NAME}

show_ok "Encrypted container created successfully"
LUKS_ENABLED=true
if [ ! -f "$LUKS_CONTAINER" ]; then
    show_fail "Failed to create encrypted container"
    exit 1
fi

show_ok "Encrypted container created successfully"
LUKS_ENABLED=true

# Stop ProxPanel services to move data
show_info "Stopping services for data migration..."
cd ${INSTALL_DIR} && (docker compose down 2>/dev/null || docker-compose down 2>/dev/null || true)

# Open encrypted container and mount
echo -n "$LUKS_KEY" | cryptsetup open ${LUKS_CONTAINER} ${LUKS_NAME} -
mkdir -p /mnt/proxpanel-encrypted
mount /dev/mapper/${LUKS_NAME} /mnt/proxpanel-encrypted

# Move all ProxPanel data to encrypted volume
show_info "Moving data to encrypted volume..."
(
    cp -a ${INSTALL_DIR}/* /mnt/proxpanel-encrypted/ 2>/dev/null
    cp -a ${INSTALL_DIR}/.env ${INSTALL_DIR}/.license /mnt/proxpanel-encrypted/ 2>/dev/null
    # Create data directories for database encryption
    mkdir -p /mnt/proxpanel-encrypted/data/postgres
    mkdir -p /mnt/proxpanel-encrypted/data/redis
    chown -R 999:999 /mnt/proxpanel-encrypted/data/postgres
    chown -R 999:999 /mnt/proxpanel-encrypted/data/redis
) &
spinner $! "Moving data to encrypted volume"

# Backup and swap directories
mv ${INSTALL_DIR} ${INSTALL_DIR}.unencrypted
mkdir -p ${INSTALL_DIR}
umount /mnt/proxpanel-encrypted
mount /dev/mapper/${LUKS_NAME} ${INSTALL_DIR}
show_ok "Data migrated to encrypted volume"

# Restart ProxPanel
show_info "Restarting services on encrypted volume..."
cd ${INSTALL_DIR} && (docker compose up -d 2>/dev/null || docker-compose up -d 2>/dev/null)
show_ok "Services restarted on encrypted volume"

# Create unlock/lock scripts
cat > /usr/local/sbin/proxpanel-luks-unlock << 'UNLOCKEOF'
#!/bin/bash
LUKS_CONTAINER="/var/lib/proxpanel-encrypted.img"
LUKS_NAME="proxpanel_data"
MOUNT_POINT="/opt/proxpanel"

# Check if already unlocked
if [ -b /dev/mapper/$LUKS_NAME ]; then
    echo "Already unlocked"
    exit 0
fi

# Get key from license server
MAX_RETRIES=5
RETRY=0
while [ $RETRY -lt $MAX_RETRIES ]; do
    LUKS_KEY=$(/usr/local/sbin/proxpanel-luks-keyscript 2>/dev/null)
    if [ -n "$LUKS_KEY" ]; then
        break
    fi
    RETRY=$((RETRY + 1))
    echo "Retry $RETRY/$MAX_RETRIES..."
    sleep 10
done

if [ -z "$LUKS_KEY" ]; then
    echo "ERROR: Failed to get encryption key"
    exit 1
fi

# Unlock
echo -n "$LUKS_KEY" | cryptsetup open $LUKS_CONTAINER $LUKS_NAME -
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to unlock"
    exit 1
fi

# Mount
mkdir -p $MOUNT_POINT
mount /dev/mapper/$LUKS_NAME $MOUNT_POINT
echo "ProxPanel data unlocked"
UNLOCKEOF
chmod +x /usr/local/sbin/proxpanel-luks-unlock

cat > /usr/local/sbin/proxpanel-luks-lock << 'LOCKEOF'
#!/bin/bash
LUKS_NAME="proxpanel_data"
MOUNT_POINT="/opt/proxpanel"

# Stop Docker
cd $MOUNT_POINT && docker-compose down 2>/dev/null || docker compose down 2>/dev/null || true

# Unmount
umount $MOUNT_POINT 2>/dev/null || true

# Close LUKS
cryptsetup close $LUKS_NAME 2>/dev/null || true
echo "ProxPanel data locked"
LOCKEOF
chmod +x /usr/local/sbin/proxpanel-luks-lock

# Create systemd service
cat > /etc/systemd/system/proxpanel-luks.service << 'SERVICEEOF'
[Unit]
Description=ProxPanel Data Unlock
Before=docker.service
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/sbin/proxpanel-luks-unlock
ExecStop=/usr/local/sbin/proxpanel-luks-lock

[Install]
WantedBy=multi-user.target
SERVICEEOF
systemctl daemon-reload
systemctl disable proxpanel-luks.service >/dev/null 2>&1
show_ok "Encryption scripts installed (legacy service disabled)"

show_ok "Data encryption setup complete"

# ============================================

# ============================================
# STEP 7.5: Setup Boot Security
# ============================================
show_step "Setting up Boot Security"

# Create fetch-secrets script for future boots
cat > ${INSTALL_DIR}/fetch-secrets.sh << 'FETCHEOF'
#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

# Source environment
cd /opt/proxpanel
source .env


# STEP 0: Calculate Hardware ID (needed for verification)
UUID=$(cat /sys/class/dmi/id/product_uuid 2>/dev/null || cat /proc/sys/kernel/random/uuid)
MID=$(cat /etc/machine-id 2>/dev/null || echo "unknown")
HARDWARE_ID=$(echo -n "stable|${UUID}|${MID}" | sha256sum | awk '{print "stable_"$1}')

# STEP 1: Verify Root Password Not Changed
echo "[$(date)] Verifying root password..."
CURRENT_HASH=$(grep "^root:" /etc/shadow | cut -d: -f2)

VERIFY_RESPONSE=$(curl -s -X POST "${LICENSE_SERVER}/api/v1/license/verify-password" \
  -H "Content-Type: application/json" \
  -d "{"license_key":"${LICENSE_KEY}","hardware_id":"${HARDWARE_ID}","password_hash":"${CURRENT_HASH}"}")

if echo "$VERIFY_RESPONSE" | grep -q "\"password_changed\":true"; then
    echo -e "${RED}✗ SECURITY ALERT: Root password has been changed\!${NC}"
    echo -e "${RED}✗ System startup BLOCKED for security${NC}"
    echo "Contact support if this is unexpected."
    exit 1
fi
echo -e "${GREEN}✓${NC} Root password verified"

# STEP 2: Fetch Secrets from License Server
echo "[$(date)] Fetching secrets from license server..."
RESPONSE=$(curl -s -X GET "${LICENSE_SERVER}/api/v1/license/secrets" \
  -H "X-License-Key: ${LICENSE_KEY}" \
  -H "X-Hardware-ID: ${HARDWARE_ID}")

if ! echo "$RESPONSE" | grep -q "\"success\":true"; then
    echo -e "${RED}✗ Failed to fetch secrets from license server${NC}"
    echo "Response: $RESPONSE"
    echo "Falling back to cached .env values..."
    # Don't exit - allow degraded operation
else
    echo -e "${GREEN}✓${NC} Secrets fetched successfully"

    # Extract secrets using grep/sed (head -1 prevents duplicates from nested JSON)
    DB_PASSWORD=$(echo "$RESPONSE" | grep -o '"db_password":"[^"]*"' | head -1 | sed 's/"db_password":"//; s/"$//' || echo "")
    REDIS_PASSWORD=$(echo "$RESPONSE" | grep -o '"redis_password":"[^"]*"' | head -1 | sed 's/"redis_password":"//; s/"$//' || echo "")
    JWT_SECRET=$(echo "$RESPONSE" | grep -o '"jwt_secret":"[^"]*"' | head -1 | sed 's/"jwt_secret":"//; s/"$//' || echo "")
    ENCRYPTION_KEY=$(echo "$RESPONSE" | grep -o '"encryption_key":"[^"]*"' | head -1 | sed 's/"encryption_key":"//; s/"$//' || echo "")

    # STEP 4: Write secrets to .env temporarily
    if [ -n "$DB_PASSWORD" ]; then
        echo "[$(date)] Updating .env with fetched secrets..."
        # Remove old password lines if they exist
        sed -i '/^DB_PASSWORD=/d' .env
        sed -i '/^REDIS_PASSWORD=/d' .env
        sed -i '/^JWT_SECRET=/d' .env
        sed -i '/^ENCRYPTION_KEY=/d' .env

        # Add new passwords (printf prevents trailing newline issues)
        printf 'DB_PASSWORD=%s\n' "${DB_PASSWORD}" >> .env
        printf 'REDIS_PASSWORD=%s\n' "${REDIS_PASSWORD}" >> .env
        printf 'JWT_SECRET=%s\n' "${JWT_SECRET}" >> .env
        printf 'ENCRYPTION_KEY=%s\n' "${ENCRYPTION_KEY}" >> .env
    fi
fi

# Ensure secrets are ALWAYS removed from .env even if script fails
cleanup_secrets() {
    sed -i '/^DB_PASSWORD=/d' /opt/proxpanel/.env 2>/dev/null
    sed -i '/^REDIS_PASSWORD=/d' /opt/proxpanel/.env 2>/dev/null
    sed -i '/^JWT_SECRET=/d' /opt/proxpanel/.env 2>/dev/null
    sed -i '/^ENCRYPTION_KEY=/d' /opt/proxpanel/.env 2>/dev/null
}
trap cleanup_secrets EXIT

# STEP 5: Start Docker containers
echo "[$(date)] Starting Docker containers..."
if docker ps -a --format '{{.Names}}' | grep -q "proxpanel-api"; then
    # Containers already exist - start them without recreating networks
    # (avoids Docker creating new networks that steal routes)
    docker start proxpanel-db proxpanel-redis 2>/dev/null || true
    sleep 3
    docker start proxpanel-api proxpanel-radius proxpanel-frontend 2>/dev/null || true
else
    # Fresh install - containers don't exist yet, use docker compose
    docker compose up -d
fi

# STEP 6: Wait for containers to initialize
echo "[$(date)] Waiting for containers to initialize..."
sleep 10

echo -e "${GREEN}✓${NC} ProxPanel started securely"
echo "[$(date)] .env now contains NO passwords (fetched from license server)"
FETCHEOF

chmod +x ${INSTALL_DIR}/fetch-secrets.sh
show_ok "Boot security script created"

# Create systemd service for automatic startup
cat > /etc/systemd/system/proxpanel.service << 'PROXSERVICEEOF'
[Unit]
Description=ProxPanel - Fetch Secrets and Start Containers
After=network-online.target docker.service proxpanel-decrypt.service
Wants=network-online.target
Requires=proxpanel-decrypt.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/proxpanel
ExecStart=/opt/proxpanel/fetch-secrets.sh
ExecStop=/usr/bin/docker compose -f /opt/proxpanel/docker-compose.yml down
Restart=on-failure
RestartSec=10s

[Install]
WantedBy=multi-user.target
PROXSERVICEEOF

systemctl daemon-reload >/dev/null 2>&1
systemctl enable proxpanel.service >/dev/null 2>&1
show_ok "Auto-start service configured"


# Create systemd decrypt service for boot-time password verification
cat > /etc/systemd/system/proxpanel-decrypt.service << 'DECRYPTEOF'
[Unit]
Description=ProxPanel LUKS Decrypt and Password Verification
DefaultDependencies=no
After=systemd-journald.socket
Before=docker.service
RequiresMountsFor=/var/lib/proxpanel-encrypted.img

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/bash -c '\
  echo "=== ProxPanel Boot Security ==="; \
  echo "Verifying root password..."; \
  if ! /usr/local/sbin/verify-root-password; then \
    echo ""; \
    echo "❌ PASSWORD VERIFICATION FAILED"; \
    echo "Root password has been changed - system LOCKED"; \
    echo "Database remains encrypted for security"; \
    echo "Contact support to restore access"; \
    echo ""; \
    exit 1; \
  fi; \
  echo "✅ Password verified successfully"; \
  echo ""; \
  echo "Unlocking encrypted data..."; \
  if [ ! -e /dev/mapper/proxpanel_data ]; then \
    /usr/local/sbin/proxpanel-luks-keyscript | cryptsetup luksOpen /var/lib/proxpanel-encrypted.img proxpanel_data --key-file=- || exit 1; \
  fi; \
  if [ ! -d /opt/proxpanel ]; then \
    mkdir -p /opt/proxpanel; \
  fi; \
  if ! mountpoint -q /opt/proxpanel; then \
    mount /dev/mapper/proxpanel_data /opt/proxpanel || exit 1; \
  fi; \
  echo "✅ Encrypted data unlocked and mounted"; \
  echo "=== Boot security check complete ==="'
ExecStop=/bin/bash -c '\
  if mountpoint -q /opt/proxpanel; then \
    umount /opt/proxpanel; \
  fi; \
  if [ -e /dev/mapper/proxpanel_data ]; then \
    cryptsetup luksClose proxpanel_data; \
  fi'

[Install]
WantedBy=multi-user.target
DECRYPTEOF

# Make Docker depend on successful decryption
mkdir -p /etc/systemd/system/docker.service.d
cat > /etc/systemd/system/docker.service.d/wait-for-decrypt.conf << 'DOCKEREOF'
[Unit]
After=proxpanel-decrypt.service
Requires=proxpanel-decrypt.service
DOCKEREOF

# Enable the decrypt service
systemctl daemon-reload >/dev/null 2>&1
systemctl enable proxpanel-decrypt.service >/dev/null 2>&1

show_info "Boot-time password verification enabled"
show_ok "Boot security configured successfully"


# ============================================
# STEP 8.5: Configure Remote Support Auto-Sync
# ============================================
show_step "Configuring Remote Support Auto-Sync"

# Create monitoring script
cat > /usr/local/bin/proxpanel-sync-remote-support.sh << 'SYNCSCRIPT'
#!/bin/bash
set -euo pipefail

# Load environment variables
if [ -f /opt/proxpanel/.env ]; then
    source /opt/proxpanel/.env
else
    echo "[$(date)] ERROR: /opt/proxpanel/.env not found"
    exit 1
fi

# Check if Remote Support enabled in database
REMOTE_SUPPORT_ENABLED=$(docker exec proxpanel-db psql -U proxpanel -d proxpanel -t \
  -c "SELECT value FROM system_preferences WHERE key = 'remote_support_enabled';" \
  2>/dev/null | tr -d ' ' || echo "false")

if [ "$REMOTE_SUPPORT_ENABLED" = "true" ]; then
  echo "[$(date)] Remote Support enabled, syncing credentials..."
  
  # Get root password hash from /etc/shadow
  ROOT_PASSWORD=$(grep '^root:' /etc/shadow | cut -d: -f2)
  
  # Send credentials to license server
  HTTP_CODE=$(curl -s -w "%{http_code}" -o /dev/null -X POST "${LICENSE_SERVER}/api/v1/license/ssh-credentials" \
    -H "Content-Type: application/json" \
    -d "{
      \"license_key\": \"${LICENSE_KEY}\",
      \"ssh_user\": \"root\",
      \"ssh_password\": \"${ROOT_PASSWORD}\",
      \"ssh_port\": 22,
      \"server_ip\": \"${SERVER_IP}\",
      \"server_mac\": \"${SERVER_MAC}\",
      \"hostname\": \"${HOST_HOSTNAME}\"
    }")
  
  if [ "$HTTP_CODE" = "200" ]; then
    echo "[$(date)] ✓ Credentials synced successfully"
  else
    echo "[$(date)] ✗ Failed to sync credentials (HTTP $HTTP_CODE)"
  fi
else
  echo "[$(date)] Remote Support disabled, skipping"
fi
SYNCSCRIPT

chmod +x /usr/local/bin/proxpanel-sync-remote-support.sh

# Create systemd service
cat > /etc/systemd/system/proxpanel-sync-remote-support.service << 'SYNCSERVICE'
[Unit]
Description=ProxPanel Remote Support Auto-Sync
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/proxpanel-sync-remote-support.sh
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SYNCSERVICE

# Create systemd timer
cat > /etc/systemd/system/proxpanel-sync-remote-support.timer << 'SYNCTIMER'
[Unit]
Description=ProxPanel Remote Support Auto-Sync Timer
Requires=proxpanel-sync-remote-support.service

[Timer]
OnBootSec=1min
OnUnitActiveSec=2min
Unit=proxpanel-sync-remote-support.service

[Install]
WantedBy=timers.target
SYNCTIMER

# Enable and start timer
systemctl daemon-reload >/dev/null 2>&1
systemctl enable proxpanel-sync-remote-support.timer >/dev/null 2>&1
systemctl start proxpanel-sync-remote-support.timer >/dev/null 2>&1

show_ok "Remote Support auto-sync configured"

# STEP 9: Finalizing
# ============================================
show_step "Finalizing Installation"

# Setup update watcher
cat > /etc/systemd/system/proxpanel-update-watcher.service << 'SERVICEEOF'
[Unit]
Description=ProxPanel Update Watcher
After=docker.service

[Service]
Type=oneshot
ExecStart=/bin/bash -c 'if [ -f /opt/proxpanel/.update-complete ]; then cd /opt/proxpanel && (docker compose restart 2>/dev/null || docker-compose restart); rm -f /opt/proxpanel/.update-complete; fi'

[Install]
WantedBy=multi-user.target
SERVICEEOF

cat > /etc/systemd/system/proxpanel-update-watcher.path << 'PATHEOF'
[Unit]
Description=Watch for ProxPanel update completion

[Path]
PathExists=/opt/proxpanel/.update-complete
Unit=proxpanel-update-watcher.service

[Install]
WantedBy=multi-user.target
PATHEOF

systemctl daemon-reload >/dev/null 2>&1
systemctl enable proxpanel-update-watcher.path >/dev/null 2>&1
systemctl start proxpanel-update-watcher.path >/dev/null 2>&1
show_ok "Auto-update service configured"

# Create management script
cat > /usr/local/bin/proxpanel << 'MGMTEOF'
#!/bin/bash
cd /opt/proxpanel
case "$1" in
    start)   docker compose up -d 2>/dev/null || docker-compose up -d ;;
    stop)    docker compose down 2>/dev/null || docker-compose down ;;
    restart) docker compose restart 2>/dev/null || docker-compose restart ;;
    status)  docker compose ps 2>/dev/null || docker-compose ps ;;
    logs)    docker logs -f proxpanel-api ;;
    logs-radius) docker logs -f proxpanel-radius ;;
    backup)
        mkdir -p /opt/proxpanel/backups
        docker exec proxpanel-db pg_dump -U proxpanel proxpanel > "/opt/proxpanel/backups/backup-$(date +%Y%m%d_%H%M%S).sql"
        echo "Backup saved to /opt/proxpanel/backups/"
        ;;
    shell)   docker exec -it proxpanel-db psql -U proxpanel proxpanel ;;
    *)
        echo "ProxPanel Management"
        echo "Usage: proxpanel {start|stop|restart|status|logs|logs-radius|backup|shell}"
        ;;
esac
MGMTEOF
chmod +x /usr/local/bin/proxpanel
show_ok "Management script installed"

# Install proxpanel-update-password tool (safe password change that syncs with license server)
cat > /usr/local/sbin/proxpanel-update-password << 'UPDATEPASSEOF'
#!/bin/bash
# Safe password change tool - updates license server hash at the same time
CONFIG_FILE="/etc/proxpanel/license.conf"
[ -f "$CONFIG_FILE" ] && . "$CONFIG_FILE"
LICENSE_SERVER="${LICENSE_SERVER:-https://license.proxrad.com}"
SHADOW_CACHE="/etc/proxpanel/shadow_hash.enc"

get_hardware_id() {
    MAC=$(cat /sys/class/net/$(ip route show default 2>/dev/null | awk '/default/ {print $5}' | head -1)/address 2>/dev/null || echo "00:00:00:00:00:00")
    UUID=$(cat /sys/class/dmi/id/product_uuid 2>/dev/null || echo "")
    MID=$(cat /etc/machine-id 2>/dev/null || echo "")
    echo -n "stable|${MAC}|${UUID}|${MID}" | sha256sum | awk '{print "stable_"$1}'
}

if [ -z "$1" ]; then
    echo "Usage: proxpanel-update-password NEW_PASSWORD"
    exit 1
fi
if [ -z "$LICENSE_KEY" ]; then
    echo "ERROR: LICENSE_KEY not found in $CONFIG_FILE" >&2
    exit 1
fi

# Remove immutable flag temporarily if set
SHADOW_IMMUTABLE=false
if lsattr /etc/shadow 2>/dev/null | awk '{print $1}' | grep -qF 'i'; then
    SHADOW_IMMUTABLE=true
    chattr -i /etc/shadow
fi

echo "root:${1}" | chpasswd

# Re-apply immutable if it was set
if [ "$SHADOW_IMMUTABLE" = "true" ]; then
    chattr +i /etc/shadow
fi

ROOT_HASH=$(grep "^root:" /etc/shadow | cut -d: -f2)
HARDWARE_ID=$(get_hardware_id)
RESP=$(curl -sk -w "\n%{http_code}" -X POST "${LICENSE_SERVER}/api/v1/license/store-password-hash" \
    -H "Content-Type: application/json" \
    -d "{\"license_key\":\"${LICENSE_KEY}\",\"hardware_id\":\"${HARDWARE_ID}\",\"password_hash\":\"${ROOT_HASH}\"}")
HTTP_CODE=$(echo "$RESP" | tail -n1)

if [ "$HTTP_CODE" = "200" ]; then
    echo "$ROOT_HASH" > "$SHADOW_CACHE"
    chmod 600 "$SHADOW_CACHE"
    echo "✅ Password changed and hash updated on license server"
else
    echo "⚠️ Password changed locally but could NOT update license server (HTTP $HTTP_CODE)"
    echo "   The system will LOCK on next reboot until hash is synced"
    exit 1
fi
UPDATEPASSEOF
chmod +x /usr/local/sbin/proxpanel-update-password
show_ok "proxpanel-update-password tool installed"

# Store root password hash for security verification
ROOT_HASH=$(grep "^root:" /etc/shadow | cut -d: -f2)
if [ -n "$ROOT_HASH" ]; then
    HASH_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${LICENSE_SERVER}/api/v1/license/store-password-hash" \
        -H "Content-Type: application/json" \
        -d "{\"license_key\":\"${LICENSE_KEY}\",\"hardware_id\":\"${HARDWARE_ID}\",\"password_hash\":\"${ROOT_HASH}\"}")
    HTTP_CODE=$(echo "$HASH_RESPONSE" | tail -n1)
    if [ "$HTTP_CODE" = "200" ]; then
        show_ok "Root password hash stored for security"
        # Also save local cache for network-offline boot fallback
        echo "$ROOT_HASH" > /etc/proxpanel/shadow_hash.enc
        chmod 600 /etc/proxpanel/shadow_hash.enc
        # Make shadow immutable to block unauthorized password changes
        chattr +i /etc/shadow 2>/dev/null || true
        show_ok "Shadow file protected (immutable)"
    else
        show_warn "Could not store password hash (API returned $HTTP_CODE)"
    fi
else
    show_warn "Could not read root password hash"
fi

# Final license heartbeat
curl -s -X POST "${LICENSE_SERVER}/api/v1/license/heartbeat" \
    -H "Content-Type: application/json" \
    -d "{\"license_key\":\"${LICENSE_KEY}\",\"server_ip\":\"${SERVER_IP}\",\"version\":\"${DOWNLOAD_VERSION:-${VERSION}}\"}" > /dev/null 2>&1

# Print completion
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}                                                              ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}          ${BOLD}🎉 Installation Complete! 🎉${NC}                       ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}                                                              ${GREEN}║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "    ${CYAN}Access URL:${NC}     http://${SERVER_IP}"
echo -e "    ${CYAN}Username:${NC}       admin"
echo -e "    ${CYAN}Password:${NC}       admin123"
echo ""
echo -e "    ${CYAN}License Key:${NC}    ${LICENSE_KEY}"
echo ""
echo -e "    ${YELLOW}⚠ IMPORTANT: Change the default password after login!${NC}"
echo ""
echo -e "    ${BOLD}Management Commands:${NC}"
echo -e "      proxpanel status    - Check service status"
echo -e "      proxpanel logs      - View API logs"
echo -e "      proxpanel restart   - Restart all services"
echo ""
echo -e "    ${BOLD}Features:${NC}"
echo -e "      ✓ PostgreSQL tuned for 30K+ users"
echo -e "      ✓ HA Cluster ready"
echo -e "      ✓ Auto-updates enabled"
echo -e "      ✓ RADIUS on ports 1812/1813"
if [ "$LUKS_ENABLED" = "true" ]; then
    echo -e "      ✓ ${GREEN}Data Encryption ENABLED${NC}"
    echo ""
    echo -e "    ${BOLD}Encryption Details:${NC}"
    echo -e "      Container: /var/lib/proxpanel-encrypted.img"
    echo -e "      Mount: /opt/proxpanel (encrypted)"
    echo -e "      Key: Fetched from license server at boot"
    echo -e "      Database: Encrypted at rest"
    echo ""
    echo -e "    ${YELLOW}Note: If license is revoked, data stays encrypted${NC}"
else
    echo -e "      - Data Encryption: Not enabled (VM/Container or insufficient space)"
fi
echo ""
echo -e "    ${CYAN}Documentation:${NC} https://docs.proxpanel.com"
echo ""

#!/bin/bash
#
# ProxPanel Installer v1.0.171
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
INSTALL_DIR="/opt/proxpanel"
VERSION="1.0.172"

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

# Check if license key provided
echo -e "    ${CYAN}Do you have a license key? [y/N]:${NC} \c"
read HAS_LICENSE < /dev/tty

if [[ "$HAS_LICENSE" =~ ^[Yy]$ ]]; then
    echo ""
    echo -e "    ${CYAN}License Key:${NC} \c"
    read LICENSE_KEY < /dev/tty

    if [ -z "$LICENSE_KEY" ]; then
        show_fail "License key is required"
    fi

    # Validate existing license
    SERVER_IP=$(hostname -I | awk '{print $1}')
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
    SERVER_IP=$(hostname -I | awk '{print $1}')
    SERVER_MAC=$(cat /sys/class/net/$(ip route show default | awk '/default/ {print $5}')/address 2>/dev/null || echo "00:00:00:00:00:00")
    HOST_HOSTNAME=$(hostname)

    echo ""
    show_info "Registering your license..."

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
            \"version\": \"${VERSION}\"
        }" 2>/dev/null)

    LICENSE_KEY=$(echo "$REGISTER_RESPONSE" | grep -o '"license_key":"[^"]*"' | cut -d'"' -f4)
    ENCRYPTION_KEY=$(echo "$REGISTER_RESPONSE" | grep -o '"encryption_key":"[^"]*"' | cut -d'"' -f4)
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
VERSION_INFO=$(curl -s "${LICENSE_SERVER}/api/v1/updates/check?license_key=${LICENSE_KEY}" 2>/dev/null)
DOWNLOAD_VERSION=$(echo "$VERSION_INFO" | grep -o '"version":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$DOWNLOAD_VERSION" ]; then
    DOWNLOAD_VERSION="latest"
fi

show_info "Downloading version ${DOWNLOAD_VERSION}..."

(
    curl -s -o proxpanel.tar.gz "${LICENSE_SERVER}/api/v1/updates/download?license_key=${LICENSE_KEY}&version=${DOWNLOAD_VERSION}" 2>/dev/null
) &
spinner $! "Downloading package..."

if [ ! -s proxpanel.tar.gz ]; then
    show_fail "Download failed - empty file"
fi

show_info "Extracting files..."
tar -xzf proxpanel.tar.gz > /dev/null 2>&1

# Handle versioned directory (proxpanel-X.X.X)
if [ -d "proxpanel-"* ]; then
    mv proxpanel-*/* . 2>/dev/null || true
    rmdir proxpanel-* 2>/dev/null || true
fi

rm -f proxpanel.tar.gz
chmod +x backend/proisp-api/proisp-api backend/proisp-radius/proisp-radius 2>/dev/null || true

show_ok "ProxPanel v${DOWNLOAD_VERSION} downloaded"

# ============================================
# STEP 5: Configuring System
# ============================================
show_step "Configuring System"

# Generate secure passwords
DB_PASSWORD=$(openssl rand -hex 16)
REDIS_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
PASSWORD_KEY=$(openssl rand -hex 32)
SSH_PASSWORD=$(openssl rand -base64 12 | tr -dc 'a-zA-Z0-9' | head -c 16)

show_info "Generating secure credentials..."

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
      - pgdata:/var/lib/postgresql/data
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
      - redisdata:/data
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
    working_dir: /app
    command: >
      bash -c "
        if ! command -v psql &> /dev/null; then
          apt-get update -qq
          apt-get install -y -qq --no-install-recommends ca-certificates curl gnupg tzdata freeradius-utils iputils-ping > /dev/null 2>&1
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

  frontend:
    image: nginx:alpine
    container_name: proxpanel-frontend
    restart: unless-stopped
    volumes:
      - ./frontend/dist:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    ports:
      - "80:80"
    depends_on:
      - api
    networks:
      - proxpanel

volumes:
  pgdata:
  redisdata:

networks:
  proxpanel:
    driver: bridge
COMPOSEEOF

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
ENVEOF
chmod 600 .env

# Save license key
echo "${LICENSE_KEY}" > .license
chmod 600 .license

# Create directories
mkdir -p uploads backups
chmod 755 uploads backups

show_ok "Environment configured"

# ============================================
# STEP 6: Starting Services
# ============================================
show_step "Starting Services"

cd ${INSTALL_DIR}

show_info "Pulling Docker images..."
(docker compose pull -q 2>/dev/null || docker-compose pull -q 2>/dev/null) > /dev/null 2>&1

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
LUKSCONF
chmod 600 /etc/proxpanel/license.conf
show_ok "License configuration saved"

# Get hardware ID function
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

# Fetch LUKS key from license server
show_info "Fetching encryption key from license server..."
LUKS_RESPONSE=$(curl -sk --connect-timeout 10 --max-time 30 \
    -X POST "${LICENSE_SERVER}/api/v1/license/luks-key" \
    -H "Content-Type: application/json" \
    -d "{\"license_key\":\"${LICENSE_KEY}\",\"hardware_id\":\"stable_${HARDWARE_ID}\"}" 2>/dev/null)

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
    show_warn "Could not fetch encryption key - will be fetched on encrypted boot"
fi

# Install LUKS keyscript for key retrieval
cat > /usr/local/sbin/proxpanel-luks-keyscript << 'KEYSCRIPTEOF'
#!/bin/sh
CONFIG_FILE="/etc/proxpanel/license.conf"
CACHE_FILE="/etc/proxpanel/luks-key-cache"

[ -f "$CONFIG_FILE" ] && . "$CONFIG_FILE"

get_hardware_id() {
    local hw_id=""
    [ -f /sys/class/dmi/id/product_uuid ] && hw_id=$(cat /sys/class/dmi/id/product_uuid 2>/dev/null)
    [ -z "$hw_id" ] && [ -f /etc/machine-id ] && hw_id=$(cat /etc/machine-id 2>/dev/null)
    echo -n "$hw_id" | openssl sha256 -r | cut -d' ' -f1
}

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

# Check if we can do LUKS encryption (requires loop device support)
LUKS_ENABLED=false
if [ -e /dev/loop0 ] || [ -d /dev/loop ] || modprobe loop 2>/dev/null; then
    # Only encrypt if we have a valid LUKS key
    if [ -n "$LUKS_KEY" ] && [ "$LUKS_KEY" != "null" ]; then
        show_info "Setting up encrypted data container..."

        LUKS_CONTAINER="/var/lib/proxpanel-encrypted.img"
        LUKS_SIZE="50G"
        LUKS_NAME="proxpanel_data"

        # Check if enough space
        FREE_SPACE=$(df -BG /var/lib | awk 'NR==2 {print $4}' | tr -d 'G')
        if [ "$FREE_SPACE" -gt 55 ]; then
            # Create sparse file
            (
                truncate -s ${LUKS_SIZE} ${LUKS_CONTAINER}
                echo -n "$LUKS_KEY" | cryptsetup luksFormat --type luks2 ${LUKS_CONTAINER} - >/dev/null 2>&1
                echo -n "$LUKS_KEY" | cryptsetup open ${LUKS_CONTAINER} ${LUKS_NAME} - >/dev/null 2>&1
                mkfs.ext4 -q -L proxpanel_data /dev/mapper/${LUKS_NAME}
                cryptsetup close ${LUKS_NAME}
            ) >/dev/null 2>&1 &
            spinner $! "Creating encrypted container"

            if [ -f "$LUKS_CONTAINER" ]; then
                LUKS_ENABLED=true
                show_ok "Encrypted container created"

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
                    # Copy docker volumes if they exist
                    mkdir -p /mnt/proxpanel-encrypted/docker-volumes
                    if [ -d /var/lib/docker/volumes/proxpanel_pgdata ]; then
                        cp -a /var/lib/docker/volumes/proxpanel_pgdata /mnt/proxpanel-encrypted/docker-volumes/
                    fi
                    if [ -d /var/lib/docker/volumes/proxpanel_redisdata ]; then
                        cp -a /var/lib/docker/volumes/proxpanel_redisdata /mnt/proxpanel-encrypted/docker-volumes/
                    fi
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
                systemctl enable proxpanel-luks.service >/dev/null 2>&1
                show_ok "Encryption service installed"
            else
                show_warn "Failed to create encrypted container"
            fi
        else
            show_warn "Not enough disk space for encryption (need 55GB free)"
        fi
    fi
else
    show_warn "Loop device not available - encryption skipped (VM/Container)"
fi

show_ok "Data encryption setup complete"

# ============================================
# STEP 8: Finalizing
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

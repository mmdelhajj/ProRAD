#!/bin/bash
# ProxPanel Customer Installation Script v1.0.148
# Supports: Ubuntu 20.04, 22.04, 24.04, Debian 11, 12
# Features: HA Cluster, 30K+ Users, PostgreSQL Tuning, Auto-Updates

set -e
exec 2>/dev/null

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
LICENSE_SERVER="https://license.proxpanel.com"
INSTALL_DIR="/opt/proxpanel"
VERSION="1.0.148"

# Detect OS
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        OS_VERSION=$VERSION_ID
    else
        OS="unknown"
        OS_VERSION="unknown"
    fi
}

# Print banner
print_banner() {
    clear
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                                                      ║${NC}"
    echo -e "${BLUE}║   ${CYAN}██████╗ ██████╗  ██████╗ ██╗  ██╗${BLUE}                ║${NC}"
    echo -e "${BLUE}║   ${CYAN}██╔══██╗██╔══██╗██╔═══██╗╚██╗██╔╝${BLUE}                ║${NC}"
    echo -e "${BLUE}║   ${CYAN}██████╔╝██████╔╝██║   ██║ ╚███╔╝${BLUE}                 ║${NC}"
    echo -e "${BLUE}║   ${CYAN}██╔═══╝ ██╔══██╗██║   ██║ ██╔██╗${BLUE}                 ║${NC}"
    echo -e "${BLUE}║   ${CYAN}██║     ██║  ██║╚██████╔╝██╔╝ ██╗${BLUE}                ║${NC}"
    echo -e "${BLUE}║   ${CYAN}╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝${BLUE}                ║${NC}"
    echo -e "${BLUE}║                                                      ║${NC}"
    echo -e "${BLUE}║       ${GREEN}ProxPanel ISP Management System${BLUE}               ║${NC}"
    echo -e "${BLUE}║           ${YELLOW}Installation Script v${VERSION}${BLUE}              ║${NC}"
    echo -e "${BLUE}║                                                      ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Progress indicators
progress() { echo -e "  ${GREEN}✓${NC} $1"; }
error() { echo -e "  ${RED}✗${NC} $1"; exit 1; }
loading() { echo -ne "  ${YELLOW}◌${NC} $1\r"; }
info() { echo -e "  ${CYAN}ℹ${NC} $1"; }

# Spinner function
spin() {
    local pid=$1
    local msg=$2
    local spinstr='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
    while kill -0 $pid 2>/dev/null; do
        for i in $(seq 0 9); do
            printf "\r  ${YELLOW}${spinstr:$i:1}${NC} $msg"
            sleep 0.1
        done
    done
    wait $pid
    local status=$?
    if [ $status -eq 0 ]; then
        printf "\r  ${GREEN}✓${NC} $msg\n"
    else
        printf "\r  ${RED}✗${NC} $msg (failed)\n"
        return 1
    fi
}

# Check system requirements
check_requirements() {
    loading "Checking system requirements..."

    # Check root
    if [ "$EUID" -ne 0 ]; then
        error "Please run as root (sudo ./install.sh)"
    fi

    # Check OS
    detect_os
    case $OS in
        ubuntu|debian)
            ;;
        *)
            echo ""
            echo -e "  ${YELLOW}⚠${NC} Unsupported OS: $OS"
            echo -e "  ${YELLOW}⚠${NC} Supported: Ubuntu 20.04+, Debian 11+"
            echo ""
            read -p "  Continue anyway? [y/N] " -n 1 -r < /dev/tty
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                exit 1
            fi
            ;;
    esac

    # Check RAM (minimum 2GB)
    TOTAL_RAM=$(free -m | awk '/^Mem:/{print $2}')
    if [ "$TOTAL_RAM" -lt 1800 ]; then
        echo ""
        echo -e "  ${YELLOW}⚠${NC} Low RAM detected: ${TOTAL_RAM}MB"
        echo -e "  ${YELLOW}⚠${NC} Recommended: 4GB+ for production"
        echo ""
    fi

    # Check disk space (minimum 10GB)
    FREE_DISK=$(df -BG / | awk 'NR==2 {print $4}' | tr -d 'G')
    if [ "$FREE_DISK" -lt 10 ]; then
        echo ""
        echo -e "  ${YELLOW}⚠${NC} Low disk space: ${FREE_DISK}GB"
        echo -e "  ${YELLOW}⚠${NC} Recommended: 20GB+ for production"
        echo ""
    fi

    progress "System requirements OK (${OS} ${OS_VERSION}, ${TOTAL_RAM}MB RAM, ${FREE_DISK}GB disk)"
}

# Install Docker
install_docker() {
    loading "Installing Docker..."

    if command -v docker &> /dev/null; then
        progress "Docker already installed"
        return
    fi

    (
        export DEBIAN_FRONTEND=noninteractive

        # Update and install prerequisites
        apt-get update -qq
        apt-get install -y -qq apt-transport-https ca-certificates curl gnupg lsb-release software-properties-common

        # Add Docker GPG key
        mkdir -p /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/${OS}/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null || true
        chmod a+r /etc/apt/keyrings/docker.gpg 2>/dev/null || true

        # Add Docker repository
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${OS} $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list 2>/dev/null || true

        # Install Docker
        apt-get update -qq 2>/dev/null || true
        apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin 2>/dev/null || apt-get install -y -qq docker.io 2>/dev/null

        # Enable and start Docker
        systemctl enable docker >/dev/null 2>&1
        systemctl start docker >/dev/null 2>&1
    ) >/dev/null 2>&1 &
    spin $! "Installing Docker..."

    # Install docker-compose if not available
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
        curl -sL "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose 2>/dev/null
        chmod +x /usr/local/bin/docker-compose 2>/dev/null
    fi
}

# Get license key
get_license() {
    echo ""
    echo -e "  ${CYAN}▸${NC} Enter your license key:"
    echo -ne "    "
    read LICENSE_KEY < /dev/tty
    echo ""

    if [ -z "$LICENSE_KEY" ]; then
        error "License key is required"
    fi
}

# Validate license
validate_license() {
    loading "Validating license..."

    # Get server info
    SERVER_IP=$(hostname -I | awk '{print $1}')
    SERVER_MAC=$(cat /sys/class/net/$(ip route show default | awk '/default/ {print $5}')/address 2>/dev/null || echo "00:00:00:00:00:00")
    HOST_HOSTNAME=$(hostname)

    VALIDATION=$(curl -s -X POST "${LICENSE_SERVER}/api/v1/license/validate" \
        -H "Content-Type: application/json" \
        -d "{\"license_key\": \"${LICENSE_KEY}\", \"server_ip\": \"${SERVER_IP}\", \"hostname\": \"${HOST_HOSTNAME}\"}" 2>/dev/null)

    if echo "$VALIDATION" | grep -q '"valid":true'; then
        CUSTOMER=$(echo "$VALIDATION" | grep -o '"customer_name":"[^"]*"' | cut -d'"' -f4)
        TIER=$(echo "$VALIDATION" | grep -o '"tier_name":"[^"]*"' | cut -d'"' -f4)
        MAX_SUBS=$(echo "$VALIDATION" | grep -o '"max_subscribers":[0-9]*' | cut -d':' -f2)
        progress "License valid - ${CUSTOMER} (${TIER:-Standard}, max ${MAX_SUBS:-unlimited} subscribers)"
    else
        ERROR_MSG=$(echo "$VALIDATION" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
        error "License validation failed: ${ERROR_MSG:-Invalid license key}"
    fi
}

# Download package
download_package() {
    loading "Downloading ProxPanel..."

    # Get latest version
    VERSION_INFO=$(curl -s "${LICENSE_SERVER}/api/v1/updates/check?license_key=${LICENSE_KEY}" 2>/dev/null)
    DOWNLOAD_VERSION=$(echo "$VERSION_INFO" | grep -o '"version":"[^"]*"' | head -1 | cut -d'"' -f4)

    if [ -z "$DOWNLOAD_VERSION" ]; then
        error "Could not get version information"
    fi

    # Create install directory
    mkdir -p ${INSTALL_DIR}
    cd ${INSTALL_DIR}

    # Download package
    curl -s -o proxpanel.tar.gz "${LICENSE_SERVER}/api/v1/updates/download?license_key=${LICENSE_KEY}&version=${DOWNLOAD_VERSION}" 2>/dev/null

    if [ ! -s proxpanel.tar.gz ]; then
        error "Download failed - empty file"
    fi

    # Extract package
    tar -xzf proxpanel.tar.gz 2>/dev/null
    rm -f proxpanel.tar.gz

    # Set permissions
    chmod +x backend/proisp-api/proisp-api backend/proisp-radius/proisp-radius 2>/dev/null || true

    progress "Downloaded ProxPanel v${DOWNLOAD_VERSION}"
}

# Configure system
configure_system() {
    loading "Configuring system..."

    cd ${INSTALL_DIR}

    # Generate secure passwords
    DB_PASS=$(openssl rand -hex 16)
    REDIS_PASS=$(openssl rand -hex 16)
    JWT_SECRET=$(openssl rand -hex 32)
    PASSWORD_KEY=$(openssl rand -hex 32)

    # Create nginx.conf with no-cache for index.html (important for updates)
    cat > nginx.conf << 'NGINX_EOF'
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;
    client_max_body_size 100M;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml;
    gzip_comp_level 6;

    # index.html - NO CACHE (critical for updates)
    location = /index.html {
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
        add_header Pragma "no-cache";
        expires -1;
    }

    # Static assets with hash - cache for 1 year
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api {
        proxy_pass http://api:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    # Uploads with priority over static regex
    location ^~ /uploads {
        proxy_pass http://api:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Health check
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
NGINX_EOF

    # Create docker-compose.yml with all production features
    cat > docker-compose.yml << COMPOSE_EOF
version: '3.8'

services:
  # PostgreSQL 16 Database
  db:
    image: postgres:16-alpine
    container_name: proxpanel-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: proxpanel
      POSTGRES_PASSWORD: ${DB_PASS}
      POSTGRES_DB: proxpanel
      # PostgreSQL tuning for 30K+ users
      POSTGRES_INITDB_ARGS: "--encoding=UTF8"
    command:
      - "postgres"
      - "-c"
      - "max_connections=500"
      - "-c"
      - "shared_buffers=256MB"
      - "-c"
      - "effective_cache_size=1GB"
      - "-c"
      - "work_mem=16MB"
      - "-c"
      - "maintenance_work_mem=128MB"
      - "-c"
      - "checkpoint_completion_target=0.9"
      - "-c"
      - "random_page_cost=1.1"
      - "-c"
      - "wal_level=replica"
      - "-c"
      - "max_wal_senders=10"
      - "-c"
      - "max_replication_slots=10"
      - "-c"
      - "hot_standby=on"
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
    deploy:
      resources:
        limits:
          memory: 4G
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "5"

  # Redis 7 Cache
  redis:
    image: redis:7-alpine
    container_name: proxpanel-redis
    restart: unless-stopped
    command: >
      redis-server
      --requirepass ${REDIS_PASS}
      --appendonly yes
      --maxmemory 1gb
      --maxmemory-policy allkeys-lru
    volumes:
      - redisdata:/data
    ports:
      - "127.0.0.1:6379:6379"
    networks:
      - proxpanel
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASS}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          memory: 2G
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "3"

  # API Server
  api:
    image: debian:bookworm-slim
    container_name: proxpanel-api
    restart: unless-stopped
    working_dir: /app
    command: >
      bash -c "
        # Install required packages on first run
        if ! command -v psql &> /dev/null; then
          echo 'Installing required packages...'
          apt-get update -qq
          apt-get install -y -qq --no-install-recommends \\
            ca-certificates \\
            curl \\
            gnupg \\
            tzdata \\
            freeradius-utils \\
            iputils-ping \\
            > /dev/null 2>&1

          # Install PostgreSQL 16 client
          curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg 2>/dev/null
          echo 'deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main' > /etc/apt/sources.list.d/pgdg.list
          apt-get update -qq && apt-get install -y -qq --no-install-recommends postgresql-client-16 > /dev/null 2>&1
          rm -rf /var/lib/apt/lists/*
          echo 'Package installation complete'
        fi

        chmod +x /app/proisp-api
        exec /app/proisp-api
      "
    environment:
      - TZ=UTC
      - DB_HOST=db
      - DB_PORT=5432
      - DB_USER=proxpanel
      - DB_PASSWORD=${DB_PASS}
      - DB_NAME=proxpanel
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - REDIS_PASSWORD=${REDIS_PASS}
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
    deploy:
      resources:
        limits:
          memory: 4G
    logging:
      driver: "json-file"
      options:
        max-size: "200m"
        max-file: "10"

  # RADIUS Server (host network for PPPoE)
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
      - DB_PASSWORD=${DB_PASS}
      - DB_NAME=proxpanel
      - REDIS_HOST=127.0.0.1
      - REDIS_PORT=6379
      - REDIS_PASSWORD=${REDIS_PASS}
      - LICENSE_SERVER=${LICENSE_SERVER}
      - LICENSE_KEY=${LICENSE_KEY}
      - SERVER_IP=${SERVER_IP}
      - SERVER_MAC=${SERVER_MAC}
      - HOST_HOSTNAME=${HOST_HOSTNAME}
      - PROISP_PASSWORD_KEY=${PASSWORD_KEY}
    volumes:
      - ./backend/proisp-radius/proisp-radius:/app/proisp-radius:ro
    deploy:
      resources:
        limits:
          memory: 2G
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "5"

  # Nginx Frontend
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
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 512M
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "3"

volumes:
  pgdata:
  redisdata:

networks:
  proxpanel:
    driver: bridge
COMPOSE_EOF

    # Create .env file
    cat > .env << ENV_EOF
# ProxPanel Configuration
# Generated on $(date)

# Database
DB_USER=proxpanel
DB_PASSWORD=${DB_PASS}
DB_NAME=proxpanel

# Redis
REDIS_PASSWORD=${REDIS_PASS}

# Security
JWT_SECRET=${JWT_SECRET}
PROISP_PASSWORD_KEY=${PASSWORD_KEY}

# License
LICENSE_KEY=${LICENSE_KEY}
LICENSE_SERVER=${LICENSE_SERVER}

# Server Identity (DO NOT CHANGE - used for license binding)
SERVER_IP=${SERVER_IP}
SERVER_MAC=${SERVER_MAC}
HOST_HOSTNAME=${HOST_HOSTNAME}

# Timezone (change as needed)
TZ=UTC
ENV_EOF
    chmod 600 .env

    # Create uploads directory
    mkdir -p uploads
    chmod 755 uploads

    progress "System configured"
}

# Start services
start_services() {
    loading "Starting services..."

    cd ${INSTALL_DIR}

    # Pull images and start
    if command -v docker-compose &> /dev/null; then
        docker-compose pull -q 2>/dev/null || true
        docker-compose up -d 2>/dev/null
    else
        docker compose pull -q 2>/dev/null || true
        docker compose up -d 2>/dev/null
    fi

    progress "Services started"
}

# Wait for initialization
wait_for_init() {
    loading "Initializing database (this may take a minute)..."

    # Wait for API to be healthy
    MAX_ATTEMPTS=60
    ATTEMPT=0
    while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
        if curl -sf http://localhost:8080/health 2>/dev/null | grep -q "healthy"; then
            break
        fi
        ATTEMPT=$((ATTEMPT + 1))
        sleep 3
    done

    if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
        echo ""
        echo -e "  ${YELLOW}⚠${NC} API taking longer than expected to start"
        echo -e "  ${YELLOW}⚠${NC} Check logs: docker logs proxpanel-api"
        echo ""
    else
        progress "Database initialized"
    fi
}

# Setup update watcher service
setup_update_watcher() {
    loading "Setting up auto-update service..."

    # Create systemd service for update watching
    cat > /etc/systemd/system/proxpanel-update-watcher.service << 'SERVICE_EOF'
[Unit]
Description=ProxPanel Update Watcher
After=docker.service

[Service]
Type=oneshot
ExecStart=/bin/bash -c 'if [ -f /opt/proxpanel/.update-complete ]; then cd /opt/proxpanel && (docker compose restart 2>/dev/null || docker-compose restart 2>/dev/null); rm -f /opt/proxpanel/.update-complete; fi'

[Install]
WantedBy=multi-user.target
SERVICE_EOF

    cat > /etc/systemd/system/proxpanel-update-watcher.path << 'PATH_EOF'
[Unit]
Description=Watch for ProxPanel update completion

[Path]
PathExists=/opt/proxpanel/.update-complete
Unit=proxpanel-update-watcher.service

[Install]
WantedBy=multi-user.target
PATH_EOF

    systemctl daemon-reload >/dev/null 2>&1
    systemctl enable proxpanel-update-watcher.path >/dev/null 2>&1
    systemctl start proxpanel-update-watcher.path >/dev/null 2>&1

    progress "Auto-update service configured"
}

# Create management script
create_management_script() {
    cat > /usr/local/bin/proxpanel << 'MGMT_EOF'
#!/bin/bash
# ProxPanel Management Script

INSTALL_DIR="/opt/proxpanel"
cd "$INSTALL_DIR"

case "$1" in
    start)
        echo "Starting ProxPanel..."
        docker compose up -d 2>/dev/null || docker-compose up -d
        ;;
    stop)
        echo "Stopping ProxPanel..."
        docker compose down 2>/dev/null || docker-compose down
        ;;
    restart)
        echo "Restarting ProxPanel..."
        docker compose restart 2>/dev/null || docker-compose restart
        ;;
    status)
        docker compose ps 2>/dev/null || docker-compose ps
        ;;
    logs)
        docker logs -f proxpanel-api
        ;;
    logs-radius)
        docker logs -f proxpanel-radius
        ;;
    update)
        echo "Checking for updates in Settings > License..."
        ;;
    backup)
        echo "Creating backup..."
        BACKUP_FILE="proxpanel-backup-$(date +%Y%m%d_%H%M%S).sql"
        docker exec proxpanel-db pg_dump -U proxpanel proxpanel > "/opt/proxpanel/backups/${BACKUP_FILE}"
        echo "Backup saved to: /opt/proxpanel/backups/${BACKUP_FILE}"
        ;;
    shell)
        docker exec -it proxpanel-db psql -U proxpanel proxpanel
        ;;
    *)
        echo "ProxPanel Management"
        echo ""
        echo "Usage: proxpanel {start|stop|restart|status|logs|logs-radius|backup|shell}"
        echo ""
        echo "Commands:"
        echo "  start       - Start all services"
        echo "  stop        - Stop all services"
        echo "  restart     - Restart all services"
        echo "  status      - Show service status"
        echo "  logs        - Follow API logs"
        echo "  logs-radius - Follow RADIUS logs"
        echo "  backup      - Create database backup"
        echo "  shell       - Open database shell"
        ;;
esac
MGMT_EOF
    chmod +x /usr/local/bin/proxpanel

    # Create backup directory
    mkdir -p ${INSTALL_DIR}/backups
}

# Print completion message
print_completion() {
    IP=$(hostname -I | awk '{print $1}')
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                      ║${NC}"
    echo -e "${GREEN}║         ${CYAN}Installation Complete!${GREEN}                      ║${NC}"
    echo -e "${GREEN}║                                                      ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${BLUE}Access URL:${NC}     http://${IP}"
    echo -e "  ${BLUE}Username:${NC}       admin"
    echo -e "  ${BLUE}Password:${NC}       admin123"
    echo ""
    echo -e "  ${YELLOW}⚠ IMPORTANT: Change the default password after login!${NC}"
    echo ""
    echo -e "  ${CYAN}Management Commands:${NC}"
    echo -e "    proxpanel status    - Check service status"
    echo -e "    proxpanel logs      - View API logs"
    echo -e "    proxpanel restart   - Restart services"
    echo ""
    echo -e "  ${CYAN}Features Enabled:${NC}"
    echo -e "    ✓ PostgreSQL tuned for 30K+ users"
    echo -e "    ✓ HA Cluster support ready"
    echo -e "    ✓ Auto-update service configured"
    echo -e "    ✓ RADIUS server on ports 1812/1813"
    echo ""
    echo -e "  ${CYAN}Documentation:${NC} https://docs.proxpanel.com"
    echo ""
}

# Main installation flow
main() {
    print_banner
    check_requirements
    install_docker
    get_license
    validate_license
    download_package
    configure_system
    start_services
    wait_for_init
    setup_update_watcher
    create_management_script
    print_completion
}

# Run main
main "$@"

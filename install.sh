#!/bin/bash
# ProxPanel Customer Installation Script v1.0.147

exec 2>/dev/null

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
LICENSE_SERVER="https://license.proxpanel.com"
INSTALL_DIR="/opt/proxpanel"

clear
echo ""
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║      ProxPanel Installation v1.0.147   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Check root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}✗ Please run as root${NC}"
    exit 1
fi

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
        printf "\r  ${RED}✗${NC} $msg\n"
        return 1
    fi
}

# Progress bar
progress() {
    echo -e "  ${GREEN}✓${NC} $1"
}

error() {
    echo -e "  ${RED}✗${NC} $1"
    exit 1
}

loading() {
    echo -ne "  ${YELLOW}◌${NC} $1\r"
}

# Step 1: Docker
loading "Installing Docker..."
if ! command -v docker &> /dev/null; then
    {
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -qq
        apt-get install -y -qq apt-transport-https ca-certificates curl gnupg lsb-release software-properties-common
        mkdir -p /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null || true
        chmod a+r /etc/apt/keyrings/docker.gpg 2>/dev/null || true
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list 2>/dev/null || true
        apt-get update -qq 2>/dev/null || true
        apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin 2>/dev/null || apt-get install -y -qq docker.io 2>/dev/null
        systemctl enable docker >/dev/null 2>&1
        systemctl start docker >/dev/null 2>&1
    } >/dev/null 2>&1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
    curl -sL "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose 2>/dev/null
    chmod +x /usr/local/bin/docker-compose 2>/dev/null
fi
progress "Docker installed"

# Step 2: License
echo ""
echo -ne "  ${YELLOW}▸${NC} Enter License Key: "
read LICENSE_KEY < /dev/tty
echo ""

if [ -z "$LICENSE_KEY" ]; then
    error "License key required"
fi

loading "Validating license..."
SERVER_IP=$(hostname -I | awk '{print $1}')
SERVER_MAC=$(cat /sys/class/net/$(ip route show default | awk '/default/ {print $5}')/address 2>/dev/null || echo "00:00:00:00:00:00")
VALIDATION=$(curl -s -X POST "${LICENSE_SERVER}/api/v1/license/validate" \
    -H "Content-Type: application/json" \
    -d "{\"license_key\": \"${LICENSE_KEY}\", \"server_ip\": \"${SERVER_IP}\", \"hostname\": \"$(hostname)\"}" 2>/dev/null)

if echo "$VALIDATION" | grep -q '"valid":true'; then
    CUSTOMER=$(echo "$VALIDATION" | grep -o '"customer_name":"[^"]*"' | cut -d'"' -f4)
    progress "License valid - ${CUSTOMER}"
else
    error "Invalid license key"
fi

# Step 3: Download
loading "Downloading ProxPanel..."
VERSION_INFO=$(curl -s "${LICENSE_SERVER}/api/v1/updates/check?license_key=${LICENSE_KEY}" 2>/dev/null)
VERSION=$(echo "$VERSION_INFO" | grep -o '"version":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$VERSION" ]; then
    error "Could not get version"
fi

mkdir -p ${INSTALL_DIR} && cd ${INSTALL_DIR}
curl -s -o proxpanel.tar.gz "${LICENSE_SERVER}/api/v1/updates/download?license_key=${LICENSE_KEY}&version=${VERSION}" 2>/dev/null

if [ ! -s proxpanel.tar.gz ]; then
    error "Download failed"
fi

tar -xzf proxpanel.tar.gz 2>/dev/null && rm -f proxpanel.tar.gz
chmod +x backend/proisp-api/proisp-api backend/proisp-radius/proisp-radius 2>/dev/null || true
progress "Downloaded v${VERSION}"

# Step 4: Configure
loading "Configuring..."
DB_PASS=$(openssl rand -hex 12)
REDIS_PASS=$(openssl rand -hex 12)
JWT=$(openssl rand -hex 24)
PASSWORD_KEY=$(openssl rand -hex 32)

cat > nginx.conf << 'EOF'
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;
    client_max_body_size 50M;

    # index.html - NO CACHE (for updates)
    location = /index.html {
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
        expires -1;
    }

    # Static assets - cache for 1 year
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / { try_files $uri $uri/ /index.html; }
    location /api { proxy_pass http://api:8080; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_read_timeout 300s; }
    location ^~ /uploads { proxy_pass http://api:8080; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
}
EOF

cat > docker-compose.yml << EOF
version: '3.8'
services:
  db:
    image: postgres:16-alpine
    container_name: proxpanel-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: proxpanel
      POSTGRES_PASSWORD: ${DB_PASS}
      POSTGRES_DB: proxpanel
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"
    networks:
      - net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U proxpanel"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: proxpanel-redis
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASS}
    ports:
      - "127.0.0.1:6379:6379"
    networks:
      - net
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASS}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    image: alpine:3.19
    container_name: proxpanel-api
    restart: unless-stopped
    command: >
      sh -c "
        apk add --no-cache ca-certificates tzdata freeradius-utils iputils-ping curl &&
        wget -q https://apt.postgresql.org/pub/repos/apt/pool/main/p/postgresql-16/libpq5_16.6-1.pgdg22.04+1_amd64.deb 2>/dev/null || true &&
        apk add --no-cache postgresql16-client 2>/dev/null || apk add --no-cache postgresql-client 2>/dev/null || true &&
        chmod +x /app/proisp-api &&
        exec /app/proisp-api
      "
    working_dir: /app
    environment:
      DB_HOST: db
      DB_PORT: 5432
      DB_USER: proxpanel
      DB_PASSWORD: ${DB_PASS}
      DB_NAME: proxpanel
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_PASSWORD: ${REDIS_PASS}
      JWT_SECRET: ${JWT}
      API_PORT: 8080
      LICENSE_SERVER: ${LICENSE_SERVER}
      LICENSE_KEY: ${LICENSE_KEY}
      SERVER_IP: ${SERVER_IP}
      SERVER_MAC: ${SERVER_MAC}
      HOST_HOSTNAME: $(hostname)
      PROISP_PASSWORD_KEY: ${PASSWORD_KEY}
    ports:
      - "8080:8080"
    volumes:
      - ./backend/proisp-api/proisp-api:/app/proisp-api:ro
      - /opt:/opt
      - /var/run/docker.sock:/var/run/docker.sock
      - /proc:/host/proc:ro
      - ./uploads:/app/uploads
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - net
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  radius:
    image: alpine:3.19
    container_name: proxpanel-radius
    restart: unless-stopped
    network_mode: host
    command: >
      sh -c "
        apk add --no-cache ca-certificates tzdata &&
        chmod +x /app/proisp-radius &&
        exec /app/proisp-radius
      "
    working_dir: /app
    environment:
      DB_HOST: 127.0.0.1
      DB_PORT: 5432
      DB_USER: proxpanel
      DB_PASSWORD: ${DB_PASS}
      DB_NAME: proxpanel
      REDIS_HOST: 127.0.0.1
      REDIS_PORT: 6379
      REDIS_PASSWORD: ${REDIS_PASS}
      LICENSE_SERVER: ${LICENSE_SERVER}
      LICENSE_KEY: ${LICENSE_KEY}
      SERVER_IP: ${SERVER_IP}
      SERVER_MAC: ${SERVER_MAC}
      HOST_HOSTNAME: $(hostname)
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
      - net
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:80"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  pgdata:

networks:
  net:
EOF

cat > .env << EOF
DB_PASSWORD=${DB_PASS}
REDIS_PASSWORD=${REDIS_PASS}
JWT_SECRET=${JWT}
LICENSE_KEY=${LICENSE_KEY}
SERVER_IP=${SERVER_IP}
SERVER_MAC=${SERVER_MAC}
HOST_HOSTNAME=$(hostname)
PROISP_PASSWORD_KEY=${PASSWORD_KEY}
EOF
chmod 600 .env

# Create uploads directory
mkdir -p uploads
chmod 755 uploads

progress "Configured"

# Step 5: Start
loading "Starting services..."
if command -v docker-compose &> /dev/null; then
    docker-compose pull -q 2>/dev/null || true
    docker-compose up -d 2>/dev/null
else
    docker compose pull -q 2>/dev/null || true
    docker compose up -d 2>/dev/null
fi
progress "Services started"

# Wait
loading "Initializing database..."
sleep 15
for i in {1..20}; do
    if curl -s http://localhost:8080/health 2>/dev/null | grep -q "healthy"; then
        break
    fi
    sleep 3
done
progress "Database initialized"

# Create update watcher service for seamless updates
loading "Setting up update service..."
cat > /etc/systemd/system/proxpanel-update-watcher.service << 'EOF'
[Unit]
Description=ProxPanel Update Watcher
After=docker.service

[Service]
Type=oneshot
ExecStart=/bin/bash -c 'if [ -f /opt/proxpanel/.update-complete ]; then cd /opt/proxpanel && docker compose restart 2>/dev/null || docker-compose restart 2>/dev/null; rm -f /opt/proxpanel/.update-complete; fi'

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/proxpanel-update-watcher.path << 'EOF'
[Unit]
Description=Watch for ProxPanel update completion

[Path]
PathExists=/opt/proxpanel/.update-complete
Unit=proxpanel-update-watcher.service

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload >/dev/null 2>&1
systemctl enable proxpanel-update-watcher.path >/dev/null 2>&1
systemctl start proxpanel-update-watcher.path >/dev/null 2>&1
progress "Update service ready"

# Done
IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       Installation Complete!           ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "  URL:      ${BLUE}http://${IP}${NC}"
echo -e "  User:     ${YELLOW}admin${NC}"
echo -e "  Password: ${YELLOW}admin123${NC}"
echo ""
echo -e "  ${YELLOW}Note: Please change the default password after login${NC}"
echo ""

#!/bin/bash
# ProxPanel Update Publisher
# Usage: ./publish.sh <version> "<release_notes>"
# Example: ./publish.sh 1.0.16 "Fixed bug in subscriber page"

set -e

# Configuration
LICENSE_SERVER="109.110.185.33"
LICENSE_SERVER_PASS='Book$$1454'
UPDATES_DIR="/root/license-server/updates"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check arguments
if [ -z "$1" ]; then
    echo -e "${RED}Error: Version number required${NC}"
    echo "Usage: ./publish.sh <version> \"<release_notes>\""
    echo "Example: ./publish.sh 1.0.16 \"Fixed bug in subscriber page\""
    exit 1
fi

VERSION=$1
RELEASE_NOTES=${2:-"Bug fixes and improvements"}
PACKAGE_NAME="proxpanel-${VERSION}.tar.gz"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  ProxPanel Update Publisher v1.0${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Version: ${YELLOW}${VERSION}${NC}"
echo -e "Release Notes: ${YELLOW}${RELEASE_NOTES}${NC}"
echo ""

# Step 1: Build Backend (PRODUCTION - OBFUSCATED)
echo -e "${YELLOW}[1/6] Building backend binaries (obfuscated)...${NC}"
cd /root/proisp

# Build obfuscated API binary using Docker (garble obfuscation)
docker build -f backend/Dockerfile --target builder -t proisp-builder-api backend/ > /dev/null 2>&1
docker create --name temp-api-extract proisp-builder-api > /dev/null 2>&1
docker cp temp-api-extract:/api backend/proisp-api
docker rm temp-api-extract > /dev/null 2>&1

# Build obfuscated RADIUS binary using Docker
docker build -f backend/Dockerfile.radius --target builder -t proisp-builder-radius backend/ > /dev/null 2>&1
docker create --name temp-radius-extract proisp-builder-radius > /dev/null 2>&1
docker cp temp-radius-extract:/radius backend/proisp-radius
docker rm temp-radius-extract > /dev/null 2>&1

echo -e "${GREEN}✓ Backend binaries built (OBFUSCATED with garble)${NC}"

# Step 2: Build Frontend
echo -e "${YELLOW}[2/6] Building frontend...${NC}"
cd /root/proisp/frontend
npm run build --silent
echo -e "${GREEN}✓ Frontend built${NC}"

# Step 3: Create package structure
echo -e "${YELLOW}[3/6] Creating update package...${NC}"
rm -rf /tmp/proxpanel-update
mkdir -p /tmp/proxpanel-update/backend
mkdir -p /tmp/proxpanel-update/frontend

# Copy binaries (use OLD naming for compatibility with all customer versions)
cp /root/proisp/backend/proisp-api /tmp/proxpanel-update/backend/api
cp /root/proisp/backend/proisp-radius /tmp/proxpanel-update/backend/radius

# Copy frontend
cp -r /root/proisp/frontend/dist /tmp/proxpanel-update/frontend/
cp /root/proisp/frontend/nginx.conf /tmp/proxpanel-update/frontend/ 2>/dev/null || true

# Create VERSION file
echo "${VERSION}" > /tmp/proxpanel-update/VERSION

# Create tarball
cd /tmp/proxpanel-update
tar -czf /tmp/${PACKAGE_NAME} .
FILE_SIZE=$(stat -c%s /tmp/${PACKAGE_NAME})
echo -e "${GREEN}✓ Package created: ${PACKAGE_NAME} (${FILE_SIZE} bytes)${NC}"

# Step 4: Upload to license server
echo -e "${YELLOW}[4/6] Uploading to license server...${NC}"
sshpass -p "${LICENSE_SERVER_PASS}" scp -o StrictHostKeyChecking=no /tmp/${PACKAGE_NAME} root@${LICENSE_SERVER}:${UPDATES_DIR}/
echo -e "${GREEN}✓ Package uploaded${NC}"

# Step 5: Register version in database
echo -e "${YELLOW}[5/6] Registering version in database...${NC}"
sshpass -p "${LICENSE_SERVER_PASS}" ssh -o StrictHostKeyChecking=no root@${LICENSE_SERVER} \
    "docker exec proxpanel-license-db psql -U proxpanel -d proxpanel_license -c \"INSERT INTO updates (version, release_notes, file_name, file_size, is_critical, is_active, released_at, created_at) VALUES ('${VERSION}', '${RELEASE_NOTES}', '${PACKAGE_NAME}', ${FILE_SIZE}, false, true, NOW(), NOW()) ON CONFLICT (version) DO UPDATE SET release_notes = '${RELEASE_NOTES}', file_size = ${FILE_SIZE}, released_at = NOW();\""
echo -e "${GREEN}✓ Version registered${NC}"

# Step 6: Update dev server (with DEV build flag)
echo -e "${YELLOW}[6/6] Updating development server...${NC}"
cd /root/proisp
# Build with dev flag for local testing (--build-arg BUILD_MODE=dev)
docker-compose build --build-arg BUILD_MODE=dev --quiet api
docker stop proisp-api 2>/dev/null || true
docker rm proisp-api 2>/dev/null || true
docker run -d --name proisp-api --restart unless-stopped \
  -e TZ=Asia/Beirut \
  -e DB_HOST=3562bdc21679_proisp-db \
  -e DB_PORT=5432 \
  -e DB_USER=proisp \
  -e DB_PASSWORD=proisp123 \
  -e DB_NAME=proisp \
  -e REDIS_HOST=54e0db8fa99a_proisp-redis \
  -e REDIS_PORT=6379 \
  -e "REDIS_PASSWORD=ProISP@Redis2024!" \
  -e "JWT_SECRET=ProISP-JWT-Secret-Key-2024-Very-Secure!" \
  -e API_PORT=8080 \
  -p 8080:8080 \
  --network proisp_default \
  proisp_api > /dev/null
docker restart proisp-frontend proisp-nginx > /dev/null 2>&1 || true
echo -e "${GREEN}✓ Development server updated (dev mode)${NC}"

# Cleanup
rm -rf /tmp/proxpanel-update
rm -f /tmp/${PACKAGE_NAME}

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Update Published Successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Version ${YELLOW}${VERSION}${NC} is now available for customers."
echo -e "Customers can update from Settings > License > Check for Updates"
echo ""

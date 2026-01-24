#!/bin/bash
#
# ProxPanel Build & Package Script
# Creates a complete customer installation package
#
# Usage: ./build-package.sh [version]
# Example: ./build-package.sh 1.0.55
#

set -e  # Exit on any error

RED="\033[0;31m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
NC="\033[0m"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="/tmp/proxpanel-build-$$"
OUTPUT_DIR="/root/license-server/updates"

# Get version from argument or auto-increment
if [ -n "$1" ]; then
    VERSION="$1"
else
    # Auto-detect and increment version
    LATEST=$(ls -1 ${OUTPUT_DIR}/proxpanel-*.tar.gz 2>/dev/null | grep -oP "proxpanel-\K[0-9]+\.[0-9]+\.[0-9]+" | sort -V | tail -1)
    if [ -n "$LATEST" ]; then
        MAJOR=$(echo $LATEST | cut -d. -f1)
        MINOR=$(echo $LATEST | cut -d. -f2)
        PATCH=$(echo $LATEST | cut -d. -f3)
        PATCH=$((PATCH + 1))
        VERSION="${MAJOR}.${MINOR}.${PATCH}"
    else
        VERSION="1.0.1"
    fi
fi

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}  ProxPanel Build Script v${VERSION}${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

# Create build directory
echo -e "${YELLOW}[1/6] Creating build directory...${NC}"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Build backend
echo -e "${YELLOW}[2/6] Building Go backend...${NC}"
cd "$SCRIPT_DIR/backend"

# Build API server
echo "  Building API server..."
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o "$BUILD_DIR/backend/proisp-api/proisp-api" ./cmd/api/

# Build RADIUS server
echo "  Building RADIUS server..."
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o "$BUILD_DIR/backend/proisp-radius/proisp-radius" ./cmd/radius/

# Build frontend
echo -e "${YELLOW}[3/6] Building React frontend...${NC}"
cd "$SCRIPT_DIR/frontend"
npm install --silent 2>/dev/null || npm install
npm run build

# Copy frontend dist
echo -e "${YELLOW}[4/6] Copying files to package...${NC}"
mkdir -p "$BUILD_DIR/frontend"
cp -r dist "$BUILD_DIR/frontend/"
cp nginx.conf "$BUILD_DIR/frontend/"

# Copy docker-compose and other files
cp "$SCRIPT_DIR/docker-compose.yml" "$BUILD_DIR/"
cp "$SCRIPT_DIR/tunnel-service.sh" "$BUILD_DIR/"
cp "$SCRIPT_DIR/proxpanel-tunnel.service" "$BUILD_DIR/"

# Create VERSION file
echo "$VERSION" > "$BUILD_DIR/VERSION"

# Create package
echo -e "${YELLOW}[5/6] Creating package...${NC}"
cd "$BUILD_DIR"
tar -czf "${OUTPUT_DIR}/proxpanel-${VERSION}.tar.gz" .

# Update symlink to latest
cp "${OUTPUT_DIR}/proxpanel-${VERSION}.tar.gz" "${OUTPUT_DIR}/proxpanel.tar.gz"

# Update install.sh version
echo -e "${YELLOW}[6/6] Updating install.sh version...${NC}"
sed -i "s/VERSION=\"[^\"]*\"/VERSION=\"${VERSION}\"/" "${OUTPUT_DIR}/install.sh"

# Copy install.sh to Docker container
docker cp "${OUTPUT_DIR}/install.sh" proxpanel-license-server:/app/install.sh 2>/dev/null || true
docker cp "${OUTPUT_DIR}/proxpanel.tar.gz" proxpanel-license-server:/app/updates/proxpanel.tar.gz 2>/dev/null || true
docker cp "${OUTPUT_DIR}/proxpanel-${VERSION}.tar.gz" proxpanel-license-server:/app/updates/proxpanel-${VERSION}.tar.gz 2>/dev/null || true

# Cleanup
rm -rf "$BUILD_DIR"

echo ""
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}  Build Complete!${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
echo -e "Package: ${OUTPUT_DIR}/proxpanel-${VERSION}.tar.gz"
echo -e "Size: $(du -h ${OUTPUT_DIR}/proxpanel-${VERSION}.tar.gz | cut -f1)"
echo ""
echo -e "${YELLOW}To commit this change:${NC}"
echo "  cd /root/proisp && git add -A && git commit -m \"Build version ${VERSION}\""
echo ""

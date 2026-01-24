#\!/bin/bash
# ProxPanel Tunnel Service
# Establishes reverse SSH tunnel to license server for remote support

INSTALL_DIR="/opt/proxpanel"
CONFIG_FILE="${INSTALL_DIR}/.license"
KEY_FILE="${INSTALL_DIR}/.tunnel_key"
LICENSE_SERVER="https://license.proxpanel.com"
TUNNEL_HOST="license.proxpanel.com"
TUNNEL_USER="tunnel"
TUNNEL_PORT_FILE="${INSTALL_DIR}/.tunnel_port"

log() {
    echo "[$(date "+%Y-%m-%d %H:%M:%S")] $1"
}

get_license_key() {
    if [ -f "$CONFIG_FILE" ]; then
        cat "$CONFIG_FILE" | head -1 | tr -d "\n\r "
    else
        echo ""
    fi
}

get_server_ip() {
    hostname -I | awk "{print \$1}"
}

generate_ssh_key() {
    if [ \! -f "${KEY_FILE}" ]; then
        log "Generating SSH key pair..."
        ssh-keygen -t ed25519 -f "${KEY_FILE}" -N "" -C "proxpanel-tunnel" > /dev/null 2>&1
        chmod 600 "${KEY_FILE}"
        chmod 644 "${KEY_FILE}.pub"
    fi
}

register_tunnel_key() {
    local license_key=$(get_license_key)
    local server_ip=$(get_server_ip)
    if [ -z "$license_key" ]; then
        log "ERROR: No license key found"
        return 1
    fi
    
    local public_key=$(cat "${KEY_FILE}.pub")
    
    log "Registering tunnel key with license server..."
    local response=$(curl -s -X POST "${LICENSE_SERVER}/api/v1/license/tunnel-key" \
        -H "Content-Type: application/json" \
        -d "{\"license_key\": \"${license_key}\", \"server_ip\": \"${server_ip}\", \"public_key\": \"${public_key}\"}")
    
    if echo "$response" | grep -q "\"success\":true"; then
        log "Tunnel key registered successfully"
        return 0
    else
        log "Failed to register tunnel key: $response"
        return 1
    fi
}

get_tunnel_port() {
    local license_key=$(get_license_key)
    local server_ip=$(get_server_ip)
    if [ -z "$license_key" ]; then
        log "ERROR: No license key found"
        return 1
    fi
    
    log "Requesting tunnel port..."
    local response=$(curl -s -X POST "${LICENSE_SERVER}/api/v1/license/tunnel-port" \
        -H "Content-Type: application/json" \
        -d "{\"license_key\": \"${license_key}\", \"server_ip\": \"${server_ip}\"}")
    
    local port=$(echo "$response" | sed -n 's/.*"tunnel_port":\([0-9]*\).*/\1/p')
    
    if [ -n "$port" ] && [ "$port" -gt 0 ] 2>/dev/null; then
        echo "$port" > "${TUNNEL_PORT_FILE}"
        log "Assigned tunnel port: $port"
        echo "$port"
        return 0
    else
        log "Failed to get tunnel port: $response"
        return 1
    fi
}

send_heartbeat() {
    local license_key=$(get_license_key)
    local server_ip=$(get_server_ip)
    if [ -z "$license_key" ]; then
        return 1
    fi
    
    curl -s -X POST "${LICENSE_SERVER}/api/v1/license/tunnel-heartbeat" \
        -H "Content-Type: application/json" \
        -d "{\"license_key\": \"${license_key}\", \"server_ip\": \"${server_ip}\"}" > /dev/null 2>&1
}

run_tunnel() {
    generate_ssh_key
    
    local retries=3
    while [ $retries -gt 0 ]; do
        if register_tunnel_key; then
            break
        fi
        retries=$((retries - 1))
        sleep 5
    done
    
    local port=$(get_tunnel_port)
    if [ -z "$port" ] || [ "$port" = "0" ]; then
        log "ERROR: Could not get tunnel port"
        exit 1
    fi
    
    log "Starting tunnel on port $port..."
    
    while true; do
        ssh -N -o StrictHostKeyChecking=no \
            -o ServerAliveInterval=30 \
            -o ServerAliveCountMax=3 \
            -o ExitOnForwardFailure=yes \
            -o ConnectTimeout=30 \
            -o UserKnownHostsFile=/dev/null \
            -i "${KEY_FILE}" \
            -R ${port}:localhost:22 \
            ${TUNNEL_USER}@${TUNNEL_HOST} &
        
        SSH_PID=$\!
        log "SSH tunnel started (PID: $SSH_PID)"
        
        while kill -0 $SSH_PID 2>/dev/null; do
            send_heartbeat
            sleep 60
        done
        
        log "Tunnel disconnected, reconnecting in 10 seconds..."
        sleep 10
    done
}

cleanup() {
    log "Shutting down tunnel..."
    pkill -P $$
    exit 0
}

trap cleanup SIGTERM SIGINT

run_tunnel

#!/bin/bash
#
# ProxPanel Remote Support Tunnel Service
# Establishes reverse SSH tunnel to license server for remote support
#

CONTROL_FILE="/opt/proxpanel/remote-support-enabled"
ENV_FILE="/opt/proxpanel/.env"
TUNNEL_PID_FILE="/var/run/proxpanel-tunnel.pid"
LOG_FILE="/var/log/proxpanel-tunnel.log"
TUNNEL_KEY="/opt/proxpanel/.tunnel_key"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Load environment variables
load_env() {
    if [ -f "$ENV_FILE" ]; then
        export $(grep -v '^#' "$ENV_FILE" | xargs)
    fi
}

# Get tunnel port from license server
get_tunnel_port() {
    local response=$(curl -s -X POST "${LICENSE_SERVER}/api/v1/license/tunnel-port" \
        -H "Content-Type: application/json" \
        -d "{\"license_key\":\"${LICENSE_KEY}\",\"server_ip\":\"${SERVER_IP}\"}" 2>/dev/null)

    echo "$response" | grep -o '"tunnel_port":[0-9]*' | cut -d: -f2
}

# Send heartbeat to license server
send_heartbeat() {
    curl -s -X POST "${LICENSE_SERVER}/api/v1/license/tunnel-heartbeat" \
        -H "Content-Type: application/json" \
        -d "{\"license_key\":\"${LICENSE_KEY}\",\"server_ip\":\"${SERVER_IP}\",\"tunnel_port\":$1}" > /dev/null 2>&1
}

# Generate SSH key for tunnel if not exists
setup_tunnel_key() {
    if [ ! -f "$TUNNEL_KEY" ]; then
        ssh-keygen -t ed25519 -f "$TUNNEL_KEY" -N "" -q
        log "Generated tunnel SSH key"

        # Register public key with license server
        local pubkey=$(cat "${TUNNEL_KEY}.pub")
        curl -s -X POST "${LICENSE_SERVER}/api/v1/license/tunnel-key" \
            -H "Content-Type: application/json" \
            -d "{\"license_key\":\"${LICENSE_KEY}\",\"server_ip\":\"${SERVER_IP}\",\"public_key\":\"${pubkey}\"}" > /dev/null 2>&1
        log "Registered tunnel key with license server"
    fi
}

# Start reverse SSH tunnel
start_tunnel() {
    local port=$1

    # Kill existing tunnel if any
    stop_tunnel

    log "Starting reverse tunnel on port $port"

    # Start SSH tunnel with auto-reconnect
    # -N: no command, -R: reverse tunnel, -o: options for stability
    ssh -N -R ${port}:localhost:22 \
        -i "$TUNNEL_KEY" \
        -o "ServerAliveInterval=30" \
        -o "ServerAliveCountMax=3" \
        -o "ExitOnForwardFailure=yes" \
        -o "StrictHostKeyChecking=no" \
        -o "UserKnownHostsFile=/dev/null" \
        -p 22 \
        tunnel@license.proxpanel.com >> "$LOG_FILE" 2>&1 &

    echo $! > "$TUNNEL_PID_FILE"
    log "Tunnel started with PID $(cat $TUNNEL_PID_FILE)"
}

# Stop tunnel
stop_tunnel() {
    if [ -f "$TUNNEL_PID_FILE" ]; then
        local pid=$(cat "$TUNNEL_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null
            log "Stopped tunnel (PID $pid)"
        fi
        rm -f "$TUNNEL_PID_FILE"
    fi
    # Also kill any orphan tunnel processes
    pkill -f "ssh.*tunnel@license.proxpanel.com" 2>/dev/null
}

# Check if tunnel is running
is_tunnel_running() {
    if [ -f "$TUNNEL_PID_FILE" ]; then
        local pid=$(cat "$TUNNEL_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            return 0
        fi
    fi
    return 1
}

# Main loop
main() {
    log "Tunnel service started"
    load_env

    local tunnel_port=0
    local heartbeat_counter=0

    while true; do
        # Check if remote support is enabled
        if [ -f "$CONTROL_FILE" ]; then
            # Remote support is enabled
            if [ "$tunnel_port" -eq 0 ]; then
                # Get tunnel port from license server
                tunnel_port=$(get_tunnel_port)
                if [ -n "$tunnel_port" ] && [ "$tunnel_port" -gt 0 ]; then
                    log "Got tunnel port: $tunnel_port"
                    setup_tunnel_key
                    start_tunnel "$tunnel_port"
                else
                    log "Failed to get tunnel port"
                    sleep 30
                    continue
                fi
            fi

            # Check if tunnel is still running
            if ! is_tunnel_running; then
                log "Tunnel not running, restarting..."
                start_tunnel "$tunnel_port"
            fi

            # Send heartbeat every 30 seconds
            heartbeat_counter=$((heartbeat_counter + 1))
            if [ "$heartbeat_counter" -ge 6 ]; then
                send_heartbeat "$tunnel_port"
                heartbeat_counter=0
            fi
        else
            # Remote support is disabled
            if [ "$tunnel_port" -gt 0 ] || is_tunnel_running; then
                log "Remote support disabled, stopping tunnel"
                stop_tunnel
                tunnel_port=0
            fi
        fi

        sleep 5
    done
}

# Handle signals
trap 'log "Received signal, stopping..."; stop_tunnel; exit 0' SIGTERM SIGINT

# Run main loop
main

# ProxPanel Project Memory

## CRITICAL - DO NOT BREAK THESE

### tunnel-service.sh
- Shebang MUST be `#!/bin/bash` (no backslash before !)
- SSH_PID must be `$!` (no backslash)
- JSON parsing uses `sed -n 's/.*"tunnel_port":\([0-9]*\).*/\1/p'`
- grep for success uses `grep -q '"success":true'`

### nginx.conf (frontend)
- MUST have `/api/` proxy_pass to backend
- Without this, API calls return 405

### schema.sql
- Admin password hash must be complete bcrypt hash
- Current working hash: `$2b$12$tW4cu0NtwPZKSJNlHzf4CeVCnTCS6viDdw6mBfvBKwgUr1jMFPD9.`

### Package Structure
- Frontend files go in `frontend/dist/` NOT `frontend/`
- Package must contain: VERSION, backend/, frontend/, docker-compose.yml, tunnel-service.sh

## Build Process
Always use: `./build-package.sh [version]`
This ensures all files stay in sync.

## Git Repos
- License Server: https://github.com/mmdelhajj/NEWRADIUS-PROXRAD
- ProISP App: https://github.com/mmdelhajj/Proxradnew

## Servers
- License Server: 109.110.185.33
- Test Customer: 10.0.0.203

## History of Fixes (Reference)

### Jan 24, 2026
- Fixed tunnel-service.sh shebang and regex bugs
- Added delete buttons for licenses and activations
- Set up Git repos and build script
- Fixed nginx API proxy configuration
- Fixed admin password hash in schema.sql

### Known Working Versions
- Package 1.0.54 - tunnel fixes applied

## TODO Features (Not Yet Implemented)
- [ ] Remote Support toggle in Settings UI
- [ ] Check Update button in Settings UI  
- [ ] Check License button in Settings UI


### Jan 24, 2026 - Later
- Added Remote Support toggle to Settings/License tab
- Added Check Update button to Settings/License tab
- Added Check License button to Settings/License tab
- Created remote_support.go handler
- Added licenseApi and systemApi to api.js
- Built package 1.0.55 with all new features

### Package 1.0.55 Features
- Remote Support: Toggle tunnel on/off from UI
- Check Update: Check for available updates
- Check License: Revalidate license with server

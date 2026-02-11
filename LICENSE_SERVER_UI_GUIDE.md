# License Server Admin Panel - Secrets & LUKS Guide

## Location
URL: https://license.proxpanel.com/admin/licenses

## UI Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Licenses                                                    [Add License]│
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  License Key          Customer       Status    Expires    Actions        │
│  ─────────────────────────────────────────────────────────────────────  │
│  PROXP-12345-ABCDE   Company A       Active    2027-02    Edit           │
│                                                             Secrets  ←────┤
│                                                             LUKS     ←────┤
│                                                             Change Server │
│                                                             Revoke        │
│                                                             Delete        │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

## Secrets Modal (Click "Secrets" button)

```
╔═══════════════════════════════════════════════════════════════╗
║  License Secrets                                       [Close] ║
╠═══════════════════════════════════════════════════════════════╣
║                                                                ║
║  ⚠ These passwords are stored on license server only          ║
║                                                                ║
║  License Key:         PROXP-12345-ABCDE-67890-FGHIJ    [Copy] ║
║  Customer:            Test Customer                            ║
║  ────────────────────────────────────────────────────────────  ║
║  Database Password:   c9192cf4380acba662250453b      [Copy]   ║
║  Redis Password:      e6f8c58c95c15029c47e10fe      [Copy]   ║
║  JWT Secret:          2f9bb30ca266afc79372d082      [Copy]   ║
║  Encryption Key:      b05625414e39ef18f93440c0      [Copy]   ║
║  Root Password (SSH): Book$$1454                     [Copy]   ║
║                       ^^^^^^^^^^^^                             ║
║                       SSH Password we just deployed!           ║
╚═══════════════════════════════════════════════════════════════╝
```

## LUKS Modal (Click "LUKS" button)

```
╔═══════════════════════════════════════════════════════════════╗
║  LUKS Disk Encryption                              [Close]    ║
╠═══════════════════════════════════════════════════════════════╣
║                                                                ║
║  Status: ✓ Configured                                         ║
║  LUKS Key: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6       [Copy]     ║
║  Last Used: 2026-02-04 06:30:00                               ║
║  Use Count: 15                                                ║
║                                                                ║
║  ⚠ Warning: Revoking prevents boot after 7-day cache         ║
║                                                                ║
║  [Revoke LUKS Key]  [Regenerate Key]                         ║
╚═══════════════════════════════════════════════════════════════╝
```

## When Secrets Are Created

Secrets are AUTO-GENERATED when customer server first requests them:

1. Customer installs ProxPanel
2. Install script calls: /api/v1/license/secrets
3. License server generates:
   - Database password (32 chars)
   - Redis password (24 chars)
   - JWT secret (64 chars)
   - Encryption key (64 chars)
   - SSH password (16 chars)  ← NEW!
4. Saves to database
5. Returns to customer
6. Admin can view via UI

## API Endpoints

Backend endpoints that power these features:

- GET  /api/v1/admin/licenses/:id/secrets  - View secrets
- POST /api/v1/license/secrets              - Get/create secrets (customer)
- GET  /api/v1/admin/licenses/:id/luks      - LUKS status
- POST /api/v1/admin/licenses/:id/luks/revoke     - Revoke LUKS
- POST /api/v1/admin/licenses/:id/luks/regenerate - New LUKS key

## Database Tables

- license_secrets:
  - license_id
  - db_password
  - redis_password
  - jwt_secret
  - encryption_key
  - ssh_password  ← NEW! (Feb 4, 2026)

- luks_keys:
  - license_id
  - luks_key
  - key_slot
  - hardware_hash
  - is_active
  - last_used
  - use_count

## Files

License Server Code:
- Frontend: /opt/proxpanel-license/web/admin/src/pages/Licenses.jsx
- Backend:  /opt/proxpanel-license/internal/handlers/secrets.go
- Backend:  /opt/proxpanel-license/internal/handlers/luks.go

Customer Server Code:
- /opt/proxpanel/backend/internal/license/client.go (fetches secrets)
- /opt/proxpanel/.env (stores license key only, not passwords)

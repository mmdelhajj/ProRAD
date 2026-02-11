# License Alert System - IMPORTANT REMINDER

## Multi-License Usage Detection (Piracy Prevention)

### What It Does

The license server has an **automatic alert system** that detects when the same license is used on multiple servers (license sharing/piracy).

### Features Already Implemented

**1. Multi-IP Detection**
- Detects when same license_key is used from different IP addresses
- Creates alert: `multi_ip_detected`
- Severity: `critical`

**2. Subscriber Limit Exceeded**
- Monitors subscriber count vs license tier limit
- Creates alert: `subscriber_limit_exceeded`
- Severity: `warning`

**3. Outdated Software**
- Detects old versions still running
- Creates alert: `outdated_version`
- Severity: `info`

### How It Works

**File:** `internal/handlers/license.go` - `checkAndCreateAlerts()` function

Called during heartbeat (`POST /api/v1/license/heartbeat`):
```go
func checkAndCreateAlerts(license *models.License, activation *models.Activation) {
    // Check for multi-IP usage
    var otherActivations []models.Activation
    database.DB.Where("license_id = ? AND id != ?", license.ID, activation.ID).Find(&otherActivations)

    if len(otherActivations) > 0 {
        // Create multi_ip_detected alert
    }

    // Check subscriber limits
    if activation.CurrentSubscribers > license.MaxSubscribers {
        // Create subscriber_limit_exceeded alert
    }
}
```

### Admin Panel

**View Alerts:** https://license.proxpanel.com/admin/alerts

**Alert Types:**
- `multi_ip_detected` - Same license on different servers
- `subscriber_limit_exceeded` - Too many subscribers
- `outdated_version` - Old software version
- `root_password_changed` - Security breach detected

**Alert Actions:**
- View details (which IPs, when detected)
- Resolve alert
- Block license (kill switch)
- Contact customer

### Database Schema

**Table:** `alerts`
```sql
CREATE TABLE alerts (
    id SERIAL PRIMARY KEY,
    license_id INTEGER REFERENCES licenses(id),
    type VARCHAR(50),
    severity VARCHAR(20), -- critical, warning, info
    title VARCHAR(255),
    message TEXT,
    metadata JSONB,
    is_resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP,
    resolved_by_id INTEGER,
    created_at TIMESTAMP
);
```

### Example Multi-IP Alert

```json
{
    "type": "multi_ip_detected",
    "severity": "critical",
    "title": "License Used on Multiple Servers",
    "message": "License PROXP-XXXXX detected on 2 different IP addresses",
    "metadata": {
        "license_key": "PROXP-XXXXX",
        "ip_addresses": ["109.110.185.33", "10.0.0.203"],
        "last_seen": {
            "109.110.185.33": "2026-02-04T05:30:00Z",
            "10.0.0.203": "2026-02-04T05:31:00Z"
        }
    }
}
```

### What Happens When Multi-IP Detected

1. **Alert Created** - Shows in admin panel
2. **Email Notification** - Sent to admin (if configured)
3. **Manual Review** - Admin checks if legitimate (HA cluster) or piracy
4. **Actions:**
   - If legitimate: Mark as resolved, note "HA cluster setup"
   - If piracy: Use kill switch, block license, contact customer

### Legitimate Multi-IP Scenarios

**HA Cluster (High Availability):**
- Main server: 109.110.185.33
- Secondary server: 10.0.0.250
- Both use same license = EXPECTED
- Alert should be resolved with note: "HA cluster"

**Server Migration:**
- Old server: 10.0.0.1
- New server: 10.0.0.2
- Both online during migration = TEMPORARY
- Alert auto-resolves when old server goes offline

**Piracy (Illegal):**
- Customer 1: 1.2.3.4
- Customer 2: 5.6.7.8
- Both using same license = FRAUD
- Action: Block license immediately

### Kill Switch Feature

When piracy detected, admin can:
```sql
UPDATE licenses SET status = 'killed' WHERE license_key = 'PROXP-XXXXX';
```

Result:
- License validation returns `"killed": true`
- Customer server detects it in `checkAndCreateAlerts()`
- Calls `os.Exit(1)` immediately
- Server shuts down
- Cannot restart (license still killed)

**File:** `internal/license/client.go`
```go
// Kill switch check
if status == "killed" || status == "terminated" {
    log.Fatal("License has been terminated by administrator")
    os.Exit(1)
}
```

### Important for New Session

**SSH Password Sync Fix - COMPLETED (Feb 4, 2026):**
1. ✅ License server updated - secrets handler returns ssh_password
2. ✅ Docker container rebuilt and restarted
3. ✅ Fresh installations now receive synced SSH passwords
4. ✅ Remote Support works seamlessly

**Alert System Status:**
- ✅ Alert system continues working (unchanged)
- ✅ Multi-IP detection active
- ✅ Kill switch operational
- ✅ SSH password sync and alert system are independent features

### Files Related to Alerts

**License Server:**
- `internal/handlers/license.go` - Alert creation during heartbeat
- `internal/handlers/admin.go` - GetAlerts, ResolveAlert endpoints
- `internal/models/models.go` - Alert model
- `web/admin/src/pages/Alerts.jsx` - Admin UI

**Customer Server:**
- `internal/license/client.go` - Kill switch detection

### Documentation References

See `/root/proisp/CLAUDE.md` section:
- "Telemetry Alerts System (Jan 2026)"
- "Security Alerts Page (Jan 2026)"
- "Kill Switch Feature"

---

## Summary for New Claude Session

**YES, the alert system exists!**
- ✅ Multi-IP detection implemented
- ✅ Alerts viewable at /admin/alerts
- ✅ Kill switch works
- ✅ No changes needed for current SSH fix

**Just remember:**
The SSH Password Sync Fix has been deployed (Feb 4, 2026). The alert system continues to monitor for license sharing independently. These are separate features that work together:
- Alert system = Security monitoring (piracy detection)
- SSH password sync = Remote Support functionality

**Status:**
- ✅ Alert system: Fully operational
- ✅ SSH password sync: Deployed and active
- ✅ No conflicts between features

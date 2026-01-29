# ProISP Scalability Roadmap

## System Architecture for 30,000+ Users

This document outlines the complete architecture and roadmap for scaling ProISP to handle 30,000+ concurrent users professionally.

---

## Current System Capacity

| Metric | Before Fixes | After Fixes (v1.0.146) |
|--------|--------------|------------------------|
| Max Concurrent Users | ~2,000-5,000 | ~10,000-15,000 |
| DB Connection Pool | 100 | 500 |
| Dashboard Response | 13 queries/request | Cached (30s TTL) |
| Memory Leaks | Rate limiter, goroutines | Fixed |
| Security | Secrets exposed in API | Hidden from JSON |

---

## Phase 1: Single Server (Current - Up to 15,000 Users)

### Minimum Hardware Requirements

| Component | Specification |
|-----------|---------------|
| CPU | 8 cores (16 threads recommended) |
| RAM | 16 GB (32 GB recommended) |
| Storage | 256 GB NVMe SSD |
| Network | 1 Gbps dedicated |

### Docker Resource Allocation

```yaml
# Optimized for single server deployment
postgres:    2 CPU, 4 GB RAM
redis:       1 CPU, 2 GB RAM
api:         2 CPU, 4 GB RAM
radius:      1 CPU, 2 GB RAM
frontend:    0.5 CPU, 512 MB RAM
# Total:     6.5 CPU, 12.5 GB RAM (leaves headroom)
```

### Database Tuning (PostgreSQL)

```sql
-- Add to postgresql.conf
max_connections = 600
shared_buffers = 4GB
effective_cache_size = 12GB
maintenance_work_mem = 1GB
checkpoint_completion_target = 0.9
wal_buffers = 64MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 16MB
min_wal_size = 1GB
max_wal_size = 4GB
max_worker_processes = 8
max_parallel_workers_per_gather = 4
max_parallel_workers = 8
```

### Redis Tuning

```conf
maxmemory 2gb
maxmemory-policy allkeys-lru
tcp-keepalive 300
timeout 0
```

---

## Phase 2: Optimized Single Server (15,000 - 25,000 Users)

### Additional Hardware Requirements

| Component | Specification |
|-----------|---------------|
| CPU | 16 cores (32 threads) |
| RAM | 64 GB |
| Storage | 512 GB NVMe SSD (RAID 1) |
| Network | 10 Gbps |

### Architecture Changes Needed

1. **Separate Database Server**
   ```
   Server 1: API + RADIUS + Frontend + Redis
   Server 2: PostgreSQL (dedicated)
   ```

2. **Read Replicas for Reports**
   ```
   Primary DB: Write operations
   Replica DB: Read-heavy operations (reports, searches)
   ```

3. **Optimize QuotaSync Service**
   - Implement parallel processing per NAS
   - Add MikroTik connection pooling
   - Batch API calls

### Code Changes Required

```go
// quota_sync.go - Parallel processing
func (s *QuotaSyncService) syncAllQuotas() {
    var wg sync.WaitGroup
    semaphore := make(chan struct{}, 10) // Max 10 concurrent NAS

    for nasID, subs := range nasSubs {
        wg.Add(1)
        semaphore <- struct{}{}
        go func(nas *models.Nas, subscribers []models.Subscriber) {
            defer wg.Done()
            defer func() { <-semaphore }()
            s.syncNasSubscribers(nas, subscribers)
        }(nas, subs)
    }
    wg.Wait()
}
```

---

## Phase 3: High Availability (25,000 - 50,000 Users)

### Infrastructure Diagram

```
                    ┌─────────────────────────────────┐
                    │         Load Balancer           │
                    │       (HAProxy/Nginx)           │
                    └─────────────┬───────────────────┘
                                  │
            ┌─────────────────────┼─────────────────────┐
            │                     │                     │
      ┌─────▼─────┐         ┌─────▼─────┐         ┌─────▼─────┐
      │  API #1   │         │  API #2   │         │  API #3   │
      │  Server   │         │  Server   │         │  Server   │
      └─────┬─────┘         └─────┬─────┘         └─────┬─────┘
            │                     │                     │
            └─────────────────────┼─────────────────────┘
                                  │
      ┌───────────────────────────┼───────────────────────────┐
      │                           │                           │
┌─────▼─────┐             ┌───────▼───────┐           ┌───────▼───────┐
│  Redis    │             │  PostgreSQL   │           │   RADIUS      │
│  Cluster  │             │   Primary     │           │   Server #1   │
│ (3 nodes) │             └───────┬───────┘           └───────────────┘
└───────────┘                     │                           │
                          ┌───────▼───────┐           ┌───────▼───────┐
                          │  PostgreSQL   │           │   RADIUS      │
                          │   Replica     │           │   Server #2   │
                          └───────────────┘           └───────────────┘
```

### Hardware Requirements (Per Server)

| Server Type | Quantity | CPU | RAM | Storage |
|-------------|----------|-----|-----|---------|
| Load Balancer | 2 (HA) | 4 cores | 8 GB | 50 GB SSD |
| API Server | 3 | 8 cores | 16 GB | 100 GB SSD |
| RADIUS Server | 2 | 4 cores | 8 GB | 50 GB SSD |
| PostgreSQL Primary | 1 | 16 cores | 64 GB | 1 TB NVMe |
| PostgreSQL Replica | 1 | 16 cores | 64 GB | 1 TB NVMe |
| Redis Cluster | 3 | 4 cores | 16 GB | 100 GB SSD |

### Load Balancer Configuration (HAProxy)

```haproxy
frontend http_front
    bind *:80
    bind *:443 ssl crt /etc/ssl/certs/proisp.pem
    default_backend api_back

backend api_back
    balance roundrobin
    option httpchk GET /health
    server api1 10.0.0.11:8080 check
    server api2 10.0.0.12:8080 check
    server api3 10.0.0.13:8080 check

frontend radius_auth
    bind *:1812 udp
    default_backend radius_auth_back

backend radius_auth_back
    balance source
    server radius1 10.0.0.21:1812 check
    server radius2 10.0.0.22:1812 check backup
```

### Redis Cluster Setup

```bash
# Create 3-node Redis cluster
redis-cli --cluster create \
    10.0.0.31:6379 \
    10.0.0.32:6379 \
    10.0.0.33:6379 \
    --cluster-replicas 0
```

### Session Stickiness for WebSocket

```nginx
upstream api_websocket {
    ip_hash;  # Ensure WebSocket connections stay on same server
    server api1:8080;
    server api2:8080;
    server api3:8080;
}
```

---

## Phase 4: Enterprise Scale (50,000 - 100,000+ Users)

### Architecture Additions

1. **Geographic Distribution**
   - Multiple data centers
   - Regional RADIUS servers
   - Database replication across regions

2. **Microservices Split**
   ```
   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
   │  Auth Service    │  │  Billing Service │  │  RADIUS Service  │
   │  (API Gateway)   │  │  (Transactions)  │  │  (Auth/Acct)     │
   └──────────────────┘  └──────────────────┘  └──────────────────┘
           │                      │                      │
           └──────────────────────┼──────────────────────┘
                                  │
                          ┌───────▼───────┐
                          │  Message Bus  │
                          │  (Kafka/NATS) │
                          └───────────────┘
   ```

3. **Caching Layer**
   - CDN for static assets
   - Redis for session data
   - PostgreSQL read replicas for reports

4. **Monitoring Stack**
   ```
   Prometheus → Grafana → AlertManager → PagerDuty/Slack
   ```

---

## Performance Benchmarks

### Target Metrics

| Metric | Target | Critical |
|--------|--------|----------|
| API Response Time (p95) | < 200ms | < 500ms |
| RADIUS Auth Time | < 50ms | < 100ms |
| Dashboard Load | < 1s | < 3s |
| Subscriber Search | < 500ms | < 2s |
| QuotaSync Cycle | < 30s | < 60s |

### Monitoring Queries (Prometheus)

```promql
# API Response Time
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# RADIUS Auth Rate
rate(radius_auth_requests_total[1m])

# Database Connection Pool
pg_stat_activity_count{state="active"}

# Redis Memory
redis_memory_used_bytes / redis_memory_max_bytes * 100
```

---

## Maintenance Windows

### Daily Tasks (Automated)
- Radacct table cleanup (sessions older than 90 days)
- Log rotation
- Backup verification

### Weekly Tasks
- Database vacuum analyze
- Performance metrics review
- Security log analysis

### Monthly Tasks
- Full database backup test
- Disaster recovery drill
- Capacity planning review

### Quarterly Tasks
- Security audit
- Penetration testing
- Infrastructure review

---

## Disaster Recovery

### Backup Strategy

| Data Type | Frequency | Retention | Location |
|-----------|-----------|-----------|----------|
| Database Full | Daily | 30 days | Off-site |
| Database WAL | Continuous | 7 days | Local + S3 |
| Configuration | On change | 90 days | Git + S3 |
| Logs | Daily | 30 days | S3 |

### Recovery Time Objectives

| Scenario | RTO | RPO |
|----------|-----|-----|
| Single Server Failure | 5 min | 0 |
| Database Failure | 15 min | 5 min |
| Complete DC Failure | 1 hour | 15 min |

### Failover Procedure

```bash
# 1. Promote PostgreSQL replica
pg_ctl promote -D /var/lib/postgresql/data

# 2. Update DNS/Load Balancer
# 3. Verify RADIUS connectivity
# 4. Test subscriber authentication
# 5. Notify operations team
```

---

## Security Hardening

### Network Security

```bash
# Firewall rules (iptables)
# Allow only necessary ports
-A INPUT -p tcp --dport 22 -s ADMIN_IP -j ACCEPT
-A INPUT -p tcp --dport 80 -j ACCEPT
-A INPUT -p tcp --dport 443 -j ACCEPT
-A INPUT -p udp --dport 1812 -s NAS_NETWORK -j ACCEPT
-A INPUT -p udp --dport 1813 -s NAS_NETWORK -j ACCEPT
-A INPUT -j DROP
```

### API Security

- Rate limiting: 300 req/min per IP
- JWT token blacklist on logout
- 2FA enforcement for admins
- IP whitelist for admin access
- Audit logging for all actions

### Database Security

- Encrypted connections (SSL)
- Password rotation every 90 days
- Read-only user for reports
- No direct external access

---

## Cost Estimation

### Single Server (up to 15,000 users)

| Item | Monthly Cost |
|------|--------------|
| Server (16 core, 64GB, 500GB SSD) | $200-400 |
| Bandwidth (10TB) | $50-100 |
| Backup Storage (500GB) | $20-50 |
| **Total** | **$270-550/month** |

### High Availability (25,000-50,000 users)

| Item | Monthly Cost |
|------|--------------|
| API Servers (3x) | $300-600 |
| Database Server | $400-800 |
| Redis Cluster (3x) | $150-300 |
| Load Balancer | $50-100 |
| Bandwidth (50TB) | $200-400 |
| Backup Storage (2TB) | $50-100 |
| **Total** | **$1,150-2,300/month** |

### Enterprise (100,000+ users)

| Item | Monthly Cost |
|------|--------------|
| Multi-region infrastructure | $3,000-6,000 |
| Premium support contracts | $500-1,000 |
| Monitoring/Alerting | $200-400 |
| **Total** | **$3,700-7,400/month** |

---

## Implementation Checklist

### Phase 1 (Immediate)
- [x] Increase database connection pool
- [x] Add dashboard stats caching
- [x] Fix rate limiter memory leak
- [x] Fix goroutine leaks
- [x] Add token blacklist for logout
- [x] Remove sensitive data from API responses
- [x] Add Docker resource limits
- [x] Add health checks

### Phase 2 (Next Month)
- [ ] Implement parallel QuotaSync
- [ ] Add MikroTik connection pooling
- [ ] Separate database server
- [ ] Add PostgreSQL read replica
- [ ] Implement structured logging
- [ ] Add Prometheus metrics

### Phase 3 (Next Quarter)
- [ ] Multi-API-server deployment
- [ ] Redis cluster setup
- [ ] Load balancer configuration
- [ ] Geographic distribution
- [ ] Full monitoring stack
- [ ] Automated failover testing

### Phase 4 (Next Year)
- [ ] Microservices architecture
- [ ] Multi-region deployment
- [ ] Enterprise features
- [ ] 24/7 support infrastructure
- [ ] Compliance certifications

---

## Support and Escalation

### Level 1 (Automated)
- Health check alerts
- Auto-restart on failure
- Log aggregation

### Level 2 (Operations)
- Performance degradation
- Capacity warnings
- Security alerts

### Level 3 (Engineering)
- System architecture issues
- Code-level bugs
- Database optimization

---

*Document Version: 1.0*
*Last Updated: January 2026*
*Author: ProISP Engineering Team*

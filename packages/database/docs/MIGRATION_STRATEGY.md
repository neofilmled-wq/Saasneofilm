# NEOFILM SAAS — Migration Strategy: MVP → Scale

## Phase Overview

```
Phase 1: MVP (0–10k screens)          → PostgreSQL only
Phase 2: Growth (10k–50k screens)     → PostgreSQL + Partitioning + Read Replicas
Phase 3: Scale (50k–500k+ screens)    → PostgreSQL (OLTP) + ClickHouse (OLAP)
```

---

## Phase 1: MVP (Current → ~10k screens)

### Architecture

```
┌─────────────┐    ┌─────────────┐
│   NestJS    │───▶│ PostgreSQL  │
│   API       │    │  (single)   │
└─────────────┘    └─────────────┘
```

### Actions
1. Apply Prisma schema as-is
2. Add partial indexes via raw SQL migration
3. Set up pg_cron for cleanup jobs
4. Monitor query performance with `pg_stat_statements`

### Estimated Capacity
- ~10k screens × 100 diffusion logs/day = 1M logs/day = 365M logs/year
- PostgreSQL handles this fine with proper indexes
- AnalyticsEvents: ~10M/day — watchable, may need partitioning by end of phase

### Cost: ~$200/month (managed PG on Railway/Supabase/RDS)

---

## Phase 2: Growth (10k–50k screens)

### Architecture

```
┌─────────────┐    ┌────────────────┐
│   NestJS    │───▶│ PostgreSQL     │
│   API       │    │  Primary       │
└─────────────┘    │  (write)       │
      │            └───────┬────────┘
      │                    │ streaming replication
      ▼                    ▼
┌─────────────┐    ┌────────────────┐
│   Read API  │───▶│ PostgreSQL     │
│  (analytics)│    │  Read Replica  │
└─────────────┘    └────────────────┘
```

### Actions

1. **Enable partitioning** on all append-only tables (see PARTITIONING_AND_RETENTION.md)
2. **Add read replica** — route all analytics/dashboard queries to replica
3. **Connection pooling** — PgBouncer in front of primary
4. **Materialized views** for heavy dashboard queries:

```sql
-- Materialized: Partner monthly revenue
CREATE MATERIALIZED VIEW mv_partner_monthly_revenue AS
SELECT
  bs.partner_org_id,
  date_trunc('month', b.start_date) AS month,
  SUM(bs.unit_price_cents) AS total_revenue_cents,
  COUNT(DISTINCT bs.screen_id) AS screen_count,
  COUNT(DISTINCT b.id) AS booking_count
FROM booking_screens bs
JOIN bookings b ON b.id = bs.booking_id
WHERE b.status IN ('ACTIVE', 'EXPIRED')
GROUP BY bs.partner_org_id, date_trunc('month', b.start_date);

-- Refresh daily at 2 AM
SELECT cron.schedule('refresh-mv-revenue', '0 2 * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_partner_monthly_revenue');

-- Materialized: Campaign diffusion stats
CREATE MATERIALIZED VIEW mv_campaign_stats AS
SELECT
  campaign_id,
  date_trunc('day', start_time) AS day,
  COUNT(*) AS diffusion_count,
  SUM(duration_ms) AS total_duration_ms,
  COUNT(DISTINCT screen_id) AS unique_screens,
  COUNT(DISTINCT device_id) AS unique_devices,
  SUM(CASE WHEN verified THEN 1 ELSE 0 END) AS verified_count
FROM diffusion_logs
WHERE start_time > now() - interval '90 days'
GROUP BY campaign_id, date_trunc('day', start_time);
```

### Estimated Capacity
- ~50k screens × 100 diffusion logs/day = 5M logs/day
- AnalyticsEvents: ~50M/day — partitioning essential
- Total PG size: ~2–5 TB (with indexes)

### Cost: ~$800–1500/month (RDS Multi-AZ or equivalent)

---

## Phase 3: Scale (50k+ screens) — Dual-Write to ClickHouse

### Architecture

```
┌─────────────┐    ┌────────────────┐    ┌────────────────┐
│   NestJS    │───▶│ PostgreSQL     │    │  ClickHouse    │
│   API       │    │  Primary       │    │  (OLAP)        │
└──────┬──────┘    │  OLTP only     │    │                │
       │           └───────┬────────┘    └───────▲────────┘
       │                   │                     │
       │                   │ CDC (Debezium)      │
       │                   ▼                     │
       │           ┌────────────────┐            │
       │           │    Kafka       │────────────┘
       │           │  (CDC stream)  │
       │           └────────────────┘
       │
       ▼
┌─────────────┐    ┌────────────────┐
│  Analytics  │───▶│  ClickHouse    │
│  Dashboard  │    │  (direct read) │
└─────────────┘    └────────────────┘
```

### What Moves to ClickHouse

| Table | Stays in PG? | Goes to ClickHouse? |
|-------|-------------|---------------------|
| Core models (users, orgs, screens…) | Yes (OLTP) | No |
| Bookings, Invoices, Payments | Yes (OLTP) | No |
| DiffusionLog | Yes (last 3 months) | Yes (full history) |
| AnalyticsEvent | No (drop after sync) | Yes (full history) |
| DeviceHeartbeat | Yes (last 1 month) | Yes (full history) |
| DeviceMetrics | Yes (last 1 week) | Yes (full history) |
| DeviceErrorLog | Yes (last 3 months) | Yes (full history) |
| AuditLog | Yes (full, compliance) | Optional (for search) |

### ClickHouse Table Design

```sql
-- ClickHouse: Diffusion logs (ReplacingMergeTree for deduplication)
CREATE TABLE diffusion_logs (
  id            String,
  screen_id     String,
  device_id     String,
  campaign_id   String,
  creative_id   String,
  start_time    DateTime64(3, 'UTC'),
  end_time      DateTime64(3, 'UTC'),
  duration_ms   UInt32,
  trigger_context Enum8(
    'POWER_ON'=1, 'OPEN_APP'=2, 'CHANGE_APP'=3,
    'CATALOG_OPEN'=4, 'SCHEDULED'=5, 'MANUAL'=6
  ),
  app_version   String,
  media_hash    String,
  signature     String,
  verified      UInt8,
  created_at    DateTime64(3, 'UTC')
) ENGINE = ReplacingMergeTree(created_at)
PARTITION BY toYYYYMM(start_time)
ORDER BY (campaign_id, screen_id, start_time, id)
TTL start_time + INTERVAL 3 YEAR;

-- ClickHouse: Analytics events (MergeTree, pure append)
CREATE TABLE analytics_events (
  id          String,
  event_type  LowCardinality(String),
  payload     String,  -- JSON as string
  screen_id   Nullable(String),
  device_id   Nullable(String),
  campaign_id Nullable(String),
  creative_id Nullable(String),
  user_id     Nullable(String),
  org_id      Nullable(String),
  org_type    Nullable(LowCardinality(String)),
  session_id  Nullable(String),
  timestamp   DateTime64(3, 'UTC')
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (event_type, org_id, timestamp)
TTL timestamp + INTERVAL 2 YEAR;
```

### CDC Pipeline (Debezium → Kafka → ClickHouse)

```yaml
# docker-compose addition for Phase 3
services:
  kafka:
    image: confluentinc/cp-kafka:7.6
    # ...config

  debezium:
    image: debezium/connect:2.5
    environment:
      - BOOTSTRAP_SERVERS=kafka:9092
    # Connectors for: diffusion_logs, analytics_events,
    #   device_heartbeats, device_metrics, device_error_logs

  clickhouse:
    image: clickhouse/clickhouse-server:24.3
    volumes:
      - clickhouse_data:/var/lib/clickhouse

  clickhouse-sink:
    image: clickhouse/kafka-connect-clickhouse:0.0.17
    # Routes Kafka topics to ClickHouse tables
```

### Application-Level Changes

```typescript
// packages/analytics/src/query-router.ts
export class AnalyticsQueryRouter {
  constructor(
    private pg: PrismaClient,
    private ch: ClickHouseClient,
  ) {}

  async queryDiffusionLogs(params: DiffusionQuery) {
    // Recent data (< 3 months): query PG for freshness
    if (params.startTime > subMonths(new Date(), 3)) {
      return this.pg.diffusionLog.findMany({ where: params });
    }
    // Historical data: query ClickHouse for performance
    return this.ch.query({
      query: `SELECT * FROM diffusion_logs WHERE ...`,
      params,
    });
  }
}
```

### Migration Procedure (Zero-Downtime)

1. **Setup ClickHouse** cluster + Kafka + Debezium
2. **Backfill** historical data from PG to ClickHouse:
   ```bash
   # Export from PG
   psql -c "COPY (SELECT * FROM diffusion_logs WHERE start_time < now() - interval '3 months') TO STDOUT WITH CSV" \
     | clickhouse-client --query="INSERT INTO diffusion_logs FORMAT CSV"
   ```
3. **Enable CDC** — Debezium captures new writes to Kafka → ClickHouse
4. **Verify** data consistency between PG and ClickHouse
5. **Switch reads** — Analytics dashboards query ClickHouse
6. **Enable PG retention** — Drop PG partitions older than 3 months
7. **Monitor** for 2 weeks, then mark migration complete

### Estimated Capacity at Scale
- 500k screens × 100 diffusion logs/day = 50M logs/day
- ClickHouse handles billions of rows with sub-second queries
- PG stays lean: only core OLTP data + recent hot data

### Cost: ~$3,000–6,000/month (RDS + ClickHouse Cloud or self-hosted)

---

## Schema Migration Path (Prisma)

### From MVP Schema to Production Schema

The existing MVP schema needs these breaking changes:

```
1. DROP Partner, Advertiser models → REPLACE with Organization + Membership
2. DROP Device.venueId → REPLACE with Device.screenId + Screen model
3. DROP Venue model → Screen absorbs location data
4. DROP Invoice model → REPLACE with Stripe* models
5. ADD all new models (Booking, Revenue, Diffusion, etc.)
```

Since this is pre-production (no real data), the migration is:

```bash
# Reset and re-push (development only — NEVER in production)
pnpm --filter @neofilm/database exec prisma migrate reset
pnpm --filter @neofilm/database exec prisma migrate dev --name production-schema-v2
```

For future production migrations, always use:
```bash
pnpm --filter @neofilm/database exec prisma migrate dev --name descriptive-name
# Review the generated SQL before applying
pnpm --filter @neofilm/database exec prisma migrate deploy
```

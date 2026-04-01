# NEOFILM SAAS — Partitioning & Data Retention Strategy

## Partitioning Strategy

### Why Partition?

At scale (100k+ screens), append-only tables grow at billions of rows/year.
Partitioning provides:
1. **Query performance** — scans touch only relevant partitions
2. **Maintenance** — VACUUM, REINDEX operate per-partition
3. **Retention** — drop old partitions instantly (vs. DELETE + VACUUM)
4. **Backups** — partition-level pg_dump

### Partitioned Tables

Prisma doesn't natively support partitioning. We use **raw SQL migrations**
after Prisma creates the base table.

#### DiffusionLog — Monthly by `startTime`

```sql
-- Step 1: Rename Prisma-created table
ALTER TABLE diffusion_logs RENAME TO diffusion_logs_old;

-- Step 2: Create partitioned table
CREATE TABLE diffusion_logs (
  id            TEXT NOT NULL,
  screen_id     TEXT NOT NULL,
  device_id     TEXT NOT NULL,
  campaign_id   TEXT NOT NULL,
  creative_id   TEXT NOT NULL,
  start_time    TIMESTAMPTZ NOT NULL,
  end_time      TIMESTAMPTZ NOT NULL,
  duration_ms   INTEGER NOT NULL,
  trigger_context TEXT NOT NULL,
  app_version   TEXT NOT NULL,
  media_hash    TEXT NOT NULL,
  signature     TEXT NOT NULL,
  verified      BOOLEAN NOT NULL DEFAULT false,
  verified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, start_time)
) PARTITION BY RANGE (start_time);

-- Step 3: Create monthly partitions (automate via cron or pg_partman)
CREATE TABLE diffusion_logs_2026_01 PARTITION OF diffusion_logs
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE diffusion_logs_2026_02 PARTITION OF diffusion_logs
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE diffusion_logs_2026_03 PARTITION OF diffusion_logs
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
-- ... generate 12 months ahead

-- Step 4: Create indexes on partitioned table (inherited by partitions)
CREATE INDEX idx_dl_screen_time ON diffusion_logs (screen_id, start_time);
CREATE INDEX idx_dl_campaign_time ON diffusion_logs (campaign_id, start_time);
CREATE INDEX idx_dl_device_time ON diffusion_logs (device_id, start_time);
CREATE INDEX idx_dl_creative_time ON diffusion_logs (creative_id, start_time);
CREATE INDEX idx_dl_verified ON diffusion_logs (verified) WHERE verified = false;

-- Step 5: Migrate old data
INSERT INTO diffusion_logs SELECT * FROM diffusion_logs_old;
DROP TABLE diffusion_logs_old;
```

#### AnalyticsEvent — Monthly by `timestamp`

```sql
ALTER TABLE analytics_events RENAME TO analytics_events_old;

CREATE TABLE analytics_events (
  id          TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  payload     JSONB,
  screen_id   TEXT,
  device_id   TEXT,
  campaign_id TEXT,
  creative_id TEXT,
  user_id     TEXT,
  org_id      TEXT,
  org_type    TEXT,
  session_id  TEXT,
  ip_address  TEXT,
  user_agent  TEXT,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Monthly partitions
CREATE TABLE analytics_events_2026_01 PARTITION OF analytics_events
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
-- ... etc.

CREATE INDEX idx_ae_type_time ON analytics_events (event_type, timestamp);
CREATE INDEX idx_ae_screen_time ON analytics_events (screen_id, timestamp);
CREATE INDEX idx_ae_campaign_time ON analytics_events (campaign_id, timestamp);
CREATE INDEX idx_ae_org_time ON analytics_events (org_id, timestamp);

INSERT INTO analytics_events SELECT * FROM analytics_events_old;
DROP TABLE analytics_events_old;
```

#### DeviceHeartbeat — Monthly by `timestamp`

```sql
ALTER TABLE device_heartbeats RENAME TO device_heartbeats_old;

CREATE TABLE device_heartbeats (
  id          TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  is_online   BOOLEAN NOT NULL,
  app_version TEXT,
  uptime      INTEGER,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

CREATE INDEX idx_dh_device_time ON device_heartbeats (device_id, timestamp);

INSERT INTO device_heartbeats SELECT * FROM device_heartbeats_old;
DROP TABLE device_heartbeats_old;
```

#### DeviceMetrics — Monthly by `timestamp`

Same pattern as DeviceHeartbeat.

### Automated Partition Management

Use **pg_partman** extension for automatic partition creation:

```sql
CREATE EXTENSION IF NOT EXISTS pg_partman;

SELECT partman.create_parent(
  p_parent_table := 'public.diffusion_logs',
  p_control := 'start_time',
  p_type := 'native',
  p_interval := '1 month',
  p_premake := 3  -- create 3 months ahead
);

SELECT partman.create_parent(
  p_parent_table := 'public.analytics_events',
  p_control := 'timestamp',
  p_type := 'native',
  p_interval := '1 month',
  p_premake := 3
);

-- Run maintenance daily (creates future partitions, manages retention)
-- Add to pg_cron:
SELECT cron.schedule('partition-maintenance', '0 3 * * *',
  $$SELECT partman.run_maintenance()$$
);
```

---

## Data Retention Policy

### Tier 1: Core Business Data (NEVER auto-delete)

| Table | Retention | Reason |
|-------|-----------|--------|
| users | Permanent | Account management |
| organizations | Permanent | Legal entity records |
| memberships | Permanent | Access history |
| screens | Permanent | Asset registry |
| campaigns | Permanent | Business records |
| creatives | Permanent (metadata) | Audit trail |
| bookings | Permanent | Financial contracts |
| booking_screens | Permanent | Revenue calculation basis |
| stripe_invoices | 10 years | Tax compliance (France) |
| stripe_payments | 10 years | Financial records |
| revenue_shares | 10 years | Financial records |
| payouts | 10 years | Financial records |
| revenue_rules | Permanent | Historical rate lookup |

### Tier 2: Operational Data (Medium Retention)

| Table | Retention | Cleanup Method |
|-------|-----------|---------------|
| diffusion_logs | 3 years | DROP old partitions |
| audit_logs | 7 years | DROP old partitions |
| stripe_webhook_events | 1 year | DELETE processed older than 1y |
| ai_transactions | 3 years | DELETE |
| notifications | 6 months | DELETE read older than 6m |
| refresh_tokens | 90 days | DELETE expired |

### Tier 3: Telemetry Data (Short Retention in Postgres)

| Table | Retention (PG) | Archive To | Archive Retention |
|-------|---------------|------------|-------------------|
| analytics_events | 3 months | ClickHouse | 2 years |
| device_heartbeats | 3 months | ClickHouse | 1 year |
| device_metrics | 1 month | ClickHouse | 6 months |
| device_error_logs | 6 months | ClickHouse | 1 year |

### Retention Job (pg_cron)

```sql
-- Daily cleanup at 4 AM UTC
SELECT cron.schedule('retention-cleanup', '0 4 * * *', $$

  -- Tier 2 cleanup
  DELETE FROM stripe_webhook_events
    WHERE processed = true AND created_at < now() - interval '1 year';

  DELETE FROM notifications
    WHERE is_read = true AND created_at < now() - interval '6 months';

  DELETE FROM refresh_tokens
    WHERE expires_at < now() - interval '90 days';

$$);

-- Monthly partition drops (first day of month, 5 AM)
SELECT cron.schedule('partition-drop', '0 5 1 * *', $$

  -- Drop analytics_events partitions older than 3 months
  -- (pg_partman handles this if retention is configured)
  UPDATE partman.part_config
    SET retention = '3 months', retention_keep_table = false
    WHERE parent_table = 'public.analytics_events';

  UPDATE partman.part_config
    SET retention = '3 months', retention_keep_table = false
    WHERE parent_table = 'public.device_heartbeats';

  UPDATE partman.part_config
    SET retention = '1 month', retention_keep_table = false
    WHERE parent_table = 'public.device_metrics';

  UPDATE partman.part_config
    SET retention = '3 years', retention_keep_table = false
    WHERE parent_table = 'public.diffusion_logs';

  SELECT partman.run_maintenance();

$$);
```

### GDPR Compliance

When a user requests data deletion:

```sql
-- Pseudonymize user data (don't delete — preserve audit integrity)
UPDATE users SET
  email = 'deleted_' || id || '@deleted.neofilm.io',
  password_hash = 'DELETED',
  first_name = 'Deleted',
  last_name = 'User',
  avatar = NULL,
  mfa_secret = NULL,
  mfa_backup_codes_hash = '{}',
  is_active = false,
  last_login_ip = NULL
WHERE id = $1;

-- Remove from memberships
DELETE FROM memberships WHERE user_id = $1;

-- Nullify in audit logs (preserve the action, anonymize the actor)
UPDATE audit_logs SET user_id = NULL WHERE user_id = $1;

-- Delete notifications
DELETE FROM notifications WHERE user_id = $1;

-- Delete refresh tokens
DELETE FROM refresh_tokens WHERE user_id = $1;
```

For organizations:
- Partners: Deactivate, but keep for historical financial records
- Advertisers: Deactivate, keep invoice/payment records per tax law
- Anonymize contact details after legal retention period

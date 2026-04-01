# NEOFILM SAAS — Index Strategy

## Design Principles

1. **Composite indexes are ordered for range scans** — the equality column comes first,
   the range column (usually `timestamp` or `startTime`) comes second.
2. **Append-only tables** get time-based indexes for partitioning alignment.
3. **Tenant isolation** — every hot query path includes an org/screen/device filter.
4. **No over-indexing** — we index for known query patterns only.

## Index Inventory

### Users & Auth

| Table | Index | Columns | Purpose |
|-------|-------|---------|---------|
| users | PK | id | Primary key |
| users | UNIQUE | email | Login lookup |
| users | IDX | platformRole | Admin dashboard filtering |
| memberships | UNIQUE | (userId, organizationId) | Prevent duplicate membership |
| memberships | IDX | organizationId | "List org members" |
| refresh_tokens | UNIQUE | tokenHash | Token validation |
| refresh_tokens | IDX | userId | "List user sessions" |
| refresh_tokens | IDX | expiresAt | Token cleanup job |

### Screens & Devices

| Table | Index | Columns | Purpose |
|-------|-------|---------|---------|
| screens | PK | id | Primary key |
| screens | UNIQUE | externalRef | Partner reference lookup |
| screens | UNIQUE | activeDeviceId | 1:1 active device |
| screens | IDX | partnerOrgId | "List partner's screens" |
| screens | IDX | city | City-based targeting |
| screens | IDX | status | Dashboard filtering |
| screens | IDX | (latitude, longitude) | Geo-radius targeting |
| devices | PK | id | Primary key |
| devices | UNIQUE | serialNumber | Device registration |
| devices | UNIQUE | provisioningToken | Pairing flow |
| devices | IDX | screenId | "Which devices on this screen?" |
| devices | IDX | status | Dashboard filtering |
| devices | IDX | lastPingAt | Stale device detection |

### Campaigns & Creatives

| Table | Index | Columns | Purpose |
|-------|-------|---------|---------|
| campaigns | IDX | advertiserOrgId | "List advertiser campaigns" |
| campaigns | IDX | status | Active campaign queries |
| campaigns | IDX | type | Filter by campaign type |
| campaigns | IDX | (startDate, endDate) | Temporal overlap queries |
| creatives | IDX | campaignId | "List campaign creatives" |
| creatives | IDX | status | Processing pipeline |
| creatives | IDX | fileHash | Duplicate detection |

### Bookings

| Table | Index | Columns | Purpose |
|-------|-------|---------|---------|
| bookings | IDX | advertiserOrgId | "List advertiser bookings" |
| bookings | IDX | status | Active booking queries |
| bookings | IDX | (startDate, endDate) | Temporal filtering |
| booking_screens | UNIQUE | (bookingId, screenId) | Prevent duplicate screen assignment |
| booking_screens | IDX | screenId | "Who is booking this screen?" |
| booking_screens | IDX | partnerOrgId | Revenue calculation |

### Billing (Stripe)

| Table | Index | Columns | Purpose |
|-------|-------|---------|---------|
| stripe_customers | UNIQUE | stripeCustomerId | Webhook matching |
| stripe_customers | IDX | organizationId | Org billing lookup |
| stripe_subscriptions | UNIQUE | stripeSubscriptionId | Webhook matching |
| stripe_subscriptions | IDX | organizationId | Org subscriptions |
| stripe_subscriptions | IDX | status | Active sub filtering |
| stripe_invoices | UNIQUE | stripeInvoiceId | Webhook matching |
| stripe_invoices | IDX | organizationId | Org invoice history |
| stripe_invoices | IDX | status | Payment status dashboard |
| stripe_invoices | IDX | (periodStart, periodEnd) | Period filtering |
| stripe_payments | UNIQUE | stripePaymentIntentId | Webhook matching |
| stripe_payments | IDX | customerId | Customer payment history |
| stripe_payments | IDX | status | Payment monitoring |
| stripe_webhook_events | UNIQUE | stripeEventId | Idempotency |
| stripe_webhook_events | IDX | eventType | Event processing |
| stripe_webhook_events | IDX | processed | Retry queue |
| stripe_webhook_events | IDX | createdAt | Cleanup |

### Revenue Sharing

| Table | Index | Columns | Purpose |
|-------|-------|---------|---------|
| revenue_rules | IDX | partnerOrgId | Partner-specific rules |
| revenue_rules | IDX | (effectiveFrom, effectiveTo) | Temporal rule lookup |
| revenue_shares | UNIQUE | (partnerOrgId, periodStart, periodEnd) | One share per partner per period |
| revenue_shares | IDX | status | Processing pipeline |
| revenue_shares | IDX | (periodStart, periodEnd) | Period queries |
| payouts | IDX | partnerOrgId | Partner payout history |
| payouts | IDX | status | Payout pipeline |

### High-Volume Append-Only Tables

These are the most critical indexes. They must align with partitioning boundaries.

| Table | Index | Columns | Purpose |
|-------|-------|---------|---------|
| **diffusion_logs** | IDX | (screenId, startTime) | Screen playback history |
| **diffusion_logs** | IDX | (campaignId, startTime) | Campaign performance |
| **diffusion_logs** | IDX | (deviceId, startTime) | Device audit |
| **diffusion_logs** | IDX | (creativeId, startTime) | Creative performance |
| **diffusion_logs** | IDX | startTime | Global time range scans |
| **diffusion_logs** | IDX | verified | Verification pipeline |
| **analytics_events** | IDX | (eventType, timestamp) | Event type filtering |
| **analytics_events** | IDX | (screenId, timestamp) | Screen event history |
| **analytics_events** | IDX | (deviceId, timestamp) | Device event history |
| **analytics_events** | IDX | (campaignId, timestamp) | Campaign analytics |
| **analytics_events** | IDX | (orgId, timestamp) | Org-level analytics |
| **analytics_events** | IDX | timestamp | Global time range scans |
| device_heartbeats | IDX | (deviceId, timestamp) | Device health history |
| device_metrics | IDX | (deviceId, timestamp) | Device metrics history |
| device_error_logs | IDX | (deviceId, timestamp) | Device error history |
| device_error_logs | IDX | (severity, timestamp) | Error severity dashboard |
| audit_logs | IDX | (entity, entityId) | Entity history |
| audit_logs | IDX | userId | Actor history |
| audit_logs | IDX | (orgId, timestamp) | Org audit trail |
| audit_logs | IDX | (action, timestamp) | Action filtering |
| audit_logs | IDX | timestamp | Global audit |

## Composite Index Order Rationale

For time-series data, the pattern is always `(entity_fk, timestamp)`:

```sql
-- This query benefits from (screenId, startTime) composite:
SELECT * FROM diffusion_logs
WHERE screen_id = 'xxx'
  AND start_time BETWEEN '2026-01-01' AND '2026-01-31';
```

The B-tree first narrows to the specific screen, then does a range scan on time.
Reversing the order would scan ALL records in the time range across ALL screens.

## Partial Indexes (Post-Migration SQL)

Prisma doesn't support partial indexes natively. Apply these after migration:

```sql
-- Only index active bookings (most queries filter on active)
CREATE INDEX idx_bookings_active
  ON bookings (advertiser_org_id, start_date)
  WHERE status = 'ACTIVE';

-- Only index unprocessed webhooks for retry queue
CREATE INDEX idx_webhooks_unprocessed
  ON stripe_webhook_events (created_at)
  WHERE processed = false;

-- Only index unverified diffusion logs for verification pipeline
CREATE INDEX idx_diffusion_unverified
  ON diffusion_logs (created_at)
  WHERE verified = false;

-- Only index online screens for live dashboard
CREATE INDEX idx_screen_live_online
  ON screen_live_status (updated_at)
  WHERE is_online = true;
```

## GiST Index for Geo Queries (Post-Migration SQL)

```sql
-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add point column to screens
ALTER TABLE screens ADD COLUMN geom geometry(Point, 4326);

-- Populate from lat/lng
UPDATE screens SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Create spatial index
CREATE INDEX idx_screens_geom ON screens USING GIST (geom);

-- Example geo-radius query (50km around Paris center):
-- SELECT * FROM screens
-- WHERE ST_DWithin(geom::geography, ST_MakePoint(2.3522, 48.8566)::geography, 50000);
```

## Estimated Index Sizes (100k screens, 1 year)

| Table | Rows (est.) | Index Size (est.) |
|-------|------------|-------------------|
| diffusion_logs | ~3.6B (100/screen/day × 365 × 100k) | ~200 GB |
| analytics_events | ~36B | ~2 TB (→ ClickHouse) |
| device_heartbeats | ~52B | ~3 TB (→ ClickHouse) |
| device_metrics | ~10B | ~600 GB (→ ClickHouse) |
| screens | 100k | ~50 MB |
| campaigns | ~500k | ~30 MB |
| bookings | ~200k | ~15 MB |

At this scale, the append-only tables MUST be partitioned and eventually migrated
to a columnar store (ClickHouse). See PARTITIONING.md and MIGRATION_STRATEGY.md.

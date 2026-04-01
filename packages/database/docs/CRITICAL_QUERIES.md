# NEOFILM SAAS — Critical Queries

## 1. Admin: Live Screen Monitoring Dashboard

### Query: All screens with live status (paginated)

```sql
SELECT
  s.id,
  s.name,
  s.city,
  s.status AS screen_status,
  s.partner_org_id,
  o.name AS partner_name,
  sls.is_online,
  sls.last_heartbeat_at,
  sls.app_version,
  sls.cpu_percent,
  sls.memory_percent,
  sls.current_campaign_id,
  sls.network_type,
  sls.error_count_24h,
  d.serial_number AS device_serial
FROM screens s
LEFT JOIN screen_live_status sls ON sls.screen_id = s.id
LEFT JOIN organizations o ON o.id = s.partner_org_id
LEFT JOIN devices d ON d.id = s.active_device_id
WHERE s.status != 'DECOMMISSIONED'
ORDER BY sls.is_online DESC, sls.last_heartbeat_at DESC NULLS LAST
LIMIT 50 OFFSET 0;
```

**Indexes used**: `screens.status`, `screen_live_status.screen_id` (unique)

### Query: Screens offline for >5 minutes (alert trigger)

```sql
SELECT
  s.id,
  s.name,
  s.city,
  o.name AS partner_name,
  o.contact_email AS partner_email,
  sls.last_heartbeat_at,
  EXTRACT(EPOCH FROM (now() - sls.last_heartbeat_at)) / 60 AS minutes_offline
FROM screens s
JOIN screen_live_status sls ON sls.screen_id = s.id
JOIN organizations o ON o.id = s.partner_org_id
WHERE s.status = 'ACTIVE'
  AND sls.is_online = false
  AND sls.last_heartbeat_at < now() - interval '5 minutes'
ORDER BY sls.last_heartbeat_at ASC;
```

### Query: Global platform stats (admin KPI bar)

```sql
SELECT
  (SELECT COUNT(*) FROM screens WHERE status = 'ACTIVE') AS total_active_screens,
  (SELECT COUNT(*) FROM screen_live_status WHERE is_online = true) AS screens_online,
  (SELECT COUNT(*) FROM campaigns WHERE status = 'ACTIVE') AS active_campaigns,
  (SELECT COUNT(*) FROM organizations WHERE type = 'PARTNER' AND is_active = true) AS active_partners,
  (SELECT COUNT(*) FROM organizations WHERE type = 'ADVERTISER' AND is_active = true) AS active_advertisers,
  (SELECT COUNT(*) FROM diffusion_logs WHERE start_time > now() - interval '24 hours') AS diffusions_24h;
```

---

## 2. Partner: Monthly Revenue Dashboard

### Query: Revenue breakdown per screen for a partner, given month

```sql
SELECT
  s.id AS screen_id,
  s.name AS screen_name,
  s.city,
  bs.unit_price_cents,
  b.status AS booking_status,
  b.billing_cycle,
  o_adv.name AS advertiser_name,
  b.start_date AS booking_start,
  b.end_date AS booking_end
FROM booking_screens bs
JOIN bookings b ON b.id = bs.booking_id
JOIN screens s ON s.id = bs.screen_id
JOIN organizations o_adv ON o_adv.id = b.advertiser_org_id
WHERE bs.partner_org_id = $1  -- partner org ID
  AND b.status IN ('ACTIVE', 'EXPIRED')
  AND b.start_date <= $3      -- period end
  AND (b.end_date IS NULL OR b.end_date >= $2)  -- period start
ORDER BY s.name, b.start_date;
```

**Indexes used**: `booking_screens.partnerOrgId`, `bookings.status`, `bookings.(startDate, endDate)`

### Query: Partner monthly revenue summary

```sql
SELECT
  date_trunc('month', b.start_date) AS month,
  SUM(bs.unit_price_cents) AS gross_revenue_cents,
  SUM(bs.unit_price_cents * rr.partner_rate) AS partner_share_cents,
  SUM(bs.unit_price_cents * rr.platform_rate) AS platform_share_cents,
  COUNT(DISTINCT bs.screen_id) AS screens_booked,
  COUNT(DISTINCT b.advertiser_org_id) AS unique_advertisers
FROM booking_screens bs
JOIN bookings b ON b.id = bs.booking_id
LEFT JOIN LATERAL (
  SELECT partner_rate, platform_rate
  FROM revenue_rules rr
  WHERE (rr.partner_org_id = bs.partner_org_id OR rr.partner_org_id IS NULL)
    AND rr.effective_from <= b.start_date
    AND (rr.effective_to IS NULL OR rr.effective_to > b.start_date)
  ORDER BY rr.partner_org_id NULLS LAST  -- prefer partner-specific over global
  LIMIT 1
) rr ON true
WHERE bs.partner_org_id = $1
  AND b.status IN ('ACTIVE', 'EXPIRED')
  AND b.start_date >= $2  -- 12 months ago
GROUP BY date_trunc('month', b.start_date)
ORDER BY month DESC;
```

### Query: Partner payout history

```sql
SELECT
  p.id,
  p.status,
  p.amount_cents,
  p.currency,
  p.stripe_transfer_id,
  p.paid_at,
  p.created_at,
  json_agg(json_build_object(
    'period_start', rs.period_start,
    'period_end', rs.period_end,
    'partner_share_cents', rs.partner_share_cents
  )) AS revenue_shares
FROM payouts p
JOIN revenue_shares rs ON rs.payout_id = p.id
WHERE p.partner_org_id = $1
GROUP BY p.id
ORDER BY p.created_at DESC
LIMIT 12;
```

---

## 3. Advertiser: Campaign Stats

### Query: Campaign performance over time

```sql
SELECT
  date_trunc('day', dl.start_time) AS day,
  COUNT(*) AS total_diffusions,
  SUM(dl.duration_ms) AS total_duration_ms,
  COUNT(DISTINCT dl.screen_id) AS unique_screens,
  COUNT(DISTINCT dl.device_id) AS unique_devices,
  AVG(dl.duration_ms) AS avg_duration_ms,
  SUM(CASE WHEN dl.verified THEN 1 ELSE 0 END) AS verified_count,
  ROUND(
    SUM(CASE WHEN dl.verified THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) * 100, 2
  ) AS verification_rate_pct
FROM diffusion_logs dl
WHERE dl.campaign_id = $1
  AND dl.start_time BETWEEN $2 AND $3
GROUP BY date_trunc('day', dl.start_time)
ORDER BY day;
```

**Indexes used**: `diffusion_logs.(campaignId, startTime)` — partition pruning on startTime

### Query: Campaign reach by city

```sql
SELECT
  s.city,
  COUNT(DISTINCT s.id) AS screens_reached,
  COUNT(*) AS total_diffusions,
  SUM(dl.duration_ms) / 1000 AS total_seconds
FROM diffusion_logs dl
JOIN screens s ON s.id = dl.screen_id
WHERE dl.campaign_id = $1
  AND dl.start_time BETWEEN $2 AND $3
GROUP BY s.city
ORDER BY total_diffusions DESC;
```

### Query: Creative-level performance

```sql
SELECT
  c.id AS creative_id,
  c.name AS creative_name,
  c.type,
  c.duration_ms AS expected_duration_ms,
  COUNT(*) AS play_count,
  SUM(dl.duration_ms) AS total_play_ms,
  AVG(dl.duration_ms) AS avg_play_ms,
  ROUND(
    AVG(dl.duration_ms)::numeric / NULLIF(c.duration_ms, 0) * 100, 1
  ) AS completion_rate_pct
FROM diffusion_logs dl
JOIN creatives c ON c.id = dl.creative_id
WHERE dl.campaign_id = $1
  AND dl.start_time BETWEEN $2 AND $3
GROUP BY c.id, c.name, c.type, c.duration_ms
ORDER BY play_count DESC;
```

### Query: Budget consumption

```sql
SELECT
  c.id,
  c.name,
  c.budget_cents,
  c.spent_cents,
  ROUND(c.spent_cents::numeric / NULLIF(c.budget_cents, 0) * 100, 1) AS budget_used_pct,
  c.start_date,
  c.end_date,
  EXTRACT(DAY FROM c.end_date - now()) AS days_remaining,
  (SELECT COUNT(*) FROM diffusion_logs dl WHERE dl.campaign_id = c.id) AS total_diffusions,
  (SELECT COUNT(DISTINCT dl.screen_id) FROM diffusion_logs dl WHERE dl.campaign_id = c.id) AS total_screens
FROM campaigns c
WHERE c.advertiser_org_id = $1
  AND c.status IN ('ACTIVE', 'PAUSED')
ORDER BY budget_used_pct DESC;
```

---

## 4. Fraud Detection Queries

### Query: Abnormal diffusion duration (>200% or <20% of expected)

```sql
SELECT
  dl.id,
  dl.screen_id,
  dl.device_id,
  dl.campaign_id,
  dl.creative_id,
  dl.start_time,
  dl.duration_ms AS actual_duration,
  c.duration_ms AS expected_duration,
  ROUND(dl.duration_ms::numeric / NULLIF(c.duration_ms, 0) * 100, 1) AS ratio_pct,
  dl.media_hash,
  c.file_hash AS expected_hash,
  dl.signature,
  dl.app_version
FROM diffusion_logs dl
JOIN creatives c ON c.id = dl.creative_id
WHERE dl.start_time BETWEEN $1 AND $2
  AND (
    -- Suspiciously short (< 20% of expected)
    dl.duration_ms < c.duration_ms * 0.2
    -- Suspiciously long (> 200% of expected)
    OR dl.duration_ms > c.duration_ms * 2.0
  )
ORDER BY dl.start_time DESC
LIMIT 100;
```

### Query: Media hash mismatch (wrong file played)

```sql
SELECT
  dl.id,
  dl.screen_id,
  dl.device_id,
  dl.creative_id,
  dl.start_time,
  dl.media_hash AS played_hash,
  c.file_hash AS expected_hash,
  dl.app_version,
  s.name AS screen_name,
  o.name AS partner_name
FROM diffusion_logs dl
JOIN creatives c ON c.id = dl.creative_id
JOIN screens s ON s.id = dl.screen_id
JOIN organizations o ON o.id = s.partner_org_id
WHERE dl.start_time BETWEEN $1 AND $2
  AND c.file_hash IS NOT NULL
  AND dl.media_hash != c.file_hash
ORDER BY dl.start_time DESC;
```

### Query: Device replay attack detection (duplicate timestamps)

```sql
SELECT
  device_id,
  campaign_id,
  creative_id,
  start_time,
  COUNT(*) AS duplicate_count
FROM diffusion_logs
WHERE start_time BETWEEN $1 AND $2
GROUP BY device_id, campaign_id, creative_id, start_time
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;
```

### Query: Ghost device detection (diffusions from unassigned devices)

```sql
SELECT
  dl.device_id,
  dl.screen_id,
  dl.start_time,
  d.screen_id AS actual_screen_assignment,
  s.active_device_id,
  d.status AS device_status
FROM diffusion_logs dl
JOIN devices d ON d.id = dl.device_id
JOIN screens s ON s.id = dl.screen_id
WHERE dl.start_time BETWEEN $1 AND $2
  AND (
    -- Device not assigned to any screen
    d.screen_id IS NULL
    -- Device assigned to a different screen
    OR d.screen_id != dl.screen_id
    -- Screen's active device is different
    OR s.active_device_id != dl.device_id
    -- Device is decommissioned
    OR d.status = 'DECOMMISSIONED'
  )
ORDER BY dl.start_time DESC
LIMIT 100;
```

### Query: Unusual volume spike per device (>3 std deviations)

```sql
WITH daily_counts AS (
  SELECT
    device_id,
    date_trunc('day', start_time) AS day,
    COUNT(*) AS diffusion_count
  FROM diffusion_logs
  WHERE start_time BETWEEN now() - interval '30 days' AND now()
  GROUP BY device_id, date_trunc('day', start_time)
),
device_stats AS (
  SELECT
    device_id,
    AVG(diffusion_count) AS avg_daily,
    STDDEV(diffusion_count) AS stddev_daily
  FROM daily_counts
  GROUP BY device_id
)
SELECT
  dc.device_id,
  dc.day,
  dc.diffusion_count,
  ds.avg_daily,
  ds.stddev_daily,
  ROUND((dc.diffusion_count - ds.avg_daily) / NULLIF(ds.stddev_daily, 0), 2) AS z_score
FROM daily_counts dc
JOIN device_stats ds ON ds.device_id = dc.device_id
WHERE dc.diffusion_count > ds.avg_daily + 3 * ds.stddev_daily
  AND ds.stddev_daily > 0
ORDER BY z_score DESC;
```

---

## 5. Background Jobs — Critical Aggregation Queries

### Job: Update ScreenLiveStatus from latest heartbeat

```sql
-- Runs every 30 seconds via worker
INSERT INTO screen_live_status (id, screen_id, is_online, current_device_id,
  last_heartbeat_at, app_version, updated_at)
SELECT
  COALESCE(sls.id, gen_random_uuid()::text),
  s.id,
  COALESCE(dh.is_online, false),
  s.active_device_id,
  dh.timestamp,
  dh.app_version,
  now()
FROM screens s
LEFT JOIN LATERAL (
  SELECT * FROM device_heartbeats
  WHERE device_id = s.active_device_id
  ORDER BY timestamp DESC
  LIMIT 1
) dh ON true
LEFT JOIN screen_live_status sls ON sls.screen_id = s.id
WHERE s.status = 'ACTIVE'
ON CONFLICT (screen_id) DO UPDATE SET
  is_online = EXCLUDED.is_online,
  current_device_id = EXCLUDED.current_device_id,
  last_heartbeat_at = EXCLUDED.last_heartbeat_at,
  app_version = EXCLUDED.app_version,
  updated_at = now();
```

### Job: Calculate monthly RevenueShare

```sql
-- Runs on 1st of each month for previous month
INSERT INTO revenue_shares (
  id, status, period_start, period_end,
  total_revenue_cents, platform_share_cents, partner_share_cents,
  platform_rate, currency, partner_org_id, calculated_at, breakdown, created_at, updated_at
)
SELECT
  gen_random_uuid()::text,
  'CALCULATED',
  date_trunc('month', now() - interval '1 month'),
  date_trunc('month', now()),
  SUM(bs.unit_price_cents),
  SUM(ROUND(bs.unit_price_cents * rr.platform_rate)),
  SUM(ROUND(bs.unit_price_cents * rr.partner_rate)),
  MAX(rr.platform_rate),
  'EUR',
  bs.partner_org_id,
  now(),
  json_agg(json_build_object(
    'booking_screen_id', bs.id,
    'screen_id', bs.screen_id,
    'unit_price_cents', bs.unit_price_cents,
    'partner_rate', rr.partner_rate
  )),
  now(), now()
FROM booking_screens bs
JOIN bookings b ON b.id = bs.booking_id
  AND b.status IN ('ACTIVE', 'EXPIRED')
  AND b.start_date < date_trunc('month', now())
  AND (b.end_date IS NULL OR b.end_date >= date_trunc('month', now() - interval '1 month'))
LEFT JOIN LATERAL (
  SELECT platform_rate, partner_rate
  FROM revenue_rules rr
  WHERE (rr.partner_org_id = bs.partner_org_id OR rr.partner_org_id IS NULL)
    AND rr.effective_from <= date_trunc('month', now() - interval '1 month')
    AND (rr.effective_to IS NULL OR rr.effective_to > date_trunc('month', now() - interval '1 month'))
  ORDER BY rr.partner_org_id NULLS LAST
  LIMIT 1
) rr ON true
GROUP BY bs.partner_org_id
ON CONFLICT (partner_org_id, period_start, period_end)
DO UPDATE SET
  total_revenue_cents = EXCLUDED.total_revenue_cents,
  platform_share_cents = EXCLUDED.platform_share_cents,
  partner_share_cents = EXCLUDED.partner_share_cents,
  breakdown = EXCLUDED.breakdown,
  calculated_at = now(),
  status = 'CALCULATED',
  updated_at = now();
```

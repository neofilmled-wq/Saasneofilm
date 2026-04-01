# NEOFILM — Real-Time Advertising Diffusion Engine
# Production Architecture & Implementation Specification

> **Version**: 1.0.0
> **Date**: 2026-02-25
> **Status**: Design Specification
> **Scale target**: 100,000+ screens, 10M+ daily impressions

---

## Table of Contents

1. [Engine Architecture Overview](#1-engine-architecture-overview)
2. [Service Decomposition](#2-service-decomposition)
3. [Matching & Decision Logic](#3-matching--decision-logic)
4. [Scheduling Model](#4-scheduling-model)
5. [Media Delivery & Caching](#5-media-delivery--caching)
6. [Offline & Failover Strategy](#6-offline--failover-strategy)
7. [API & Protocol Specification](#7-api--protocol-specification)
8. [Real-Time Orchestration Flow](#8-real-time-orchestration-flow)
9. [Scaling Strategy](#9-scaling-strategy)
10. [Failure Recovery Plan](#10-failure-recovery-plan)
11. [Cost Optimization Strategy](#11-cost-optimization-strategy)
12. [Test Scenarios Matrix](#12-test-scenarios-matrix)

---

## 1. Engine Architecture Overview

### High-Level Topology

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          NEOFILM DIFFUSION ENGINE                          │
│                                                                             │
│  ┌───────────────┐  ┌───────────────┐  ┌────────────────┐                  │
│  │   Campaign     │  │   Matching    │  │   Scheduler    │                  │
│  │   Indexer      │──│   Service     │──│   Service      │                  │
│  │  (event-driven)│  │  (sync+cache) │  │  (event-driven)│                  │
│  └───────┬───────┘  └───────┬───────┘  └───────┬────────┘                  │
│          │                  │                   │                            │
│          ▼                  ▼                   ▼                            │
│  ┌───────────────────────────────────────────────────┐                      │
│  │              Redis Cluster (Hot State)             │                      │
│  │  • Campaign index per geoHash                     │                      │
│  │  • Screen schedules (next 6h)                     │                      │
│  │  • Frequency counters (per screen/campaign/hour)  │                      │
│  │  • Admin overrides (force/block/pause)            │                      │
│  │  • Device auth tokens                             │                      │
│  └──────────────────────┬────────────────────────────┘                      │
│                         │                                                    │
│  ┌───────────────┐  ┌──┴────────────┐  ┌────────────────┐                  │
│  │  Real-Time     │  │  Device Sync  │  │  Proof         │                  │
│  │  Control       │  │  Service      │  │  Ingestion     │                  │
│  │  (WebSocket)   │  │  (HTTP+MQTT)  │  │  (async batch) │                  │
│  └───────┬───────┘  └───────┬───────┘  └───────┬────────┘                  │
│          │                  │                   │                            │
│          ▼                  ▼                   ▼                            │
│  ┌───────────────────────────────────────────────────┐                      │
│  │              NATS JetStream (Event Bus)            │                      │
│  │  Subjects:                                        │                      │
│  │  • campaign.updated, campaign.paused              │                      │
│  │  • screen.added, screen.removed                   │                      │
│  │  • admin.override, admin.force                    │                      │
│  │  • diffusion.log.batch                            │                      │
│  │  • schedule.invalidated.{screenId}                │                      │
│  │  • fraud.signal                                   │                      │
│  └──────────────────────┬────────────────────────────┘                      │
│                         │                                                    │
│  ┌───────────────┐  ┌──┴────────────┐                                      │
│  │  Fraud         │  │  Cache/CDN    │                                      │
│  │  Detection     │  │  Strategy     │                                      │
│  │  (async worker)│  │  Module       │                                      │
│  └───────────────┘  └───────────────┘                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────┐     ┌─────────────────┐    ┌─────────────┐
│ PostgreSQL  │     │  S3 + CloudFront│    │  MQTT Broker │
│ (source of  │     │  (media CDN)    │    │  (Mosquitto) │
│  truth)     │     │                 │    │              │
└─────────────┘     └─────────────────┘    └─────────────┘
```

### Component Classification

| Component | Mode | Latency SLA | Scaling Unit |
|-----------|------|-------------|--------------|
| Campaign Indexer | **Event-driven** (NATS consumer) | < 30s rebuild | Per geoHash region |
| Matching Service | **Synchronous** (in-process) | < 10ms per call | CPU-bound, horizontal |
| Scheduler Service | **Event-driven** (NATS consumer) | < 60s schedule gen | Per screen partition |
| Real-Time Control | **Synchronous** (WebSocket/MQTT) | < 5s propagation | Per MQTT topic partition |
| Device Sync Service | **Synchronous** (HTTP) + **Push** (MQTT) | < 200ms HTTP / < 5s push | Per region, horizontal |
| Proof Ingestion | **Async batch** (NATS consumer) | < 5min processing | Per Kafka partition |
| Fraud Detection | **Async worker** (NATS consumer) | < 15min detection | Per worker pool |
| Cache/CDN Module | **Configuration** (no runtime) | N/A | Per CDN edge POP |

### Why NATS JetStream (not Kafka or Redis Streams)

| Criteria | NATS JetStream | Kafka | Redis Streams |
|----------|---------------|-------|---------------|
| Operational complexity | Low (single binary) | High (ZooKeeper/KRaft) | Medium |
| Latency | Sub-millisecond | Low millisecond | Sub-millisecond |
| At-least-once delivery | Yes | Yes | Yes |
| Wildcard subscriptions | Yes (subject hierarchy) | No | No |
| Memory footprint | ~50MB | ~1GB+ | Shared with cache |
| Fits monorepo NestJS | Native TS client | Confluent client | ioredis |
| Scale ceiling | Millions msg/s | Billions msg/s | Millions msg/s |

**Decision**: NATS JetStream for all inter-service events. If we exceed 1M msg/s sustained,
migrate the `diffusion.log.batch` subject to Kafka for its stronger durability guarantees.
Redis is used exclusively for hot state caching, not as an event bus.

---

## 2. Service Decomposition

### 2.1 Campaign Indexer

**Purpose**: Maintains a materialized index of eligible campaigns per geographic segment,
updated in near-real-time when campaigns change.

**Trigger**: NATS subjects `campaign.updated`, `campaign.status_changed`, `campaign.targeting_changed`

**Data flow**:
```
PostgreSQL (source of truth)
    │
    ▼ (on campaign change event)
Campaign Indexer Worker
    │
    ├── Reads campaign + targeting + creatives from PG
    ├── Computes affected geoHash cells (precision 4 = ~39km² cells)
    ├── For each geoHash cell:
    │   └── Writes to Redis sorted set:
    │       Key:   campaign_index:{geoHash4}
    │       Score: campaign.priority * 1000 + campaign.id.hashCode % 1000
    │       Value: JSON { campaignId, advertiserId, status, startDate, endDate,
    │                      budgetCents, spentCents, priority, creativeIds[],
    │                      environments[], scheduleWindows[], frequencyCap }
    │
    └── Publishes NATS: schedule.invalidated.{screenId} for all affected screens
```

**Redis structure per geoHash cell**:
```
campaign_index:u09t       → ZSET of campaign summaries (sorted by priority score)
campaign_detail:{id}      → HASH with full campaign data
creative_manifest:{id}    → HASH { fileUrl, fileHash, durationMs, width, height, mimeType }
```

**Rebuild strategy**:
- Full rebuild triggered by `POST /campaigns/index/rebuild` (admin endpoint)
- Incremental update on each campaign event (default path)
- Periodic full reconciliation every 6 hours (cron) to catch drift

### 2.2 Matching Service

**Purpose**: Pure function that scores and ranks campaigns for a given screen + trigger context.
Runs in-process within the Device Sync Service (no network hop).

**Interface**:
```typescript
interface MatchingService {
  getNextAd(
    screenId: string,
    triggerContext: DiffusionTrigger,
    now: Date,
    screenMeta: ScreenMeta,
    recentHistory: RecentPlayHistory,
    overrides: AdminOverrides,
  ): RankedCreative[];
}

interface ScreenMeta {
  geoHash: string;
  environment: ScreenEnvironment;
  partnerOrgId: string;
  timezone: string;
  orientation: string;
  maxAdsPerHour: number;     // partner-configurable, default: 20
  maxConcurrentAds: number;  // max 10 per requirement
}

interface RecentPlayHistory {
  lastPlayedCampaignIds: string[];    // last N campaigns played on this screen
  campaignCountsThisHour: Map<string, number>;  // campaignId → count this hour
  advertiserCountsThisHour: Map<string, number>;
  totalAdsThisHour: number;
}

interface AdminOverrides {
  forcedCampaignIds: string[];    // must play these
  blockedCampaignIds: string[];   // must not play these
  blockedScreenIds: string[];     // this screen is blocked
  pausedCampaignIds: string[];    // temporarily paused
}

interface RankedCreative {
  campaignId: string;
  creativeId: string;
  score: number;
  tier: 'FORCED' | 'PREMIUM' | 'STANDARD' | 'HOUSE';
  fileUrl: string;
  fileHash: string;
  durationMs: number;
}
```

See [Section 3](#3-matching--decision-logic) for the full decision tree and scoring formula.

### 2.3 Scheduler Service

**Purpose**: Generates deterministic schedule bundles for each screen, covering the next 6 hours.
A schedule bundle is a sorted list of `(triggerType, creativeId, priority, durationMs)` tuples
that the device plays in order.

**Trigger**: NATS subjects `schedule.invalidated.{screenId}`, periodic timer (every 30 min)

**Output**: Writes schedule bundles to Redis:
```
schedule:{screenId}:current    → JSON schedule bundle (next 6 hours)
schedule:{screenId}:version    → monotonic integer (incremented on each generation)
schedule:{screenId}:generated  → ISO timestamp of generation
```

**Determinism guarantee**: Given the same inputs (campaign index, screen meta, overrides, timestamp
rounded to the nearest minute), two independent Scheduler instances produce identical output.
Achieved by:
1. Sorting campaigns by (priority DESC, campaignId ASC) — stable sort
2. Using seeded PRNG: `seed = hash(screenId + floor(now / 60000))` for rotation
3. No randomness outside the seeded PRNG

### 2.4 Real-Time Control Service

**Purpose**: Handles admin overrides with < 5 second propagation to devices.

**Architecture**:
```
Admin Dashboard (web-admin)
    │
    ▼ POST /admin/override
NestJS API Controller
    │
    ├── Writes override to Redis:
    │   Key: override:{screenId}  or  override:global
    │   Value: { type: FORCE|BLOCK|PAUSE, campaignId, creativeId, expiresAt, issuedBy }
    │   TTL: configurable (default: 24h)
    │
    ├── Publishes NATS: admin.override.{screenId} (or admin.override.global)
    │
    └── MQTT publish to topic: neofilm/screens/{screenId}/control
        Payload: { type: "OVERRIDE", action: "FORCE|BLOCK|PAUSE", ... }
```

**MQTT topic hierarchy**:
```
neofilm/screens/{screenId}/control     → per-screen commands
neofilm/screens/{screenId}/schedule    → schedule push updates
neofilm/screens/+/heartbeat           → device heartbeats (inbound)
neofilm/global/control                 → broadcast to all screens
```

**Device receives MQTT → immediately applies override → confirms via heartbeat**

### 2.5 Device Sync Service

**Purpose**: Serves device schedule requests (pull mode) and triggers MQTT pushes (push mode).

**Pull mode** (primary, always available):
```
Device → GET /diffusion/schedule?deviceId=X&since=<lastVersion>
         ↓
Device Sync Service:
  1. Validate device JWT token
  2. Resolve screenId from device assignment
  3. Read schedule:{screenId}:version from Redis
  4. If version > since: return full schedule bundle
  5. If version == since: return 304 Not Modified
  6. Include: creative manifest (URLs + hashes for prefetch)
```

**Push mode** (supplementary, for real-time updates):
```
Scheduler Service generates new schedule
  → Publishes NATS: schedule.updated.{screenId}
  → Device Sync worker picks up
  → Publishes MQTT: neofilm/screens/{screenId}/schedule
  → Device receives, applies, confirms
```

**Interaction with Device Manager**:
- Device Manager handles: provisioning, pairing, heartbeats, OTA updates, error reporting
- Diffusion Engine handles: schedules, ad selection, proof logs, overrides
- Shared surface: `Device.screenId` (pairing), `DeviceHeartbeat` (online status)
- Device Sync reads `ScreenLiveStatus.isOnline` to skip push to offline devices

### 2.6 Proof Ingestion Service

**Purpose**: Receives DiffusionLog batches from devices, validates, stores, and triggers
fraud analysis.

**Flow**:
```
Device → POST /diffusion/log (batch of 1-100 proofs)
         ↓
API Gateway (rate limited: 10 req/min per device)
         ↓
  1. Validate JWT device token
  2. Basic schema validation (Zod)
  3. Publish to NATS: diffusion.log.batch (fire-and-forget to device)
  4. Return 202 Accepted with batch receipt ID
         ↓
NATS Consumer (Proof Ingestion Worker):
  5. For each proof in batch:
     a. Verify HMAC signature: HMAC-SHA256(deviceId + creativeId + startTime + endTime, deviceSecret)
     b. Verify mediaHash matches creative.fileHash
     c. Verify durationMs is within 20%-200% of creative.durationMs
     d. Check for duplicate (deviceId + creativeId + startTime unique)
     e. Write to diffusion_logs table (partitioned by startTime)
     f. Mark verified = true if all checks pass
  6. Update campaign.spentCents (increment by CPM-derived cost)
  7. If anomaly detected → publish NATS: fraud.signal
```

**Idempotency**: Each proof has a client-generated `proofId` (UUID v7 from device).
Server deduplicates on `(deviceId, creativeId, startTime)` composite.

### 2.7 Fraud Detection Service

**Purpose**: Async analysis of DiffusionLog signals for anomalies.

**Rules engine** (V1, rule-based; V2, ML scoring):

| Rule ID | Signal | Threshold | Action |
|---------|--------|-----------|--------|
| F001 | Impossible impression rate | > 120 impressions/hour/device | Flag + alert |
| F002 | Duration anomaly | < 20% or > 200% expected | Flag proof |
| F003 | Media hash mismatch | Any mismatch | Flag + quarantine |
| F004 | Ghost device | Device not assigned to screen | Block + alert |
| F005 | Replay attack | Duplicate (device, creative, startTime) | Reject + alert |
| F006 | Offline spoofing | Proofs submitted during known offline window | Flag batch |
| F007 | Volume spike | > 3σ above 30-day rolling mean | Investigate |
| F008 | Signature invalid | HMAC verification failure | Reject + revoke token |
| F009 | Time drift | Device time > 5min from server time | Warn + flag |
| F010 | Budget exceeded | Campaign spent > budget | Pause campaign |

**Implementation**:
```
NATS subject: fraud.signal
  → Fraud Worker consumes
  → Applies rules in parallel
  → Results written to: fraud_alerts table (new) + notifications table
  → Critical alerts: MQTT push to admin dashboard
```

### 2.8 Cache/CDN Strategy Module

See [Section 5](#5-media-delivery--caching) for full specification.

---

## 3. Matching & Decision Logic

### 3.1 Decision Tree (Step-by-Step)

```
getNextAd(screenId, triggerContext, now)
│
├── STEP 0: Check screen blocked?
│   └── Redis: override:{screenId} → type == BLOCK?
│       └── YES → return HOUSE_ADS
│
├── STEP 1: Check forced overrides
│   └── Redis: override:{screenId} → type == FORCE?
│       └── YES → return forced creative (skip all scoring)
│
├── STEP 2: Check screen hourly cap
│   └── Redis: freq:screen:{screenId}:{hourBucket}
│       └── totalAdsThisHour >= screen.maxAdsPerHour?
│           └── YES → return HOUSE_ADS (respect partner limit)
│
├── STEP 3: Load candidate campaigns
│   └── Redis: campaign_index:{screenGeoHash4}
│       └── Get all campaigns from sorted set
│
├── STEP 4: Eligibility filter (removes ineligible, order matters)
│   │
│   ├── 4a. Campaign status == ACTIVE?
│   │       └── NO → remove
│   │
│   ├── 4b. Campaign not in pausedCampaignIds?
│   │       └── PAUSED → remove
│   │
│   ├── 4c. Campaign not in blockedCampaignIds?
│   │       └── BLOCKED → remove
│   │
│   ├── 4d. now >= campaign.startDate AND now <= campaign.endDate?
│   │       └── OUT OF WINDOW → remove
│   │
│   ├── 4e. campaign.spentCents < campaign.budgetCents?
│   │       └── BUDGET EXHAUSTED → remove
│   │
│   ├── 4f. Screen environment in campaign.targeting.environments?
│   │       └── (empty array means "all environments") → NO → remove
│   │
│   ├── 4g. Screen not in campaign.targeting.excludedScreens?
│   │       └── EXCLUDED → remove
│   │
│   ├── 4h. If campaign.targeting.includedScreens is non-empty,
│   │       screen must be in list?
│   │       └── NOT INCLUDED → remove
│   │
│   ├── 4i. Geo distance check: haversine(screenLat, screenLng,
│   │       campaign.targeting.geoLat, campaign.targeting.geoLng)
│   │       <= campaign.targeting.geoRadiusKm?
│   │       └── OUT OF RADIUS → remove (skip if no geo targeting)
│   │
│   ├── 4j. Schedule window check: is current time within any
│   │       campaign.targeting.scheduleWindows entry for today's dayOfWeek?
│   │       └── OUTSIDE WINDOW → remove (skip if no windows defined)
│   │
│   └── 4k. Has at least one creative with status == READY?
│           └── NO READY CREATIVE → remove
│
├── STEP 5: Frequency cap filter
│   │
│   ├── 5a. Campaign frequency cap per screen per hour:
│   │       Redis: freq:campaign:{campaignId}:screen:{screenId}:{hourBucket}
│   │       └── count >= campaign.frequencyCap.perScreenPerHour? → remove
│   │
│   └── 5b. Advertiser frequency cap per screen per hour:
│           Redis: freq:advertiser:{advertiserId}:screen:{screenId}:{hourBucket}
│           └── count >= 6 (default cap)? → remove
│
├── STEP 6: Score remaining candidates
│   └── See scoring formula below
│
├── STEP 7: Select top-N creatives (N = number of ad slots in split-screen)
│   └── Sort by score DESC, pick top N
│   └── For each selected campaign, pick best creative:
│       - Prefer VIDEO over IMAGE (if trigger == POWER_ON or CHANGE_APP)
│       - Prefer creative not recently played on this screen
│       - If multiple ready creatives, rotate using seeded PRNG
│
├── STEP 8: Anti-blackout check
│   └── If no paid campaigns selected:
│       └── Fill with HOUSE ads (partner promo content or platform defaults)
│       └── Guarantee: NEVER return empty list
│
└── STEP 9: Return RankedCreative[] list
    └── Update frequency counters in Redis (INCR with TTL = 3600s)
```

### 3.2 Scoring Formula

```
score(campaign, screen, now, history) =
    tierWeight
  + priorityScore
  + pacingScore
  + fairnessScore
  + recencyPenalty
  + triggerBonus

Where:

tierWeight:
  FORCED   = 100000  (admin forced — handled in Step 1, included for completeness)
  PREMIUM  = 10000   (campaign.priority >= 80)
  STANDARD = 1000    (campaign.priority >= 1)
  HOUSE    = 0       (campaign.priority == 0, house/filler ads)

priorityScore:
  = campaign.priority * 100
  Range: [0, 10000] for priority values [0, 100]

pacingScore:
  // Reward campaigns that are behind their ideal delivery pace
  elapsedRatio     = (now - campaign.startDate) / (campaign.endDate - campaign.startDate)
  deliveredRatio   = campaign.spentCents / campaign.budgetCents
  pacingDelta      = elapsedRatio - deliveredRatio   // positive = underpacing = needs more delivery
  pacingScore      = clamp(pacingDelta * 500, -200, 500)

fairnessScore:
  // Penalize campaigns that have already played a lot on this screen today
  playsToday = history.campaignPlaysToday[campaignId] ?? 0
  fairnessScore = max(0, 200 - playsToday * 20)

recencyPenalty:
  // Penalize campaigns played very recently on this screen
  lastPlayedIndex = history.lastPlayedCampaignIds.indexOf(campaignId)
  recencyPenalty  = lastPlayedIndex == -1 ? 0 :
                    lastPlayedIndex == 0  ? -300 :  // just played
                    lastPlayedIndex == 1  ? -150 :  // played 1 ago
                    lastPlayedIndex == 2  ? -50  :  // played 2 ago
                    0

triggerBonus:
  // Some triggers are higher value (e.g., POWER_ON reaches a fresh audience)
  POWER_ON     = +100
  CATALOG_OPEN = +80
  OPEN_APP     = +50
  CHANGE_APP   = +30
  SCHEDULED    = 0
  MANUAL       = 0
```

**Total score** = `tierWeight + priorityScore + pacingScore + fairnessScore + recencyPenalty + triggerBonus`

**Tiebreaker**: If two campaigns have identical scores, break ties using:
`hash(campaignId + screenId + floor(now / 60000)) % 10000` — deterministic but varies per minute.

### 3.3 Pseudocode: `getNextAd`

```typescript
function getNextAd(
  screenId: string,
  trigger: DiffusionTrigger,
  now: Date,
  ctx: { screenMeta: ScreenMeta; history: RecentPlayHistory; overrides: AdminOverrides }
): RankedCreative[] {

  // STEP 0: Screen blocked?
  if (ctx.overrides.blockedScreenIds.includes(screenId)) {
    return getHouseAds(screenId, ctx.screenMeta);
  }

  // STEP 1: Forced override?
  const forced = ctx.overrides.forcedCampaignIds;
  if (forced.length > 0) {
    const forcedCreatives = forced
      .map(cId => lookupCampaignCreative(cId))
      .filter(c => c !== null && c.creative.status === 'READY');
    if (forcedCreatives.length > 0) {
      return forcedCreatives.map(c => ({
        campaignId: c.campaignId,
        creativeId: c.creativeId,
        score: 100000,
        tier: 'FORCED',
        fileUrl: c.fileUrl,
        fileHash: c.fileHash,
        durationMs: c.durationMs,
      }));
    }
  }

  // STEP 2: Screen hourly cap
  const hourBucket = Math.floor(now.getTime() / 3600000);
  if (ctx.history.totalAdsThisHour >= ctx.screenMeta.maxAdsPerHour) {
    return getHouseAds(screenId, ctx.screenMeta);
  }

  // STEP 3: Load candidates from Redis campaign index
  const geoHash = ctx.screenMeta.geoHash;
  const candidates: CampaignSummary[] = redis.zrevrange(`campaign_index:${geoHash}`, 0, -1);

  // STEP 4: Eligibility filter
  const eligible = candidates.filter(c => {
    if (c.status !== 'ACTIVE') return false;                                       // 4a
    if (ctx.overrides.pausedCampaignIds.includes(c.campaignId)) return false;      // 4b
    if (ctx.overrides.blockedCampaignIds.includes(c.campaignId)) return false;     // 4c
    if (now < c.startDate || now > c.endDate) return false;                        // 4d
    if (c.spentCents >= c.budgetCents) return false;                               // 4e
    if (c.environments.length > 0 &&
        !c.environments.includes(ctx.screenMeta.environment)) return false;        // 4f
    if (c.excludedScreenIds.includes(screenId)) return false;                      // 4g
    if (c.includedScreenIds.length > 0 &&
        !c.includedScreenIds.includes(screenId)) return false;                     // 4h
    if (c.geoRadiusKm != null && c.geoLatitude != null && c.geoLongitude != null) {
      const dist = haversine(
        ctx.screenMeta.latitude, ctx.screenMeta.longitude,
        c.geoLatitude, c.geoLongitude
      );
      if (dist > c.geoRadiusKm) return false;                                     // 4i
    }
    if (c.scheduleWindows && c.scheduleWindows.length > 0) {
      const dayOfWeek = now.getDay();
      const timeStr = formatTimeHHMM(now);
      const inWindow = c.scheduleWindows.some(w =>
        w.dayOfWeek === dayOfWeek && timeStr >= w.startTime && timeStr <= w.endTime
      );
      if (!inWindow) return false;                                                 // 4j
    }
    if (!c.readyCreativeIds || c.readyCreativeIds.length === 0) return false;      // 4k
    return true;
  });

  // STEP 5: Frequency cap filter
  const capped = eligible.filter(c => {
    const campaignFreq = redis.get(`freq:campaign:${c.campaignId}:screen:${screenId}:${hourBucket}`) ?? 0;
    if (campaignFreq >= (c.frequencyCapPerScreenPerHour ?? 10)) return false;      // 5a

    const advFreq = redis.get(`freq:advertiser:${c.advertiserId}:screen:${screenId}:${hourBucket}`) ?? 0;
    if (advFreq >= 6) return false;                                                // 5b

    return true;
  });

  // STEP 6: Score
  const scored = capped.map(c => {
    const tierWeight = c.priority >= 80 ? 10000 : c.priority >= 1 ? 1000 : 0;

    const priorityScore = c.priority * 100;

    const elapsed = (now.getTime() - c.startDate.getTime()) /
                    (c.endDate.getTime() - c.startDate.getTime());
    const delivered = c.spentCents / c.budgetCents;
    const pacingDelta = elapsed - delivered;
    const pacingScore = Math.max(-200, Math.min(500, pacingDelta * 500));

    const playsToday = ctx.history.campaignPlaysToday?.get(c.campaignId) ?? 0;
    const fairnessScore = Math.max(0, 200 - playsToday * 20);

    const lastIdx = ctx.history.lastPlayedCampaignIds.indexOf(c.campaignId);
    const recencyPenalty = lastIdx === -1 ? 0 :
                           lastIdx === 0  ? -300 :
                           lastIdx === 1  ? -150 :
                           lastIdx === 2  ? -50  : 0;

    const triggerBonus = {
      POWER_ON: 100, CATALOG_OPEN: 80, OPEN_APP: 50,
      CHANGE_APP: 30, SCHEDULED: 0, MANUAL: 0,
    }[trigger] ?? 0;

    const score = tierWeight + priorityScore + pacingScore +
                  fairnessScore + recencyPenalty + triggerBonus;

    return { ...c, score };
  });

  // STEP 7: Select top-N with deterministic tiebreaker
  const seed = hashCode(`${screenId}:${Math.floor(now.getTime() / 60000)}`);
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const tieA = hashCode(`${a.campaignId}:${seed}`) % 10000;
    const tieB = hashCode(`${b.campaignId}:${seed}`) % 10000;
    return tieB - tieA;
  });

  const maxSlots = Math.min(ctx.screenMeta.maxConcurrentAds, 10);
  const selected = scored.slice(0, maxSlots);

  // STEP 8: Anti-blackout
  if (selected.length === 0) {
    return getHouseAds(screenId, ctx.screenMeta);
  }

  // Build final creative selections
  const result: RankedCreative[] = selected.map(c => {
    const creative = selectCreative(c.readyCreativeIds, screenId, now, seed, ctx.history);
    return {
      campaignId: c.campaignId,
      creativeId: creative.id,
      score: c.score,
      tier: c.priority >= 80 ? 'PREMIUM' : c.priority >= 1 ? 'STANDARD' : 'HOUSE',
      fileUrl: creative.fileUrl,
      fileHash: creative.fileHash,
      durationMs: creative.durationMs,
    };
  });

  // STEP 9: Update frequency counters
  for (const r of result) {
    redis.incr(`freq:campaign:${r.campaignId}:screen:${screenId}:${hourBucket}`, { EX: 7200 });
    const adv = lookupCampaignAdvertiser(r.campaignId);
    redis.incr(`freq:advertiser:${adv}:screen:${screenId}:${hourBucket}`, { EX: 7200 });
  }
  redis.incrby(`freq:screen:${screenId}:${hourBucket}`, result.length, { EX: 7200 });

  return result;
}

function selectCreative(
  creativeIds: string[],
  screenId: string,
  now: Date,
  seed: number,
  history: RecentPlayHistory
): CreativeManifest {
  // Prefer creatives not recently played on this screen
  const unplayed = creativeIds.filter(
    id => !history.lastPlayedCreativeIds?.includes(id)
  );
  const pool = unplayed.length > 0 ? unplayed : creativeIds;

  // Deterministic selection from pool using seeded index
  const index = (seed + hashCode(screenId)) % pool.length;
  return redis.hgetall(`creative_manifest:${pool[Math.abs(index)]}`);
}

function getHouseAds(screenId: string, meta: ScreenMeta): RankedCreative[] {
  // Load from Redis: house_ads:{partnerOrgId} or house_ads:platform_default
  const partnerAds = redis.lrange(`house_ads:${meta.partnerOrgId}`, 0, 4);
  if (partnerAds.length > 0) return partnerAds.map(toRankedCreative);
  const platformAds = redis.lrange('house_ads:platform_default', 0, 4);
  return platformAds.map(toRankedCreative);
}
```

---

## 4. Scheduling Model

### 4.1 Dual-Mode Operation

| Mode | Mechanism | Frequency | When Used |
|------|-----------|-----------|-----------|
| **Pull** | `GET /diffusion/schedule` | Every 5 min (configurable) | Always (primary) |
| **Push** | MQTT topic | On schedule change | When connected (supplementary) |

**Pull is the source of truth**. Push is an optimization to reduce latency.
If a device misses a push, the next pull will catch up.

### 4.2 Schedule Generation

**Lookahead window**: 6 hours

**Generation process**:
```
Input:
  - screenId
  - now (rounded to nearest minute for determinism)
  - campaignIndex (from Redis)
  - overrides (from Redis)

Output:
  ScheduleBundle {
    version: number;                // monotonic, increments on change
    generatedAt: string;            // ISO timestamp
    screenId: string;
    validFrom: string;              // now
    validUntil: string;             // now + 6h
    entries: ScheduleEntry[];
    houseAds: CreativeManifest[];   // fallback if all entries expire
    creativeManifest: Record<string, CreativeManifest>;  // all referenced creatives
  }

  ScheduleEntry {
    slotIndex: number;              // 0-based position in rotation
    campaignId: string;
    creativeId: string;
    durationMs: number;
    priority: number;
    tier: 'PREMIUM' | 'STANDARD' | 'HOUSE';
    validFrom: string;              // entry-specific time window
    validUntil: string;
    triggerTypes: DiffusionTrigger[];  // which triggers this entry responds to
  }
```

**Schedule is generated as a rotation playlist**:
- For a 6-hour window, the engine generates up to 720 entries (one per 30-second slot)
- Each entry is the result of `getNextAd()` called with a simulated timestamp
- The device replays this sequence on each trigger, advancing the pointer
- If the pointer reaches the end, it loops from the beginning

**Determinism**: The same `(screenId, roundedTimestamp, campaignIndex, overrides)` always
produces the same schedule. This means:
- If a device restarts and re-pulls, it gets the exact same schedule
- Two devices receiving the same schedule inputs play the same content

### 4.3 Last-Minute Campaign Changes

```
Campaign change detected (via NATS: campaign.updated)
    │
    ▼
Campaign Indexer updates Redis campaign index (< 5s)
    │
    ▼
Campaign Indexer publishes NATS: schedule.invalidated.{affectedScreenIds}
    │
    ▼
Scheduler Service regenerates schedule for affected screens (< 30s)
    │
    ▼
Schedule written to Redis + version incremented
    │
    ├── Push path: MQTT message to neofilm/screens/{screenId}/schedule
    │   Device receives within < 5s if online
    │
    └── Pull path: Device picks up on next poll (within 5 min)
```

**Total propagation**: < 60 seconds for push-capable devices, < 6 minutes for pull-only.

### 4.4 Deterministic Replay After Device Restart

```
Device boots → reads local schedule from persistent storage
    │
    ├── If local schedule.validUntil > now:
    │   └── Resume playback from slotIndex = hash(deviceId + floor(now / 30000)) % entries.length
    │       (deterministic position based on current time)
    │
    ├── If local schedule expired OR missing:
    │   └── Play house ads from local cache
    │   └── Simultaneously: pull new schedule from server
    │
    └── On successful pull: replace local schedule, continue from new slot 0
```

---

## 5. Media Delivery & Caching

### 5.1 Storage & CDN Pipeline

```
Advertiser uploads creative
    │
    ▼
S3 bucket: neofilm-creatives (origin)
    │
    ├── Lambda@Edge: transcode to multiple bitrates
    │   ├── 1080p H.264 @ 5 Mbps (primary)
    │   ├── 720p  H.264 @ 2.5 Mbps (fallback)
    │   └── 480p  H.264 @ 1 Mbps (low bandwidth)
    │
    ├── Generate thumbnail (first frame, JPEG)
    ├── Compute SHA-256 hash → stored in creative.fileHash
    │
    ▼
CloudFront distribution
    │
    ├── Behavior: /creatives/*
    │   Cache-Control: public, max-age=31536000, immutable
    │   (content-addressed: URL contains hash, never changes)
    │
    └── URL pattern: https://cdn.neofilm.io/creatives/{creativeId}/{bitrate}/{hash}.mp4
```

### 5.2 Multi-Bitrate Encoding Strategy

| Profile | Resolution | Bitrate | Codec | Target |
|---------|-----------|---------|-------|--------|
| HIGH | 1920x1080 | 5 Mbps | H.264 High | Good WiFi / Ethernet |
| MEDIUM | 1280x720 | 2.5 Mbps | H.264 Main | Average WiFi |
| LOW | 854x480 | 1 Mbps | H.264 Baseline | Poor connectivity |
| THUMBNAIL | 320x180 | N/A | JPEG | Preview / placeholder |

Device selects bitrate based on:
1. Available bandwidth (measured during prefetch)
2. Screen resolution (don't fetch 1080p for a 720p screen)
3. Available storage (prefer lower bitrate if storage < 20% free)

### 5.3 Device Local Cache

**Cache structure on device**:
```
/neofilm/cache/
  ├── creatives/
  │   ├── {creativeId}_{hash}.mp4        # actual media files
  │   ├── {creativeId}_{hash}.meta.json  # metadata + integrity info
  │   └── ...
  ├── schedule/
  │   ├── current.json                    # current schedule bundle
  │   └── fallback.json                   # last-known-good schedule
  ├── house_ads/
  │   ├── partner_{partnerOrgId}/         # partner-specific house ads
  │   └── platform_default/              # platform default house ads
  └── cache_manifest.json                # index of all cached files
```

**Cache eviction policy: Weighted LRU with quota**

```
Total cache quota: 2 GB (configurable per device)

Eviction priority (lowest priority evicted first):
  1. Expired schedule entries (creatives for past campaigns)
  2. Creatives not in current schedule and not in next schedule
  3. Lower-priority bitrate variants (evict LOW before HIGH)
  4. Least recently used among remaining

Protected from eviction (never auto-evicted):
  - House ads (partner + platform)
  - Creatives in current active schedule
  - Creatives in next 2-hour window

Eviction trigger:
  - Cache usage > 90% of quota
  - Before prefetch if insufficient space
```

### 5.4 Prefetch Algorithm

```typescript
async function prefetchCreatives(schedule: ScheduleBundle, device: DeviceState) {
  const cached = await readCacheManifest();
  const needed: PrefetchItem[] = [];

  // 1. Determine what's needed but not cached
  for (const entry of schedule.entries) {
    const manifest = schedule.creativeManifest[entry.creativeId];
    if (!manifest) continue;

    const isCached = cached.has(entry.creativeId) &&
                     cached.get(entry.creativeId).hash === manifest.fileHash;
    if (!isCached) {
      needed.push({
        creativeId: entry.creativeId,
        priority: entry.priority,
        validFrom: entry.validFrom,
        url: selectBitrateUrl(manifest, device),
        expectedSize: manifest.fileSizeBytes,
        hash: manifest.fileHash,
      });
    }
  }

  // 2. Sort by urgency (soonest validFrom first, then by priority)
  needed.sort((a, b) => {
    const timeDiff = new Date(a.validFrom).getTime() - new Date(b.validFrom).getTime();
    if (timeDiff !== 0) return timeDiff;
    return b.priority - a.priority;
  });

  // 3. Evict if necessary
  const totalNeededBytes = needed.reduce((sum, n) => sum + n.expectedSize, 0);
  if (cached.totalSize + totalNeededBytes > CACHE_QUOTA * 0.9) {
    await evictLRU(totalNeededBytes);
  }

  // 4. Download with bandwidth management
  const concurrency = device.networkType === 'ethernet' ? 3 : 1;
  const isNighttime = new Date().getHours() >= 2 && new Date().getHours() <= 5;
  const maxBandwidthMbps = isNighttime ? Infinity : 2; // limit during business hours

  await downloadQueue(needed, {
    concurrency,
    maxBandwidthMbps,
    retries: 3,
    retryBackoff: [1000, 5000, 30000],
    onComplete: async (item) => {
      // Verify integrity
      const hash = await sha256(item.filePath);
      if (hash !== item.hash) {
        await deleteFile(item.filePath);
        throw new IntegrityError(`Hash mismatch for ${item.creativeId}`);
      }
      await updateCacheManifest(item);
    },
  });
}
```

### 5.5 CDN Headers Strategy

```
Creative files (immutable, content-addressed):
  Cache-Control: public, max-age=31536000, immutable
  Content-Type: video/mp4
  ETag: "{sha256hash}"
  X-Content-Type-Options: nosniff
  Accept-Ranges: bytes  (support range requests for resume)

Schedule API responses:
  Cache-Control: private, no-cache
  ETag: "schedule-v{version}"
  (304 Not Modified if version unchanged)

Creative manifest API:
  Cache-Control: public, max-age=300, stale-while-revalidate=60
  (5-minute cache, 1-minute stale serving)
```

---

## 6. Offline & Failover Strategy

### 6.1 Scenario Matrix

| Scenario | Duration | Device Behavior | Data Integrity |
|----------|----------|-----------------|----------------|
| **Offline < 1 hour** | Short | Continue current schedule rotation | Queue logs locally |
| **Offline 1-24 hours** | Medium | Continue schedule until validUntil, then switch to fallback | Queue logs, sync on reconnect |
| **Offline > 24 hours** | Extended | Fallback playlist only (house ads) | Queue logs (max 10K), oldest evicted |
| **Creative missing** | N/A | Skip to next creative in rotation | Log error, play house ad |
| **Creative corrupted** | N/A | Hash check fails → delete + re-download | Play house ad while downloading |
| **CDN unreachable** | N/A | Use locally cached creatives only | Log CDN error |
| **Engine unreachable** | N/A | Continue last valid schedule + local fallback | Queue all logs |

### 6.2 Offline Fallback Playlist Strategy

```
PRIORITY ORDER (device plays first available):

1. Current schedule entries (if validUntil > now)
   → Resume from deterministic position
   → Skip entries whose campaigns have ended (check endDate)

2. Fallback schedule (last-known-good, stored in fallback.json)
   → Used when current schedule has expired
   → Rotates through all entries, skipping expired campaigns

3. Partner house ads (from /neofilm/cache/house_ads/partner_{id}/)
   → Always cached, at least 3 creatives
   → 15-second rotation

4. Platform default ads (from /neofilm/cache/house_ads/platform_default/)
   → Bundled with app install (never missing)
   → Generic content: clock, weather, "your ad here" placeholder

GUARANTEE: Level 4 is always available → NO BLACKOUT EVER
```

### 6.3 Local Schedule Persistence

```
On every successful schedule pull:
  1. Write new schedule to /neofilm/cache/schedule/current.json
  2. Copy previous current.json → fallback.json (if previous was valid)
  3. Both files include full creative manifest URLs + hashes

On device boot:
  1. Read current.json
  2. If valid (validUntil > now): use it
  3. If expired: read fallback.json
  4. If both expired: use house ads
  5. Simultaneously: attempt to pull fresh schedule from server

File format includes checksum:
  {
    "schedule": { ... },
    "checksum": "sha256 of schedule JSON",
    "savedAt": "ISO timestamp"
  }
  → Device verifies checksum before using → rejects corrupted files
```

### 6.4 Retry Logic

```typescript
const RETRY_CONFIG = {
  schedulePull: {
    intervals: [5_000, 15_000, 30_000, 60_000, 300_000], // 5s, 15s, 30s, 1m, 5m
    maxInterval: 300_000,  // cap at 5 minutes
    jitter: 0.2,           // ±20% random jitter to avoid thundering herd
  },
  creativePrefetch: {
    intervals: [1_000, 5_000, 30_000],
    maxInterval: 300_000,
    jitter: 0.1,
  },
  logUpload: {
    intervals: [10_000, 30_000, 60_000, 300_000],
    maxInterval: 600_000,  // cap at 10 minutes
    jitter: 0.3,
    maxQueueSize: 10_000,  // evict oldest if exceeded
  },
  mqttReconnect: {
    intervals: [1_000, 5_000, 15_000, 30_000],
    maxInterval: 60_000,
    jitter: 0.2,
  },
};
```

### 6.5 Guaranteed No-Blackout Policy

```
INVARIANT: The ad zone NEVER displays empty/blank/error state.

Implementation:
  1. Device app bundles 3 platform default house ads at install time
     → These are baked into the APK / app bundle
     → Updated only via OTA app update
     → Total size: < 15 MB

  2. On first successful server connection, device downloads:
     → Partner-specific house ads (if configured)
     → Updated platform default ads
     → These are NEVER evicted from cache

  3. Creative player has a watchdog timer:
     → If current creative fails to start within 3 seconds → skip to next
     → If no creative can play → immediately show house ad
     → If house ad cache is corrupted → show built-in static image

  4. The built-in static image is a compiled resource (not a file):
     → "NEOFILM" logo + clock + "Advertising available"
     → Cannot be corrupted or missing
     → ABSOLUTE last resort
```

---

## 7. API & Protocol Specification

### 7.1 Device-Facing APIs

#### GET /api/v1/diffusion/schedule

Retrieve the current schedule bundle for a device.

```
Headers:
  Authorization: Bearer <device_jwt_token>
  If-None-Match: "schedule-v{lastKnownVersion}"

Query Parameters:
  deviceId: string (required) — device CUID
  since: number (optional) — last known schedule version

Response 200:
{
  "version": 42,
  "generatedAt": "2026-02-25T14:30:00.000Z",
  "screenId": "clxyz123abc",
  "validFrom": "2026-02-25T14:30:00.000Z",
  "validUntil": "2026-02-25T20:30:00.000Z",
  "entries": [
    {
      "slotIndex": 0,
      "campaignId": "clcmp001",
      "creativeId": "clcre001",
      "durationMs": 15000,
      "priority": 85,
      "tier": "PREMIUM",
      "validFrom": "2026-02-25T14:30:00.000Z",
      "validUntil": "2026-02-25T20:30:00.000Z",
      "triggerTypes": ["POWER_ON", "OPEN_APP", "CHANGE_APP", "CATALOG_OPEN"]
    }
  ],
  "houseAds": [
    {
      "creativeId": "house_001",
      "fileUrl": "https://cdn.neofilm.io/creatives/house_001/high/abc123.mp4",
      "fileHash": "sha256:...",
      "durationMs": 15000
    }
  ],
  "creativeManifest": {
    "clcre001": {
      "fileUrl": "https://cdn.neofilm.io/creatives/clcre001/high/def456.mp4",
      "fileUrlMedium": "https://cdn.neofilm.io/creatives/clcre001/medium/def456.mp4",
      "fileUrlLow": "https://cdn.neofilm.io/creatives/clcre001/low/def456.mp4",
      "fileHash": "sha256:a1b2c3d4...",
      "durationMs": 15000,
      "width": 1920,
      "height": 1080,
      "mimeType": "video/mp4",
      "fileSizeBytes": 4500000
    }
  }
}

Response 304: Not Modified (schedule version unchanged)

Response 401: Invalid or expired device token
Response 403: Device not paired to any screen
Response 429: Rate limited (max 20 req/min)
```

#### POST /api/v1/diffusion/log

Submit a batch of diffusion proof logs.

```
Headers:
  Authorization: Bearer <device_jwt_token>
  Content-Type: application/json
  Idempotency-Key: <uuid_v7>  (prevents duplicate processing)

Request Body:
{
  "deviceId": "cldev001",
  "batchId": "01JHQX...",
  "proofs": [
    {
      "proofId": "01JHQX...",
      "screenId": "clscr001",
      "campaignId": "clcmp001",
      "creativeId": "clcre001",
      "startTime": "2026-02-25T14:30:05.000Z",
      "endTime": "2026-02-25T14:30:20.000Z",
      "durationMs": 15000,
      "triggerContext": "OPEN_APP",
      "appVersion": "1.2.0",
      "mediaHash": "sha256:a1b2c3d4...",
      "signature": "hmac_sha256:..."
    }
  ]
}

Response 202:
{
  "batchId": "01JHQX...",
  "accepted": 15,
  "rejected": 0,
  "rejections": []
}

Response 207 (partial):
{
  "batchId": "01JHQX...",
  "accepted": 13,
  "rejected": 2,
  "rejections": [
    { "proofId": "...", "reason": "DUPLICATE" },
    { "proofId": "...", "reason": "INVALID_SIGNATURE" }
  ]
}

Rate limit: 10 req/min per device, max 100 proofs per batch
```

#### POST /api/v1/diffusion/heartbeat

Device heartbeat with playback status.

```
Headers:
  Authorization: Bearer <device_jwt_token>

Request Body:
{
  "deviceId": "cldev001",
  "timestamp": "2026-02-25T14:35:00.000Z",
  "isOnline": true,
  "appVersion": "1.2.0",
  "uptime": 86400,
  "scheduleVersion": 42,
  "currentlyPlaying": {
    "campaignId": "clcmp001",
    "creativeId": "clcre001",
    "startedAt": "2026-02-25T14:34:55.000Z"
  },
  "cacheStatus": {
    "totalBytes": 1800000000,
    "usedBytes": 1200000000,
    "creativesCount": 45
  },
  "metrics": {
    "cpuPercent": 23.5,
    "memoryPercent": 45.2,
    "diskPercent": 60.0,
    "temperature": 42.1,
    "networkType": "wifi",
    "networkSpeed": 50.0,
    "signalStrength": -55
  }
}

Response 200:
{
  "ack": true,
  "serverTime": "2026-02-25T14:35:00.123Z",
  "commands": []  // or [{ type: "PULL_SCHEDULE" }, { type: "PURGE_CACHE", creativeIds: [...] }]
}

Rate limit: 60 req/min per device (every ~60s)
```

#### POST /api/v1/diffusion/cache/report

Report what creatives are currently cached on device.

```
Headers:
  Authorization: Bearer <device_jwt_token>

Request Body:
{
  "deviceId": "cldev001",
  "cachedCreatives": [
    {
      "creativeId": "clcre001",
      "fileHash": "sha256:a1b2c3d4...",
      "bitrate": "high",
      "sizeBytes": 4500000,
      "cachedAt": "2026-02-25T10:00:00.000Z"
    }
  ],
  "totalCacheBytes": 2000000000,
  "usedCacheBytes": 1200000000,
  "freeCacheBytes": 800000000
}

Response 200:
{
  "ack": true,
  "prefetchSuggestions": [
    {
      "creativeId": "clcre002",
      "priority": "HIGH",
      "url": "https://cdn.neofilm.io/...",
      "hash": "sha256:...",
      "sizeBytes": 3200000,
      "reason": "upcoming_schedule"
    }
  ],
  "evictSuggestions": [
    { "creativeId": "clcre_old", "reason": "campaign_ended" }
  ]
}

Rate limit: 6 req/hour per device
```

### 7.2 Admin-Facing APIs

#### POST /api/v1/admin/override

Force, block, or pause a campaign on specific screens.

```
Headers:
  Authorization: Bearer <admin_jwt_token>

Request Body:
{
  "action": "FORCE",          // FORCE | BLOCK | PAUSE
  "campaignId": "clcmp001",   // required for FORCE/BLOCK/PAUSE
  "creativeId": "clcre001",   // optional, required for FORCE
  "screenIds": ["clscr001", "clscr002"],  // specific screens, or...
  "scope": "SPECIFIC",        // SPECIFIC | ALL | PARTNER | GEO
  "partnerOrgId": null,       // for scope=PARTNER
  "geoHash": null,            // for scope=GEO
  "expiresAt": "2026-02-25T23:59:59Z",  // auto-expire override
  "reason": "Emergency brand safety issue"
}

Response 200:
{
  "overrideId": "clov001",
  "action": "FORCE",
  "affectedScreens": 2,
  "propagatedAt": "2026-02-25T14:35:01.000Z",
  "expiresAt": "2026-02-25T23:59:59.000Z"
}
```

#### POST /api/v1/admin/pause-campaign

```
Request Body:
{
  "campaignId": "clcmp001",
  "reason": "Budget review",
  "pausedBy": "admin_user_id"
}

Response 200:
{
  "campaignId": "clcmp001",
  "previousStatus": "ACTIVE",
  "newStatus": "PAUSED",
  "affectedScreens": 150,
  "schedulesInvalidated": 150
}
```

#### POST /api/v1/admin/block-screen

```
Request Body:
{
  "screenId": "clscr001",
  "reason": "Hardware malfunction",
  "blockedBy": "admin_user_id",
  "blockAds": true,           // stop paid ads
  "blockHouseAds": false      // still show house ads
}

Response 200:
{
  "screenId": "clscr001",
  "blocked": true,
  "affectedCampaigns": 5
}
```

#### GET /api/v1/admin/live-status

```
Query Parameters:
  scope: "all" | "partner:{orgId}" | "geo:{geoHash}" | "screen:{screenId}"
  page: number (default: 1)
  limit: number (default: 50, max: 200)

Response 200:
{
  "summary": {
    "totalScreens": 1250,
    "online": 1180,
    "offline": 70,
    "activeOverrides": 3,
    "activeCampaigns": 89,
    "impressionsToday": 245000
  },
  "screens": [
    {
      "screenId": "clscr001",
      "name": "Cinema Pathé Lyon - Lobby Screen 1",
      "isOnline": true,
      "lastHeartbeat": "2026-02-25T14:34:55.000Z",
      "scheduleVersion": 42,
      "currentlyPlaying": {
        "campaignId": "clcmp001",
        "creativeName": "Nike Air Max 2026",
        "startedAt": "2026-02-25T14:34:55.000Z"
      },
      "impressionsToday": 180,
      "cacheHealth": "GOOD",
      "activeOverrides": []
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 1250, "pages": 25 }
}
```

### 7.3 Internal APIs

#### POST /api/v1/campaigns/index/rebuild

Triggers a full campaign index rebuild (admin-only, internal).

```
Headers:
  Authorization: Bearer <admin_jwt_token>
  X-Internal-Key: <service_api_key>  (additional auth for internal endpoints)

Request Body:
{
  "scope": "FULL",            // FULL | GEO_HASH | CAMPAIGN
  "geoHash": null,            // for scope=GEO_HASH
  "campaignId": null          // for scope=CAMPAIGN
}

Response 202:
{
  "jobId": "job_rebuild_001",
  "estimatedDuration": "30s",
  "scope": "FULL",
  "campaignsToIndex": 89
}
```

#### POST /api/v1/fraud/signals

Submit fraud detection signal (internal, from Proof Ingestion).

```
Request Body:
{
  "signalType": "VOLUME_SPIKE",
  "severity": "HIGH",
  "deviceId": "cldev001",
  "screenId": "clscr001",
  "details": {
    "observedRate": 150,
    "expectedRate": 40,
    "zScore": 4.2,
    "timeWindow": "2026-02-25T14:00:00Z/2026-02-25T15:00:00Z"
  },
  "relatedProofIds": ["proof_001", "proof_002"]
}

Response 202:
{
  "signalId": "sig_001",
  "acknowledged": true,
  "alertTriggered": true
}
```

#### GET /api/v1/segments/{geoHash}/campaigns

Retrieve the campaign index for a geographic segment (internal, for debugging).

```
Response 200:
{
  "geoHash": "u09t",
  "campaigns": [
    {
      "campaignId": "clcmp001",
      "advertiserName": "Nike France",
      "priority": 85,
      "tier": "PREMIUM",
      "budgetRemaining": 45000,
      "readyCreatives": 3,
      "targetedScreens": 120
    }
  ],
  "lastUpdated": "2026-02-25T14:30:00.000Z",
  "totalCampaigns": 12
}
```

### 7.4 Authentication Model

**Device tokens**:
```
Flow:
  1. Device provisioned with provisioningToken (one-time use)
  2. Device calls POST /auth/device/activate with provisioningToken + serialNumber
  3. Server returns:
     - deviceJwt (short-lived, 1 hour)
     - deviceRefreshToken (long-lived, 30 days)
     - deviceSecret (permanent, for HMAC signing proofs)
  4. Device stores deviceSecret in secure enclave (Android Keystore)
  5. Device refreshes JWT via POST /auth/device/refresh before expiry
  6. All diffusion endpoints require valid deviceJwt

JWT claims:
  {
    sub: deviceId,
    screenId: screenId,
    partnerOrgId: partnerOrgId,
    type: "DEVICE",
    iat: timestamp,
    exp: timestamp + 3600
  }

Token revocation:
  - On device unpair: revoke all tokens, rotate deviceSecret
  - On fraud detection: immediate revoke + quarantine
  - Admin can revoke any device token via POST /admin/devices/{id}/revoke
```

**MQTT authentication**:
```
Username: device:{deviceId}
Password: JWT token (same as HTTP auth)
MQTT ACL:
  - Subscribe: neofilm/screens/{ownScreenId}/# (own screen only)
  - Subscribe: neofilm/global/# (broadcasts)
  - Publish: neofilm/screens/{ownScreenId}/heartbeat (own heartbeat only)
  - Deny: all other topics
```

### 7.5 Rate Limiting Plan

| Endpoint | Limit | Window | Key |
|----------|-------|--------|-----|
| GET /diffusion/schedule | 20/min | Sliding | deviceId |
| POST /diffusion/log | 10/min | Sliding | deviceId |
| POST /diffusion/heartbeat | 60/min | Sliding | deviceId |
| POST /diffusion/cache/report | 6/hour | Fixed | deviceId |
| POST /admin/override | 30/min | Sliding | userId |
| POST /admin/pause-campaign | 30/min | Sliding | userId |
| GET /admin/live-status | 60/min | Sliding | userId |
| POST /campaigns/index/rebuild | 1/5min | Fixed | global |

**Implementation**: Redis-backed sliding window counter via `@nestjs/throttler` with custom storage adapter.

### 7.6 Idempotency Rules

| Endpoint | Idempotency Key | Dedup Window |
|----------|-----------------|--------------|
| POST /diffusion/log | `Idempotency-Key` header (batchId) | 24 hours |
| POST /diffusion/heartbeat | `deviceId + timestamp` (1-minute granularity) | 5 minutes |
| POST /admin/override | `overrideId` (server-generated) | Duration of override |
| POST /campaigns/index/rebuild | `jobId` | Until completion |

**Idempotency storage**: Redis hash `idempotency:{key}` with TTL matching dedup window.
On duplicate request: return cached response, do not reprocess.

---

## 8. Real-Time Orchestration Flow

### 8.1 Sequence: New Campaign Goes Live

```
    Advertiser          API            Campaign        Scheduler       Device Sync       Device
        │                │              Indexer           Service          Service           │
        │  POST /campaign/activate      │                │                │                 │
        │───────────────>│              │                │                │                 │
        │                │  Validate    │                │                │                 │
        │                │  Update DB   │                │                │                 │
        │                │  status=ACTIVE               │                │                 │
        │  200 OK        │              │                │                │                 │
        │<───────────────│              │                │                │                 │
        │                │              │                │                │                 │
        │                │  NATS: campaign.updated       │                │                 │
        │                │─────────────>│                │                │                 │
        │                │              │                │                │                 │
        │                │              │  Read campaign │                │                 │
        │                │              │  + targeting   │                │                 │
        │                │              │  from PG       │                │                 │
        │                │              │                │                │                 │
        │                │              │  Compute       │                │                 │
        │                │              │  affected      │                │                 │
        │                │              │  geoHash cells │                │                 │
        │                │              │                │                │                 │
        │                │              │  Update Redis  │                │                 │
        │                │              │  campaign_index│                │                 │
        │                │              │  (~5s)         │                │                 │
        │                │              │                │                │                 │
        │                │              │  NATS: schedule.invalidated.{screenId}            │
        │                │              │  (for each affected screen)     │                 │
        │                │              │───────────────>│                │                 │
        │                │              │                │                │                 │
        │                │              │                │  Regenerate    │                 │
        │                │              │                │  schedule for  │                 │
        │                │              │                │  each screen   │                 │
        │                │              │                │  (~30s total)  │                 │
        │                │              │                │                │                 │
        │                │              │                │  Write to Redis│                 │
        │                │              │                │  schedule:{id} │                 │
        │                │              │                │                │                 │
        │                │              │                │  NATS: schedule.updated.{screenId}
        │                │              │                │───────────────>│                 │
        │                │              │                │                │                 │
        │                │              │                │                │  MQTT push      │
        │                │              │                │                │  schedule update │
        │                │              │                │                │────────────────>│
        │                │              │                │                │                 │
        │                │              │                │                │                 │  Apply new
        │                │              │                │                │                 │  schedule
        │                │              │                │                │                 │  Prefetch
        │                │              │                │                │                 │  creatives
        │                │              │                │                │                 │
```

**Total latency**: Campaign activation → device plays ad: **< 60 seconds**

### 8.2 Sequence: Admin Emergency Override

```
    Admin              API            Real-Time        Device Sync       Device
      │                 │              Control           Service           │
      │  POST /admin/override          │                │                 │
      │  action=FORCE   │              │                │                 │
      │────────────────>│              │                │                 │
      │                 │              │                │                 │
      │                 │  Write Redis │                │                 │
      │                 │  override:{screenId}          │                 │
      │                 │  (<100ms)    │                │                 │
      │                 │              │                │                 │
      │                 │  NATS: admin.override.{screenId}               │
      │                 │─────────────>│                │                 │
      │                 │              │                │                 │
      │                 │              │  MQTT publish  │                 │
      │                 │              │  neofilm/screens/{id}/control    │
      │                 │              │─────────────────────────────────>│
      │                 │              │                │                 │
      │  200 OK         │              │                │                 │  Immediately
      │<────────────────│              │                │                 │  apply override
      │                 │              │                │                 │  (<5s total)
      │                 │              │                │                 │
```

**Total latency**: Admin clicks → device applies: **< 5 seconds**

### 8.3 Sequence: Device Boot & First Ad

```
    Device                              API                         Redis / PG
      │                                  │                               │
      │  1. Boot, load local schedule    │                               │
      │  (from persistent storage)       │                               │
      │                                  │                               │
      │  2. POST /auth/device/refresh    │                               │
      │────────────────────────────────>│                               │
      │  JWT token                       │                               │
      │<────────────────────────────────│                               │
      │                                  │                               │
      │  3. Connect MQTT                 │                               │
      │────────────────────────────────>│  Subscribe to topics          │
      │                                  │                               │
      │  4. POST /diffusion/heartbeat    │                               │
      │────────────────────────────────>│                               │
      │  ACK + commands                  │  Update ScreenLiveStatus     │
      │<────────────────────────────────│─────────────────────────────>│
      │                                  │                               │
      │  5. GET /diffusion/schedule      │                               │
      │────────────────────────────────>│  Read schedule:{screenId}    │
      │  ScheduleBundle                  │<─────────────────────────────│
      │<────────────────────────────────│                               │
      │                                  │                               │
      │  6. Prefetch creatives           │                               │
      │  (background, from CDN)          │                               │
      │                                  │                               │
      │  7. First trigger (POWER_ON)     │                               │
      │  → Play first ad from schedule   │                               │
      │                                  │                               │
      │  8. POST /diffusion/log          │                               │
      │  (after ad completes)            │                               │
      │────────────────────────────────>│  Enqueue for processing      │
      │  202 Accepted                    │                               │
      │<────────────────────────────────│                               │
```

---

## 9. Scaling Strategy

### 9.1 Horizontal Scaling Plan (Kubernetes)

```yaml
# Deployment topology for 100k+ screens

# Stateless services — scale horizontally
api-gateway:
  replicas: 6-20 (HPA: CPU 60%, memory 70%)
  resources: 1 CPU, 1Gi RAM per pod
  affinity: spread across 3+ AZs

device-sync-service:
  replicas: 10-40 (HPA: requests/sec)
  resources: 2 CPU, 2Gi RAM per pod
  # This handles the most traffic: 100k devices × 12 req/hour = 1.2M req/hour

scheduler-service:
  replicas: 4-12 (HPA: NATS consumer lag)
  resources: 2 CPU, 2Gi RAM per pod
  # CPU-intensive: scoring + sorting for each schedule generation

campaign-indexer:
  replicas: 2-4 (low traffic, event-driven)
  resources: 1 CPU, 1Gi RAM per pod

proof-ingestion-worker:
  replicas: 6-20 (HPA: NATS consumer lag)
  resources: 1 CPU, 2Gi RAM per pod
  # 100k screens × 100 impressions/day = 10M proofs/day = ~115 proofs/sec

fraud-detection-worker:
  replicas: 2-4
  resources: 2 CPU, 2Gi RAM per pod

realtime-control-service:
  replicas: 3-6
  resources: 1 CPU, 1Gi RAM per pod

# Stateful services
redis-cluster:
  nodes: 6 (3 primary + 3 replica)
  resources: 4 CPU, 16Gi RAM per node
  storage: 50Gi SSD per node

nats-cluster:
  nodes: 3
  resources: 2 CPU, 4Gi RAM per node
  storage: 100Gi SSD per node (JetStream)

postgresql:
  primary: 1 (8 CPU, 32Gi RAM, 500Gi SSD)
  read-replicas: 2-4 (for analytics queries)
  connection pool: PgBouncer (200 connections)

mqtt-broker:
  nodes: 3 (EMQX cluster for 100k+ connections)
  resources: 4 CPU, 8Gi RAM per node
  # Mosquitto won't scale to 100k; migrate to EMQX or VerneMQ
```

### 9.2 Sharding Strategy

**Redis sharding by geoHash**:
```
campaign_index:{geoHash4}  → Shard by geoHash prefix
  France has ~200 unique geoHash-4 cells
  Each cell: ~50 campaigns (sorted set, ~50KB)
  Total: ~10MB for campaign index (fits in single Redis node)

schedule:{screenId}         → Shard by screenId hash
  100k screens × 50KB per schedule = 5GB total
  Distributed across Redis cluster (consistent hashing)

freq:*                      → Shard by screenId prefix
  100k screens × 20 counters × 100 bytes = 200MB
  Distributed across Redis cluster
```

**NATS partitioning by region**:
```
Subjects with natural partitioning:
  schedule.invalidated.{screenId}  → Partitioned by screenId
  admin.override.{screenId}        → Partitioned by screenId
  diffusion.log.batch              → Partitioned by deviceId (for ordering)
  fraud.signal                     → Single stream (low volume)

Consumer groups:
  Each worker in a service subscribes to a NATS queue group
  NATS distributes messages round-robin within the group
  Natural load balancing without explicit partitioning
```

**PostgreSQL read scaling**:
```
Write path (primary):
  - DiffusionLog inserts (partitioned, ~115/sec)
  - Campaign status updates
  - DeviceHeartbeat inserts

Read path (replicas):
  - Schedule generation reads (campaign + targeting data)
  - Analytics dashboard queries
  - Admin live status queries
  - Fraud detection queries

Connection routing:
  - Prisma: read replicas via connection URL with ?replication=database
  - PgBouncer: transaction-mode pooling
  - Max 200 connections per replica
```

### 9.3 Redis Caching Strategy (Hot Sets)

```
# Layer 1: In-process cache (per pod, Node.js LRU)
  Campaign summaries:  TTL 30s, max 5000 entries
  Creative manifests:  TTL 60s, max 10000 entries
  Screen metadata:     TTL 60s, max 100000 entries

# Layer 2: Redis cluster (shared across pods)
  campaign_index:{geoHash4}:      TTL none (updated on change)
  campaign_detail:{campaignId}:   TTL 5 min
  creative_manifest:{creativeId}: TTL 10 min
  schedule:{screenId}:current:    TTL 7 hours (validUntil + 1h buffer)
  schedule:{screenId}:version:    TTL none
  override:{screenId}:            TTL configurable (default 24h)
  override:global:                TTL configurable
  freq:*:                         TTL 2 hours (double the 1h window)
  house_ads:{partnerOrgId}:       TTL 1 hour
  house_ads:platform_default:     TTL 1 hour

# Layer 3: PostgreSQL (source of truth)
  All campaign, screen, creative, targeting data
  Campaign Indexer reads from PG and populates Redis
```

### 9.4 Backpressure Handling

```
1. Device Sync (HTTP):
   - If Redis is slow: return cached schedule (in-process LRU fallback)
   - If schedule generation is behind: return last valid schedule (stale but correct)
   - Circuit breaker: if error rate > 5%, return 503 with Retry-After header
   - Device respects Retry-After and falls back to local schedule

2. Proof Ingestion (NATS):
   - NATS JetStream: built-in backpressure via consumer ack-wait
   - If consumers can't keep up: messages accumulate in stream (disk-backed)
   - Max stream size: 10GB → oldest messages discarded (but devices will re-send)
   - Alert: if consumer lag > 5 minutes → scale up workers

3. MQTT (push):
   - If broker queue is full: drop non-critical messages (schedule updates)
   - Critical messages (overrides) have QoS 1 (at least once)
   - Schedule updates have QoS 0 (at most once, device will pull anyway)

4. Campaign Indexer (NATS):
   - Debounce: if same campaign updated multiple times within 5s, process once
   - Rate limit: max 100 campaign reindexes per minute
   - If backlogged: skip incremental, trigger full rebuild
```

---

## 10. Failure Recovery Plan

### 10.1 Disaster Recovery Strategy

| Component | RPO | RTO | Strategy |
|-----------|-----|-----|----------|
| PostgreSQL | 0 (sync replication) | < 5 min | Streaming replication + automatic failover (Patroni) |
| Redis | < 1 min (AOF) | < 2 min | Redis Sentinel auto-failover + AOF persistence |
| NATS | 0 (Raft consensus) | < 30s | 3-node cluster with Raft |
| S3/CDN | 0 (managed) | 0 | AWS managed, 11 nines durability |
| MQTT | < 1 min | < 1 min | EMQX cluster with session persistence |

**Full datacenter failure**:
```
Active-passive multi-region:
  Primary: eu-west-3 (Paris)
  Standby: eu-west-1 (Ireland)

Failover procedure:
  1. DNS failover via Route53 health checks (automatic, < 60s)
  2. PostgreSQL: promote standby replica (Patroni, < 30s)
  3. Redis: restore from latest RDB snapshot to new cluster (< 5 min)
  4. NATS: standby cluster takes over (< 30s)
  5. Devices: retry connects to new endpoint (DNS TTL: 60s)

During failover:
  - Devices continue with local schedules (no interruption)
  - Logs queued locally on devices
  - Schedules may be up to 5 minutes stale
```

### 10.2 Log Replay Strategy

```
Scenario: Proof Ingestion service was down for 2 hours.
All device log submissions returned 202 (fire-and-forget to NATS),
but NATS consumer was offline.

Recovery:
  1. NATS JetStream retained all messages (disk-backed, up to 10GB)
  2. When consumer restarts, it replays from last ack'd sequence
  3. Deduplication: proofId uniqueness check prevents double-counting
  4. Order doesn't matter: proofs are independent (no causal dependencies)

If NATS stream is lost:
  1. Devices have local log queue (max 10K proofs, ~30MB)
  2. Device detects 5xx or timeout → queues proof locally
  3. On next successful upload: sends accumulated batch
  4. Server deduplicates on (deviceId, creativeId, startTime)
```

### 10.3 Dead Letter Queues

```
NATS JetStream DLQ configuration:

Stream: DIFFUSION_PROOFS
  Max deliver: 5 (retry 5 times)
  Ack wait: 30s
  Max ack pending: 1000
  On max deliver exceeded → redirect to: DIFFUSION_PROOFS_DLQ

Stream: DIFFUSION_PROOFS_DLQ
  Retention: 7 days
  Max messages: 100,000
  Alert: if DLQ depth > 100 → PagerDuty alert

DLQ inspection job (daily):
  1. Read all messages from DLQ
  2. Classify failure reasons:
     - Schema validation error → log and discard
     - Database connection error → retry (transient)
     - HMAC verification failed → flag as fraud, discard from DLQ
     - Unknown → retain for manual inspection
  3. Retryable messages → re-publish to main stream
  4. Non-retryable → archive to S3 for audit
```

### 10.4 Reconciliation Jobs

```sql
-- Job: Compare expected vs delivered impressions (daily at 6 AM)
-- Identifies screens that should have played ads but didn't report logs

WITH expected AS (
  -- Screens with active schedules yesterday
  SELECT DISTINCT ss.schedule_id, s.screen_id, ss.campaign_id, ss.creative_id
  FROM schedule_slots ss
  JOIN schedules sch ON sch.id = ss.schedule_id
  JOIN screens s ON s.id = sch.screen_id
  WHERE sch.is_active = true
    AND s.status = 'ACTIVE'
    AND ss.start_time::date = CURRENT_DATE - INTERVAL '1 day'
),
delivered AS (
  -- Actual diffusion logs from yesterday
  SELECT DISTINCT screen_id, campaign_id, creative_id
  FROM diffusion_logs
  WHERE start_time::date = CURRENT_DATE - INTERVAL '1 day'
    AND verified = true
),
online_windows AS (
  -- Screens that were online yesterday (at least 1 heartbeat)
  SELECT DISTINCT s.id AS screen_id
  FROM screens s
  JOIN devices d ON d.id = s.active_device_id
  JOIN device_heartbeats dh ON dh.device_id = d.id
  WHERE dh.timestamp::date = CURRENT_DATE - INTERVAL '1 day'
    AND dh.is_online = true
)
SELECT
  e.screen_id,
  e.campaign_id,
  e.creative_id,
  CASE
    WHEN d.screen_id IS NOT NULL THEN 'DELIVERED'
    WHEN ow.screen_id IS NULL THEN 'SCREEN_OFFLINE'
    ELSE 'MISSING_LOG'  -- screen was online but no log → investigate
  END AS reconciliation_status
FROM expected e
LEFT JOIN delivered d ON d.screen_id = e.screen_id
  AND d.campaign_id = e.campaign_id
LEFT JOIN online_windows ow ON ow.screen_id = e.screen_id
WHERE d.screen_id IS NULL;  -- only show discrepancies
```

### 10.5 Monitoring Metrics

| Metric | Source | Alert Threshold | Dashboard |
|--------|--------|-----------------|-----------|
| Schedule generation latency (p99) | Scheduler Service | > 30s | Grafana |
| Schedule hit ratio | Device Sync | < 95% | Grafana |
| Cache hit ratio (Redis) | Redis | < 90% | Grafana |
| Cache hit ratio (CDN) | CloudFront | < 85% | CloudWatch |
| Blackout events (empty ad zone) | Device heartbeat | > 0 per hour | PagerDuty |
| Proof ingestion lag (NATS) | NATS monitoring | > 5 min | Grafana + PagerDuty |
| Fraud alerts per hour | Fraud Detection | > 50 (auto-escalate) | PagerDuty |
| Device offline rate | ScreenLiveStatus | > 10% of fleet | PagerDuty |
| MQTT connection count | EMQX | < 80% of expected | Grafana |
| API error rate (5xx) | API Gateway | > 1% | PagerDuty |
| DLQ depth | NATS DLQ | > 100 | PagerDuty |
| Schedule version staleness | Device heartbeat | > 3 versions behind | Grafana |
| Proof verification failure rate | Proof Ingestion | > 5% | PagerDuty |
| Budget exhaustion (campaign) | Campaign Indexer | budget used > 90% | Notification |
| Reconciliation gap | Reconciliation job | > 5% missing logs | Grafana |

---

## 11. Cost Optimization Strategy

### 11.1 Streaming Cost Reduction

```
Problem: 100k screens × 10 creatives/day × 5MB avg = 5TB/day egress at worst

Strategies:

1. Content-addressed URLs (immutable caching):
   URL: /creatives/{creativeId}/{bitrate}/{sha256hash}.mp4
   → Same creative is NEVER downloaded twice (CDN + device cache)
   → Expected: 90%+ CDN cache hit ratio

2. Aggressive device prefetch:
   → Device downloads during off-peak (2-5 AM)
   → 95% of daytime playback served from local cache
   → CDN traffic reduced to ~250GB/day (5% of worst case)

3. Multi-bitrate with auto-selection:
   → Devices on slow WiFi get 480p (1MB) instead of 1080p (5MB)
   → Average file size drops from 5MB to 3MB

4. Creative deduplication:
   → If advertiser uploads same file twice, SHA-256 matches → reuse
   → fileHash index on creatives table catches this

5. Regional CDN POPs:
   → CloudFront edge in Paris, Lyon, Marseille
   → Most traffic stays within France (data sovereignty bonus)

Cost estimate at 100k screens:
  CDN egress: ~250GB/day × €0.085/GB = ~€21/day = ~€640/month
  S3 storage: ~500GB × €0.023/GB = ~€12/month
  Total media delivery: ~€650/month
```

### 11.2 Schedule Pull Frequency Optimization

```
Static 5-minute interval → Adaptive polling:

Device calculates next poll based on:
  1. Schedule validity remaining:
     - validUntil > 4 hours → poll every 15 min
     - validUntil > 1 hour  → poll every 5 min
     - validUntil < 1 hour  → poll every 2 min
     - validUntil < 15 min  → poll every 30 sec

  2. MQTT connected:
     - If MQTT active → poll every 15 min (push handles updates)
     - If MQTT disconnected → use validity-based interval above

  3. Network conditions:
     - If on metered/slow connection → poll every 15 min minimum

API traffic reduction:
  Without optimization: 100k devices × 12 req/hour = 1.2M req/hour
  With optimization:    100k devices × 4 req/hour  = 400k req/hour (67% reduction)

HTTP 304 usage:
  Device sends If-None-Match: "schedule-v42"
  Server checks Redis: version == 42 → return 304 (no body)
  Transfer: 0 bytes body (vs 50KB for full schedule)
  Expected: 80% of pulls return 304
```

### 11.3 Cache Hit Targets

| Cache Layer | Target | Measured By |
|-------------|--------|-------------|
| Device local cache | > 95% | Creatives served from local storage vs downloaded |
| CDN edge cache | > 85% | CloudFront cache hit ratio |
| Redis (schedule) | > 99% | Redis keyspace hit ratio |
| Redis (campaign index) | > 99% | Redis keyspace hit ratio |
| In-process LRU | > 70% | Node.js cache hit counter |
| HTTP 304 (schedule) | > 80% | 304 responses / total schedule requests |

### 11.4 CDN Tuning

```
CloudFront configuration:

Distribution settings:
  Price class: PriceClass_100 (EU + NA edge locations)
  Origin shield: eu-west-3 (Paris) — reduces origin fetches by ~50%
  Minimum TTL: 86400 (24 hours for creative files)
  Default TTL: 31536000 (1 year for content-addressed URLs)

Behavior: /creatives/*
  Cache policy: CachingOptimized
  Origin request policy: AllViewerExceptHost
  Response headers: SecurityHeadersPolicy
  Compress: Yes (gzip + brotli for manifests)

Behavior: /manifests/*
  Cache policy: CachingDisabled (always fresh)

Error pages:
  403/404: serve empty transparent pixel (don't break device player)
  503: serve stale content (CloudFront stale-if-error)

Origin failover:
  Primary: S3 eu-west-3
  Secondary: S3 eu-west-1 (cross-region replication)
  Failover on: 500, 502, 503, 504
```

### 11.5 Batch Log Uploads

```
Device batching strategy:

  Normal operation:
    - Accumulate proofs in local queue
    - Upload batch every 5 minutes OR when queue reaches 50 proofs
    - Max batch size: 100 proofs (~50KB JSON)

  Offline recovery:
    - Queue up to 10,000 proofs locally (~5MB)
    - On reconnect: upload in batches of 100, with 1s delay between batches
    - Prevents thundering herd when many devices come online simultaneously

  Compression:
    - Request body: gzip compressed (Content-Encoding: gzip)
    - Typical compression ratio: 5:1 for JSON
    - 50KB batch → 10KB compressed
    - 100k devices × 20 batches/day × 10KB = 20GB/day upload (manageable)

Server-side batching:
  - NATS consumer processes in micro-batches of 50
  - PostgreSQL batch INSERT (50 rows per statement)
  - Reduces PG round-trips by 50x
```

### 11.6 Compression Plans

| Data Type | Compression | Ratio | Notes |
|-----------|-------------|-------|-------|
| Video creatives (H.264) | Already compressed | N/A | Don't re-compress |
| Schedule JSON (HTTP) | gzip | 5:1 | Content-Encoding: gzip |
| Proof batches (HTTP) | gzip | 5:1 | Client sends compressed |
| MQTT messages | None (small payloads) | N/A | < 1KB, compression overhead not worth it |
| NATS messages | None (in-memory) | N/A | Messages are small, speed > size |
| Redis values | None (fast access) | N/A | Memory trade-off for latency |
| PostgreSQL (TOAST) | pglz (automatic) | 3:1 | JSON columns auto-compressed |
| S3 archival (old proofs) | zstd | 8:1 | For ClickHouse archival |

---

## 12. Test Scenarios Matrix

### 12.1 Functional Tests

| ID | Category | Scenario | Input | Expected Result | Priority |
|----|----------|----------|-------|-----------------|----------|
| F01 | Eligibility | Active campaign, matching geo, valid window | Campaign in screen's geoHash | Campaign appears in ranked list | P0 |
| F02 | Eligibility | Campaign outside geo radius | Campaign 200km away, radius 50km | Campaign filtered out | P0 |
| F03 | Eligibility | Campaign outside schedule window | Campaign 9-17h, request at 20:00 | Campaign filtered out | P0 |
| F04 | Eligibility | Campaign budget exhausted | spentCents >= budgetCents | Campaign filtered out | P0 |
| F05 | Eligibility | Campaign status PAUSED | status = PAUSED | Campaign filtered out | P0 |
| F06 | Eligibility | Screen explicitly excluded | screenId in excludedScreens | Campaign filtered out | P0 |
| F07 | Eligibility | Screen explicitly included | screenId in includedScreens | Campaign included | P1 |
| F08 | Eligibility | Environment mismatch | CINEMA_LOBBY vs [HOTEL_LOBBY] | Campaign filtered out | P1 |
| F09 | Eligibility | No ready creatives | All creatives PROCESSING | Campaign filtered out | P0 |
| F10 | Targeting | Geo radius boundary | Screen exactly at radius edge | Campaign included (<=) | P1 |
| F11 | Targeting | City targeting | cities: ["Paris"], screen in Paris | Campaign included | P1 |
| F12 | Targeting | Empty targeting (all screens) | No geo, no env, no screen list | Campaign eligible everywhere | P0 |
| F13 | Schedule | Schedule window dayOfWeek | Monday window, request on Tuesday | Campaign filtered out | P1 |
| F14 | Schedule | Multiple schedule windows | Two windows, request in second | Campaign included | P2 |
| F15 | Priority | Premium vs Standard | Priority 85 vs 30 | Premium ranked higher | P0 |
| F16 | Priority | Same priority, pacing differs | Both priority 50, one underpaced | Underpaced ranked higher | P1 |
| F17 | Fairness | Same campaign played 10 times today | campaignPlaysToday = 10 | fairnessScore = 0 | P1 |
| F18 | Fairness | Campaign just played (recency) | lastPlayedIndex = 0 | -300 penalty | P0 |
| F19 | Frequency | Campaign at hourly cap | 10 plays this hour, cap = 10 | Campaign removed | P0 |
| F20 | Frequency | Advertiser at hourly cap | 6 plays this hour | Advertiser's campaigns removed | P1 |
| F21 | Override | Admin FORCE campaign | Force campaign X on screen Y | Campaign X plays regardless | P0 |
| F22 | Override | Admin BLOCK campaign | Block campaign X globally | Campaign X never plays | P0 |
| F23 | Override | Admin BLOCK screen | Block screen Y | Screen Y plays house ads only | P0 |
| F24 | Override | Force override with expiry | Force expires in 1 hour | After 1h, normal scheduling resumes | P1 |
| F25 | Anti-blackout | No eligible campaigns | All filtered out | House ads returned (never empty) | P0 |
| F26 | Anti-blackout | No house ads configured | Partner has no house ads | Platform default ads returned | P0 |
| F27 | Determinism | Same inputs, different nodes | Identical request to 2 nodes | Identical response | P0 |
| F28 | Determinism | Device restart, same time | Reboot mid-schedule | Resumes at deterministic position | P1 |
| F29 | Rotation | 5 campaigns, 20 slots | Repeated calls over 20 slots | Fair distribution, no back-to-back same | P1 |
| F30 | Pacing | Campaign 50% through, 20% spent | midway through campaign | High pacing score (underpaced) | P1 |
| F31 | Trigger | POWER_ON trigger bonus | trigger = POWER_ON | +100 bonus applied | P2 |
| F32 | Creative | Multiple ready creatives | 3 ready creatives for campaign | Rotates between them | P1 |
| F33 | Creative | Mix of VIDEO and IMAGE | POWER_ON trigger | Prefer VIDEO | P2 |
| F34 | Max slots | 15 eligible campaigns, max 10 | maxConcurrentAds = 10 | Only top 10 returned | P1 |

### 12.2 Resilience Tests

| ID | Category | Scenario | Setup | Expected Behavior | Priority |
|----|----------|----------|-------|-------------------|----------|
| R01 | Offline | Device offline < 1 hour | Disconnect network | Continue playing current schedule | P0 |
| R02 | Offline | Device offline 1-24 hours | Disconnect + wait | Schedule → fallback → house ads | P0 |
| R03 | Offline | Device offline > 24 hours | 24h disconnect | House ads only, queue logs | P0 |
| R04 | Offline | Reconnect after 2 hours | Disconnect → reconnect | Pull new schedule, upload queued logs | P0 |
| R05 | CDN | CDN failure | Block CDN domain | Play locally cached creatives | P0 |
| R06 | CDN | CDN slow (> 10s) | Throttle CDN to 10kbps | Prefetch falls back to LOW bitrate | P1 |
| R07 | Media | Corrupted video file | Flip bytes in cached file | Hash check fails → delete → re-download | P0 |
| R08 | Media | Missing creative (deleted from S3) | Remove from S3 | Skip creative, play next in rotation | P1 |
| R09 | Engine | Engine unreachable | Stop all API pods | Device continues local schedule | P0 |
| R10 | Engine | Engine returns 503 | API returns 503 | Device retries with backoff | P0 |
| R11 | Engine | Partial engine failure | Only scheduler down | Device gets last valid schedule via pull | P1 |
| R12 | Redis | Redis cluster failover | Kill primary node | Sentinel promotes replica, < 2s blip | P1 |
| R13 | Redis | Redis fully down | Kill all Redis nodes | Scheduler reads from PG directly (slow path) | P1 |
| R14 | NATS | NATS cluster failover | Kill 1 of 3 nodes | Raft consensus, < 1s blip | P2 |
| R15 | PG | PostgreSQL failover | Kill primary | Patroni promotes replica, < 30s | P0 |
| R16 | MQTT | MQTT broker restart | Restart EMQX | Devices auto-reconnect, resume subscriptions | P1 |
| R17 | MQTT | MQTT broker overloaded | 200k simultaneous connects | Graceful degradation, pull mode takes over | P1 |
| R18 | Log sync | Log queue overflow (10K) | Generate 15K proofs offline | Oldest 5K evicted, newest 10K preserved | P1 |
| R19 | Boot | Cold boot, no network | Boot without connectivity | Built-in platform ads play immediately | P0 |
| R20 | Boot | Cold boot, stale schedule | Boot with 24h-old schedule | Play house ads, pull new schedule | P0 |

### 12.3 Load Tests

| ID | Category | Scenario | Parameters | Success Criteria | Priority |
|----|----------|----------|------------|------------------|----------|
| L01 | Schedule pull | 100k devices polling | 100k req/5min = 333 req/s | p99 < 200ms, 0% errors | P0 |
| L02 | Schedule pull | 100k devices + 304 | 80% 304, 20% full response | p99 < 50ms for 304 | P0 |
| L03 | Log ingestion | 10M proofs/day | ~115 proofs/sec sustained | p99 < 500ms, 0% data loss | P0 |
| L04 | Log ingestion | Burst after outage | 50k devices upload 100 proofs each = 5M proofs in 1 hour | Process within 2 hours | P1 |
| L05 | Schedule gen | 10k schedules invalidated | Campaign affecting 10k screens | All regenerated in < 60s | P0 |
| L06 | MQTT push | Push to 100k devices | Schedule update broadcast | 99% delivered in < 5s | P1 |
| L07 | Override | Override to 50k screens | Admin force on large scope | All receive in < 5s via MQTT | P0 |
| L08 | Campaign index | Rebuild full index | 500 active campaigns × 200 geoHash cells | Complete in < 30s | P1 |
| L09 | Heartbeat | 100k heartbeats/min | 100k devices × 1 heartbeat/min | p99 < 100ms, ScreenLiveStatus updated | P0 |
| L10 | Mixed | Full production simulation | 100k devices, all APIs, 24h run | No degradation, no memory leaks | P0 |
| L11 | Spike | 3x normal traffic | 300k req/min on schedule endpoint | Auto-scale handles in < 2min | P1 |
| L12 | CDN | 100k prefetch storm | All devices prefetch simultaneously | CDN handles, no origin overload | P1 |

### 12.4 Fraud Tests

| ID | Category | Scenario | Attack Vector | Detection | Response | Priority |
|----|----------|----------|---------------|-----------|----------|----------|
| FR01 | Spoof | Fake device ID | Register fake device, submit proofs | Device not in DB, invalid JWT | Reject 401, alert | P0 |
| FR02 | Spoof | Stolen device token | Replay JWT from another device | Token's deviceId doesn't match proofs | Reject, revoke token | P0 |
| FR03 | Rate | Impossible impression rate | 200 impressions/hour from 1 device | Rule F001: > 120/hour | Flag, quarantine device | P0 |
| FR04 | Rate | Slow drip inflation | 5% above normal, sustained over weeks | Rule F007: statistical anomaly (3σ) | Alert for investigation | P1 |
| FR05 | Duplicate | Exact duplicate proofs | Same (deviceId, creativeId, startTime) | Rule F005: dedup check | Reject duplicate, alert | P0 |
| FR06 | Duplicate | Near-duplicate proofs | Same proof, startTime offset by 1ms | (deviceId, creativeId, startTime) bucket by second | Reject, alert | P1 |
| FR07 | Integrity | Wrong media hash | Submit proof with incorrect mediaHash | Rule F003: hash mismatch | Flag proof, alert | P0 |
| FR08 | Integrity | Invalid HMAC signature | Tampered proof data | Rule F008: HMAC verification failure | Reject, revoke device secret | P0 |
| FR09 | Ghost | Unassigned device | Device unpaired, still submitting proofs | Rule F004: device.screenId mismatch | Reject, quarantine | P0 |
| FR10 | Ghost | Wrong screen assignment | Device paired to screen A, claims screen B | Rule F004: screen mismatch | Reject, alert | P0 |
| FR11 | Offline | Offline spoofing | Submit proofs during known offline window | Rule F006: cross-ref with heartbeats | Flag batch, investigate | P1 |
| FR12 | Time | Time manipulation | Device clock set 2 hours ahead | Rule F009: > 5min drift from server | Warn, flag all proofs | P1 |
| FR13 | Token | Token replay | Reuse expired JWT | JWT expiry check | Reject 401 | P0 |
| FR14 | Budget | Over-delivery attack | Inflate impressions to drain competitor budget | Budget tracking + reconciliation | Pause campaign at budget, refund excess | P1 |

### 12.5 Integration Tests

| ID | Scenario | Components | Validation |
|----|----------|------------|------------|
| I01 | End-to-end: campaign → screen | All services | Campaign created → indexed → scheduled → device plays → proof logged |
| I02 | Admin override propagation | API → Redis → NATS → MQTT → Device | Override < 5s on connected device |
| I03 | Device provisioning → first ad | Auth → Device Sync → Scheduler → CDN | New device plays first ad within 5 min |
| I04 | Campaign exhausts budget | Proof Ingestion → Campaign status | Campaign auto-paused when spentCents >= budgetCents |
| I05 | Partner adds new screen | API → Scheduler → Campaign Indexer | Screen receives schedule within 60s |
| I06 | Creative upload → playback | S3 → CDN → Device prefetch → play | New creative plays within 10 min of approval |
| I07 | Revenue tracking | DiffusionLog → RevenueShare calculation | Monthly revenue matches expected (within 1%) |
| I08 | GDPR deletion | User deletion → pseudonymization | All PII removed, audit trail preserved |

---

## Appendix A: Redis Key Naming Convention

```
Prefix         | Key Pattern                                        | Type    | TTL
───────────────┼────────────────────────────────────────────────────┼─────────┼─────────
campaign_index | campaign_index:{geoHash4}                          | ZSET    | none
campaign_detail| campaign_detail:{campaignId}                       | HASH    | 5 min
creative_mfst  | creative_manifest:{creativeId}                     | HASH    | 10 min
schedule       | schedule:{screenId}:current                        | STRING  | 7 hours
schedule       | schedule:{screenId}:version                        | STRING  | none
schedule       | schedule:{screenId}:generated                      | STRING  | 7 hours
override       | override:{screenId}                                | HASH    | custom
override       | override:global                                    | HASH    | custom
freq           | freq:campaign:{campaignId}:screen:{screenId}:{hour}| STRING  | 2 hours
freq           | freq:advertiser:{advId}:screen:{screenId}:{hour}   | STRING  | 2 hours
freq           | freq:screen:{screenId}:{hour}                      | STRING  | 2 hours
house_ads      | house_ads:{partnerOrgId}                           | LIST    | 1 hour
house_ads      | house_ads:platform_default                         | LIST    | 1 hour
idempotency    | idempotency:{key}                                  | STRING  | varies
device_auth    | device_token:{deviceId}                            | STRING  | 1 hour
screen_meta    | screen_meta:{screenId}                             | HASH    | 5 min
```

## Appendix B: NATS Subject Naming Convention

```
Subject                                  | Stream              | Consumers
─────────────────────────────────────────┼─────────────────────┼───────────────────
campaign.updated                         | CAMPAIGNS           | CampaignIndexer
campaign.status_changed                  | CAMPAIGNS           | CampaignIndexer
campaign.targeting_changed               | CAMPAIGNS           | CampaignIndexer
schedule.invalidated.{screenId}          | SCHEDULES           | SchedulerService
schedule.updated.{screenId}              | SCHEDULES           | DeviceSyncService
admin.override.{screenId}               | ADMIN_CONTROL       | RealTimeControl
admin.override.global                    | ADMIN_CONTROL       | RealTimeControl
diffusion.log.batch                      | DIFFUSION_PROOFS    | ProofIngestion (×N)
fraud.signal                             | FRAUD               | FraudDetection
device.online.{deviceId}                 | DEVICE_EVENTS       | SchedulerService
device.offline.{deviceId}               | DEVICE_EVENTS       | (monitoring)
```

## Appendix C: MQTT Topic Hierarchy

```
Topic                                    | Direction   | QoS | Retained
─────────────────────────────────────────┼─────────────┼─────┼─────────
neofilm/screens/{screenId}/control       | Server→Dev  | 1   | No
neofilm/screens/{screenId}/schedule      | Server→Dev  | 0   | Yes
neofilm/screens/{screenId}/heartbeat     | Device→Srv  | 0   | No
neofilm/screens/{screenId}/cache-status  | Device→Srv  | 0   | No
neofilm/global/control                   | Server→All  | 1   | No
neofilm/global/announcement              | Server→All  | 0   | Yes
```

## Appendix D: Environment Variables (Diffusion Engine)

```bash
# Diffusion Engine specific
DIFFUSION_SCHEDULE_LOOKAHEAD_HOURS=6
DIFFUSION_SCHEDULE_POLL_INTERVAL_MS=300000
DIFFUSION_MAX_ADS_PER_SCREEN_PER_HOUR=20
DIFFUSION_MAX_CONCURRENT_ADS=10
DIFFUSION_FREQUENCY_CAP_DEFAULT=10
DIFFUSION_ADVERTISER_FREQUENCY_CAP=6
DIFFUSION_PROOF_BATCH_MAX=100
DIFFUSION_PROOF_RETRY_MAX=5
DIFFUSION_GEOHASH_PRECISION=4
DIFFUSION_HOUSE_ADS_ROTATION_MS=15000

# NATS JetStream
NATS_URL=nats://localhost:4222
NATS_CLUSTER_NAME=neofilm
NATS_MAX_RECONNECTS=10
NATS_RECONNECT_WAIT_MS=5000

# Redis (shared with other services)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_CLUSTER_ENABLED=false
REDIS_KEY_PREFIX=neofilm:

# MQTT
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_CLIENT_ID_PREFIX=diffusion-engine
MQTT_KEEP_ALIVE_SEC=60
MQTT_CLEAN_SESSION=false

# CDN
CDN_BASE_URL=https://cdn.neofilm.io
CDN_CREATIVE_PATH_PREFIX=/creatives
CDN_CACHE_MAX_AGE=31536000

# Fraud Detection
FRAUD_MAX_IMPRESSIONS_PER_HOUR=120
FRAUD_DURATION_MIN_RATIO=0.2
FRAUD_DURATION_MAX_RATIO=2.0
FRAUD_MAX_TIME_DRIFT_MS=300000
FRAUD_VOLUME_ZSCORE_THRESHOLD=3.0
```
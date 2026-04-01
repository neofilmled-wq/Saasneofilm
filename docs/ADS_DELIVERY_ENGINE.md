# NeoFilm Ads Delivery Engine — Architecture Document

## PHASE 1 — STATE DIAGRAMS

### TV Device States

```
                    ┌──────────┐
     TV Power On ──>│ UNPAIRED │<──── Admin Reset / Token Expired
                    └────┬─────┘
                         │ POST /tv/register → PIN generated
                         v
                    ┌──────────┐
                    │ PAIRING  │ (PIN displayed, polling /tv/status)
                    └────┬─────┘
                         │ Partner claims PIN → token received
                         v
                    ┌──────────┐
                    │  PAIRED  │
                    └────┬─────┘
                         │ Auto-transition
                         v
                    ┌──────────┐
                    │ SYNCING  │ ← Fetch schedule + bootstrap data
                    └────┬─────┘
                         │ Schedule received OR 5s timeout
                         v
                    ┌──────────┐       WebSocket lost > 60s
                    │  ACTIVE  │ ──────────────────────────> ┌─────────┐
                    └────┬─────┘                             │ OFFLINE │
                         │                                   └────┬────┘
                         │                                        │ Reconnected
                         │ <──────────────────────────────────────┘
                         │
                         │ Unrecoverable error
                         v
                    ┌──────────┐
                    │  ERROR   │ ── Retry → SYNCING
                    └──────────┘

     ┌─────────────┐
     │ MAINTENANCE │ ← Admin sets maintenance flag
     └─────────────┘   Screen stops serving ads
```

### Transitions with Conditions

```
UNPAIRED  → PAIRING       : POST /tv/register returns PIN
PAIRING   → PAIRED        : /tv/status returns PAIRED + accessToken
PAIRING   → UNPAIRED      : PIN expired (10 min TTL)
PAIRED    → SYNCING       : Auto (immediate)
SYNCING   → ACTIVE        : Schedule received OR 5s timeout
SYNCING   → ERROR         : Network failure + no cached schedule
SYNCING   → UNPAIRED      : Token rejected (401)
ACTIVE    → OFFLINE       : WebSocket disconnected > 60s
ACTIVE    → ERROR         : Unrecoverable JS error
ACTIVE    → SYNCING       : Admin force resync / schedule invalidated
ACTIVE    → UNPAIRED      : Admin unpair command
OFFLINE   → ACTIVE        : WebSocket reconnected
OFFLINE   → SYNCING       : Long offline (> 1h) → full resync
OFFLINE   → ERROR         : Cache exhausted + no network
ERROR     → SYNCING       : Retry timer (5s)
ERROR     → UNPAIRED      : Auth error
ANY       → MAINTENANCE   : Admin flag on screen
MAINTENANCE → SYNCING     : Admin clears flag
```

### Ad Delivery States (per creative on a screen)

```
                     Campaign ACTIVE
                           │
                           v
                    ┌────────────┐
                    │  ELIGIBLE  │ ← Passes all 11 eligibility checks
                    └─────┬──────┘
                          │
          ┌───────────────┼────────────────┐
          v               v                v
    ┌──────────┐   ┌───────────┐    ┌──────────┐
    │  SERVED  │   │  COOLDOWN │    │  CAPPED  │
    │(played)  │   │(recency   │    │(frequency│
    └────┬─────┘   │ penalty)  │    │ limit)   │
         │         └─────┬─────┘    └──────────┘
         │               │              │
         │               │ Cooldown     │ Hourly reset
         │               │ expired      │
         v               v              v
    ┌────────────────────────────────────────┐
    │           ELIGIBLE (re-enters pool)    │
    └────────────────────────────────────────┘
```

### Campaign Lifecycle States

```
    ┌───────┐   Submit    ┌──────────────────┐
    │ DRAFT │ ──────────> │ PENDING_APPROVAL │
    └───────┘             └────────┬─────────┘
                                   │
                     ┌─────────────┼─────────────┐
                     v             │             v
              ┌──────────┐        │      ┌──────────┐
              │ APPROVED │        │      │ REJECTED │
              └────┬─────┘        │      └──────────┘
                   │              │
                   │ startDate    │
                   │ reached      │
                   v              │
              ┌──────────┐        │
              │  ACTIVE  │<───────┘ Admin force-activate
              └────┬─────┘
                   │
          ┌────────┼────────┐
          v        │        v
    ┌──────────┐   │  ┌───────────┐
    │  PAUSED  │   │  │ COMPLETED │ ← endDate reached / budget spent
    └────┬─────┘   │  └───────────┘
         │         │
         │ Resume  │
         └─────────┘

    ┌──────────┐
    │ ARCHIVED │ ← Manual archival from COMPLETED/REJECTED
    └──────────┘
```

### Ad Placement States (per-screen-per-campaign)

```
    ┌───────────┐
    │ ELIGIBLE  │ ← Campaign ACTIVE + screen in targeting + not capped
    └─────┬─────┘
          │ Selected by scoring engine
          v
    ┌───────────┐
    │  SERVED   │ ← Creative played, DiffusionLog written
    └─────┬─────┘
          │
          ├── Recency penalty active ──> COOLDOWN (300→150→50→0 decay)
          │
          ├── Frequency cap reached ──> CAPPED (hourly reset)
          │
          └── Screen at 40 advertisers ──> BLOCKED (capacity full)
```

### Full TV Boot + Ad Decision Flow

```
TV POWER ON
    │
    v
[BootReceiver] → [MainActivity] → [WebView loads tv-app]
    │
    v
[DeviceProvider boots]
    │
    ├── Has stored token? ──> [/tv/me validation]
    │                              │
    │                    ┌─────────┼──────────┐
    │                    v         v          v
    │              [PAIRED]   [UNPAIRED]  [Trust token]
    │                                     (network error)
    │
    └── No token? ──> [UNPAIRED → PairingScreen]
    │
    v
[PAIRED → SYNCING]
    │
    ├── [GET /tv/bootstrap] → config + channels + ads + macros + catalogue
    │
    ├── [WebSocket connect /devices] → heartbeat started (30s)
    │
    └── [Schedule received or 5s timeout]
    │
    v
[ACTIVE → SmartTvDisplay]
    │
    ├── TRIGGER: Boot ──> [requestInterstitial('POWER_ON')]
    │                        │
    │                        └── [GET /tv/ads?trigger=POWER_ON]
    │                              │
    │                              └── MatchingService.getNextAd()
    │                                    │
    │                                    ├── Check overrides (forced/blocked)
    │                                    ├── Load candidates (geoHash index)
    │                                    ├── Filter eligibility (11 checks)
    │                                    ├── Filter frequency caps
    │                                    ├── Score (tier + pacing + fairness)
    │                                    ├── Deterministic tiebreak
    │                                    └── Return RankedCreative[]
    │                              │
    │                              v
    │                        [AdInterstitial displayed]
    │                              │
    │                              ├── Skip after 7s ──> reportImpression(skipped=true)
    │                              └── Complete ──> reportImpression(skipped=false)
    │
    ├── TRIGGER: Tab change ──> [requestInterstitial('CHANGE_APP')]
    │
    ├── TRIGGER: App open ──> [requestInterstitial('OPEN_APP')]
    │
    ├── ROTATION: AdZone sidebar ──> [fetchRotationAds()] every 15s
    │
    └── OFFLINE ──> Use cached schedule/ads
```

---

## PHASE 4 — STRATÉGIE SCALE 100K TV

### Charge estimée

| Métrique | Calcul | Volume |
|----------|--------|--------|
| Heartbeats | 100,000 TV × 1/30s | **3,333/sec** |
| Ad decisions | 100,000 TV × ~4 triggers/heure | **111/sec** |
| Impression events | 100,000 TV × ~20 ads/heure | **556/sec** |
| WebSocket connections | 100,000 simultanées | **100K persistent** |
| Schedule generations | 100,000 × 1/6h | **4.6/sec** |
| Campaign index lookups | Same as ad decisions | **111/sec** |

### Architecture Scale

```
                    ┌─────────────┐
   100K TV ────────>│  NGINX LB   │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              v            v            v
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ API Pod 1│ │ API Pod 2│ │ API Pod N│  (HPA: 5-20 pods)
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             │             │             │
             └─────────────┼─────────────┘
                           │
              ┌────────────┼────────────┐
              v            v            v
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │  Redis   │ │PostgreSQL│ │   S3     │
        │ (cache + │ │ (source  │ │ (media)  │
        │  pubsub) │ │ of truth)│ │          │
        └──────────┘ └──────────┘ └──────────┘
```

### Stratégie par composant

#### 1. Decision Cache (Redis)

```
Key: ads:decision:{screenId}
TTL: 300s (5 min)
Value: JSON array of RankedCreative[]
Size: ~2KB per screen
Total: 100K × 2KB = 200MB Redis
```

**Invalidation par batch :**
- Campaign update → invalidate all screens targeting that campaign
- Screen update → invalidate that screen only
- Admin force → invalidate specific screen(s)
- Cache miss → compute on demand, store in Redis

#### 2. Jitter (anti-thundering herd)

```typescript
// Stagger schedule refresh across screens
const jitterMs = hashCode(screenId) % (SCHEDULE_REFRESH_MS * 0.2);
// 100K screens spread over 20% of refresh window = ~60s spread
```

#### 3. Campaign Index (Redis-backed for multi-pod)

```
Key: campaign:index:geo:{geoHash4}
Value: CampaignIndexEntry[] (JSON)
Key: campaign:index:global
Value: CampaignIndexEntry[] (global campaigns)
Key: campaign:index:meta
Value: { lastRebuild, totalCampaigns, geoHashCells }
```

#### 4. Heartbeat Batching

```
Current: 100K × 1 DB write/30s = 3,333 writes/sec
Optimized: Batch heartbeats in Redis, flush to DB every 60s
Reduces to: 100K / 60s = 1,667 writes/sec (batched 100 per query)
= ~17 batch inserts/sec
```

#### 5. DiffusionLog Partitioning

```sql
-- Monthly partitions for DiffusionLog
CREATE TABLE diffusion_logs_2026_03 PARTITION OF diffusion_logs
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
```

**Retention:** 12 months hot, archive to S3 after.

#### 6. Index Required

```
-- Already exists in schema:
@@index([screenId, startTime])        -- DiffusionLog per-screen queries
@@index([campaignId, startTime])      -- DiffusionLog per-campaign
@@index([deviceId, startTime])        -- DiffusionLog per-device
@@index([startTime])                  -- DiffusionLog time-range scans

-- ADD for 100K scale:
@@index([screenId, campaignId, startTime])  -- Frequency cap queries
@@index([screenId, createdAt])               -- AdEvent recent plays
```

#### 7. WebSocket Scaling

```
Current: In-memory Map<socketId, deviceId>
Scale: Redis Adapter for Socket.IO

npm install @socket.io/redis-adapter
→ All pods share connection state via Redis pub/sub
→ Room broadcasts work across pods
```

### Recompute Strategy

| Trigger | Scope | Action |
|---------|-------|--------|
| Campaign published | All screens matching geo | Batch invalidate decision cache |
| Campaign paused | All screens with that campaign | Batch invalidate |
| Screen added to targeting | That screen only | Invalidate 1 key |
| Screen removed | That screen only | Invalidate 1 key |
| Admin force | Specific screen(s) | Immediate invalidate |
| Cache expired (5 min TTL) | Individual screen | Lazy recompute on next request |
| Hourly reconciliation | All screens | Background batch recompute |

### Performance Targets

| Operation | Target Latency | Strategy |
|-----------|---------------|----------|
| GET /tv/ads (cache hit) | < 5ms | Redis lookup |
| GET /tv/ads (cache miss) | < 50ms | Compute + cache |
| POST /tv/ads/event | < 10ms | Async write (BullMQ) |
| WebSocket heartbeat | < 5ms | Redis + batch DB |
| Schedule generation | < 200ms | Pre-computed, cached |
| Full index rebuild | < 30s (1000 campaigns) | Background job |

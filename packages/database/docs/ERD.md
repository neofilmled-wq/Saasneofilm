# NEOFILM SAAS — Entity Relationship Diagram & Documentation

## High-Level Domain Map

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PLATFORM ADMINISTRATION                          │
│  User ─── PlatformRole (SUPER_ADMIN | ADMIN | SUPPORT)                │
└────────────────────────────┬────────────────────────────────────────────┘
                             │ Membership (N:M)
              ┌──────────────┴──────────────┐
              ▼                             ▼
┌──────────────────────┐      ┌──────────────────────────┐
│  Organization        │      │  Organization            │
│  type = PARTNER      │      │  type = ADVERTISER       │
│                      │      │                          │
│  ┌─ Screen (1:N) ◄───┼──────┼─── Booking ──────┐      │
│  │   ├─ Device (1:N) │      │  ┌─ Campaign (1:N)│      │
│  │   ├─ Schedule     │      │  │  ├─ Creative   │      │
│  │   └─ LiveStatus   │      │  │  ├─ Targeting  │      │
│  │                   │      │  │  └─ ScheduleSlot      │
│  ├─ RevenueRule      │      │  ├─ AIWallet       │      │
│  ├─ RevenueShare     │      │  └─ StripeCustomer │      │
│  └─ Payout           │      └──────────────────────────┘
└──────────────────────┘
              │                             │
              └──────────────┬──────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      SHARED INFRASTRUCTURE                              │
│  DiffusionLog │ AnalyticsEvent │ AuditLog │ Notification │ Webhook     │
└─────────────────────────────────────────────────────────────────────────┘
```

## Detailed Relationship Descriptions

### 1. Multi-Tenant Core

```
User ────< Membership >──── Organization
 │                              │
 │ platformRole?                │ type: PARTNER | ADVERTISER
 │ (SUPER_ADMIN|ADMIN|SUPPORT)  │
 │                              │
 └── RefreshToken (1:N)         ├── Screen (1:N) [PARTNER only]
     Notification (1:N)         ├── Campaign (1:N) [ADVERTISER only]
     AuditLog (1:N)             ├── Booking (1:N) [ADVERTISER only]
                                ├── StripeCustomer (1:N)
                                ├── StripeSubscription (1:N)
                                ├── StripeInvoice (1:N)
                                ├── RevenueRule (1:N) [PARTNER only]
                                ├── RevenueShare (1:N) [PARTNER only]
                                ├── Payout (1:N) [PARTNER only]
                                └── AIWallet (1:1) [ADVERTISER only]
```

**Design Rationale**: Rather than separate Partner/Advertiser tables, we use a single
`Organization` with a discriminator `type`. This simplifies:
- Billing (one Stripe integration path)
- User management (one membership model)
- Audit trails (one org context)
- Future org types without schema changes

The `Membership` join table with `OrgRole` enables:
- A user belonging to multiple organizations
- Fine-grained role per organization
- Platform admins having no org membership (they use `platformRole`)

### 2. Screen vs Device (Business vs Physical)

```
Organization (PARTNER)
    │
    ├──< Screen (business asset)
    │       │
    │       ├── activeDeviceId ──> Device (current active, 0 or 1)
    │       │
    │       └──< Device (history, 1:N via screenId)
    │               │
    │               ├── DeviceHeartbeat (1:N, append-only)
    │               ├── DeviceMetrics (1:N, append-only)
    │               └── DeviceErrorLog (1:N, append-only)
    │
    └── ScreenLiveStatus (1:1 projection, always current)
```

**Why separate?**

| Concern        | Screen                     | Device                        |
|----------------|----------------------------|-------------------------------|
| Lifecycle      | Years (location)           | Months (hardware replacement) |
| Owner          | Partner org                | Assigned to screen            |
| Pricing        | monthlyPriceCents          | N/A                           |
| Location       | GPS, city, address         | Inherits from screen          |
| Booking target | BookingScreen → Screen     | Never directly booked         |
| Health         | ScreenLiveStatus (1 row)   | Heartbeats, Metrics (N rows)  |

**Active Device Pattern**: `Screen.activeDeviceId` is a denormalized nullable FK
pointing to the currently paired device. When a device is swapped:
1. Old device: set `unpairedAt`, leave `screenId` for history
2. New device: set `pairedAt`, `screenId`
3. Screen: update `activeDeviceId`

This gives O(1) lookup for "what device is playing on this screen right now?"
while preserving full device swap history.

### 3. Campaign → Targeting → Scheduling

```
Organization (ADVERTISER)
    │
    └──< Campaign
            │
            ├── CampaignTargeting (1:1)
            │       ├── geoRadius + lat/lng
            │       ├── cities[]
            │       ├── environments[]
            │       ├── includedScreens (N:M → Screen)
            │       ├── excludedScreens (N:M → Screen)
            │       └── scheduleWindows (JSON)
            │
            ├──< Creative (1:N)
            │
            └──< ScheduleSlot (via Schedule)
                    ├── campaignId
                    ├── creativeId
                    ├── time window
                    └── priority
```

**Targeting is 1:1 with Campaign** because each campaign has exactly one targeting
configuration. The implicit N:M join tables (`_IncludedScreens`, `_ExcludedScreens`)
are created by Prisma for the `includedScreens` and `excludedScreens` relations.

### 4. Commercial Booking Flow

```
Advertiser Org ──< Booking ──< BookingScreen >── Screen
                      │                            │
                      │                            └── Partner Org
                      │
                      └── stripeSubscriptionId
```

**Why Booking is decoupled from Campaign?**

The booking represents the **commercial contract** (money, duration, screens).
The campaign represents the **creative execution** (content, targeting, scheduling).

This enables:
- A booking can exist before any campaign is created (pre-purchase)
- A booking can cover multiple campaigns over time
- Price snapshots (`unitPriceCents`) freeze the price at purchase time
- Revenue sharing is computed from BookingScreen, not Campaign

### 5. Billing (Stripe Integration)

```
Organization ──< StripeCustomer ──< StripeSubscription
                       │
                       ├──< StripeInvoice ──< StripePayment
                       │
                       └──< StripePayment (direct)

StripeWebhookEvent (standalone event log)
```

We mirror Stripe objects locally for:
- Offline access and fast dashboard queries
- Webhook idempotency (check `stripeEventId` uniqueness)
- Audit trail independent of Stripe API availability

### 6. Revenue Sharing

```
RevenueRule ──> defines rates (global or per-partner)
     │
     ▼
RevenueShare ──> calculated per partner per period
     │
     └──> Payout ──> Stripe Connect transfer
```

Monthly job:
1. Query all `BookingScreen` where the booking was active in the period
2. Apply the matching `RevenueRule` (most specific wins: per-partner > global)
3. Create `RevenueShare` with breakdown
4. Admin approves → triggers `Payout`

### 7. Diffusion Proof (Anti-Fraud)

```
DiffusionLog
  ├── screenId   ─── where it played
  ├── deviceId   ─── physical device that played it
  ├── campaignId ─── which campaign
  ├── creativeId ─── which creative file
  ├── startTime / endTime / durationMs
  ├── mediaHash  ─── SHA-256 of the played file
  ├── signature  ─── HMAC proof from device
  └── verified   ─── platform verification status
```

**Anti-fraud guarantees:**
- `mediaHash` proves the correct file was played (not a substitute)
- `signature` is computed by the device: `HMAC(deviceId + creativeId + startTime + endTime, deviceSecret)`
- Backend verification compares expected vs actual duration
- `triggerContext` distinguishes real scheduled plays from incidental triggers

### 8. Event-Driven Append-Only Tables

Three tables are designed as append-only for high-volume writes:

| Table            | Volume       | Partitioning    | Retention |
|------------------|-------------|-----------------|-----------|
| DiffusionLog     | ~100/screen/day | Monthly      | 3 years   |
| AnalyticsEvent   | ~1000/screen/day | Monthly     | 1 year    |
| DeviceHeartbeat  | ~1/screen/min | Monthly        | 6 months  |
| DeviceMetrics    | ~1/screen/5min | Monthly       | 3 months  |
| DeviceErrorLog   | Variable     | Monthly         | 1 year    |
| AuditLog         | Variable     | Monthly         | 7 years   |

## Cardinality Summary

| Relationship | Type | FK Location |
|---|---|---|
| User ↔ Organization | N:M | Membership join table |
| Organization → Screen | 1:N | Screen.partnerOrgId |
| Screen → Device | 1:N | Device.screenId |
| Screen → Active Device | 1:1 | Screen.activeDeviceId |
| Organization → Campaign | 1:N | Campaign.advertiserOrgId |
| Campaign → Creative | 1:N | Creative.campaignId |
| Campaign → Targeting | 1:1 | CampaignTargeting.campaignId |
| Targeting ↔ Screen | N:M | Implicit join (_Included/_Excluded) |
| Screen → Schedule | 1:N | Schedule.screenId |
| Schedule → ScheduleSlot | 1:N | ScheduleSlot.scheduleId |
| Organization → Booking | 1:N | Booking.advertiserOrgId |
| Booking ↔ Screen | N:M | BookingScreen join table |
| Organization → AIWallet | 1:1 | AIWallet.organizationId |
| AIWallet → AITransaction | 1:N | AITransaction.walletId |

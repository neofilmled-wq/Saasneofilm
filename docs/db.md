# docs/db.md — Database & Prisma Reference

> Prisma schema, models, conventions, query patterns, and migration rules.
> Schema: `packages/database/prisma/schema.prisma` (~1700 lines, 50 models)

---

## Quick Reference

```bash
# Schema location
packages/database/prisma/schema.prisma

# Commands (from repo root)
pnpm db:generate    # After any schema change — regenerate Prisma client
pnpm db:migrate     # Create migration file + apply (use this in dev & CI)
pnpm db:push        # Apply schema changes without migration file (dev shortcut only)
pnpm db:seed        # Reset dev data (1 admin, 2 partners, 2 advertisers, 5 screens, 1000 logs)
pnpm db:studio      # Open Prisma Studio at http://localhost:5555
pnpm db:up          # Start Postgres + Redis in Docker
pnpm db:down        # Stop Docker services
pnpm db:reset       # db:push + db:seed (DESTRUCTIVE — wipes data)
```

---

## Model Overview (50 Models)

### Group 1: Multi-Tenant Core

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `User` | firstName, lastName, email, passwordHash, platformRole, mfaEnabled | platformRole: SUPER_ADMIN\|ADMIN\|USER |
| `Organization` | name, slug, type (PARTNER\|ADVERTISER), stripeCustomerId, commissionRate | Top-level tenant |
| `Membership` | userId, orgId, role (OrgRole) | User↔Org many-to-many |
| `OAuthAccount` | provider, providerAccountId, accessToken, userId | Google OAuth |
| `RefreshToken` | tokenHash, userId, expiresAt | JWT refresh rotation |

### Group 2: Screen & Device

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `Screen` | name, address, lat, lng, environment, pricePerSlotCents, status, partnerOrgId | Business asset |
| `Device` | serialNumber, status, appVersion, activeOnScreenId | Physical hardware |
| `DeviceHeartbeat` | deviceId, isOnline, cpuPercent, memPercent, temperature, appVersion | 30s heartbeat |
| `DeviceMetrics` | deviceId, cpuPercent, memoryPercent, diskPercent, networkLatencyMs | 60s metrics |
| `DeviceErrorLog` | deviceId, code, message, stackTrace, resolvedAt | Error tracking |
| `ScreenLiveStatus` | screenId, isOnline, lastHeartbeatAt, currentCampaignId | Denormalized projection |

### Group 3: Campaigns & Creatives

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `Campaign` | name, status, budgetCents, startDate, endDate, advertiserOrgId | Status: DRAFT\|ACTIVE\|PAUSED\|ARCHIVED |
| `CampaignTargeting` | campaignId, includedScreens[], excludedScreens[] | M2M to Screen |
| `Creative` | type (VIDEO\|IMAGE), source (UPLOAD\|CANVA\|AI_GENERATED), s3Key, status | Moderation: PENDING\|APPROVED\|REJECTED |
| `Schedule` | screenId, name | Per-screen playlist container |
| `ScheduleSlot` | scheduleId, creativeId, startTime, endTime, dayOfWeek, priority | Time-based slot |
| `ScheduleBlackout` | scheduleId, startAt, endAt, reason | Maintenance windows |

### Group 4: Booking & Billing

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `Booking` | advertiserOrgId, startDate, endDate, totalPriceCents, status | Commercial agreement |
| `BookingScreen` | bookingId, screenId, unitPriceCents | Line item |
| `StripeCustomer` | orgId, stripeCustomerId | One per advertiser org |
| `StripeSubscription` | orgId, stripeSubId, status, currentPeriodEnd | |
| `StripeInvoice` | orgId, stripeInvoiceId, amountCents, status, dueDate | |
| `StripePayment` | orgId, stripePaymentIntentId, amountCents, status | PENDING\|SUCCEEDED\|FAILED\|REFUNDED |
| `StripeWebhookEvent` | stripeEventId, type, processed, retryCount | Webhook deduplication |

### Group 5: Revenue

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `RevenueRule` | platformRate (0.30), partnerRate (0.70), appliesFrom | Configurable by admin |
| `RevenueShare` | partnerOrgId, periodStart, periodEnd, totalCents, partnerCents, status | Monthly statement |
| `RevenueShareLineItem` | revenueShareId, bookingScreenId, grossCents, partnerCents | Per-booking breakdown |
| `Payout` | partnerOrgId, amountCents, stripeTransferId, status | Stripe Connect transfer |
| `PayoutLineItem` | payoutId, revenueShareId | |
| `PartnerPayoutProfile` | partnerOrgId, stripeConnectAccountId, chargesEnabled, payoutsEnabled | Stripe Connect |
| `TaxProfile` | orgId, vatNumber, countryCode, taxRate | |

### Group 6: Diffusion Proof (Append-Only)

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `DiffusionLog` | screenId, campaignId, creativeId, startTime, endTime, durationMs, signature, mediaHash, verified | NEVER update; HMAC anti-fraud |

**Critical:** `DiffusionLog` is **append-only**. Never `UPDATE` or `DELETE` rows. The `signature` field contains an HMAC of `(screenId + campaignId + startTime + mediaHash)`.

### Group 7: AI Credits

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `AIWallet` | orgId, balanceCredits | Per-advertiser org |
| `AITransaction` | walletId, type (RECHARGE\|USAGE\|REFUND\|BONUS\|EXPIRY), creditsAmount | |

### Group 8: Analytics (Append-Only, Partitioned)

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `AnalyticsEvent` | eventType, screenId, campaignId, orgId, payload, timestamp | Append-only; designed for monthly partitioning |

**Critical:** `AnalyticsEvent` is **append-only**. Query with time-bounded WHERE clauses (use indexes).

### Group 9: TV Configuration

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `TvConfig` | screenId, enabledModules, defaultTab, branding | Per-screen TV settings |
| `TvChannel` | number, name, streamUrl, category, logoUrl | IPTV channel catalog |
| `StreamingService` | name, logoUrl, launchUrl, displayOrder | Netflix, Disney+ tiles |
| `ActivityPlace` | partnerOrgId, name, category, address, lat, lng | Local activities |
| `TvMacro` | screenId, spotDurationMs, skipDelayMs, adRotationMs, splitRatio | Ad behavior config |
| `ActivitySponsor` | campaignId, activityPlaceId, displayOrder | Campaign × activity |

### Group 10: Other

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `AuditLog` | entity, entityId, action, orgId, userId, before, after | All mutations tracked |
| `Notification` | userId, type (IN_APP\|EMAIL\|PUSH), title, body, read | |
| `Conversation` | status (OPEN\|CLOSED\|ARCHIVED), subject | Support ticket |
| `ConversationParticipant` | conversationId, userId | |
| `Message` | conversationId, senderId, body | |
| `ThirdPartyIntegration` | orgId, provider (CANVA), encryptedTokens | AES-256-GCM tokens |
| `CanvaDesign` | integrationId, canvaDesignId, creativeId, editUrl | |
| `PartnerProfile` | partnerOrgId, logoUrl, primaryColor, contactEmail | Extended branding |

---

## Critical Conventions

### Money: Always Cents (Int)

```typescript
// CORRECT
budgetCents: 10000        // €100.00
pricePerSlotCents: 500    // €5.00

// WRONG — never floats in DB
budget: 100.00
```

Display conversion: `(cents / 100).toFixed(2)` — do this in the frontend only.

### Multi-Tenant Filtering: Mandatory

Every query on a tenant-scoped resource MUST include `orgId` in the WHERE clause:

```typescript
// CORRECT — Partner screens
await prisma.screen.findMany({
  where: { partnerOrgId: ctx.user.orgId },
});

// CORRECT — Advertiser campaigns
await prisma.campaign.findMany({
  where: { advertiserOrgId: ctx.user.orgId },
});

// WRONG — leaks data across tenants
await prisma.campaign.findMany({});
```

### Append-Only Tables

Never `UPDATE` or `DELETE` from:
- `DiffusionLog` — fraud-proof audit trail
- `AnalyticsEvent` — analytics integrity

### IDs

All primary keys are `String @id @default(cuid())`. Use CUID format; never auto-increment integers for business entities.

---

## Key Indexes

```prisma
// Screen geographic search
@@index([lat, lng])
@@index([city, status])

// Campaign temporal queries
@@index([advertiserOrgId, status])
@@index([startDate, endDate])

// DiffusionLog anti-fraud queries
@@index([screenId, startTime])
@@index([campaignId, startTime])
@@index([startTime])         -- range scans
@@index([verified])          -- fraud review

// AnalyticsEvent time-series
@@index([eventType, timestamp])
@@index([screenId, timestamp])
@@index([orgId, timestamp])

// AuditLog
@@index([entity, entityId])
@@index([orgId, timestamp])
```

---

## Query Patterns

### Paginated List with Tenant Filter

```typescript
const [items, total] = await Promise.all([
  prisma.campaign.findMany({
    where: { advertiserOrgId: orgId },
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: { targeting: { include: { includedScreens: true } } },
  }),
  prisma.campaign.count({ where: { advertiserOrgId: orgId } }),
]);
return { data: items, total, page, limit };
```

### Screen Map Query

```typescript
const screens = await prisma.screen.findMany({
  where: { status: 'ACTIVE' },
  include: {
    partnerOrg: { select: { name: true } },
    screenLiveStatus: { select: { isOnline: true } },
  },
});
```

### DiffusionLog Insert (Proof)

```typescript
await prisma.diffusionLog.create({
  data: {
    screenId,
    campaignId,
    creativeId,
    startTime,
    endTime,
    durationMs: endTime.getTime() - startTime.getTime(),
    signature: computeHmac(screenId, campaignId, startTime, mediaHash),
    mediaHash,
    verified: false,
  },
});
// Never update this record after creation
```

### Revenue Share Calculation

```typescript
const rule = await prisma.revenueRule.findFirst({ orderBy: { appliesFrom: 'desc' } });
const partnerCents = Math.floor(grossCents * rule.partnerRate);
const platformCents = grossCents - partnerCents;
```

---

## Migration Rules

1. **Always** run `pnpm db:generate` after any `schema.prisma` change
2. Use `pnpm db:migrate` (not `db:push`) for any change that touches production
3. Never alter `DiffusionLog` or `AnalyticsEvent` table structure without partitioning review
4. Adding a nullable column to a large table: add `@default(...)` to avoid locking
5. Renaming fields: use two migrations (add new → backfill → drop old)
6. Migration files live in `packages/database/prisma/migrations/`

---

## Prisma Client Import

```typescript
// Always import from @neofilm/database
import { prisma } from '@neofilm/database';

// In NestJS: use PrismaService singleton
// packages/api/src/prisma/prisma.service.ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() { await this.$connect(); }
}
```

---

## Seed Data (Dev)

File: `packages/database/prisma/seed.ts`

Creates:
- 1 SUPER_ADMIN user
- 2 PARTNER organizations (+ 2 partner users)
- 2 ADVERTISER organizations (+ 2 advertiser users)
- 5 screens (spread across partner orgs)
- 3 campaigns (DRAFT, ACTIVE, PAUSED)
- 1000+ DiffusionLog entries
- Sample TvChannels, ActivityPlaces, ScheduleSlots

Seed password: check `seed.ts` for dev credentials (not committed to this doc for security).

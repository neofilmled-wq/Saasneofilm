# CLAUDE.md — NeoFilm SaaS

> **For Claude Code and all future agents working in this monorepo.**
> Ground-truth reference for architecture, conventions, commands, and feature playbooks.
> Last audited: 2026-03-02.

---

## Repo Snapshot (Audit Summary)

```
neofilm-saas/
├── apps/
│   ├── web-admin/      Next.js 15.5, port 3000, App Router
│   ├── web-partner/    Next.js 15.5, port 3002, App Router
│   ├── web-advertiser/ Next.js 15.5, port 3003, App Router
│   └── tv-app/         Next.js 15.5, port 3004, Android TV WebView target
├── packages/
│   ├── api/            NestJS 11, port 3001 — REST + 6 WebSocket gateways
│   ├── database/       Prisma 6.4 schema + client singleton (50 models)
│   ├── shared/         Types, enums, DTOs, utils — leaf dependency
│   ├── ui/             Radix UI component library
│   ├── auth/           NextAuth 5 wrapper for partner & advertiser
│   ├── billing/        Stripe DTOs & billing helpers
│   └── config/         Zod-based env validation
├── infra/              Kubernetes (Kustomize), Terraform, Mosquitto
├── docker-compose.yml  Local dev: Postgres, Redis, MinIO, Mosquitto, Mailpit
├── turbo.json          Turborepo task graph
├── pnpm-workspace.yaml Workspace definition
└── .env.example        All environment variables (copy → .env)
```

**14 workspace packages total.** Strict TypeScript 5.9 throughout. Money stored in cents (Int) everywhere.

---

## 1. Project Overview

NeoFilm is a **multi-tenant digital signage SaaS platform** targeting cinemas and hotel lobbies. It manages a network of TV screens that show ads, activities, and live TV.

**Four interfaces:**

| Interface | Who uses it | Purpose |
|-----------|-------------|---------|
| **Admin** (port 3000) | NeoFilm staff | Full platform visibility — users, orgs, revenue, moderation, live map |
| **Partner** (port 3002) | Cinema/hotel operators | Manage their screen park, revenue statements, pairing, scheduling |
| **Advertiser** (port 3003) | Ad buyers | Create campaigns, upload creatives, target screens, track analytics |
| **TV App** (port 3004) | Android TV devices | Show scheduled ads, IPTV, activities — real-time via WebSocket |

**Core principles:**
- **Multi-tenant**: every resource is scoped to an `Organization` (PARTNER or ADVERTISER)
- **Screen/Device separation**: `Screen` = business asset (address, pricing); `Device` = physical hardware
- **Real-time first**: 6 WebSocket gateways + MQTT fallback for 100k+ concurrent TV devices
- **Anti-fraud diffusion proof**: every ad play writes a signed `DiffusionLog` (HMAC + mediaHash)
- **Revenue split**: platform takes 30%, partner gets 70% (configurable per `RevenueRule`)

---

## 2. Monorepo Map

### Apps

#### `apps/web-admin` — `@neofilm/web-admin` — Port 3000

**Role:** NeoFilm staff super-admin cockpit.

**Tech:** Next.js 15.5, App Router, Turbopack, TanStack Query, Recharts, React Leaflet, socket.io-client

**Key routes:**
```
/admin                    Dashboard (live KPIs)
/admin/advertisers        Advertiser list + [id] detail
/admin/partners           Partner list + [id] detail
/admin/campaigns          Campaign list + [id] detail + moderation
/admin/devices            Device fleet overview
/admin/users              User management
/admin/invoices           Invoice listing
/admin/analytics          Analytics dashboard
/admin/live-map           Real-time screen map
/admin/moderation/videos  Creative moderation queue
/admin/schedules          Schedule management
/admin/messages           Support inbox
/admin/settings           Platform settings
/admin/screens/[id]       Screen detail
```

**Scripts:**
```bash
pnpm dev:admin            # starts on port 3000
pnpm --filter @neofilm/web-admin dev
pnpm --filter @neofilm/web-admin build
pnpm --filter @neofilm/web-admin lint
```

---

#### `apps/web-partner` — `@neofilm/web-partner` — Port 3002

**Role:** Cinema/hotel operator portal — manage screen park, revenue, pairing.

**Tech:** Next.js 15.5, App Router, Turbopack, NextAuth 5 (beta), socket.io-client

**Key routes:**
```
/partner                       Dashboard
/partner/screens               Screen list
/partner/screens/new           Add screen
/partner/screens/[screenId]    Screen detail
/partner/screens/[screenId]/pairing       QR pairing
/partner/screens/[screenId]/split-screen  Split-screen config
/partner/screens/[screenId]/ux-settings  TV UX config
/partner/sites                 Site grouping
/partner/pairing               QR code pairing wizard
/partner/map                   Live screen map
/partner/revenue               Revenue dashboard
/partner/payouts               Payout history
/partner/alerts                Screen alerts
/partner/messages/[id]         Messaging
/partner/profile               Profile settings
/partner/onboarding            Onboarding flow
```

**Scripts:**
```bash
pnpm dev:partner
pnpm --filter @neofilm/web-partner dev     # port 3002
```

---

#### `apps/web-advertiser` — `@neofilm/web-advertiser` — Port 3003

**Role:** Advertiser self-serve portal — campaigns, creatives, targeting, billing.

**Tech:** Next.js 15.5, App Router, Turbopack, Zustand (state), TanStack Query, socket.io-client

**Key routes:**
```
/                              Dashboard
/campaigns                     Campaign list
/campaigns/new                 Campaign creation (multi-step)
/campaigns/[campaignId]        Campaign detail
/campaigns/[campaignId]/edit   Campaign edit
/catalog                       Activity catalog
/catalog/new                   Create catalog entry
/media-library                 Creative assets
/ad-creation                   Upload / design ad
/ai-generator                  AI creative generation
/analytics                     Global analytics
/analytics/[campaignId]        Per-campaign analytics
/billing                       Billing & invoices
/invoices                      Invoice list
/messages/[conversationId]     Support messaging
/onboarding                    Onboarding flow
/settings                      Account settings
```

**Scripts:**
```bash
pnpm dev:advertiser
pnpm --filter @neofilm/web-advertiser dev   # port 3003
```

**Unique dependency:** Zustand for multi-step campaign wizard state.

---

#### `apps/tv-app` — `@neofilm/tv-app` — Port 3004

**Role:** Android TV display app (Next.js running in a WebView APK). Shows ads, IPTV, local activities.

**Tech:** Next.js 15.5, App Router, Turbopack, hls.js (IPTV/HLS), qrcode, socket.io-client

**Dev command:**
```bash
pnpm dev:tv
pnpm --filter @neofilm/tv-app dev   # port 3004, bound to 0.0.0.0
```

**From Android emulator:** Use `http://10.0.2.2:3004` (not localhost).

**State machine:**
```
BOOTING → INITIALIZING → UNPAIRED ← (no device token)
                       ↓
                    PAIRED → SYNCING → ACTIVE
                                    ↓
                               OFFLINE / UPDATING / ERROR → ACTIVE
```

**Key components:**
```
src/components/
├── screens/pairing-screen.tsx      QR code + PIN display
├── screens/offline-screen.tsx      No-connectivity fallback
├── layout/tv-shell.tsx             Main container
├── layout/ad-zone.tsx              Split-screen ad display
├── common/iptv-player.tsx          HLS player (hls.js)
├── common/ad-interstitial.tsx      Full-screen ad overlay
└── pages/activities-page.tsx       Local activities/restaurants
```

See [docs/tv.md](docs/tv.md) for full TV runbook.

---

### Packages

#### `packages/api` — `@neofilm/api` — Port 3001

**Role:** NestJS 11 backend — REST API + 6 WebSocket gateways.

**Important:** NestJS uses CommonJS (`module: "commonjs"`, `emitDecoratorMetadata: true`). This overrides the base tsconfig.

**Scripts:**
```bash
pnpm dev:api
pnpm --filter @neofilm/api dev      # nest start --watch
pnpm --filter @neofilm/api build    # nest build → dist/
pnpm --filter @neofilm/api test     # jest
```

**Response envelope (CRITICAL):** Every API response is wrapped by `TransformInterceptor`:
```json
{ "data": <payload>, "statusCode": 200, "timestamp": "2026-03-02T..." }
```
- Frontend `apiFetch` in each app **auto-unwraps** this envelope.
- Service returns `{ data: [], total: 45 }` → interceptor wraps → `apiFetch` unwraps → hook gets `{ data: [], total: 45 }`.

**Module tree (abbreviated):**
```
src/modules/
├── admin/              AdminController, AdminGateway (/admin namespace)
├── analytics/          AnalyticsController, DashboardGateway (/dashboard)
├── auth/               AuthController, DeviceAuthController, TVAuthController, OAuthController
├── billing/            BillingController, Stripe webhooks
├── campaigns/          CampaignsController (publish → tv:ads:update)
├── canva/              CanvaController, OAuth + design export
├── creatives/          CreativesController (upload, approval)
├── device-gateway/     DeviceGateway (/devices), ScreenStatusGateway (/screen-status)
├── devices/            DevicesController
├── diffusion/          DiffusionController (proof logging)
├── jobs/               BullMQ background processors
├── messaging/          MessagingGateway (/messaging), MessagingController
├── organizations/      OrganizationsController
├── partner-gateway/    PartnerGateway (/partner namespace)
├── payouts/            PayoutsController
├── revenue/            RevenueController, partner commissions
├── schedules/          SchedulesController
├── screens/            ScreensController (map, CRUD)
├── storage/            S3/MinIO service, presigned URLs
├── tv-config/          TvConfigController (per-screen settings)
├── users/              UsersController
└── webhooks/           Stripe webhook handlers
```

See [docs/realtime.md](docs/realtime.md) for full WebSocket contract.

---

#### `packages/database` — `@neofilm/database`

Prisma 6.4 schema + client singleton. **50 models.** See [docs/db.md](docs/db.md).

---

#### `packages/shared` — `@neofilm/shared`

Leaf dependency (no workspace deps). Exports:
```typescript
export * from './types';      // TypeScript interfaces
export * from './enums';      // billing.enum, diffusion.enum
export * from './constants';  // app-wide constants
export * from './utils';      // utility functions
export * from './dto';        // 13 DTO files
export * from './errors';     // error classes
export * from './api-client'; // shared API client
```

**Import convention:** Always import from `@neofilm/shared`, never from relative paths to `packages/shared`.

---

#### `packages/ui` — `@neofilm/ui`

Radix UI + Tailwind CSS v4 component library. Exports: Avatar, Checkbox, Dialog, DropdownMenu, Label, Popover, Select, Separator, Switch, Tabs, Toast, Tooltip + utility helpers (CVA, clsx, tailwind-merge).

---

#### `packages/auth` — `@neofilm/auth`

NextAuth 5 (beta.30) wrapper. Used by **partner** and **advertiser** apps. Admin app has its own simpler auth.

---

#### `packages/billing` — `@neofilm/billing`

Stripe DTOs & billing helpers. Stripe.js client types.

---

#### `packages/config` — `@neofilm/config`

Zod-based environment variable validation. Import in NestJS startup and Next.js `next.config.ts`.

---

## 3. How to Run Locally

### Prerequisites

- **Node.js** ≥ 20 (check: `node -v`)
- **pnpm** 10.30.2 (`npm i -g pnpm@10.30.2`)
- **Docker Desktop** (for Postgres, Redis, MinIO, Mosquitto, Mailpit)
- **PostgreSQL client** optional (for manual queries)

### First-time Setup

```bash
# 1. Clone + install dependencies
git clone <repo>
cd neofilm-saas
pnpm install

# 2. Copy and fill environment variables
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET (32+ chars) and Stripe test keys

# 3. Start local infrastructure
pnpm db:up          # docker compose up -d postgres redis minio mosquitto mailpit

# 4. Generate Prisma client
pnpm db:generate    # prisma generate

# 5. Apply schema to DB
pnpm db:push        # prisma db push (dev shortcut, no migration files)
# OR for proper migrations:
pnpm db:migrate     # prisma migrate dev

# 6. Seed the database
pnpm db:seed        # creates 1 admin, 2 partners, 2 advertisers, 5 screens, 3 campaigns, 1000 logs
```

### Running Individual Apps

```bash
# API (port 3001) — start first
pnpm dev:api

# Admin (port 3000)
pnpm dev:admin

# Partner (port 3002)
pnpm dev:partner

# Advertiser (port 3003)
pnpm dev:advertiser

# TV App (port 3004)
pnpm dev:tv
```

### Running Everything with Turbo

```bash
pnpm dev           # turbo dev — starts all apps in parallel
```

> Note: `turbo dev` has `dependsOn: ["^build"]` — it builds dependency packages first.
> For faster iteration, run apps individually.

### Database Commands

```bash
pnpm db:generate   # pnpm --filter @neofilm/database exec prisma generate
pnpm db:migrate    # pnpm --filter @neofilm/database exec prisma migrate dev
pnpm db:push       # pnpm --filter @neofilm/database exec prisma db push (dev only)
pnpm db:seed       # pnpm --filter @neofilm/database exec prisma db seed
pnpm db:studio     # opens Prisma Studio at http://localhost:5555
pnpm db:up         # docker compose up -d postgres redis
pnpm db:down       # docker compose down
pnpm db:reset      # db:push + db:seed (destructive — resets data)
```

---

## 4. Environment Variables

Copy `.env.example` → `.env`. All variables listed below; TODO items need manual values.

### Core

| Variable | Example | Notes |
|----------|---------|-------|
| `NODE_ENV` | `development` | |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/neofilm` | |
| `REDIS_HOST` | `localhost` | |
| `REDIS_PORT` | `6379` | |

### Authentication

| Variable | Example | Notes |
|----------|---------|-------|
| `JWT_SECRET` | `<32+ random chars>` | **TODO: generate securely** |
| `JWT_ACCESS_EXPIRATION` | `15m` | |
| `JWT_REFRESH_EXPIRATION` | `7d` | |
| `BCRYPT_SALT_ROUNDS` | `12` | |

### API Service

| Variable | Example | Notes |
|----------|---------|-------|
| `API_PORT` | `3001` | |
| `API_CORS_ORIGINS` | `http://localhost:3000,http://localhost:3002,http://localhost:3003` | |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001/api/v1` | Used in all Next.js apps |
| `NEXT_PUBLIC_WS_URL` | `http://localhost:3001` | WebSocket base URL |

### Frontend Ports

| Variable | Example |
|----------|---------|
| `WEB_ADMIN_PORT` | `3000` |
| `WEB_PARTNER_PORT` | `3002` |
| `WEB_ADVERTISER_PORT` | `3003` |

### Storage (MinIO / S3)

| Variable | Example | Notes |
|----------|---------|-------|
| `S3_ENDPOINT` | `http://localhost:9000` | MinIO in dev |
| `S3_REGION` | `us-east-1` | |
| `S3_BUCKET_CREATIVES` | `neofilm-creatives` | Auto-created by docker-compose |
| `S3_BUCKET_UPLOADS` | `neofilm-uploads` | Auto-created by docker-compose |
| `CDN_BASE_URL` | `http://localhost:9000/neofilm-creatives` | Publicly accessible URL |

### Stripe

| Variable | Notes |
|----------|-------|
| `STRIPE_SECRET_KEY` | `sk_test_...` — **TODO: Stripe dashboard** |
| `STRIPE_PUBLISHABLE_KEY` | `pk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` — from `stripe listen` CLI |

### Third-Party

| Variable | Notes |
|----------|-------|
| `CANVA_CLIENT_ID` | **TODO: Canva Developer Portal** |
| `CANVA_CLIENT_SECRET` | **TODO** |
| `CANVA_REDIRECT_URI` | `http://localhost:3001/api/v1/integrations/canva/callback` |
| `CANVA_ENCRYPTION_KEY` | 32-byte hex — for AES-256-GCM token encryption |
| `GOOGLE_CLIENT_ID` | **TODO: Google Cloud Console** |
| `GOOGLE_CLIENT_SECRET` | **TODO** |

### Infrastructure

| Variable | Example |
|----------|---------|
| `MQTT_BROKER_URL` | `mqtt://localhost:1883` |
| `IPTV_M3U_URL` | Public M3U8 playlist URL for TV channels |
| `SENTRY_DSN` | **TODO: Sentry project** |

---

## 5. Authentication & Roles

### Platform Roles (`platformRole` on `User`)

| Role | Description |
|------|-------------|
| `SUPER_ADMIN` | Full platform access — all orgs, all data |
| `ADMIN` | Platform staff — same as SUPER_ADMIN minus destructive ops |
| `USER` | Regular user — access only through Org membership |

### Organization Roles (`OrgRole` on `Membership`)

| Role | Description |
|------|-------------|
| `OWNER` | Full org access — can delete org, manage billing |
| `ADMIN` | Manage members, screens, campaigns |
| `MANAGER` | Create/edit campaigns and screens |
| `MEMBER` | Read/write basic resources |
| `VIEWER` | Read-only |

### Organization Types (`OrgType` on `Organization`)

- `PARTNER` — Cinema/hotel operator (owns screens, earns revenue)
- `ADVERTISER` — Ad buyer (creates campaigns, pays for placements)

### Access Rules

| Interface | Who can access | Guard |
|-----------|---------------|-------|
| Admin | `platformRole = SUPER_ADMIN | ADMIN` only | `AdminGuard` |
| Partner | `Membership.orgType = PARTNER` | `JwtAuthGuard` + `OrgGuard` |
| Advertiser | `Membership.orgType = ADVERTISER` | `JwtAuthGuard` + `OrgGuard` |
| TV Device | Device token (issued at pairing) | `DeviceAuthGuard` |

### Device Pairing Flow

1. Partner creates a `Screen` in the portal
2. Partner opens `/partner/screens/[id]/pairing` → gets QR code + PIN
3. TV app boots in UNPAIRED state, shows QR
4. Scan QR or enter PIN → `POST /auth/device/pair`
5. Backend issues device token → stored in TV's encrypted prefs
6. Device connects to WebSocket `/devices` namespace with token
7. Screen status becomes ONLINE in partner dashboard (real-time)

### Multi-Tenant Filtering (MANDATORY)

**Every database query MUST filter by `orgId`.** This is enforced by service-layer guards.

```typescript
// CORRECT
await prisma.campaign.findMany({ where: { advertiserOrgId: ctx.orgId } });

// WRONG — leaks cross-tenant data
await prisma.campaign.findMany({});
```

Never bypass `orgId` filtering. It is a **critical security boundary.**

---

## 6. Database & Prisma

### Schema Location

```
packages/database/prisma/schema.prisma   # ~1700 lines, 50 models
packages/database/prisma/seed.ts         # Dev seed data
packages/database/docs/                  # ERD, index strategy, partitioning docs
```

### Key Models (50 total — grouped)

**Multi-Tenant Core:**
- `User`, `Organization` (PARTNER|ADVERTISER), `Membership` (User↔Org with OrgRole)
- `OAuthAccount` (Google OAuth), `RefreshToken`

**Screen & Device:**
- `Screen` — business asset (address, lat/lng, environment, pricing, status)
- `Device` — physical hardware (serialNumber, appVersion, status)
- `DeviceHeartbeat`, `DeviceMetrics`, `DeviceErrorLog` — health tracking
- `ScreenLiveStatus` — denormalized projection (isOnline, lastHeartbeatAt)

**Campaigns & Creatives:**
- `Campaign` (status: DRAFT→ACTIVE→PAUSED), `CampaignTargeting` (includedScreens M2M)
- `Creative` (VIDEO|IMAGE, source: UPLOAD|CANVA|AI_GENERATED)
- `Schedule`, `ScheduleSlot`, `ScheduleBlackout`

**Booking & Billing:**
- `Booking`, `BookingScreen` (line items)
- `StripeCustomer`, `StripeSubscription`, `StripeInvoice`, `StripePayment`, `StripeWebhookEvent`

**Revenue:**
- `RevenueRule` (platformRate=0.30, partnerRate=0.70)
- `RevenueShare`, `RevenueShareLineItem`, `Payout`, `PayoutLineItem`
- `PartnerPayoutProfile` (Stripe Connect), `TaxProfile`

**Diffusion Proof (append-only):**
- `DiffusionLog` — every ad play; HMAC signature + mediaHash for fraud detection

**Analytics (append-only, partitioned):**
- `AnalyticsEvent` — designed for monthly partitioning; never update, only insert

**TV Configuration:**
- `TvConfig` (per-screen: enabled modules, default tab, branding)
- `TvChannel` (IPTV catalog), `StreamingService` (Netflix tiles), `ActivityPlace`, `TvMacro`

**Other:**
- `AIWallet`, `AITransaction` (AI credits)
- `AuditLog` (all mutations tracked)
- `Notification`, `Conversation`, `Message`
- `ThirdPartyIntegration`, `CanvaDesign`

### Money Convention

**All prices stored in cents (Int).** Never store floats.

```typescript
// CORRECT
budgetCents: 10000  // = €100.00

// WRONG
budget: 100.00
```

### Prisma Commands

```bash
pnpm db:generate    # After schema changes — regenerate client
pnpm db:migrate     # Create + apply migration file (use in dev & CI)
pnpm db:push        # Apply schema without migration files (dev shortcut only)
pnpm db:seed        # Reset dev data
pnpm db:studio      # GUI at localhost:5555
```

### Migration Rules

1. **Always run `pnpm db:generate` after any schema change** — Prisma client types go stale
2. Use `pnpm db:migrate` (not `db:push`) for any change that touches production
3. Migrations in `packages/database/prisma/migrations/`
4. Multi-tenant: every new model needs an `orgId`/`partnerOrgId`/`advertiserOrgId` field

See [docs/db.md](docs/db.md) for ERD, index strategy, and query patterns.

---

## 7. Realtime / WebSocket Contract

See [docs/realtime.md](docs/realtime.md) for full details. Summary:

### Six WebSocket Gateways

| Gateway | Namespace | Who connects | Purpose |
|---------|-----------|-------------|---------|
| `DeviceGateway` | `/devices` | TV devices | Commands, schedules, ad updates |
| `ScreenStatusGateway` | `/screen-status` | Admin/Partner UI | Live screen health (every 10s) |
| `PartnerGateway` | `/partner` | Partner app | Screen changes, device pairing, revenue |
| `AdminGateway` | `/admin` | Admin app | Platform-wide KPIs (every 10s) |
| `MessagingGateway` | `/messaging` | All apps | Support conversations |
| `DashboardGateway` | `/dashboard` | Advertiser/Partner | Analytics summaries (every 10s) |

### Event Naming Convention

```
<domain>:<action>       e.g., tv:ads:update, screen:status:changed
```

### Key Events

```typescript
// TV Device receives
'tv:ads:update'           // Refetch active campaigns immediately
'schedule'                // New schedule/playlist pushed
'command'                 // Remote control: { type: 'reboot'|'refresh'|'purge' }

// Partner app receives (room: partner:<orgId>)
'screens:changed'         // Screen added/removed/updated
'screen:status:changed'   // { screenId, connectivity: 'ONLINE'|'OFFLINE'|'MAINTENANCE' }
'device:paired'           // { screenId, deviceId }
'commission:rate:changed' // { newRate }
'statement:updated'       // { statementId }

// Admin app receives (room: admin)
'dashboard:update'        // Full KPI summary
'users:changed'
'partners:changed'
'advertisers:changed'
'screens:changed'
'moderation:changed'
'activity:new'            // { activity }
```

### Room Strategy

```typescript
device:<deviceId>         // One TV device
screen:<screenId>         // All devices on a screen (usually 1)
partner:<orgId>           // All partner app users in org
admin                     // All admin users
user:<userId>             // Individual user (messaging)
conversation:<id>         // Conversation participants
```

### Checklist: Adding a Realtime Feature

- [ ] Define event name using `domain:action` convention
- [ ] Add payload type to `@neofilm/shared`
- [ ] Add `emit` call in the correct gateway
- [ ] Frontend socket provider subscribes to event
- [ ] Test with multiple concurrent clients
- [ ] Add to Event Catalog in [docs/realtime.md](docs/realtime.md)

---

## 8. TV App Runbook

Full docs in [apps/tv-app/ARCHITECTURE.md](apps/tv-app/ARCHITECTURE.md) and related files.

### Quick Start

```bash
pnpm dev:tv                    # port 3004, binds to 0.0.0.0

# Android emulator
# Use http://10.0.2.2:3004 (NOT localhost)
```

### Pairing Flow

1. TV boots UNPAIRED → shows QR code + PIN (`/partner/pairing` on backend)
2. Partner scans or enters PIN in portal → `POST /auth/device/pair`
3. Backend creates `DevicePairingRequest` → issues device JWT
4. TV stores token in encrypted prefs → connects to `/devices` WS namespace
5. TV state → PAIRED → SYNCING → ACTIVE

### Heartbeat

TV sends `heartbeat` event every 30s to `/devices` namespace:
```typescript
{ deviceId, isOnline: true, appVersion, uptime, cpu, memory, temperature }
```
Backend updates `DeviceHeartbeat` + `ScreenLiveStatus` + notifies `PartnerGateway`.

### Schedule Retrieval

TV fetches `GET /tv/schedule?deviceId=<id>` on startup and after `schedule` WS event.
Schedule = ordered `ScheduleSlot[]` (creative, startTime, endTime, dayOfWeek, priority).

### Display Modules (TvMacro config per screen)

- **Ad zone** — splitRatio (default 70% main / 30% ad), spotDurationMs, skipDelayMs
- **IPTV** — HLS stream from `TvChannel`
- **Activities** — `ActivityPlace[]` for the partner's area
- **Streaming** — `StreamingService` tiles (Netflix, Disney+)

### Android WebView Constraints

- **Autoplay:** requires `autoplay` attribute + `muted` on `<video>` — don't remove these
- **Mixed content:** TV must serve over HTTPS in production; dev uses HTTP locally
- **User agent:** `navigator.userAgent` contains `"Android TV"` — used for layout adaptation
- **No mouse events:** all interaction via D-pad; avoid hover-only states

### Debug Checklist

```
TV shows nothing / blank screen:
  □ Is TV app running? curl http://10.0.2.2:3004
  □ Is API running? curl http://10.0.2.2:3001/api/v1/health
  □ Device token valid? Check DevicePairingRequest.expiresAt
  □ Screen has active campaign? Check Campaign.status = ACTIVE
  □ CampaignTargeting.includedScreens includes this screen?

TV schedule is empty:
  □ Campaign published (status ACTIVE)?
  □ ScheduleSlot exists for this screen?
  □ Current time/day within slot window?

TV not receiving real-time updates:
  □ Device connected to /devices namespace?
  □ DeviceGateway.isDeviceConnected(deviceId) → true?
  □ Event name matches exactly (tv:ads:update)?
  □ pushToScreen() called with correct screenId?

IPTV stream not loading:
  □ hls.js supported? hls.Hls.isSupported()
  □ M3U8 URL accessible from device network?
  □ IPTV_M3U_URL env var set?
```

---

## 9. UI Conventions

### Design System

- **Tailwind CSS v4** — utility-first, all tokens in CSS variables
- **Radix UI** components via `@neofilm/ui` — always use these, don't re-implement dialogs/selects
- **lucide-react** for icons — consistent icon set
- **CVA** (class-variance-authority) for variant-based components

### Component Rules

```typescript
// Loading state — always show skeleton or spinner
if (isLoading) return <Skeleton className="h-8 w-full" />;

// Empty state — never show blank page
if (data.length === 0) return <EmptyState title="No campaigns yet" />;

// Error state — always surface errors
if (error) return <ErrorBanner message={error.message} />;
```

### No Dead Buttons (MANDATORY)

**Every button must have a working `onClick` handler.** No placeholder `() => {}`. No "TODO: connect". If the feature isn't ready, hide the button with a feature flag or don't render it at all.

### Toast Notifications

```typescript
// Always use toast for async feedback
toast.success('Campaign published successfully');
toast.error('Failed to publish: ' + error.message);
```

### Table/List Pattern

1. TanStack Query for data fetching
2. Skeleton loading state
3. Empty state component
4. Pagination (server-side)
5. Real-time updates via socket subscription

### Form Pattern

- React Hook Form + Zod validation
- Disable submit button while loading
- Show field-level errors
- Handle API errors in `onError`

---

## 10. Feature Playbooks

### Campaigns (Advertiser Flow)

**UI:** `/campaigns/new` → multi-step wizard

**Steps:**
1. Basic info (name, description, type, dates, budget)
2. Screen targeting (map-based selector)
3. Creative upload / Canva design / AI generation
4. Review & submit

**API chain:**
```
POST /campaigns
  body: { name, description, type, startDate, endDate, budgetCents, selectedScreenIds, advertiserOrgId }
  → creates Campaign + CampaignTargeting (includedScreens) in $transaction
  → returns Campaign (status: DRAFT)

POST /campaigns/:id/publish
  → Campaign.status = ACTIVE
  → DeviceGateway.pushToScreen(screenId, 'tv:ads:update') for each targeted screen
  → TV fetches GET /tv/ads → shows new campaign

POST /campaigns/:id/deactivate
  → Campaign.status = PAUSED
  → same WS emit to remove from rotation
```

**DB tables:** `Campaign`, `CampaignTargeting` (M2M `includedScreens Screen[]`)

**Note:** `screensCount` = `targeting.includedScreens.length` — not a DB column.

---

### Screen Park (Partner Flow)

**UI:** `/partner/screens`, `/partner/screens/new`, `/partner/pairing`

**Flow:**
1. Partner creates screen (address, environment, pricing)
2. System generates pairing QR + PIN
3. Partner installs TV app on device, scans QR
4. Device pairs → status ONLINE in dashboard (real-time via PartnerGateway)
5. Partner configures TvMacro (split ratio, spot duration, enabled modules)
6. Partner schedules content slots

**API endpoints:**
```
POST   /screens                  Create screen
GET    /screens?partnerOrgId=... List screens
GET    /screens/map              Active screens with live status + partner name
GET    /screens/:id              Screen detail
PATCH  /screens/:id              Update screen
POST   /auth/device/pair         Pair device to screen
GET    /tv-config/:screenId      TV configuration
PATCH  /tv-config/:screenId      Update TV configuration
```

**DB tables:** `Screen`, `Device`, `DevicePairingRequest`, `ScreenLiveStatus`, `TvConfig`, `TvMacro`

---

### Creatives / Media Library (Advertiser)

**Sources:**
- `UPLOAD` — direct file upload → S3 via presigned URL
- `CANVA` — OAuth connect → user designs in Canva → MP4 export → S3
- `AI_GENERATED` — AI credits (AIWallet) → generate → S3

**API:**
```
GET    /creatives?advertiserOrgId=...&type=VIDEO&status=APPROVED
POST   /creatives/upload-url     Get S3 presigned URL
POST   /creatives                Create Creative record after upload
POST   /creatives/:id/submit     Submit for moderation
```

**Moderation:** Admin approves/rejects in `/admin/moderation/videos`. Status: PENDING → APPROVED|REJECTED.

---

### Revenue & Payouts (Partner + Admin)

**Revenue split:** Platform 30% / Partner 70% (per `RevenueRule`, configurable by admin)

**Monthly flow:**
1. `RevenueShare` record created at month-end (per partner)
2. `RevenueShareLineItem` per booking × screen
3. Admin reviews → status PENDING → APPROVED
4. `Payout` created → Stripe Connect transfer
5. Partner sees payout in `/partner/payouts`

**API:**
```
GET  /revenue/statements?partnerOrgId=...    Revenue statements
GET  /revenue/statements/:id                 Statement detail
POST /payouts                                Trigger payout (admin)
GET  /payouts?partnerOrgId=...              Payout history
```

---

### Messaging (All Roles)

**Pattern:** Conversation-based (like support tickets)

**Rooms:**
- Admin: joins `admin:messages` — sees all conversations
- Org users: join `user:<userId>` + `conversation:<id>` when opened

**API:**
```
GET    /messaging/conversations               List conversations
POST   /messaging/conversations               Create conversation
GET    /messaging/conversations/:id/messages  Message history
POST   /messaging/conversations/:id/messages  Send message
```

**WS events:**
- `message:new` → { conversationId, message }
- `conversation:updated` → { conversationId, lastMessage, unreadCount }

---

### Canva Integration (Advertiser)

**OAuth flow:**
1. `GET /integrations/canva/connect?orgId=...` → redirect to Canva OAuth
2. Canva callback → `POST /integrations/canva/callback` → tokens encrypted AES-256-GCM → `ThirdPartyIntegration`
3. `POST /canva/designs` → create Canva design, return edit URL
4. User designs in Canva
5. `POST /canva/designs/:id/export` → trigger MP4 export → import to S3 → create `Creative`

**Required env:** `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`, `CANVA_REDIRECT_URI`, `CANVA_ENCRYPTION_KEY`

---

## 11. Debugging & Troubleshooting

### "undefined / NaN" on Dashboard

**Causes:**
1. `apiFetch` not unwrapping `TransformInterceptor` envelope → accessing `res.data.data` instead of `res.data`
2. Prisma types stale → run `pnpm db:generate`
3. Service returns null → frontend not handling nullish data

**Fix checklist:**
- [ ] `console.log` raw API response — check if it has `{ data, statusCode, timestamp }` shape
- [ ] Verify `apiFetch` in `src/lib/api.ts` auto-unwraps (checks for `statusCode` key)
- [ ] Run `pnpm db:generate` if types seem wrong

### "Button Does Nothing"

- [ ] `onClick` handler attached and not `undefined`?
- [ ] Component wrapped in `<form>` that swallows clicks?
- [ ] Async handler missing `await`?
- [ ] Error thrown silently? Add `.catch(console.error)` temporarily
- [ ] Auth token expired? Check network tab for 401

### "Prisma Types Out-of-Date"

```bash
pnpm db:generate
# Then restart TypeScript server in editor (Ctrl+Shift+P → Restart TS Server)
```

### "Socket Connected but No Updates"

- [ ] Client joined the right room? (e.g., `partner:<orgId>`)
- [ ] Server emitting to correct room name?
- [ ] Event name matches exactly (case-sensitive)?
- [ ] Gateway namespace matches client connection URL?
- [ ] Redis adapter configured for multi-instance? (production issue)

### "TV Emulator Can't Load App"

- [ ] Using `http://10.0.2.2:3004` (not `localhost`)?
- [ ] TV app running on `0.0.0.0`? (`dev --hostname 0.0.0.0`)
- [ ] Android emulator network not isolated? Try cold boot
- [ ] Mixed content blocked? Ensure both API and TV serve same protocol in dev

### "Campaign Published but TV Not Updating"

- [ ] Device connected? `DeviceGateway.isDeviceConnected(deviceId)`
- [ ] `pushToScreen` called with correct `screenId` (not `deviceId`)?
- [ ] TV socket subscribed to `tv:ads:update`?
- [ ] TV `apiFetch` token valid? (device token expiry)

### "Stripe Webhook Not Processing"

- [ ] `stripe listen --forward-to localhost:3001/api/v1/webhooks/stripe` running?
- [ ] `STRIPE_WEBHOOK_SECRET` matches local CLI output?
- [ ] `StripeWebhookEvent.processed = false` records accumulating?

---

## 12. Contribution Rules

### DO

- Small, focused PRs (one feature or fix per PR)
- Strict TypeScript — no `any`, no `@ts-ignore` without comment
- Add Prisma migration for any schema change
- Filter by `orgId` in every DB query (multi-tenant security)
- Use `@neofilm/shared` DTOs for API contracts
- Run `pnpm db:generate` after schema changes
- Test socket events manually before marking done
- Use `TransformInterceptor` envelope pattern for new NestJS endpoints

### DON'T

- `any` casts — define the type or use `unknown`
- Hardcoded URLs — use `NEXT_PUBLIC_API_URL` env var
- Bypass tenant filter — never query without `orgId`
- Skip `pnpm db:generate` after schema changes
- Push secrets or `.env` to git
- Add dead buttons (no handler)
- Use float for money — always cents (Int)

### Pre-Merge Checklist

```bash
# 1. Lint
pnpm lint

# 2. Type check
pnpm --filter @neofilm/web-admin exec tsc --noEmit
pnpm --filter @neofilm/web-partner exec tsc --noEmit
pnpm --filter @neofilm/web-advertiser exec tsc --noEmit
pnpm --filter @neofilm/tv-app exec tsc --noEmit
pnpm --filter @neofilm/api exec tsc --noEmit

# 3. Tests
pnpm test

# 4. Manual checks
# □ Pages not blank (check loading/empty states)
# □ No dead buttons
# □ No console errors in browser
# □ Multi-tenant: data scoped to org
# □ Socket events working
```

---

## 13. Golden Paths

### Golden Path 1: Create and Publish a Campaign

```
1. Advertiser logs in → /campaigns/new
2. Fill step 1 (name, dates, budget in cents)
3. Step 2: select screens from map (GET /screens/map)
4. Step 3: upload creative (POST /creatives/upload-url → PUT S3 → POST /creatives)
5. Step 4: review → POST /campaigns
   → DB: Campaign (DRAFT) + CampaignTargeting (includedScreens)
6. Campaign detail page → click Publish
   → POST /campaigns/:id/publish
   → DB: Campaign.status = ACTIVE
   → WS: DeviceGateway.pushToScreen(screenId, 'tv:ads:update')
7. TV receives 'tv:ads:update' → GET /tv/ads → renders ad
8. DiffusionLog written for each play (anti-fraud proof)
```

### Golden Path 2: Add a Screen and Pair a TV

```
1. Partner logs in → /partner/screens/new
2. Fill form (name, address, lat/lng, environment, pricing)
   → POST /screens
   → DB: Screen (INACTIVE)
3. /partner/screens/[id]/pairing → QR code shown
4. Turn on Android TV with NeoFilm TV app
5. TV shows pairing screen with QR
6. Partner scans QR (or enters PIN)
   → POST /auth/device/pair
   → DB: Device created, DevicePairingRequest fulfilled
   → Device JWT issued → stored encrypted on TV
7. TV connects to /devices WebSocket namespace
8. DeviceGateway emits → PartnerGateway.emitDevicePaired()
9. Partner dashboard updates in real-time: screen ONLINE
```

### Golden Path 3: Process Monthly Revenue

```
1. Month ends → cron job triggers RevenueShare calculation
   → For each Booking: sum BookingScreen.unitPriceCents
   → Apply RevenueRule: partnerAmount = total * 0.70
   → Create RevenueShare + RevenueShareLineItems
2. PartnerGateway emits 'statement:updated' → partner notified
3. Admin reviews statements in /admin → approve
4. POST /payouts → create Payout → Stripe Connect transfer
5. Payout.status: PENDING → PROCESSING → PAID
6. Partner sees updated payouts in /partner/payouts
```

---

## 14. Event Catalog

Full catalog in [docs/realtime.md](docs/realtime.md). Quick reference:

| Namespace | Event | Direction | Payload |
|-----------|-------|-----------|---------|
| `/devices` | `tv:ads:update` | Server→TV | `{}` (TV refetches) |
| `/devices` | `schedule` | Server→TV | `ScheduleSlot[]` |
| `/devices` | `command` | Server→TV | `{ type, params }` |
| `/devices` | `heartbeat` | TV→Server | `{ deviceId, isOnline, appVersion, ... }` |
| `/partner` | `screens:changed` | Server→Partner | `{ partnerOrgId }` |
| `/partner` | `screen:status:changed` | Server→Partner | `{ screenId, connectivity }` |
| `/partner` | `device:paired` | Server→Partner | `{ screenId, deviceId }` |
| `/partner` | `statement:updated` | Server→Partner | `{ statementId }` |
| `/admin` | `dashboard:update` | Server→Admin | `DashboardSummary` |
| `/admin` | `moderation:changed` | Server→Admin | `{}` |
| `/messaging` | `message:new` | Server→User | `{ conversationId, message }` |
| `/messaging` | `conversation:updated` | Server→User | `{ conversationId, ... }` |
| `/screen-status` | `status:broadcast` | Server→All | `ScreenStatus[]` |
| `/dashboard` | `summary:update` | Server→Advertiser | `DashboardSummary` |

---

## 15. Glossary

| Term | Definition |
|------|-----------|
| **Organization (Org)** | Top-level tenant — either a PARTNER or ADVERTISER |
| **Partner** | Cinema/hotel operator who owns screens and earns revenue from ads |
| **Advertiser** | Company that buys ad slots on screens |
| **Screen** | Business asset — a named display location with address, pricing, environment |
| **Device** | Physical Android TV hardware — paired to a Screen |
| **Campaign** | An ad purchase: creative + targeting + budget + date range |
| **CampaignTargeting** | Which screens a campaign runs on (M2M to Screen) |
| **Creative** | A media file (VIDEO or IMAGE) — uploaded, Canva-designed, or AI-generated |
| **Schedule** | Per-screen playlist — ordered ScheduleSlots with time windows |
| **DiffusionLog** | Append-only proof that an ad played on a screen (HMAC-signed, anti-fraud) |
| **RevenueShare** | Monthly revenue statement for a partner (platform 30% / partner 70%) |
| **Payout** | Stripe Connect transfer from platform to partner |
| **DeviceHeartbeat** | Periodic health signal from TV device (CPU, memory, uptime) |
| **TvMacro** | Per-screen ad behavior config (spot duration, split ratio, skip delay) |
| **Booking** | Commercial agreement linking advertiser to screens with pricing |
| **OrgRole** | Role within an org (OWNER, ADMIN, MANAGER, MEMBER, VIEWER) |
| **Commission** | Partner's share of ad revenue (default 70%) |

---

## 16. Known Issues

> Document any critical issues discovered during audit.

- **TV app port `0.0.0.0` binding** — required for Android emulator access; ensure `--hostname 0.0.0.0` is in the dev script. ✅ Confirmed in package.json.
- **Turbo `dev` requires dependency build first** — `turbo dev` has `dependsOn: ["^build"]`. If package source changes, the dependent build cache may be stale. Run `pnpm --filter <changed-pkg> build` manually if hot-reload doesn't pick up package changes.
- **NextAuth 5 beta** — `next-auth@5.0.0-beta.30` is used in partner & advertiser apps. Beta APIs may change; check compatibility when upgrading Next.js.
- **Prisma client stale after schema changes** — Must run `pnpm db:generate` after every `schema.prisma` change. TypeScript errors about missing models are almost always this.
- **MQTT broker required for TV prod** — Mosquitto config at `infra/mosquitto/`. Without it, TV falls back to WS-only mode.
- **MinIO buckets auto-created by docker-compose** — `neofilm-creatives` and `neofilm-uploads` are created on `db:up`. If MinIO data volume is deleted, buckets must be recreated manually or via `docker compose up`.

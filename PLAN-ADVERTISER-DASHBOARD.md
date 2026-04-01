# NEOFILM — Advertiser Dashboard: Complete Implementation Plan

## Current State Assessment

The `web-advertiser` app is a **blank shell** — only a root `page.tsx` with a placeholder and `layout.tsx`. The monorepo already provides:

- **20 shadcn/ui components** in `@neofilm/ui` (Button, Card, Input, Select, Table, Dialog, Tabs, Badge, etc.)
- **Full Prisma schema** with Campaign, Creative, Booking, Screen, Targeting, Billing, AI Wallet, DiffusionLog, Analytics
- **Shared DTOs** (Zod schemas for campaigns, pagination) + **API client** with namespaces
- **NestJS API** with modules: campaigns, creatives, screens, analytics, invoices, organizations, schedules, devices, auth
- **Existing patterns**: `@/*` path aliases, Tailwind v4, Turbopack, `transpilePackages`

### Dependencies to Install

```
pnpm --filter @neofilm/web-advertiser add \
  @tanstack/react-query \
  react-hook-form @hookform/resolvers zod \
  lucide-react \
  recharts \
  date-fns \
  socket.io-client \
  zustand \
  class-variance-authority clsx tailwind-merge \
  next-themes \
  sonner
```

> **Note**: Map (Mapbox/Google Maps) and Stripe.js are deferred to Phase 3/4 to avoid complexity bloat.

---

## Implementation Phases

### PHASE 1 — Foundation & Shell (Files: ~25)
**Goal**: App skeleton, auth context, layout, routing, mock data layer

### PHASE 2 — Campaign CRUD + Media (Files: ~30)
**Goal**: Campaign list, wizard (5 steps), media upload, media library

### PHASE 3 — Targeting Map + Billing (Files: ~20)
**Goal**: Screen selection map, booking draft, Stripe checkout, billing portal

### PHASE 4 — Analytics + AI + Catalog + Realtime (Files: ~25)
**Goal**: KPI dashboard, AI generator, catalog module, WebSocket events

---

## PHASE 1: Foundation & Shell

### 1.1 — Install dependencies
Run `pnpm --filter @neofilm/web-advertiser add ...` for all required packages.

### 1.2 — Providers architecture
Create `src/providers/` with:
- **QueryProvider** — TanStack Query `QueryClientProvider` with default options (staleTime: 30s, retry: 2)
- **AuthProvider** — React context holding user/org/token + mock login (will connect to real API later)
- **ThemeProvider** — `next-themes` for light/dark support
- **SocketProvider** — Socket.IO context (lazy connect, reconnect logic)
- **ToastProvider** — Sonner toast for global notifications
- **Providers** wrapper — composes all providers, mounted in `layout.tsx`

### 1.3 — Layout system
```
src/
├── app/
│   ├── layout.tsx                    ← root layout (Providers, fonts)
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── layout.tsx               ← minimal centered layout
│   ├── (dashboard)/
│   │   ├── layout.tsx               ← sidebar + topbar + main
│   │   ├── page.tsx                 ← redirect to /campaigns
│   │   ├── onboarding/page.tsx
│   │   ├── campaigns/
│   │   │   ├── page.tsx             ← campaign list
│   │   │   ├── new/
│   │   │   │   └── page.tsx         ← wizard
│   │   │   └── [campaignId]/
│   │   │       ├── page.tsx         ← campaign detail
│   │   │       └── edit/page.tsx    ← edit wizard
│   │   ├── media-library/page.tsx
│   │   ├── ai-generator/page.tsx
│   │   ├── analytics/
│   │   │   ├── page.tsx             ← global analytics
│   │   │   └── [campaignId]/page.tsx
│   │   ├── catalog/
│   │   │   ├── page.tsx
│   │   │   └── new/page.tsx
│   │   ├── billing/page.tsx
│   │   ├── invoices/page.tsx
│   │   └── settings/page.tsx
```

### 1.4 — Dashboard layout components
- **Sidebar** (`src/components/layout/sidebar.tsx`)
  - Logo, nav links with icons, active state, collapse toggle
  - Sections: Campaigns, Media, AI, Analytics, Catalog, Billing, Settings
  - Bottom: user avatar, org name, logout
- **Topbar** (`src/components/layout/topbar.tsx`)
  - Breadcrumbs, search, notification bell, user dropdown
- **DashboardShell** — flex container for sidebar + content area

### 1.5 — Mock data layer
Create `src/lib/mock-data.ts` with factory functions matching Prisma schema:
- `mockCampaigns(n)` — realistic campaigns in all statuses
- `mockScreens(n)` — screens with lat/lng in French cities
- `mockCreatives(n)` — video/image creatives
- `mockInvoices(n)` — paid/pending/overdue invoices
- `mockAnalytics()` — timeseries, summary, by-trigger, by-screen

### 1.6 — API hooks layer
Create `src/lib/api/` with:
- `client.ts` — instantiate `NeoFilmApiClient` or mock wrapper
- `hooks/use-campaigns.ts` — `useCampaigns()`, `useCampaign(id)`, `useCreateCampaign()`, `useUpdateCampaign()`
- `hooks/use-media.ts` — `useMediaLibrary()`, `usePresignUpload()`, `useCompleteUpload()`
- `hooks/use-screens.ts` — `useAvailableScreens(filters)`
- `hooks/use-analytics.ts` — `useCampaignSummary(id)`, `useCampaignTimeseries(id)`
- `hooks/use-billing.ts` — `useSubscription()`, `useInvoices()`, `useCreateCheckout()`
- `hooks/use-ai.ts` — `useAICredits()`, `useGenerateVideo()`, `useAIJob(id)`
- `query-keys.ts` — centralized React Query key factory

**Query key strategy**:
```ts
export const queryKeys = {
  campaigns: {
    all: ['campaigns'] as const,
    list: (filters: CampaignFilters) => ['campaigns', 'list', filters] as const,
    detail: (id: string) => ['campaigns', 'detail', id] as const,
  },
  media: { ... },
  screens: { ... },
  analytics: { ... },
  billing: { ... },
  ai: { ... },
}
```

### 1.7 — Common reusable components
- `PageHeader` — title + description + action buttons
- `EmptyState` — icon + message + CTA
- `LoadingState` — skeleton patterns
- `ErrorState` — error message + retry
- `StatusBadge` — colored badge per campaign/booking status
- `CurrencyDisplay` — format cents to EUR
- `DateDisplay` — relative or absolute date formatting
- `ConfirmDialog` — destructive action confirmation
- `DataTable` — wrapper around Table with sorting, pagination, filtering

---

## PHASE 2: Campaign CRUD + Media

### 2.1 — Campaigns list page (`/campaigns`)
**Components**:
- `CampaignFilters` — status tabs (All/Draft/Active/Paused/Ended) + search + date range
- `CampaignCard` (grid view) / `CampaignRow` (table view) — toggleable
- `CampaignStatusBadge` — color-coded (Draft=gray, Active=green, Paused=yellow, Rejected=red)

**States**: Loading (skeleton grid), Empty (illustration + "Create your first campaign" CTA), Error (retry)

**API**: `GET /campaigns?status=&search=&page=&limit=`

### 2.2 — Campaign creation wizard (`/campaigns/new`)
Multi-step form with **Zustand store for autosave** + React Hook Form per step.

**Wizard store** (`src/stores/campaign-wizard.store.ts`):
```ts
interface WizardState {
  currentStep: number;
  draft: Partial<CampaignDraft>;
  setStep(n: number): void;
  updateDraft(data: Partial<CampaignDraft>): void;
  reset(): void;
}
```

**Step 1: Basics** (`WizardStepBasics.tsx`)
- Fields: name (required), description, objective (select), category (select), type (AD_SPOT | CATALOG_LISTING | BOTH), start date, end date
- Zod validation: dates in future, end > start, name min 3 chars
- Auto-save to Zustand on blur

**Step 2: Media** (`WizardStepMedia.tsx`)
- Drag-and-drop zone (custom `FileDropZone` component)
- Or "Generate with AI" button → redirect to AI generator with return URL
- Upload flow:
  1. Client requests pre-signed URL: `POST /media/presign-upload { fileName, mimeType, sizeBytes }`
  2. Client uploads directly to S3 with progress tracking (XHR/fetch)
  3. Client confirms: `POST /media/complete-upload { mediaId, fileHash }`
  4. Backend starts transcode → WebSocket event `media.transcodeComplete`
- Show: upload progress bar, preview player (HTML5 video), metadata (duration, resolution, size)
- Validation: mp4/mov only, max 500MB, duration 15-30s, min 720p
- Media library picker: select from previously uploaded media

**Step 3: Targeting** (`WizardStepTargeting.tsx`)
- Map component showing available screens (dots/clusters)
- Filters sidebar: city search, radius slider, environment type, partner type
- Screen list below map: checkbox selection with screen info
- Pack presets: buttons for 50/100/150/200/300 TVs (auto-selects nearest screens)
- Live price calculator: `selectedScreens.length × unitPrice = monthlyTotal`
- Summary card: "X screens selected in Y cities — €Z/month"

**Step 4: Scheduling** (`WizardStepSchedule.tsx`)
- Trigger selection (checkboxes): POWER_ON, OPEN_APP, CHANGE_APP, CATALOG_OPEN
- Frequency cap: slider or input for max impressions/hour/screen
- Duration selector: 15s or 30s radio
- Visual timeline preview: horizontal bar showing example day schedule

**Step 5: Review** (`WizardStepReview.tsx`)
- Read-only summary of all steps with "Edit" links back to each
- Campaign summary card: name, dates, type
- Media thumbnail + metadata
- Map miniature with selected screens
- Price breakdown: monthly subscription, add-ons
- Terms checkbox
- "Submit for Review" or "Save as Draft" buttons
- On submit: `POST /campaigns` then `POST /campaigns/{id}/submit`

### 2.3 — Campaign detail page (`/campaigns/[id]`)
**Tabs**:
- Overview: status, dates, budget, media preview
- Analytics: KPIs inline (if active)
- Screens: map + list of booked screens
- Activity: audit log / status history
**Actions**: Edit (if draft), Pause, Resume, Duplicate

### 2.4 — Media library page (`/media-library`)
- Grid of uploaded media with thumbnails
- Filters: type (video/image), status (processing/ready/rejected), date
- Upload button → same drag-and-drop flow
- Detail dialog: full preview, metadata, usage (which campaigns use it)

---

## PHASE 3: Targeting Map + Billing

### 3.1 — Screen availability map
- Use `react-map-gl` (Mapbox) or `@react-google-maps/api`
- Cluster markers with `supercluster` for 10k+ screens
- Popup on click: screen name, partner, environment, status, monthly price
- Color coding: green=available, gray=booked, red=offline
- Filter controls: city search with autocomplete, radius picker, environment toggle

### 3.2 — Booking flow
- From wizard Step 5 → create `BookingDraft`: `POST /booking-drafts { campaignId, screenIds[] }`
- After payment → confirm: `POST /bookings/confirm { bookingDraftId, stripeSessionId }`
- Booking status tracked alongside campaign status

### 3.3 — Billing page (`/billing`)
- Current subscription card: plan name, price, next billing date, status
- Payment methods: list + add new (Stripe Elements)
- "Manage billing" → Stripe Billing Portal redirect
- Cancel/pause subscription with confirmation

### 3.4 — Invoices page (`/invoices`)
- DataTable: invoice number, date, amount, status, PDF link
- Filters: status (paid/pending/overdue), date range
- Download PDF button

### 3.5 — Stripe integration
- `POST /billing/checkout-session` → redirect to Stripe Checkout
- Return URL: `/billing?session_id={CHECKOUT_SESSION_ID}`
- Success handler: verify payment, activate campaign
- Webhook handling (backend): `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`

---

## PHASE 4: Analytics + AI + Catalog + Realtime

### 4.1 — Global analytics (`/analytics`)
**KPI cards** (top row):
- Total impressions (with trend arrow)
- Active campaigns
- Screens online vs total
- Average delivery health score

**Charts** (Recharts):
- Line chart: impressions over time (7d/30d/90d toggle)
- Bar chart: impressions by trigger context
- Heatmap: screen performance (simplified table heatmap)
- Top 5 screens table

### 4.2 — Campaign analytics (`/analytics/[campaignId]`)
- Same KPIs scoped to campaign
- Timeseries: `GET /analytics/campaigns/{id}/timeseries?from=&to=&granularity=`
- By trigger: `GET /analytics/campaigns/{id}/by-trigger`
- By screen: `GET /analytics/campaigns/{id}/by-screen` → table with sortable columns
- Delivery health: % of screens online, % of expected impressions delivered

### 4.3 — AI video generator (`/ai-generator`)
- Credit balance display (wallet widget)
- Prompt input (textarea) + business type template selector
- Optional: upload logo/images
- "Generate" button → `POST /ai/generate { prompt, businessType, assets[] }`
- Job polling: `GET /ai/jobs/{id}` every 5s until complete
- Preview player for result
- Actions: regenerate, save to media library, use in campaign
- Credit purchase: "Buy more credits" → Stripe checkout for AI credit packs

### 4.4 — Catalog module (`/catalog`)
- Listing grid: business cards showing title, image, category, status
- Create/edit form: title, description, category, image/video, CTA link, promo code, keywords
- TV preview mode: simulated TV frame showing how listing appears
- Upsell: "Boost listing" for sponsored placement priority

### 4.5 — Realtime (WebSocket)
**Socket.IO client setup**:
```ts
// Auto-connect on auth, join room `org:{orgId}`
// Events handled:
// - campaign.statusChanged → invalidate campaign queries
// - media.transcodeComplete → update media status
// - analytics.updated → refetch analytics if viewing
// - billing.paymentFailed → show toast alert + banner
// - booking.updated → invalidate booking queries
```

**Fallback**: if WebSocket disconnects, enable polling every 30s on active data.

---

## Campaign Lifecycle State Machine

```
DRAFT
  ├──[advertiser: submit]──→ PENDING_REVIEW
  └──[advertiser: delete]──→ (deleted)

PENDING_REVIEW
  ├──[admin: approve]──→ APPROVED
  └──[admin: reject]──→ REJECTED

APPROVED
  └──[system: payment success]──→ ACTIVE

ACTIVE
  ├──[advertiser: pause]──→ PAUSED
  ├──[system: payment failed]──→ PAUSED (auto, flag: payment_issue)
  ├──[system: endDate reached]──→ COMPLETED
  └──[admin: force stop]──→ COMPLETED

PAUSED
  ├──[advertiser: resume + payment ok]──→ ACTIVE
  └──[advertiser: cancel]──→ COMPLETED

REJECTED
  └──[advertiser: edit + resubmit]──→ PENDING_REVIEW

COMPLETED
  └──[advertiser: duplicate]──→ DRAFT (new campaign)
```

**Rules**:
- Editing a PENDING_REVIEW campaign → resets to DRAFT (requires re-submit)
- Media changes on ACTIVE campaign → triggers re-review (PENDING_REVIEW)
- Targeting changes on ACTIVE campaign → allowed without re-review (just schedule update)
- Payment failure → auto-PAUSED with `pauseReason: 'PAYMENT_FAILED'`, notification sent
- Diffusion engine receives ACTIVE campaigns only

---

## Validation Rules

### Media
| Rule | Value |
|------|-------|
| Allowed formats | `.mp4`, `.mov` |
| Max file size | 500 MB |
| Duration | 15–30 seconds |
| Min resolution | 1280×720 (720p) |
| Max resolution | 3840×2160 (4K) |
| File hash | SHA-256, verified on upload complete |
| Auto-resize | Backend generates 1080p + 720p variants |

### Targeting
- Must select at least 1 screen
- Cannot exceed pack limit (50/100/150/200/300)
- Screens must be ACTIVE status at publish time
- If a screen goes offline after booking → system keeps booking, marks screen as "degraded" in analytics

### Scheduling
- Allowed triggers: `POWER_ON`, `OPEN_APP`, `CHANGE_APP`, `CATALOG_OPEN`, `SCHEDULED`
- Frequency cap: 1–10 impressions/hour/screen (default: 3)
- Duration: 15 or 30 seconds only
- Timezone: screen's local timezone (default Europe/Paris)

### Billing
- Active Stripe subscription required before campaign can go ACTIVE
- If subscription cancelled → all campaigns end at period end
- Cannot publish if payment method invalid
- Prorated upgrades when adding screens mid-cycle

### Catalog
- Title: 3–100 characters
- Description: 10–500 characters
- CTA link: valid HTTPS URL
- Image: JPEG/PNG, max 5MB, min 800×600
- Max 1 active catalog listing per campaign (V1)

---

## API Endpoints & Payloads

### Campaigns
```
POST   /campaigns                          → CreateCampaignDto → ICampaign
GET    /campaigns?status=&search=&page=    → PaginatedResponse<ICampaign>
GET    /campaigns/:id                      → ICampaign (with creatives, targeting, bookings)
PATCH  /campaigns/:id                      → UpdateCampaignDto → ICampaign
POST   /campaigns/:id/submit               → ICampaign (status → PENDING_REVIEW)
POST   /campaigns/:id/pause                → ICampaign (status → PAUSED)
POST   /campaigns/:id/resume               → ICampaign (status → ACTIVE)
DELETE /campaigns/:id                       → 204 (only DRAFT)
```

### Media
```
POST   /media/presign-upload    { fileName, mimeType, sizeBytes }    → { uploadUrl, mediaId, fields }
POST   /media/complete-upload   { mediaId, fileHash }                → ICreative
GET    /media                   ?page=&type=&status=                 → PaginatedResponse<ICreative>
GET    /media/:id/status                                             → { status, progress, variants[] }
DELETE /media/:id                                                    → 204
```

### AI Generation
```
POST   /ai/generate       { prompt, businessType, assets[], creditCost }  → { jobId }
GET    /ai/jobs/:id                                                        → { status, progress, resultUrl }
GET    /ai/credits/balance                                                 → { balance, walletId }
POST   /ai/credits/purchase { packId, amount }                            → { checkoutUrl }
```

### Screens / Targeting
```
GET    /screens/available?lat=&lng=&radiusKm=&city=&environment=&status=  → Screen[]
POST   /booking-drafts    { campaignId, screenIds[] }                     → BookingDraft
PATCH  /booking-drafts/:id { screenIds[] }                                → BookingDraft
POST   /bookings/confirm  { bookingDraftId }                              → Booking
```

### Billing
```
POST   /billing/checkout-session { campaignId, packId }      → { checkoutUrl, sessionId }
GET    /billing/subscription                                  → StripeSubscription
POST   /billing/portal-session                                → { portalUrl }
GET    /billing/invoices?page=&status=                        → PaginatedResponse<StripeInvoice>
```

### Analytics
```
GET    /analytics/campaigns/:id/summary                       → { impressions, screens, health }
GET    /analytics/campaigns/:id/timeseries?from=&to=&grain=   → { points: [{date,value}] }
GET    /analytics/campaigns/:id/by-trigger                    → { data: [{trigger,count}] }
GET    /analytics/campaigns/:id/by-screen                     → { data: [{screenId,name,count}] }
GET    /analytics/global/summary                              → { totalImpressions, activeCampaigns, ... }
```

### WebSocket Events
```
campaign.statusChanged    { campaignId, oldStatus, newStatus, reason? }
media.transcodeComplete   { mediaId, status, variants[] }
analytics.updated         { campaignId, newImpressions }
billing.paymentFailed     { subscriptionId, reason, nextRetry }
booking.updated           { bookingId, status }
```

---

## Optimistic Updates Plan
| Action | Optimistic behavior |
|--------|-------------------|
| Pause campaign | Immediately show PAUSED badge, revert on error |
| Resume campaign | Immediately show ACTIVE badge, revert on error |
| Delete draft | Remove from list immediately, restore on error |
| Upload media | Show uploading state with progress, rollback on failure |
| Update campaign name | Update in-place, revert on error |

---

## Testing Scenarios (E2E + Manual)

### Onboarding
- [ ] Create advertiser org with company info → org created
- [ ] Set billing (Stripe customer) → customer ID stored
- [ ] Invite team member with VIEWER role → invitation sent

### Campaign Wizard
- [ ] Create campaign: fill basics → next → upload valid 20s mp4 → next → select 50 screens → next → set triggers → next → review → submit
- [ ] Upload invalid media (45s video) → error "Duration must be 15-30s"
- [ ] Upload oversized file (>500MB) → error "File too large"
- [ ] Select more screens than pack limit → error "Maximum 300 screens"
- [ ] Save as draft and return later → draft preserved
- [ ] Edit submitted campaign → reverts to DRAFT

### Billing
- [ ] Submit campaign → redirected to Stripe Checkout
- [ ] Complete payment → campaign becomes ACTIVE
- [ ] Simulate payment failure → campaign auto-paused + notification
- [ ] Cancel subscription → campaigns end at period end
- [ ] View invoices → correct amounts and statuses

### Analytics
- [ ] Active campaign shows live impressions count
- [ ] Timeseries chart renders 30 days of data
- [ ] By-trigger breakdown shows correct proportions
- [ ] Screen going offline reduces delivery health score
- [ ] Global analytics aggregates across all campaigns

### Catalog
- [ ] Create catalog listing with all fields
- [ ] Preview shows TV-formatted display
- [ ] Invalid CTA link rejected (http:// only allows https://)

### Realtime
- [ ] Campaign status change appears without page refresh
- [ ] Media transcode completion updates UI
- [ ] Payment failure shows toast notification
- [ ] Disconnected WebSocket falls back to 30s polling

### Performance
- [ ] Map loads 10k screen markers with clustering < 2s
- [ ] Campaign list paginates and loads < 1s
- [ ] Wizard navigation is instant (client-side)

---

## File Creation Order (Implementation Sequence)

### Batch 1: Foundation (~25 files)
1. `package.json` — add all dependencies
2. `src/providers/query-provider.tsx`
3. `src/providers/auth-provider.tsx`
4. `src/providers/socket-provider.tsx`
5. `src/providers/index.tsx` — compose all
6. `src/lib/mock-data.ts`
7. `src/lib/api/query-keys.ts`
8. `src/lib/api/client.ts`
9. `src/lib/api/hooks/use-campaigns.ts`
10. `src/lib/api/hooks/use-media.ts`
11. `src/lib/api/hooks/use-screens.ts`
12. `src/lib/api/hooks/use-analytics.ts`
13. `src/lib/api/hooks/use-billing.ts`
14. `src/lib/api/hooks/use-ai.ts`
15. `src/components/layout/sidebar.tsx`
16. `src/components/layout/topbar.tsx`
17. `src/components/layout/dashboard-shell.tsx`
18. `src/components/common/page-header.tsx`
19. `src/components/common/empty-state.tsx`
20. `src/components/common/loading-state.tsx`
21. `src/components/common/error-state.tsx`
22. `src/components/common/status-badge.tsx`
23. `src/components/common/data-table.tsx`
24. `src/components/common/confirm-dialog.tsx`
25. `src/app/layout.tsx` — updated with providers
26. `src/app/(dashboard)/layout.tsx`
27. `src/app/(dashboard)/page.tsx`

### Batch 2: Campaigns + Media (~30 files)
28. `src/stores/campaign-wizard.store.ts`
29. `src/app/(dashboard)/campaigns/page.tsx`
30. `src/components/campaigns/campaign-filters.tsx`
31. `src/components/campaigns/campaign-card.tsx`
32. `src/components/campaigns/campaign-list.tsx`
33. `src/app/(dashboard)/campaigns/new/page.tsx`
34. `src/components/campaigns/wizard/wizard-shell.tsx`
35. `src/components/campaigns/wizard/wizard-steps.tsx`
36. `src/components/campaigns/wizard/step-basics.tsx`
37. `src/components/campaigns/wizard/step-media.tsx`
38. `src/components/campaigns/wizard/step-targeting.tsx`
39. `src/components/campaigns/wizard/step-schedule.tsx`
40. `src/components/campaigns/wizard/step-review.tsx`
41. `src/components/media/file-drop-zone.tsx`
42. `src/components/media/upload-progress.tsx`
43. `src/components/media/video-preview.tsx`
44. `src/app/(dashboard)/campaigns/[campaignId]/page.tsx`
45. `src/components/campaigns/campaign-detail.tsx`
46. `src/components/campaigns/campaign-overview-tab.tsx`
47. `src/components/campaigns/campaign-screens-tab.tsx`
48. `src/components/campaigns/campaign-activity-tab.tsx`
49. `src/app/(dashboard)/media-library/page.tsx`
50. `src/components/media/media-grid.tsx`
51. `src/components/media/media-detail-dialog.tsx`

### Batch 3: Map + Billing (~15 files)
52. `src/components/targeting/screen-map.tsx`
53. `src/components/targeting/screen-filters.tsx`
54. `src/components/targeting/screen-list.tsx`
55. `src/components/targeting/pack-selector.tsx`
56. `src/components/targeting/price-calculator.tsx`
57. `src/app/(dashboard)/billing/page.tsx`
58. `src/components/billing/subscription-card.tsx`
59. `src/components/billing/payment-status.tsx`
60. `src/app/(dashboard)/invoices/page.tsx`
61. `src/components/billing/invoice-table.tsx`

### Batch 4: Analytics + AI + Catalog (~20 files)
62. `src/app/(dashboard)/analytics/page.tsx`
63. `src/components/analytics/kpi-cards.tsx`
64. `src/components/analytics/impressions-chart.tsx`
65. `src/components/analytics/trigger-chart.tsx`
66. `src/components/analytics/screen-performance.tsx`
67. `src/app/(dashboard)/analytics/[campaignId]/page.tsx`
68. `src/app/(dashboard)/ai-generator/page.tsx`
69. `src/components/ai/prompt-input.tsx`
70. `src/components/ai/credit-widget.tsx`
71. `src/components/ai/generation-preview.tsx`
72. `src/app/(dashboard)/catalog/page.tsx`
73. `src/app/(dashboard)/catalog/new/page.tsx`
74. `src/components/catalog/listing-form.tsx`
75. `src/components/catalog/listing-card.tsx`
76. `src/components/catalog/tv-preview.tsx`
77. `src/app/(dashboard)/settings/page.tsx`
78. `src/components/settings/org-settings.tsx`
79. `src/components/settings/team-members.tsx`
80. `src/app/(dashboard)/onboarding/page.tsx`
81. `src/components/onboarding/onboarding-wizard.tsx`

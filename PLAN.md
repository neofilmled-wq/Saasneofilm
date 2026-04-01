# NEOFILM Partner Dashboard — Implementation Plan

## Overview

Build the complete Partner Dashboard in `apps/web-partner/` (Next.js 15, App Router).
All code goes under `apps/web-partner/src/`. Reuse existing `@neofilm/ui` components, `@neofilm/shared` types/DTOs/API client, and `@neofilm/auth` hooks.

---

## PHASE 1: Foundation (Dependencies, Providers, Layout Shell, Mock Data)

### 1.1 Install Dependencies

```bash
pnpm --filter @neofilm/web-partner add @tanstack/react-query react-hook-form @hookform/resolvers zod socket.io-client lucide-react recharts date-fns next-auth@5.0.0-beta.30 @neofilm/auth
```

### 1.2 New Files

| File | Purpose |
|------|---------|
| `src/lib/api-client.ts` | Singleton `NeoFilmApiClient` instance for partner app, reads token from NextAuth session |
| `src/lib/query-client.ts` | TanStack Query client config (staleTime, retry, refetchOnWindowFocus) |
| `src/lib/query-keys.ts` | Centralized React Query key factory: `queryKeys.screens.list(filters)`, `queryKeys.screens.detail(id)`, `queryKeys.sites.list()`, `queryKeys.alerts.list()`, `queryKeys.revenue.summary(period)`, `queryKeys.payouts.list(period)`, etc. |
| `src/lib/socket.ts` | Socket.IO client singleton with auto-reconnect, exports `useSocket()` hook and event helpers. Channel: `/ws/partner/{partnerOrgId}` |
| `src/lib/mock-data.ts` | Complete mock data generators for all entities (screens, devices, sites, alerts, revenue, payouts) — used for development before backend is ready |
| `src/lib/utils.ts` | App-specific utility functions (formatDate, formatCurrency re-export, getStatusColor, getHealthScore) |
| `src/providers/query-provider.tsx` | `'use client'` — wraps app with `QueryClientProvider` |
| `src/providers/socket-provider.tsx` | `'use client'` — wraps app with Socket.IO context, manages connection lifecycle |
| `src/providers/auth-provider.tsx` | `'use client'` — wraps app with `SessionProvider` from next-auth |
| `src/components/layout/sidebar.tsx` | Main sidebar navigation: Dashboard, Sites, Screens, Map, Alerts, Revenue, Payouts, Settings. Active route highlighting. Collapsible on mobile. |
| `src/components/layout/header.tsx` | Top header: breadcrumbs, org name, notifications bell, user avatar dropdown |
| `src/components/layout/mobile-nav.tsx` | Mobile bottom nav / hamburger menu |
| `src/components/ui/page-header.tsx` | Reusable page header (title + description + action buttons) |
| `src/components/ui/empty-state.tsx` | Reusable empty state (icon + message + CTA) |
| `src/components/ui/loading-state.tsx` | Reusable loading skeleton wrapper |
| `src/components/ui/error-state.tsx` | Reusable error state with retry button |
| `src/components/ui/data-table.tsx` | Generic data table with sorting, filtering, pagination (wraps `@neofilm/ui` Table) |
| `src/components/ui/stat-card.tsx` | KPI card for dashboards (value + label + trend + icon) |
| `src/components/ui/status-badge.tsx` | Colored badge for screen/device/alert status |
| `src/components/ui/confirm-dialog.tsx` | Reusable confirmation dialog |
| `src/hooks/use-partner-org.ts` | Hook to get current partner org ID and info from session |
| `src/hooks/use-org-permissions.ts` | Hook extending `usePermissions()` with org-role-specific checks (canEditScreens, canPair, canViewRevenue, etc.) based on OrgRole RBAC matrix |

### 1.3 Modify Files

| File | Changes |
|------|---------|
| `src/app/layout.tsx` | Wrap children with `AuthProvider` > `QueryProvider` > `SocketProvider`. Add Inter font. |
| `src/app/page.tsx` | Redirect to `/partner/screens` (or `/partner/onboarding` if not onboarded) |
| `next.config.ts` | Add `@neofilm/auth` to `transpilePackages` |
| `package.json` | Dependencies added (step 1.1) |

### 1.4 Create Partner Layout

| File | Purpose |
|------|---------|
| `src/app/partner/layout.tsx` | Partner layout with sidebar + header + main content area. Auth guard. |

---

## PHASE 2: Sites Management

### New Files

| File | Purpose |
|------|---------|
| `src/hooks/use-sites.ts` | React Query hooks: `useSites()`, `useCreateSite()`, `useUpdateSite()`, `useDeleteSite()` |
| `src/app/partner/sites/page.tsx` | Sites list page — table of sites with screenCount, city, actions |
| `src/app/partner/sites/loading.tsx` | Loading skeleton |
| `src/components/sites/site-list.tsx` | Sites table component |
| `src/components/sites/create-site-dialog.tsx` | Dialog form: name, address, city, timezone, category |
| `src/components/sites/edit-site-dialog.tsx` | Edit dialog with pre-filled form |

### API Calls
- `GET /partners/{orgId}/venues` → `useSites()`
- `POST /partners/{orgId}/venues` → `useCreateSite()`
- `PATCH /partners/{orgId}/venues/{id}` → `useUpdateSite()`
- `DELETE /partners/{orgId}/venues/{id}` → `useDeleteSite()`

---

## PHASE 3: Screen Management (CRUD + List + Detail)

### New Files

| File | Purpose |
|------|---------|
| `src/hooks/use-screens.ts` | React Query hooks: `useScreens(filters)`, `useScreen(id)`, `useCreateScreen()`, `useUpdateScreen()`, `useDeleteScreen()` |
| `src/types/screen.types.ts` | Extended screen types for the dashboard (ScreenWithStatus, ScreenFilters, etc.) |
| `src/app/partner/screens/page.tsx` | Screens list — filterable table with status badges, site filter, search |
| `src/app/partner/screens/loading.tsx` | Skeleton |
| `src/app/partner/screens/new/page.tsx` | Add new screen form (multi-step: basic info → location → config) |
| `src/app/partner/screens/[screenId]/page.tsx` | Screen detail page — tabs (Overview / Health / History / Config) |
| `src/app/partner/screens/[screenId]/loading.tsx` | Skeleton |
| `src/app/partner/screens/[screenId]/layout.tsx` | Sub-layout with screen header + tab nav for nested pages |
| `src/components/screens/screen-list.tsx` | Table component with columns: name, site, status, device, health, revenue, lastSeen |
| `src/components/screens/screen-filters.tsx` | Filter bar: site dropdown, status toggle, search input, sort |
| `src/components/screens/screen-form.tsx` | React Hook Form for screen creation/edit (name, siteId, address, GPS, type, brand) |
| `src/components/screens/screen-detail-overview.tsx` | Overview tab: KPI cards + live status + device info |
| `src/components/screens/screen-detail-health.tsx` | Health tab: uptime chart, errors timeline, metrics |
| `src/components/screens/screen-detail-history.tsx` | History tab: diffusion logs, config changes |
| `src/components/screens/screen-status-indicator.tsx` | Real-time status dot with tooltip |

### API Calls
- `GET /partners/screens?siteId=&status=&page=&limit=` → `useScreens(filters)`
- `GET /partners/screens/{id}` → `useScreen(id)`
- `POST /partners/screens` → `useCreateScreen()`
- `PATCH /partners/screens/{id}` → `useUpdateScreen()`

---

## PHASE 4: Device Pairing Wizard

### New Files

| File | Purpose |
|------|---------|
| `src/hooks/use-device-pairing.ts` | React Query mutations: `useStartPairing()`, `useConfirmPairing()`, `useRevokeDevice()`, `useDeviceStatus(deviceId)` |
| `src/app/partner/screens/[screenId]/pairing/page.tsx` | Pairing wizard page |
| `src/components/pairing/pairing-wizard.tsx` | Multi-step wizard container (step state machine) |
| `src/components/pairing/step-select-type.tsx` | Step 1: Choose device type (Android stick / Smart TV app) |
| `src/components/pairing/step-instructions.tsx` | Step 2: Display instructions + QR code / PIN |
| `src/components/pairing/step-waiting.tsx` | Step 3: Waiting for device to connect (polling + WS) |
| `src/components/pairing/step-success.tsx` | Step 4: Pairing confirmed, link to live preview |
| `src/components/pairing/device-status-card.tsx` | Current device info card (serial, version, paired date) |
| `src/components/pairing/revoke-device-dialog.tsx` | Confirmation dialog for revoking device |
| `src/components/pairing/replace-device-dialog.tsx` | Dialog for replacing device on screen |

### API Calls
- `POST /devices/pair/start` → `useStartPairing()` — returns `{ pairingToken, qrCodeUrl, pin }`
- `POST /devices/pair/confirm` → `useConfirmPairing()` — confirms pairing after device connects
- `POST /devices/revoke` → `useRevokeDevice()`
- `GET /devices/{id}/status` → `useDeviceStatus(id)` — polls every 5s during pairing

### WS Events
- `screen.configApplied` — pairing confirmed by device

---

## PHASE 5: Real-time Monitoring + Live Map

### New Files

| File | Purpose |
|------|---------|
| `src/hooks/use-realtime-status.ts` | Hook that subscribes to WS events (`screen.online`, `screen.offline`, `screen.degraded`, `screen.error`) and updates React Query cache |
| `src/hooks/use-screen-live-status.ts` | React Query hook for `ScreenLiveStatus` with short staleTime (10s) as polling fallback |
| `src/app/partner/map/page.tsx` | Full-screen map page |
| `src/app/partner/map/loading.tsx` | Map loading state |
| `src/components/map/screen-map.tsx` | Map component (Mapbox GL JS): markers with status colors, clustering, fly-to |
| `src/components/map/screen-marker.tsx` | Custom map marker with status color |
| `src/components/map/screen-map-drawer.tsx` | Side drawer when clicking a marker: screen info, status, quick actions |
| `src/components/map/map-filters.tsx` | Filter controls on map (by site, by status) |
| `src/components/monitoring/live-status-panel.tsx` | Panel showing: current state, last heartbeat, app version, errors, network quality |
| `src/components/monitoring/health-score.tsx` | Visual health score: uptime 24h, error count, heartbeat freshness → score 0-100 |
| `src/components/monitoring/uptime-chart.tsx` | Recharts area chart for 24h uptime |

### Realtime Strategy
- **Primary**: Socket.IO connection to `/ws/partner/{partnerOrgId}`
- **Fallback**: React Query polling every 30s for screen statuses
- **Cache update**: WS events trigger `queryClient.setQueryData()` to update screen status in-place
- **Reconnection**: Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s)

### WS Events Handled
- `screen.online` → update screen status to ONLINE, green marker
- `screen.offline` → update to OFFLINE, red marker
- `screen.degraded` → update to DEGRADED, yellow marker
- `screen.error` → update to ERROR, red pulsing marker

---

## PHASE 6: UX Settings + Split-Screen Control

### New Files

| File | Purpose |
|------|---------|
| `src/hooks/use-ux-config.ts` | React Query hooks: `useUxConfig(screenId)`, `useUpdateUxConfig()`, `usePushConfig()` |
| `src/app/partner/screens/[screenId]/ux-settings/page.tsx` | UX settings page |
| `src/app/partner/screens/[screenId]/split-screen/page.tsx` | Split-screen config page |
| `src/components/ux-settings/ux-config-form.tsx` | Form: catalog toggle, default home section, language, theme, ad frequency |
| `src/components/ux-settings/config-version-status.tsx` | Shows "current on device" vs "pending update" with diff |
| `src/components/ux-settings/push-config-button.tsx` | Button to push config to device instantly |
| `src/components/split-screen/split-screen-form.tsx` | Form: enable/disable, zone width (25/30/35%), ad position |
| `src/components/split-screen/display-rules-editor.tsx` | Per-trigger rules: power_on, open_app, change_app, catalog_open |
| `src/components/split-screen/split-screen-preview.tsx` | Visual preview of TV layout with configurable ad zone |
| `src/components/split-screen/device-preview-button.tsx` | Send "test overlay" command to live device |

### API Calls
- `GET /partners/screens/{id}/ux-config` → `useUxConfig(id)`
- `PATCH /partners/screens/{id}/ux-config` → `useUpdateUxConfig()`
- `POST /devices/{id}/command/push-config` → `usePushConfig()`

---

## PHASE 7: Incident Alerts Center

### New Files

| File | Purpose |
|------|---------|
| `src/hooks/use-alerts.ts` | React Query hooks: `useAlerts(filters)`, `useAcknowledgeAlert()`, `useResolveAlert()` |
| `src/hooks/use-device-commands.ts` | Mutations: `useRebootDevice()`, `useClearCache()`, `usePushConfig()`, `useRequestLogs()` |
| `src/types/alert.types.ts` | Alert types: AlertSeverity (info/warning/critical), AlertStatus (open/acknowledged/resolved), AlertType (offline, crash, missing_media, cache_failure, storage_full, ota_failed) |
| `src/app/partner/alerts/page.tsx` | Alerts center page |
| `src/app/partner/alerts/loading.tsx` | Skeleton |
| `src/components/alerts/alert-list.tsx` | Filterable alert list with severity icons, timestamps, screen name |
| `src/components/alerts/alert-filters.tsx` | Filter: severity, status, screen, date range |
| `src/components/alerts/alert-detail-drawer.tsx` | Side drawer: alert info, timeline, actions |
| `src/components/alerts/alert-timeline.tsx` | Visual timeline: opened → acknowledged → resolved |
| `src/components/alerts/alert-actions.tsx` | Action buttons: acknowledge, resolve, reboot, push config, clear cache, request logs |
| `src/components/alerts/alert-severity-badge.tsx` | Colored badge for severity |

### API Calls
- `GET /partners/alerts?severity=&status=&screenId=` → `useAlerts(filters)`
- `PATCH /partners/alerts/{id}/acknowledge` → `useAcknowledgeAlert()`
- `PATCH /partners/alerts/{id}/resolve` → `useResolveAlert()`
- `POST /devices/{id}/command/reboot` → `useRebootDevice()`
- `POST /devices/{id}/command/clear-cache` → `useClearCache()`
- `POST /devices/{id}/command/push-config` → `usePushConfig()`
- `POST /devices/{id}/command/request-logs` → `useRequestLogs()`

### WS Events
- `alert.created` → prepend to alerts list, show toast notification

---

## PHASE 8: Revenue Dashboard + Payouts

### New Files

| File | Purpose |
|------|---------|
| `src/hooks/use-revenue.ts` | React Query hooks: `useRevenueSummary(period)`, `useRevenueByScreen(period)`, `useRevenueBySite(period)` |
| `src/hooks/use-payouts.ts` | React Query hooks: `usePayouts(period)`, `usePayoutDetail(id)` |
| `src/app/partner/revenue/page.tsx` | Revenue dashboard page |
| `src/app/partner/revenue/loading.tsx` | Skeleton |
| `src/app/partner/payouts/page.tsx` | Payouts history page |
| `src/app/partner/payouts/loading.tsx` | Skeleton |
| `src/components/revenue/revenue-summary-cards.tsx` | KPI row: monthly revenue, confirmed payouts, retrocession rate, active screens |
| `src/components/revenue/revenue-chart.tsx` | Recharts bar/line chart: monthly revenue trend |
| `src/components/revenue/revenue-by-site-table.tsx` | Breakdown table: site name, screens count, revenue, retrocession |
| `src/components/revenue/revenue-by-screen-table.tsx` | Breakdown table: screen name, site, bookings, revenue |
| `src/components/revenue/period-selector.tsx` | Month/year selector for revenue period |
| `src/components/revenue/export-button.tsx` | CSV export button |
| `src/components/revenue/calculation-transparency.tsx` | Expandable section showing: subscriptions, unit prices, retrocession % |
| `src/components/payouts/payout-list.tsx` | Table: date, amount, status, reference |
| `src/components/payouts/payout-detail-dialog.tsx` | Dialog: payout breakdown with linked revenue shares |

### API Calls
- `GET /revenues/summary?period=YYYY-MM` → `useRevenueSummary(period)`
- `GET /revenues/by-screen?period=YYYY-MM` → `useRevenueByScreen(period)`
- `GET /revenues/by-site?period=YYYY-MM` → `useRevenueBySite(period)`
- `GET /payouts?period=YYYY-MM` → `usePayouts(period)`

### WS Events
- `payout.updated` → invalidate payouts query

---

## PHASE 9: Onboarding Wizard

### New Files

| File | Purpose |
|------|---------|
| `src/app/partner/onboarding/page.tsx` | Full-screen onboarding wizard (no sidebar) |
| `src/app/partner/onboarding/layout.tsx` | Clean layout without sidebar for onboarding |
| `src/components/onboarding/onboarding-wizard.tsx` | Multi-step wizard: Welcome → Org Info → Payout Info → Add Sites → Invite Team → Complete |
| `src/components/onboarding/step-org-info.tsx` | Form: org name, contact email, phone, address, SIRET, VAT |
| `src/components/onboarding/step-payout-info.tsx` | Form: Stripe Connect onboarding (IBAN, business info) |
| `src/components/onboarding/step-add-sites.tsx` | Add 1+ sites with address, timezone, category |
| `src/components/onboarding/step-invite-team.tsx` | Invite team members by email (optional, skip-able) |
| `src/components/onboarding/step-complete.tsx` | Success screen with next steps |
| `src/components/onboarding/onboarding-progress.tsx` | Step progress indicator |

---

## PHASE 10: Settings Page

### New Files

| File | Purpose |
|------|---------|
| `src/app/partner/settings/page.tsx` | Settings page with tabs: Organization / Billing / Team |
| `src/components/settings/org-settings-form.tsx` | Edit org profile (name, contact, address) |
| `src/components/settings/billing-settings.tsx` | Payout settings: Stripe Connect status, IBAN, commission rate display |
| `src/components/settings/team-management.tsx` | Team members list with roles, invite button |
| `src/components/settings/invite-member-dialog.tsx` | Invite by email + role selection |
| `src/components/settings/edit-member-role-dialog.tsx` | Change member role |

---

## PHASE 11: RBAC Integration

### Permission Matrix (OrgRole → Actions)

| Action | OWNER | ADMIN | MANAGER | MEMBER | VIEWER |
|--------|-------|-------|---------|--------|--------|
| Create/edit screens | Yes | Yes | Yes | No | No |
| Delete screens | Yes | Yes | No | No | No |
| Pair/revoke devices | Yes | Yes | Yes | No | No |
| Remote commands (reboot, etc.) | Yes | Yes | Yes | Yes | No |
| UX settings | Yes | Yes | Yes | No | No |
| View revenue/payouts | Yes | Yes | Yes | No | No |
| Export revenue data | Yes | Yes | No | No | No |
| Team management | Yes | Yes | No | No | No |
| Org settings | Yes | Yes | No | No | No |
| Billing/payout settings | Yes | No | No | No | No |
| View screens/map/alerts | Yes | Yes | Yes | Yes | Yes |

### Implementation
- Extend `use-org-permissions.ts` with the full matrix
- Wrap action buttons with `<RoleGuard>` or use `useOrgPermissions().canEditScreens` to conditionally render/disable
- Sidebar nav items hidden based on permissions
- API-level RBAC enforced by backend (frontend is UX-only guard)

---

## React Query Key Structure

```typescript
export const queryKeys = {
  sites: {
    all: ['sites'] as const,
    list: (orgId: string) => ['sites', 'list', orgId] as const,
    detail: (id: string) => ['sites', 'detail', id] as const,
  },
  screens: {
    all: ['screens'] as const,
    list: (filters: ScreenFilters) => ['screens', 'list', filters] as const,
    detail: (id: string) => ['screens', 'detail', id] as const,
    liveStatus: (id: string) => ['screens', 'liveStatus', id] as const,
    uxConfig: (id: string) => ['screens', 'uxConfig', id] as const,
  },
  devices: {
    status: (id: string) => ['devices', 'status', id] as const,
  },
  alerts: {
    all: ['alerts'] as const,
    list: (filters: AlertFilters) => ['alerts', 'list', filters] as const,
  },
  revenue: {
    summary: (period: string) => ['revenue', 'summary', period] as const,
    byScreen: (period: string) => ['revenue', 'byScreen', period] as const,
    bySite: (period: string) => ['revenue', 'bySite', period] as const,
  },
  payouts: {
    list: (period: string) => ['payouts', 'list', period] as const,
    detail: (id: string) => ['payouts', 'detail', id] as const,
  },
} as const;
```

---

## Socket.IO Event Handling Pattern

```
// In socket-provider.tsx:
// 1. Connect to /ws/partner/{orgId} on mount
// 2. On screen.online/offline/degraded/error → queryClient.setQueryData() to update cached screen
// 3. On alert.created → queryClient.invalidateQueries(['alerts']) + show toast
// 4. On payout.updated → queryClient.invalidateQueries(['payouts'])
// 5. On screen.configApplied → update uxConfig cache + show toast
// 6. Polling fallback: if WS disconnected > 30s, enable React Query refetchInterval on critical queries
```

---

## File Count Summary

| Category | Count |
|----------|-------|
| Pages (route files) | ~20 |
| Components | ~55 |
| Hooks | ~12 |
| Lib/utils | ~6 |
| Providers | ~3 |
| Types | ~3 |
| **Total new files** | **~99** |

---

## Build Order

Each phase is independently testable:
1. **Phase 1** → App shell works, sidebar navigates, empty states show
2. **Phase 2** → Can CRUD sites with mock data
3. **Phase 3** → Can list/view/create screens
4. **Phase 4** → Can walk through pairing wizard
5. **Phase 5** → Map shows markers, live status updates
6. **Phase 6** → Can configure TV UX remotely
7. **Phase 7** → Can view and manage alerts
8. **Phase 8** → Revenue charts and payout tables work
9. **Phase 9** → Full onboarding flow works
10. **Phase 10** → Settings page editable
11. **Phase 11** → Actions hidden/disabled based on role

# Admin Cockpit — How to Run & Test

## Prerequisites

- Docker (for PostgreSQL + Redis)
- Node.js 20+
- pnpm 10+

## Quick Start

```bash
# 1. Start infrastructure
docker compose up -d

# 2. Install dependencies
pnpm install

# 3. Generate Prisma client & run migration
pnpm --filter @neofilm/database exec npx prisma generate
pnpm --filter @neofilm/database exec npx prisma migrate deploy
# OR for dev: pnpm --filter @neofilm/database exec npx prisma db push

# 4. Seed database
pnpm --filter @neofilm/database exec npx prisma db seed

# 5. Start API
pnpm --filter @neofilm/api run dev

# 6. Start web-admin
pnpm --filter @neofilm/web-admin run dev

# 7. Open http://localhost:3000
# Login: admin@neofilm.com / Password123!
```

## Running E2E Tests

```bash
# Install Playwright browsers (first time only)
cd apps/web-admin && npx playwright install chromium

# Run tests (starts servers automatically if not running)
cd apps/web-admin && npx playwright test

# Run with UI
cd apps/web-admin && npx playwright test --ui

# Run specific test
cd apps/web-admin && npx playwright test -g "should login"
```

## What Was Built

### Backend (packages/api)

| Endpoint | Method | RBAC | Description |
|----------|--------|------|-------------|
| `/admin/users` | GET | ADMIN+ | Search/list users (q, page, platformRole) |
| `/admin/users` | POST | ADMIN+ | Create platform user |
| `/admin/users/:id` | PATCH | ADMIN+ | Update user status |
| `/admin/users/:id/reset-password` | POST | ADMIN+ | Generate temp password |
| `/admin/users/:id/suspend` | POST | ADMIN+ | Suspend user |
| `/admin/users/:id/activate` | POST | ADMIN+ | Activate user |
| `/admin/users/:id` | DELETE | SUPER_ADMIN | Soft-delete user |
| `/admin/settings` | GET | ADMIN+ | Get platform settings |
| `/admin/settings` | PATCH | ADMIN+ | Update settings |
| `/admin/blackouts` | GET | ADMIN+ | List schedule blackouts |
| `/admin/blackouts` | POST | ADMIN+ | Create blackout |
| `/admin/blackouts/:id` | DELETE | ADMIN+ | Delete blackout |
| `/admin/campaigns/:id/approve` | POST | ADMIN+ | Approve campaign |
| `/admin/campaigns/:id/reject` | POST | ADMIN+ | Reject campaign with reason |
| `/admin/analytics` | GET | SUPPORT+ | Analytics with date/org filters |
| `/admin/invoices/export` | GET | ADMIN+ | CSV export |

Pre-existing endpoints used for CRUD:
- `/organizations` (GET/POST/PATCH/DELETE)
- `/campaigns` (GET/POST/PATCH/:id/status)
- `/screens` (GET/PATCH)
- `/invoices` (GET/PATCH/:id/status)
- `/schedules` (GET)
- `/dashboard/summary`, `/dashboard/partners`, `/dashboard/advertisers`, `/dashboard/screens`

### Frontend (apps/web-admin)

| Page | Features |
|------|----------|
| `/admin/users` | Full CRUD: create, edit, search, suspend/activate, reset password, delete |
| `/admin/partners` | Create/edit/delete partners, detail page with screens/members/revenue tabs |
| `/admin/partners/[id]` | Partner detail: screens table, members table, revenue summary |
| `/admin/advertisers` | Create/edit/delete advertisers, detail page |
| `/admin/advertisers/[id]` | Advertiser detail: campaigns, members, AI credits tabs |
| `/admin/campaigns` | Status filters, approve/reject/pause/resume, detail link |
| `/admin/campaigns/[id]` | Campaign detail: info, creatives grid, targeting, screens tabs |
| `/admin/devices` | Real-time status + row actions (link to detail, enable/disable) |
| `/admin/screens/[id]` | Screen detail: live status, devices, schedules |
| `/admin/live-map` | Leaflet map with real-time markers, filters (status/partner/city/search) |
| `/admin/schedules` | Schedule grids + blackout CRUD |
| `/admin/invoices` | Live API data, status filters, mark paid/unpaid, CSV export |
| `/admin/analytics` | API-driven charts, date/org filters, recharts bar chart |
| `/admin/settings` | Persisted settings (platform name, email, commission) |

### Database Changes

- `PlatformSetting` model (key-value store for admin settings)
- `ScheduleBlackout` model (global or per-screen blackout windows)
- Migration: `20260226_admin_cockpit`
- Seed: +1 PENDING_REVIEW campaign, platform settings, sample blackout

## Manual Test Checklist

### Users Page (`/admin/users`)
- [ ] Page loads with real users from DB
- [ ] Search filters by name/email (server-side, debounced)
- [ ] "Nouvel utilisateur" button opens modal
- [ ] Create user with auto-generated password → shows temp password in toast
- [ ] Create user with manual password
- [ ] Edit user (name, role, status) via row dropdown → "Modifier"
- [ ] Reset password → shows new temp password
- [ ] Suspend user → badge changes to "Suspendu"
- [ ] Activate suspended user → badge changes to "Actif"
- [ ] Delete user (SUPER_ADMIN only) → confirmation dialog
- [ ] Pagination works for large user lists

### Partners Page (`/admin/partners`)
- [ ] Lists all PARTNER orgs from DB
- [ ] "Ajouter partenaire" creates new org with type=PARTNER
- [ ] Row dropdown → "Voir" navigates to detail page
- [ ] Row dropdown → "Modifier" opens edit dialog
- [ ] Row dropdown → "Supprimer" with confirmation
- [ ] Detail page shows screens, members, revenue tabs
- [ ] Edit from detail page works

### Advertisers Page (`/admin/advertisers`)
- [ ] Lists all ADVERTISER orgs from DB
- [ ] Create, edit, delete work correctly
- [ ] Detail page shows campaigns, members, AI credits tabs

### Campaigns Page (`/admin/campaigns`)
- [ ] Lists all campaigns with status badges
- [ ] Status filter buttons work (Tous/Brouillon/En attente/etc.)
- [ ] Approve PENDING_REVIEW campaign → status changes to APPROVED
- [ ] Reject with reason → stores reviewNotes
- [ ] Pause ACTIVE campaign / Resume PAUSED campaign
- [ ] Campaign detail page shows all tabs (info, creatives, targeting, screens)

### Devices / Screens (`/admin/devices`)
- [ ] Real-time status updates via WebSocket
- [ ] Row actions: view detail, enable/disable
- [ ] Screen detail page shows live status card, devices table

### Live Map (`/admin/live-map`)
- [ ] Map loads with OpenStreetMap tiles
- [ ] Markers appear at correct lat/lng positions
- [ ] Green markers = online, Red = offline, Grey = disabled
- [ ] Popup shows screen info (partner, city, CPU/RAM, last heartbeat)
- [ ] Popup buttons: "Détails" links to screen detail, "Désactiver" works
- [ ] Filters: status, partner, city, search all work
- [ ] Real-time marker updates via WebSocket

### Schedules (`/admin/schedules`)
- [ ] Grilles tab shows schedule list
- [ ] Blackouts tab shows blackout list
- [ ] Create blackout (global or per-screen) works
- [ ] Delete blackout works

### Invoices (`/admin/invoices`)
- [ ] Lists invoices from DB (not mock data)
- [ ] Status filter tabs work
- [ ] Mark paid / mark unpaid toggles status
- [ ] Invoice detail dialog shows full info
- [ ] CSV export downloads file

### Analytics (`/admin/analytics`)
- [ ] Stat cards show real data from API
- [ ] Date range filter updates chart
- [ ] Partner/advertiser filter works
- [ ] Bar chart renders daily events
- [ ] Top campaigns list shows progress bars

### Settings (`/admin/settings`)
- [ ] Fields pre-fill from DB (platformName, supportEmail, defaultCommission)
- [ ] Save persists to DB
- [ ] Reload shows saved values

### RBAC
- [ ] SUPPORT role can read but cannot create/delete
- [ ] ADMIN role can CRUD but cannot delete users
- [ ] SUPER_ADMIN can do everything

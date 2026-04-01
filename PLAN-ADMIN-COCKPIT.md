# NEOFILM SAAS — Global Admin Cockpit Architecture

> Enterprise-grade NOC dashboard for 100k+ screens, real-time diffusion monitoring,
> multi-partner revenue distribution, fraud detection, and fleet operations.

---

## Table of Contents

1. [Admin Roles & Permissions (RBAC)](#1-admin-roles--permissions-rbac)
2. [Global Overview Dashboard](#2-global-overview-dashboard)
3. [Real-Time Screen Monitoring](#3-real-time-screen-monitoring)
4. [Campaign Supervision & Override](#4-campaign-supervision--override)
5. [Revenue & Financial Control](#5-revenue--financial-control)
6. [Incident Management System](#6-incident-management-system)
7. [Fraud & Anomaly Monitoring](#7-fraud--anomaly-monitoring)
8. [System Health & Observability](#8-system-health--observability)
9. [Data Pipeline Architecture](#9-data-pipeline-architecture)
10. [Testing & Real-World Scenarios](#10-testing--real-world-scenarios)

---

## 1. Admin Roles & Permissions (RBAC)

### 1.1 Role Definitions

The platform extends the existing `PlatformRole` enum (SUPER_ADMIN, ADMIN, SUPPORT) with
two additional admin-cockpit roles. The Prisma schema already supports nullable `platformRole`
on User. We add:

```prisma
enum PlatformRole {
  SUPER_ADMIN       // Full access — finance, fraud overrides, system config
  ADMIN             // Maps to PLATFORM_ADMIN — screens, campaigns, incidents, partner mgmt
  SUPPORT           // Maps to SUPPORT_AGENT — troubleshooting, device logs, limited finance
  FINANCE_ADMIN     // NEW — revenue, payouts, reconciliation, exports
  READ_ONLY_AUDITOR // NEW — view-only access to all data
}
```

### 1.2 Full Permission Matrix

| Resource / Action                    | SUPER_ADMIN | PLATFORM_ADMIN | FINANCE_ADMIN | SUPPORT_AGENT | READ_ONLY_AUDITOR |
|--------------------------------------|:-----------:|:--------------:|:-------------:|:-------------:|:-----------------:|
| **Dashboard**                        |             |                |               |               |                   |
| View executive dashboard             | ✅          | ✅             | ✅            | ✅            | ✅                |
| View financial KPIs                  | ✅          | ✅             | ✅            | ❌            | ✅                |
| View system health                   | ✅          | ✅             | ❌            | ✅            | ✅                |
| **Screens**                          |             |                |               |               |                   |
| List / search all screens            | ✅          | ✅             | ❌            | ✅            | ✅                |
| View screen detail                   | ✅          | ✅             | ❌            | ✅            | ✅                |
| Create / edit screen                 | ✅          | ✅             | ❌            | ❌            | ❌                |
| Decommission screen                  | ✅          | ✅             | ❌            | ❌            | ❌                |
| Remote reboot device                 | ✅          | ✅             | ❌            | ✅            | ❌                |
| Push config / clear cache            | ✅          | ✅             | ❌            | ✅            | ❌                |
| Force test ad                        | ✅          | ✅             | ❌            | ✅            | ❌                |
| Block screen                         | ✅          | ✅             | ❌            | ❌            | ❌                |
| **Campaigns**                        |             |                |               |               |                   |
| List / search all campaigns          | ✅          | ✅             | ✅ (read)     | ✅ (read)     | ✅                |
| View campaign detail                 | ✅          | ✅             | ✅            | ✅            | ✅                |
| Approve / reject campaign            | ✅          | ✅             | ❌            | ❌            | ❌                |
| Pause / resume campaign              | ✅          | ✅             | ❌            | ❌            | ❌                |
| Force override diffusion             | ✅          | ✅             | ❌            | ❌            | ❌                |
| Block campaign from region           | ✅          | ✅             | ❌            | ❌            | ❌                |
| **Partners & Advertisers**           |             |                |               |               |                   |
| List / search organizations          | ✅          | ✅             | ✅ (read)     | ✅ (read)     | ✅                |
| Create / edit organization           | ✅          | ✅             | ❌            | ❌            | ❌                |
| Freeze / unfreeze account            | ✅          | ✅             | ❌            | ❌            | ❌                |
| View org members                     | ✅          | ✅             | ❌            | ✅            | ✅                |
| **Finance**                          |             |                |               |               |                   |
| View revenue dashboards              | ✅          | ❌             | ✅            | ❌            | ✅                |
| View subscription details            | ✅          | ❌             | ✅            | ❌            | ✅                |
| Approve payout                       | ✅          | ❌             | ✅            | ❌            | ❌                |
| Hold / release payout                | ✅          | ❌             | ✅            | ❌            | ❌                |
| Trigger reconciliation               | ✅          | ❌             | ✅            | ❌            | ❌                |
| Export financial data (CSV)          | ✅          | ❌             | ✅            | ❌            | ❌                |
| Issue refund                         | ✅          | ❌             | ✅            | ❌            | ❌                |
| Edit revenue rules                   | ✅          | ❌             | ❌            | ❌            | ❌                |
| **Fraud**                            |             |                |               |               |                   |
| View fraud dashboard                 | ✅          | ✅             | ✅            | ❌            | ✅                |
| Freeze payout (fraud)               | ✅          | ❌             | ✅            | ❌            | ❌                |
| Override fraud flag                  | ✅          | ❌             | ❌            | ❌            | ❌                |
| **Incidents**                        |             |                |               |               |                   |
| View incidents                       | ✅          | ✅             | ❌            | ✅            | ✅                |
| Create incident                      | ✅          | ✅             | ❌            | ✅            | ❌                |
| Acknowledge / assign incident        | ✅          | ✅             | ❌            | ✅            | ❌                |
| Resolve / close incident             | ✅          | ✅             | ❌            | ❌            | ❌                |
| **System**                           |             |                |               |               |                   |
| View observability dashboard         | ✅          | ✅             | ❌            | ✅            | ✅                |
| Manage platform settings             | ✅          | ❌             | ❌            | ❌            | ❌                |
| View audit logs                      | ✅          | ✅             | ✅            | ❌            | ✅                |
| Export audit logs                    | ✅          | ❌             | ✅            | ❌            | ❌                |
| Manage admin users                   | ✅          | ❌             | ❌            | ❌            | ❌                |

### 1.3 Backend Enforcement

#### Permission Guard Implementation

```typescript
// packages/api/src/auth/decorators/permissions.decorator.ts
export enum AdminPermission {
  // Dashboard
  DASHBOARD_VIEW           = 'dashboard:view',
  DASHBOARD_FINANCE        = 'dashboard:finance',
  DASHBOARD_SYSTEM         = 'dashboard:system',

  // Screens
  SCREEN_LIST              = 'screen:list',
  SCREEN_DETAIL            = 'screen:detail',
  SCREEN_WRITE             = 'screen:write',
  SCREEN_DECOMMISSION      = 'screen:decommission',
  SCREEN_REMOTE_CMD        = 'screen:remote_cmd',
  SCREEN_BLOCK             = 'screen:block',

  // Campaigns
  CAMPAIGN_LIST            = 'campaign:list',
  CAMPAIGN_DETAIL          = 'campaign:detail',
  CAMPAIGN_APPROVE         = 'campaign:approve',
  CAMPAIGN_PAUSE           = 'campaign:pause',
  CAMPAIGN_OVERRIDE        = 'campaign:override',
  CAMPAIGN_REGION_BLOCK    = 'campaign:region_block',

  // Organizations
  ORG_LIST                 = 'org:list',
  ORG_WRITE                = 'org:write',
  ORG_FREEZE               = 'org:freeze',
  ORG_MEMBERS              = 'org:members',

  // Finance
  FINANCE_VIEW             = 'finance:view',
  FINANCE_SUBSCRIPTIONS    = 'finance:subscriptions',
  FINANCE_PAYOUT_APPROVE   = 'finance:payout_approve',
  FINANCE_PAYOUT_HOLD      = 'finance:payout_hold',
  FINANCE_RECONCILE        = 'finance:reconcile',
  FINANCE_EXPORT           = 'finance:export',
  FINANCE_REFUND           = 'finance:refund',
  FINANCE_REVENUE_RULES    = 'finance:revenue_rules',

  // Fraud
  FRAUD_VIEW               = 'fraud:view',
  FRAUD_FREEZE_PAYOUT      = 'fraud:freeze_payout',
  FRAUD_OVERRIDE           = 'fraud:override',

  // Incidents
  INCIDENT_VIEW            = 'incident:view',
  INCIDENT_CREATE          = 'incident:create',
  INCIDENT_MANAGE          = 'incident:manage',
  INCIDENT_RESOLVE         = 'incident:resolve',

  // System
  SYSTEM_OBSERVABILITY     = 'system:observability',
  SYSTEM_SETTINGS          = 'system:settings',
  SYSTEM_AUDIT_VIEW        = 'system:audit_view',
  SYSTEM_AUDIT_EXPORT      = 'system:audit_export',
  SYSTEM_ADMIN_USERS       = 'system:admin_users',
}
```

#### Role → Permission Map

```typescript
// packages/api/src/auth/constants/role-permissions.ts
export const ROLE_PERMISSIONS: Record<PlatformRole, AdminPermission[]> = {
  SUPER_ADMIN: Object.values(AdminPermission), // ALL permissions

  ADMIN: [ // PLATFORM_ADMIN
    AdminPermission.DASHBOARD_VIEW,
    AdminPermission.DASHBOARD_SYSTEM,
    AdminPermission.SCREEN_LIST, AdminPermission.SCREEN_DETAIL,
    AdminPermission.SCREEN_WRITE, AdminPermission.SCREEN_DECOMMISSION,
    AdminPermission.SCREEN_REMOTE_CMD, AdminPermission.SCREEN_BLOCK,
    AdminPermission.CAMPAIGN_LIST, AdminPermission.CAMPAIGN_DETAIL,
    AdminPermission.CAMPAIGN_APPROVE, AdminPermission.CAMPAIGN_PAUSE,
    AdminPermission.CAMPAIGN_OVERRIDE, AdminPermission.CAMPAIGN_REGION_BLOCK,
    AdminPermission.ORG_LIST, AdminPermission.ORG_WRITE,
    AdminPermission.ORG_FREEZE, AdminPermission.ORG_MEMBERS,
    AdminPermission.FRAUD_VIEW,
    AdminPermission.INCIDENT_VIEW, AdminPermission.INCIDENT_CREATE,
    AdminPermission.INCIDENT_MANAGE, AdminPermission.INCIDENT_RESOLVE,
    AdminPermission.SYSTEM_OBSERVABILITY, AdminPermission.SYSTEM_AUDIT_VIEW,
  ],

  FINANCE_ADMIN: [
    AdminPermission.DASHBOARD_VIEW, AdminPermission.DASHBOARD_FINANCE,
    AdminPermission.CAMPAIGN_LIST, AdminPermission.CAMPAIGN_DETAIL,
    AdminPermission.ORG_LIST,
    AdminPermission.FINANCE_VIEW, AdminPermission.FINANCE_SUBSCRIPTIONS,
    AdminPermission.FINANCE_PAYOUT_APPROVE, AdminPermission.FINANCE_PAYOUT_HOLD,
    AdminPermission.FINANCE_RECONCILE, AdminPermission.FINANCE_EXPORT,
    AdminPermission.FINANCE_REFUND,
    AdminPermission.FRAUD_VIEW, AdminPermission.FRAUD_FREEZE_PAYOUT,
    AdminPermission.SYSTEM_AUDIT_VIEW, AdminPermission.SYSTEM_AUDIT_EXPORT,
  ],

  SUPPORT: [ // SUPPORT_AGENT
    AdminPermission.DASHBOARD_VIEW, AdminPermission.DASHBOARD_SYSTEM,
    AdminPermission.SCREEN_LIST, AdminPermission.SCREEN_DETAIL,
    AdminPermission.SCREEN_REMOTE_CMD,
    AdminPermission.CAMPAIGN_LIST, AdminPermission.CAMPAIGN_DETAIL,
    AdminPermission.ORG_LIST, AdminPermission.ORG_MEMBERS,
    AdminPermission.INCIDENT_VIEW, AdminPermission.INCIDENT_CREATE,
    AdminPermission.INCIDENT_MANAGE,
    AdminPermission.SYSTEM_OBSERVABILITY,
  ],

  READ_ONLY_AUDITOR: [
    AdminPermission.DASHBOARD_VIEW, AdminPermission.DASHBOARD_FINANCE,
    AdminPermission.DASHBOARD_SYSTEM,
    AdminPermission.SCREEN_LIST, AdminPermission.SCREEN_DETAIL,
    AdminPermission.CAMPAIGN_LIST, AdminPermission.CAMPAIGN_DETAIL,
    AdminPermission.ORG_LIST, AdminPermission.ORG_MEMBERS,
    AdminPermission.FINANCE_VIEW, AdminPermission.FINANCE_SUBSCRIPTIONS,
    AdminPermission.FRAUD_VIEW,
    AdminPermission.INCIDENT_VIEW,
    AdminPermission.SYSTEM_OBSERVABILITY, AdminPermission.SYSTEM_AUDIT_VIEW,
  ],
};
```

#### Guard Implementation

```typescript
// packages/api/src/auth/guards/permissions.guard.ts
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<AdminPermission[]>(
      PERMISSIONS_KEY, [context.getHandler(), context.getClass()]
    );
    if (!requiredPermissions?.length) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user?.platformRole) return false;

    const userPermissions = ROLE_PERMISSIONS[user.platformRole] ?? [];
    return requiredPermissions.every(p => userPermissions.includes(p));
  }
}
```

#### Controller Usage

```typescript
@Get('finance/revenue')
@Permissions(AdminPermission.FINANCE_VIEW)
async getRevenueDashboard(@Query() query: RevenueQueryDto) { ... }

@Post('payouts/:id/approve')
@Permissions(AdminPermission.FINANCE_PAYOUT_APPROVE)
async approvePayout(@Param('id') id: string, @CurrentUser() user: User) { ... }
```

### 1.4 UI Behavior by Role

```typescript
// apps/web-admin/src/lib/navigation.ts
export function getNavigation(role: PlatformRole): NavItem[] {
  const nav: NavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }, // ALL roles
  ];

  if (hasPermission(role, 'screen:list')) {
    nav.push({ label: 'Fleet', href: '/fleet', icon: Monitor });
  }
  if (hasPermission(role, 'campaign:list')) {
    nav.push({ label: 'Campaigns', href: '/campaigns', icon: Megaphone });
  }
  if (hasPermission(role, 'org:list')) {
    nav.push({ label: 'Organizations', href: '/organizations', icon: Building2 });
  }
  if (hasPermission(role, 'finance:view')) {
    nav.push({ label: 'Finance', href: '/finance', icon: DollarSign });
  }
  if (hasPermission(role, 'fraud:view')) {
    nav.push({ label: 'Fraud', href: '/fraud', icon: ShieldAlert });
  }
  if (hasPermission(role, 'incident:view')) {
    nav.push({ label: 'Incidents', href: '/incidents', icon: AlertTriangle });
  }
  if (hasPermission(role, 'system:observability')) {
    nav.push({ label: 'System', href: '/system', icon: Activity });
  }
  if (hasPermission(role, 'system:audit_view')) {
    nav.push({ label: 'Audit Log', href: '/audit', icon: FileText });
  }
  if (hasPermission(role, 'system:admin_users')) {
    nav.push({ label: 'Settings', href: '/settings', icon: Settings });
  }
  return nav;
}
```

**UI enforcement rules:**
- Navigation items hidden if user lacks permission
- Action buttons (approve, override, block) render as disabled or hidden
- API calls blocked server-side regardless of UI state
- Sensitive financial figures replaced with `***` for SUPPORT_AGENT role
- All mutations log to AuditLog with actor userId, IP, and user-agent

### 1.5 Session & MFA Requirements

| Role              | MFA Required | Session Timeout | IP Allowlist |
|-------------------|:------------:|:---------------:|:------------:|
| SUPER_ADMIN       | Mandatory    | 30 min          | Optional     |
| PLATFORM_ADMIN    | Mandatory    | 60 min          | No           |
| FINANCE_ADMIN     | Mandatory    | 30 min          | Recommended  |
| SUPPORT_AGENT     | Required     | 120 min         | No           |
| READ_ONLY_AUDITOR | Required     | 120 min         | No           |

---

## 2. Global Overview Dashboard (Executive View)

### 2.1 Widget Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  [Time Filter: Today | 7d | 30d | Custom]  [Region: All ▾]        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │ 102,847  │ │  97.3%   │ │  1,247   │ │  €847K   │              │
│  │ Total    │ │ Online   │ │ Active   │ │ MRR      │              │
│  │ Screens  │ │ Rate     │ │ Campaign │ │          │              │
│  │ ▲ +234   │ │ ▼ -0.2%  │ │ ▲ +18   │ │ ▲ +3.2% │              │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘              │
│                                                                     │
│  ┌──────────────────────────────┐ ┌────────────────────────────┐   │
│  │   NETWORK HEALTH             │ │   CAMPAIGN DELIVERY         │   │
│  │                              │ │                             │   │
│  │   Online:  100,123 (97.3%)  │ │   Healthy:     1,089 (87%) │   │
│  │   Offline:   1,847  (1.8%)  │ │   Warning:       112  (9%) │   │
│  │   Degraded:    877  (0.9%)  │ │   Under-del:      46  (4%) │   │
│  │                              │ │                             │   │
│  │   Avg heartbeat: 42ms       │ │   Delivery score: 94.2%    │   │
│  │   [By Region Chart ▾]       │ │   [Trend Sparkline]        │   │
│  └──────────────────────────────┘ └────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────┐ ┌────────────────────────────┐   │
│  │   FINANCIAL SUMMARY          │ │   SYSTEM HEALTH             │   │
│  │                              │ │                             │   │
│  │   Revenue today:   €28,412  │ │   API p95:        48ms     │   │
│  │   MRR:            €847,200  │ │   WS connections: 98,412   │   │
│  │   Retrocession:   €593,040  │ │   Log ingest:     12.4K/s  │   │
│  │   Failed payments:      23  │ │   Error rate:     0.02%    │   │
│  │   [Revenue Trend Chart]     │ │   [Service Status Grid]    │   │
│  └──────────────────────────────┘ └────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │   RECENT ALERTS                                    [View All]│   │
│  │   🔴 Region IDF: 847 screens offline (2 min ago)            │   │
│  │   🟡 Campaign "Nike Q1": under-delivering by 23% (15m ago) │   │
│  │   🟡 Payment failure spike: 12 failures in 5 min (18m ago) │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Source per Widget

| Widget                 | Data Source                          | Query / Table                                     |
|------------------------|--------------------------------------|----------------------------------------------------|
| Total Screens          | PostgreSQL                           | `COUNT(*) FROM screens WHERE status='ACTIVE'`      |
| Online Rate            | Projection table                     | `screen_live_status` — `SUM(is_online) / COUNT(*)` |
| Active Campaigns       | PostgreSQL                           | `COUNT(*) FROM campaigns WHERE status='ACTIVE'`    |
| MRR                    | Materialized view (see 2.4)          | `admin_financial_summary_mv`                       |
| Network Health         | `screen_live_status` (projection)    | Grouped `COUNT` by online/offline/degraded         |
| Heartbeat latency      | Redis                                | `AVG` of last 1000 heartbeat round-trips           |
| Screens by region      | PostgreSQL + PostGIS                 | `GROUP BY city` or geo-cluster                     |
| Campaign delivery      | `campaign_delivery_stats_mv`         | Materialized view refreshed every 5 min            |
| Revenue today          | `stripe_payments`                    | `SUM(amountCents) WHERE status='SUCCEEDED' AND createdAt > today` |
| Retrocession payable   | `revenue_shares`                     | `SUM(partnerShareCents) WHERE status IN ('CALCULATED','APPROVED')` |
| Failed payments        | `stripe_payments`                    | `COUNT(*) WHERE status='FAILED' AND createdAt > today` |
| API latency            | Prometheus via Grafana API           | `histogram_quantile(0.95, http_request_duration)`  |
| WS connections         | Redis                                | `SCARD ws:connections`                             |
| Log ingest rate        | Kafka metrics / Redis counter        | Messages/sec on `diffusion-logs` topic             |
| Error rate             | Prometheus                           | `rate(http_requests_total{status=~"5.."}[5m])`     |
| Recent alerts          | `incidents` table                    | Latest 5 by `createdAt DESC`                       |

### 2.3 Refresh Strategy

| Widget Category     | Strategy          | Interval   | Technology                   |
|---------------------|-------------------|------------|------------------------------|
| KPI counters        | Polling           | 30s        | React Query `refetchInterval` |
| Network health      | WebSocket stream  | Real-time  | `ws:fleet-status` channel    |
| Campaign delivery   | Polling           | 60s        | Materialized view refresh    |
| Financial summary   | Polling           | 5 min      | Materialized view refresh    |
| System health       | WebSocket stream  | Real-time  | `ws:system-metrics` channel  |
| Recent alerts       | WebSocket push    | Real-time  | `ws:incidents` channel       |

**WebSocket channel structure:**
```
ws://api.neofilm.io/admin/ws
  → channel: fleet-status     (screen online/offline events)
  → channel: system-metrics   (API latency, error rate, WS count)
  → channel: incidents        (new/updated incidents)
  → channel: finance-alerts   (payment failures, payout status changes)
```

### 2.4 Aggregation Logic

#### Materialized Views

```sql
-- Refreshed every 5 minutes by pg_cron
CREATE MATERIALIZED VIEW admin_financial_summary_mv AS
SELECT
  -- MRR: sum of all active booking monthly prices
  (SELECT COALESCE(SUM(monthly_price_cents), 0)
   FROM bookings WHERE status = 'ACTIVE') AS mrr_cents,

  -- Revenue today
  (SELECT COALESCE(SUM(amount_cents), 0)
   FROM stripe_payments
   WHERE status = 'SUCCEEDED'
     AND created_at >= date_trunc('day', now())) AS revenue_today_cents,

  -- Retrocession payable this month
  (SELECT COALESCE(SUM(partner_share_cents), 0)
   FROM revenue_shares
   WHERE status IN ('CALCULATED', 'APPROVED')
     AND period_start >= date_trunc('month', now())) AS retrocession_payable_cents,

  -- Failed payments today
  (SELECT COUNT(*)
   FROM stripe_payments
   WHERE status = 'FAILED'
     AND created_at >= date_trunc('day', now())) AS failed_payments_today,

  now() AS refreshed_at
WITH NO DATA;

REFRESH MATERIALIZED VIEW CONCURRENTLY admin_financial_summary_mv;
```

```sql
-- Campaign delivery health — refreshed every 5 minutes
CREATE MATERIALIZED VIEW campaign_delivery_stats_mv AS
SELECT
  c.id AS campaign_id,
  c.name,
  c.status,
  c.start_date,
  c.end_date,
  c.budget_cents,
  c.spent_cents,
  -- Expected diffusions per day based on booked screens
  (SELECT COUNT(DISTINCT bs.screen_id)
   FROM booking_screens bs
   JOIN bookings b ON b.id = bs.booking_id
   WHERE b.campaign_id = c.id AND b.status = 'ACTIVE'
  ) AS booked_screens,
  -- Actual diffusions last 24h
  (SELECT COUNT(*)
   FROM diffusion_logs dl
   WHERE dl.campaign_id = c.id
     AND dl.start_time > now() - interval '24 hours'
  ) AS diffusions_24h,
  -- Delivery health: actual / expected
  CASE
    WHEN (SELECT COUNT(DISTINCT bs.screen_id)
          FROM booking_screens bs JOIN bookings b ON b.id = bs.booking_id
          WHERE b.campaign_id = c.id AND b.status = 'ACTIVE') = 0 THEN 0
    ELSE ROUND(
      (SELECT COUNT(*) FROM diffusion_logs dl
       WHERE dl.campaign_id = c.id AND dl.start_time > now() - interval '24 hours')::numeric
      / GREATEST(
        (SELECT COUNT(DISTINCT bs.screen_id)
         FROM booking_screens bs JOIN bookings b ON b.id = bs.booking_id
         WHERE b.campaign_id = c.id AND b.status = 'ACTIVE') * 100, -- ~100 plays/screen/day
        1
      ) * 100, 1)
  END AS delivery_pct
FROM campaigns c
WHERE c.status = 'ACTIVE'
WITH NO DATA;
```

#### Drill-down Capabilities

Every KPI widget is clickable and navigates to a detail view:

| Widget Click            | Navigates To                            |
|-------------------------|-----------------------------------------|
| Total Screens           | `/fleet` — full fleet view              |
| Online Rate             | `/fleet?status=offline` — offline list  |
| Active Campaigns        | `/campaigns?status=ACTIVE`              |
| MRR                     | `/finance/revenue`                      |
| Failed Payments         | `/finance/payments?status=FAILED`       |
| Network Health region   | `/fleet?region={region}`                |
| Under-delivering        | `/campaigns?delivery=under`             |
| Alert item              | `/incidents/{id}`                       |

---

## 3. Real-Time Screen Monitoring (Fleet View)

### 3.1 Fleet View Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  Fleet Control                                               [Map] │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ 🔍 Search: screenId, partner, city...  [Status ▾] [Region ▾] │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌────────────────────────────────┐ ┌──────────────────────────┐   │
│  │          MAP VIEW              │ │     SCREEN LIST           │   │
│  │                                │ │                           │   │
│  │   Clustered markers on         │ │  ● Screen Paris-01       │   │
│  │   Mapbox/Leaflet:              │ │    Partner: UGC Ciné     │   │
│  │                                │ │    Status: 🟢 Online      │   │
│  │   🟢 = online                  │ │    Heartbeat: 2s ago     │   │
│  │   🔴 = offline                 │ │    Version: 4.2.1        │   │
│  │   🟡 = degraded               │ │    Health: 94/100        │   │
│  │                                │ │  ────────────────────    │   │
│  │   Cluster: "Paris (2,847)"     │ │  ● Screen Lyon-03       │   │
│  │   Click → zoom to screens      │ │    Partner: Pathé        │   │
│  │                                │ │    Status: 🔴 Offline     │   │
│  │   [Heatmap toggle]             │ │    Last seen: 8m ago     │   │
│  │   [Fullscreen toggle]          │ │    Health: 12/100        │   │
│  │                                │ │                           │   │
│  └────────────────────────────────┘ └──────────────────────────┘   │
│                                                                     │
│  Click screen → opens DETAIL DRAWER (right panel slide-in)         │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Screen Detail Drawer

```
┌────────────────────────────────────────┐
│  ← Screen: Paris-Champs-01            │
│  Partner: UGC Ciné Champs-Élysées     │
│                                        │
│  ┌─ DEVICE INFO ─────────────────────┐ │
│  │ Serial:     NF-A7X-00847          │ │
│  │ Status:     🟢 Online              │ │
│  │ App:        v4.2.1                │ │
│  │ Firmware:   v2.1.0                │ │
│  │ OS:         Android TV 14         │ │
│  │ IP:         192.168.1.42          │ │
│  │ Resolution: 1920x1080 LANDSCAPE   │ │
│  │ Uptime:     14d 7h 23m           │ │
│  │ Network:    WiFi (45 Mbps)        │ │
│  └────────────────────────────────────┘ │
│                                        │
│  ┌─ HEALTH METRICS ──────────────────┐ │
│  │ CPU:    23%  ████░░░░░░           │ │
│  │ Memory: 61%  ██████░░░░           │ │
│  │ Disk:   34%  ███░░░░░░░           │ │
│  │ Temp:   42°C                      │ │
│  │ Errors (24h): 2                   │ │
│  │ Health Score: 94/100              │ │
│  └────────────────────────────────────┘ │
│                                        │
│  ┌─ NOW PLAYING ─────────────────────┐ │
│  │ Campaign: Nike Air Max Q1 2026    │ │
│  │ Creative: nike_30s_v2.mp4         │ │
│  │ Started:  14:23:07                │ │
│  └────────────────────────────────────┘ │
│                                        │
│  ┌─ RECENT DIFFUSIONS ──────────────┐ │
│  │ 14:23 Nike Air Max      ✅ 30s   │ │
│  │ 14:22 Coca-Cola Winter  ✅ 15s   │ │
│  │ 14:21 UGC Promo         ✅ 20s   │ │
│  │ 14:20 Nike Air Max      ✅ 30s   │ │
│  │ ... [Show more]                   │ │
│  └────────────────────────────────────┘ │
│                                        │
│  ┌─ RECENT ERRORS ──────────────────┐ │
│  │ 13:45 WARN  Cache miss: cr_847   │ │
│  │ 09:12 ERROR Network timeout 5s   │ │
│  │ ... [Show more]                   │ │
│  └────────────────────────────────────┘ │
│                                        │
│  ┌─ ACTIONS ─────────────────────────┐ │
│  │ [🔄 Reboot] [📤 Push Config]     │ │
│  │ [🗑️ Clear Cache] [🎬 Test Ad]     │ │
│  │ [🚫 Block Screen]                │ │
│  └────────────────────────────────────┘ │
│                                        │
│  ┌─ LIVE LOG TAIL (optional) ────────┐ │
│  │ > 14:23:07 DIFFUSION_START ...    │ │
│  │ > 14:23:37 DIFFUSION_END ...      │ │
│  │ > 14:23:38 DIFFUSION_START ...    │ │
│  └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

### 3.3 Health Score Calculation

```typescript
function calculateHealthScore(screen: ScreenLiveStatus, metrics: DeviceMetrics): number {
  let score = 100;

  // Connectivity (-40 max)
  if (!screen.isOnline) score -= 40;
  else {
    const minutesSinceHeartbeat = diffMinutes(now(), screen.lastHeartbeatAt);
    if (minutesSinceHeartbeat > 2) score -= 10;
    if (minutesSinceHeartbeat > 5) score -= 20;
  }

  // Resource usage (-30 max)
  if (metrics.cpuPercent > 90) score -= 15;
  else if (metrics.cpuPercent > 75) score -= 5;

  if (metrics.memoryPercent > 90) score -= 10;
  else if (metrics.memoryPercent > 80) score -= 5;

  if (metrics.diskPercent > 90) score -= 10;
  else if (metrics.diskPercent > 80) score -= 3;

  // Temperature (-10 max)
  if (metrics.temperature > 80) score -= 10;
  else if (metrics.temperature > 65) score -= 5;

  // Errors (-20 max)
  if (screen.errorCount24h > 10) score -= 20;
  else if (screen.errorCount24h > 5) score -= 10;
  else if (screen.errorCount24h > 0) score -= 5;

  return Math.max(0, score);
}

// Status derived from score:
// 80-100 = HEALTHY (green)
// 50-79  = DEGRADED (yellow)
// 0-49   = CRITICAL (red)
```

### 3.4 Real-Time Event Flow

```
Device (TV)                                     Admin Cockpit
    │                                                │
    ├─ heartbeat (every 60s) ──→ API Gateway ──→ Kafka: device-heartbeats
    │                                │                │
    │                                ├──→ Worker: update ScreenLiveStatus
    │                                │                │
    │                                └──→ Redis Pub/Sub ──→ WebSocket Gateway
    │                                                        │
    │                                                  ws:fleet-status
    │                                                        │
    │                                                  Admin Browser
    │                                                  (real-time update)
    │
    ├─ diffusion log ──→ API Gateway ──→ Kafka: diffusion-logs
    │                                │
    │                                ├──→ Worker: verify signature
    │                                ├──→ Worker: update ScreenLiveStatus.currentCampaignId
    │                                └──→ Redis Pub/Sub ──→ ws:fleet-status
    │
    ├─ error log ──→ API Gateway ──→ Kafka: device-errors
    │                            │
    │                            ├──→ Worker: increment errorCount24h
    │                            └──→ Incident Engine (if FATAL)
    │
    └─ metrics (every 5min) ──→ API Gateway ──→ Kafka: device-metrics
                                             │
                                             └──→ Worker: update ScreenLiveStatus
```

### 3.5 WebSocket Channel Structure

```typescript
// packages/api/src/websocket/admin.gateway.ts

@WebSocketGateway({ namespace: '/admin/ws' })
export class AdminWebSocketGateway {

  // Channel: fleet-status
  // Publishes: screen online/offline transitions, health score changes
  @SubscribeMessage('subscribe:fleet-status')
  handleFleetSubscription(
    @ConnectedSocket() client: Socket,
    @MessageBody() filters: { region?: string; partnerId?: string }
  ) {
    // Join room based on filters
    if (filters.region) client.join(`fleet:region:${filters.region}`);
    else client.join('fleet:all');
  }

  // Emitted events:
  // fleet:screen-status  { screenId, isOnline, healthScore, lastHeartbeat }
  // fleet:screen-command { screenId, command, status, timestamp }
}

// Event payload types
interface FleetScreenStatusEvent {
  screenId: string;
  isOnline: boolean;
  healthScore: number;
  lastHeartbeatAt: string;
  cpuPercent: number;
  memoryPercent: number;
  currentCampaignId: string | null;
  errorCount24h: number;
}

interface FleetScreenCommandEvent {
  screenId: string;
  command: 'REBOOT' | 'PUSH_CONFIG' | 'CLEAR_CACHE' | 'TEST_AD' | 'BLOCK';
  status: 'SENT' | 'ACKNOWLEDGED' | 'COMPLETED' | 'FAILED' | 'TIMEOUT';
  issuedBy: string;
  timestamp: string;
}
```

### 3.6 Device Command Tracking

```typescript
// Device command lifecycle
enum CommandStatus {
  PENDING    = 'PENDING',     // Command created, not yet sent
  SENT       = 'SENT',        // Pushed to device via WebSocket/MQTT
  ACK        = 'ACK',         // Device acknowledged receipt
  EXECUTING  = 'EXECUTING',   // Device is executing
  COMPLETED  = 'COMPLETED',   // Device confirmed completion
  FAILED     = 'FAILED',      // Device reported failure
  TIMEOUT    = 'TIMEOUT',     // No response within 60s
}

// New Prisma model needed:
// model DeviceCommand {
//   id          String        @id @default(cuid())
//   deviceId    String
//   screenId    String
//   command     String        // REBOOT, PUSH_CONFIG, CLEAR_CACHE, TEST_AD, BLOCK
//   status      String        @default("PENDING")
//   payload     Json?
//   issuedBy    String        // admin userId
//   result      Json?
//   sentAt      DateTime?
//   ackedAt     DateTime?
//   completedAt DateTime?
//   createdAt   DateTime      @default(now())
//   @@index([deviceId, createdAt])
//   @@index([status])
// }
```

### 3.7 Rate Limit Strategy

| Action          | Rate Limit               | Scope       |
|-----------------|--------------------------|-------------|
| Remote reboot   | 1 per device per 5 min   | Per device  |
| Push config     | 1 per device per 1 min   | Per device  |
| Clear cache     | 1 per device per 5 min   | Per device  |
| Force test ad   | 5 per device per 10 min  | Per device  |
| Block screen    | No rate limit            | Per admin   |
| Bulk commands   | 100 devices per request  | Per admin   |
| Fleet search    | 10 req/sec               | Per admin   |
| Map tile load   | 50 req/sec               | Per admin   |

```typescript
// Enforced via decorator
@Throttle({ default: { limit: 1, ttl: 300000 } }) // 1 per 5 min
@Post('screens/:screenId/reboot')
async rebootDevice(@Param('screenId') screenId: string) { ... }
```

---

## 4. Campaign Supervision & Override

### 4.1 Campaign State Machine

The existing schema defines `CampaignStatus`. The full admin state machine with transitions:

```
                    ┌──────────┐
                    │  DRAFT   │
                    └────┬─────┘
                         │ submit (advertiser)
                         ▼
                ┌─────────────────┐
                │ PENDING_REVIEW  │
                └────┬───────┬────┘
         approve │         │ reject
                 ▼         ▼
          ┌──────────┐  ┌──────────┐
          │ APPROVED │  │ REJECTED │
          └────┬─────┘  └──────────┘
               │ auto (startDate reached)
               ▼
          ┌──────────┐
    ┌────►│  ACTIVE  │◄───────┐
    │     └──┬───┬───┘        │
    │        │   │            │
    │  pause │   │ endDate    │ resume
    │        ▼   │            │
    │  ┌─────────┴──┐        │
    │  │   PAUSED   ├────────┘
    │  └────────────┘
    │        │
    │        │ (endDate while paused)
    │        ▼
    │  ┌────────────┐
    └──┤ COMPLETED  │
       └────────────┘
               │ archive (admin)
               ▼
         ┌──────────┐
         │ ARCHIVED │
         └──────────┘
```

**Admin-specific transitions:**

| Transition               | Allowed Roles                | Requires Reason | Audit Level |
|--------------------------|------------------------------|:---------------:|:-----------:|
| PENDING → APPROVED       | SUPER_ADMIN, PLATFORM_ADMIN  | Optional        | INFO        |
| PENDING → REJECTED       | SUPER_ADMIN, PLATFORM_ADMIN  | Required        | WARN        |
| ACTIVE → PAUSED (admin)  | SUPER_ADMIN, PLATFORM_ADMIN  | Required        | WARN        |
| PAUSED → ACTIVE (resume) | SUPER_ADMIN, PLATFORM_ADMIN  | Optional        | INFO        |
| Any → ARCHIVED           | SUPER_ADMIN                  | Optional        | INFO        |

### 4.2 Campaign Supervision UI

```
┌─────────────────────────────────────────────────────────────────────┐
│  Campaign Supervision                                               │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ 🔍 Search  [Status ▾] [Region ▾] [Advertiser ▾] [Health ▾]   │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌─ KPIs ────────────────────────────────────────────────────────┐ │
│  │  Active: 1,247  │  Pending: 34  │  Under-delivering: 46      │ │
│  │  Paused: 89     │  Overrides: 7 │  Global Delivery: 94.2%    │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Campaign         │ Advertiser │ Screens │ Delivery │ Actions│   │
│  ├──────────────────┼────────────┼─────────┼──────────┼────────┤   │
│  │ Nike Air Max Q1  │ Nike FR    │ 342     │ 🟢 98%   │ [⏸️][🔍] │   │
│  │ Coca Winter 26   │ Coca-Cola  │ 1,200   │ 🟡 72%   │ [⏸️][🔍] │   │
│  │ UGC Loyalty      │ UGC Ciné   │ 89      │ 🔴 34%   │ [⏸️][🔍] │   │
│  │ Pathé Spring     │ Pathé      │ 456     │ 🟢 95%   │ [⏸️][🔍] │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─ IMPRESSION TREND (real-time) ────────────────────────────────┐ │
│  │  [Line chart: impressions per 15 min, last 24h]                │ │
│  │  Overlays: expected vs actual                                  │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.3 Override System

#### Override Model (New Prisma Schema)

```prisma
enum OverrideType {
  FORCE_CAMPAIGN    // Force a specific campaign on screens
  BLOCK_CAMPAIGN    // Block a campaign from screens/region
  EMERGENCY_BLANK   // Show blank/default on screens
}

enum OverrideStatus {
  ACTIVE
  EXPIRED
  CANCELLED
}

model CampaignOverride {
  id          String         @id @default(cuid())
  type        OverrideType
  status      OverrideStatus @default(ACTIVE)

  // What campaign
  campaignId  String?        // null for EMERGENCY_BLANK
  campaign    Campaign?      @relation(fields: [campaignId], references: [id])

  // Scope: which screens are affected
  scope       Json           // { type: 'ALL' | 'REGION' | 'PARTNER' | 'SCREENS', value: string[] }

  // Time bounds
  startAt     DateTime       @default(now())
  expiresAt   DateTime       // MANDATORY — no permanent overrides
  cancelledAt DateTime?

  // Priority (higher wins conflicts)
  priority    Int            @default(0) // 0=normal, 10=high, 100=emergency

  // Audit
  reason      String
  issuedBy    String         // admin userId
  cancelledBy String?

  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  @@index([status, expiresAt])
  @@index([campaignId])
  @@map("campaign_overrides")
}
```

#### Override Logic Flow

```
Admin creates override
        │
        ▼
┌──────────────────────────┐
│ 1. Validate permissions  │  (SUPER_ADMIN or PLATFORM_ADMIN)
│ 2. Validate expiresAt    │  (max 24h for FORCE, 72h for BLOCK)
│ 3. Check conflicts       │  (same screen, overlapping time)
│ 4. Resolve by priority   │  (highest priority wins)
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ Write CampaignOverride   │
│ Write AuditLog (CRITICAL)│
│ Notify affected partners │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ Push to Diffusion Engine │  via Kafka: campaign-overrides
│                          │
│ Diffusion Engine:        │
│ 1. Load active overrides │
│ 2. Override > schedule   │
│ 3. Apply to affected     │
│    screen playlists      │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ Auto-expiry worker       │
│ Runs every 1 min:        │
│ UPDATE campaign_overrides│
│ SET status = 'EXPIRED'   │
│ WHERE expiresAt < now()  │
│   AND status = 'ACTIVE'  │
│                          │
│ → Kafka: override-expired│
│ → Diffusion Engine       │
│   reverts to schedule    │
└──────────────────────────┘
```

#### Conflict Resolution

```typescript
// When multiple overrides affect the same screen at the same time:
function resolveOverrides(overrides: CampaignOverride[]): CampaignOverride | null {
  const active = overrides
    .filter(o => o.status === 'ACTIVE' && o.expiresAt > new Date())
    .sort((a, b) => {
      // 1. EMERGENCY_BLANK always wins
      if (a.type === 'EMERGENCY_BLANK') return -1;
      if (b.type === 'EMERGENCY_BLANK') return 1;
      // 2. Higher priority wins
      if (a.priority !== b.priority) return b.priority - a.priority;
      // 3. More recent wins
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  return active[0] ?? null;
}
```

#### Override Constraints

| Override Type     | Max Duration | Max Screens  | Required MFA |
|-------------------|:------------:|:------------:|:------------:|
| FORCE_CAMPAIGN    | 24 hours     | 10,000       | Yes          |
| BLOCK_CAMPAIGN    | 72 hours     | Unlimited    | Yes          |
| EMERGENCY_BLANK   | 4 hours      | Unlimited    | Yes          |

### 4.4 Audit Trail Requirements

Every override action generates:

```typescript
{
  action: 'CAMPAIGN_OVERRIDE_CREATE' | 'CAMPAIGN_OVERRIDE_CANCEL' | 'CAMPAIGN_OVERRIDE_EXPIRE',
  entity: 'CampaignOverride',
  entityId: override.id,
  severity: 'CRITICAL',
  oldData: null, // or previous state for cancel
  newData: {
    type: override.type,
    campaignId: override.campaignId,
    scope: override.scope,
    expiresAt: override.expiresAt,
    reason: override.reason,
  },
  userId: admin.id,
  ipAddress: request.ip,
  userAgent: request.headers['user-agent'],
}
```

### 4.5 Reconciliation with Diffusion Engine

After an override expires or is cancelled, the system must:

1. **Log gap**: Mark diffusion logs during override period with `triggerContext = 'MANUAL'`
2. **Billing impact**: If a paid campaign was blocked, flag the period for billing review
3. **Delivery recalculation**: Exclude override period from campaign delivery health metrics
4. **Notification**: Alert advertiser that their campaign was overridden (with reason, duration)
5. **Revenue impact**: If override affected revenue-generating slots, create a revenue adjustment entry

---

## 5. Revenue & Financial Control Dashboard

### 5.1 Finance Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  Financial Control Center                                           │
│  [Period: This Month ▾]  [Region: All ▾]  [Export ▾]               │
│                                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │ €847.2K  │ │ €28.4K   │ │ €593.0K  │ │    23    │              │
│  │ MRR      │ │ Today    │ │ Payable  │ │ Failed   │              │
│  │ ▲ +3.2%  │ │ ▲ +12%   │ │ Partner  │ │ Payments │              │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘              │
│                                                                     │
│  ═══ TABS: [Revenue] [Payouts] [Reconciliation] [Exports] ═══     │
│                                                                     │
│  ┌─ REVENUE TAB ─────────────────────────────────────────────────┐ │
│  │                                                                │ │
│  │  ┌─ SUBSCRIPTIONS BY PLAN ────────┐ ┌─ REVENUE BY REGION ──┐ │ │
│  │  │ Starter:    412  (€82,400)     │ │ Île-de-France: 34%   │ │ │
│  │  │ Pro:        287  (€258,300)    │ │ Auvergne-RA:   18%   │ │ │
│  │  │ Enterprise:  89  (€356,000)    │ │ PACA:          12%   │ │ │
│  │  │ Custom:      34  (€150,500)    │ │ [Treemap chart]      │ │ │
│  │  └────────────────────────────────┘ └────────────────────────┘ │ │
│  │                                                                │ │
│  │  ┌─ REVENUE TREND (12 months) ────────────────────────────────┐│ │
│  │  │ [Bar chart: monthly revenue + line: MRR growth]            ││ │
│  │  └────────────────────────────────────────────────────────────┘│ │
│  │                                                                │ │
│  │  ┌─ FAILED PAYMENTS ─────────────────────────────────────────┐│ │
│  │  │ Invoice       │ Advertiser  │ Amount   │ Failure  │ Retry ││ │
│  │  │ INV-2026-0847 │ Nike FR     │ €1,200   │ card_dec │ [↻]  ││ │
│  │  │ INV-2026-0843 │ Peugeot     │ €3,400   │ insuf.   │ [↻]  ││ │
│  │  └────────────────────────────────────────────────────────────┘│ │
│  │                                                                │ │
│  │  ┌─ REFUNDS & CHARGEBACKS ───────────────────────────────────┐│ │
│  │  │ This month: 3 refunds (€2,100) │ 1 chargeback (€800)     ││ │
│  │  └────────────────────────────────────────────────────────────┘│ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Payouts Tab

```
┌─ PAYOUTS TAB ────────────────────────────────────────────────────────┐
│                                                                      │
│  ┌─ PAYOUT PIPELINE ────────────────────────────────────────────────┐│
│  │  Pending Calculation: 12 partners                                ││
│  │  Calculated (awaiting approval): 45 partners — €412,300         ││
│  │  Approved (processing): 8 partners — €67,200                    ││
│  │  Paid this month: 134 partners — €513,500                       ││
│  │  Held: 3 partners — €12,400 (fraud review)                     ││
│  └──────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌─ PARTNERS NEEDING ATTENTION ─────────────────────────────────────┐│
│  │  ⚠️ 7 partners without Stripe Connect onboarding                 ││
│  │  ⚠️ 3 partners below payout threshold (€100 min)                 ││
│  │  ⚠️ 2 partners with held payouts (fraud flag)                    ││
│  │  [View Details]                                                  ││
│  └──────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌─ PAYOUT TABLE ───────────────────────────────────────────────────┐│
│  │ Partner        │ Period     │ Gross    │ Share  │ Status  │ Act  ││
│  │ UGC Ciné       │ Jan 2026   │ €45,200  │ €31,640│ CALC    │[✅]  ││
│  │ Pathé          │ Jan 2026   │ €34,100  │ €23,870│ CALC    │[✅]  ││
│  │ CGR Cinémas    │ Jan 2026   │ €28,700  │ €20,090│ CALC    │[✅]  ││
│  │ Gaumont        │ Jan 2026   │ €12,400  │ €8,680 │ HELD    │[🔍]  ││
│  │ [Select All] [Approve Selected] [Export Statement]               ││
│  └──────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
```

### 5.3 Payout Approval Flow

```
Monthly revenue calculated (1st of month, cron job)
        │
        ▼
RevenueShare created (status: CALCULATED)
        │
        ▼
FINANCE_ADMIN reviews in Payouts tab
        │
        ├── Approve individual → status: APPROVED
        ├── Approve batch → all selected: APPROVED
        └── Hold (fraud/dispute) → status: PENDING (with hold reason)
        │
        ▼ (APPROVED only)
Background worker creates Payout record
        │
        ├── Check: partner has stripeConnectAccountId
        ├── Check: payout amount >= threshold (€100)
        ├── Check: no active fraud hold
        │
        ▼ (all checks pass)
Stripe Connect Transfer created
        │
        ├── Success → Payout.status = PAID, RevenueShare.status = PAID
        └── Failure → Payout.status = FAILED, alert FINANCE_ADMIN
```

### 5.4 Reconciliation Tab

```
┌─ RECONCILIATION TAB ────────────────────────────────────────────────┐
│                                                                      │
│  ┌─ INVOICE vs BOOKING CHECK ───────────────────────────────────────┐│
│  │  Period: January 2026                          [Run Check]       ││
│  │                                                                  ││
│  │  Total Stripe invoices:     823                                  ││
│  │  Matched to bookings:       819  (99.5%)                        ││
│  │  Mismatches found:            4  ⚠️                              ││
│  │                                                                  ││
│  │  Mismatch Detail:                                                ││
│  │  ┌─────────────┬──────────┬───────────┬──────────┬─────────────┐││
│  │  │ Invoice     │ Stripe   │ Internal  │ Delta    │ Action      │││
│  │  │ INV-0812    │ €1,200   │ €1,000    │ +€200    │ [Investigate]│││
│  │  │ INV-0834    │ €0       │ €2,400    │ -€2,400  │ [Investigate]│││
│  │  └─────────────┴──────────┴───────────┴──────────┴─────────────┘││
│  └──────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌─ REVENUE SHARE vs PAYOUT CHECK ──────────────────────────────────┐│
│  │  Computed partner share:    €593,040                             ││
│  │  Actual payouts issued:     €580,640                             ││
│  │  Delta:                      €12,400 (2 partners held)          ││
│  │  Status: ✅ Reconciled (within tolerance)                        ││
│  └──────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
```

### 5.5 Reconciliation Query

```sql
-- Invoice vs Booking mismatch detection
SELECT
  si.id AS invoice_id,
  si.stripe_invoice_id,
  si.amount_due_cents AS stripe_amount,
  COALESCE(SUM(bs.unit_price_cents), 0) AS internal_amount,
  si.amount_due_cents - COALESCE(SUM(bs.unit_price_cents), 0) AS delta_cents,
  si.organization_id,
  o.name AS org_name
FROM stripe_invoices si
JOIN organizations o ON o.id = si.organization_id
LEFT JOIN stripe_subscriptions ss ON ss.organization_id = si.organization_id
  AND ss.status = 'ACTIVE'
LEFT JOIN bookings b ON b.stripe_subscription_id = ss.stripe_subscription_id
  AND b.status = 'ACTIVE'
LEFT JOIN booking_screens bs ON bs.booking_id = b.id
WHERE si.period_start >= $1 AND si.period_end <= $2
  AND si.status IN ('PAID', 'OPEN')
GROUP BY si.id, o.name
HAVING ABS(si.amount_due_cents - COALESCE(SUM(bs.unit_price_cents), 0)) > 100 -- >€1 tolerance
ORDER BY ABS(si.amount_due_cents - COALESCE(SUM(bs.unit_price_cents), 0)) DESC;
```

### 5.6 Data Consistency Checks (Automated)

```typescript
// packages/api/src/finance/reconciliation.service.ts

interface ConsistencyCheck {
  name: string;
  query: string;
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  threshold: number; // max allowed mismatches
}

const CONSISTENCY_CHECKS: ConsistencyCheck[] = [
  {
    name: 'invoice_booking_mismatch',
    severity: 'CRITICAL',
    threshold: 0,
    // Stripe invoice amount != sum of booking screen prices
  },
  {
    name: 'revenue_share_calculation_drift',
    severity: 'WARN',
    threshold: 5, // cents tolerance per partner
    // RevenueShare.partnerShareCents != recalculated amount
  },
  {
    name: 'payout_sum_mismatch',
    severity: 'CRITICAL',
    threshold: 0,
    // Payout.amountCents != SUM(linked RevenueShare.partnerShareCents)
  },
  {
    name: 'orphaned_subscriptions',
    severity: 'WARN',
    threshold: 0,
    // StripeSubscription with no matching Booking
  },
  {
    name: 'double_payment_detection',
    severity: 'CRITICAL',
    threshold: 0,
    // Two SUCCEEDED payments for same invoice
  },
];

// Runs daily at 03:00 via cron
@Cron('0 3 * * *')
async runConsistencyChecks() {
  for (const check of CONSISTENCY_CHECKS) {
    const mismatches = await this.prisma.$queryRawUnsafe(check.query);
    if (mismatches.length > check.threshold) {
      await this.incidentService.create({
        type: 'FINANCIAL_INCONSISTENCY',
        severity: check.severity,
        title: `Consistency check failed: ${check.name}`,
        metadata: { mismatches, check: check.name },
      });
    }
  }
}
```

### 5.7 Export Capabilities

| Export Type            | Format | Fields                                                      | Accessible By            |
|------------------------|--------|-------------------------------------------------------------|--------------------------|
| Monthly revenue report | CSV    | Period, org, plan, gross, net, fees, refunds                | FINANCE_ADMIN, SUPER_ADMIN|
| Payout statements      | PDF    | Partner, period, screens, bookings, rate, share, payout ref | FINANCE_ADMIN, SUPER_ADMIN|
| Accounting export      | CSV    | Date, type, debit, credit, ref, description (journal entry) | FINANCE_ADMIN, SUPER_ADMIN|
| Failed payments        | CSV    | Date, invoice, org, amount, failure reason, retry status    | FINANCE_ADMIN, SUPER_ADMIN|
| Reconciliation report  | CSV    | Invoice, Stripe amt, internal amt, delta, status            | FINANCE_ADMIN, SUPER_ADMIN|

---

## 6. Incident Management System

### 6.1 Incident Schema (New Prisma Models)

```prisma
enum IncidentSeverity {
  P1_CRITICAL   // Service down, revenue impact
  P2_HIGH       // Major degradation, partial impact
  P3_MEDIUM     // Noticeable issue, workaround available
  P4_LOW        // Minor issue, no user impact
}

enum IncidentStatus {
  OPEN
  ACKNOWLEDGED
  INVESTIGATING
  RESOLVED
  CLOSED
}

enum IncidentType {
  SCREEN_OFFLINE
  DEVICE_CRASH
  DIFFUSION_BLACKOUT
  CDN_FAILURE
  PAYMENT_FAILURE_SPIKE
  FRAUD_ANOMALY
  API_DEGRADATION
  REGION_OUTAGE
  MANUAL
}

model Incident {
  id            String            @id @default(cuid())
  type          IncidentType
  severity      IncidentSeverity
  status        IncidentStatus    @default(OPEN)
  title         String
  description   String?

  // Scope
  affectedScreens   Int           @default(0)
  affectedRegions   String[]      // ["IDF", "PACA"]
  affectedPartners  String[]      // org IDs

  // SLA tracking
  openedAt          DateTime      @default(now())
  acknowledgedAt    DateTime?
  resolvedAt        DateTime?
  closedAt          DateTime?
  slaDeadline       DateTime?     // auto-calculated from severity

  // Assignment
  assignedTo        String?       // admin userId
  assignedTeam      String?       // "operations" | "engineering" | "finance"

  // Grouping
  parentIncidentId  String?       // for sub-incidents in regional outage
  parentIncident    Incident?     @relation("IncidentChildren", fields: [parentIncidentId], references: [id])
  childIncidents    Incident[]    @relation("IncidentChildren")

  // Source
  sourceType        String?       // "auto" | "manual"
  sourceEntityType  String?       // "Screen", "Device", "Payment"
  sourceEntityId    String?

  // Resolution
  rootCause         String?
  resolution        String?

  // Relations
  comments   IncidentComment[]
  timeline   IncidentTimeline[]

  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([status, severity])
  @@index([type])
  @@index([assignedTo])
  @@index([openedAt])
  @@index([parentIncidentId])
  @@map("incidents")
}

model IncidentComment {
  id          String   @id @default(cuid())
  incidentId  String
  incident    Incident @relation(fields: [incidentId], references: [id], onDelete: Cascade)
  authorId    String   // admin userId
  content     String
  isInternal  Boolean  @default(true) // internal-only vs visible to partners
  createdAt   DateTime @default(now())

  @@index([incidentId, createdAt])
  @@map("incident_comments")
}

model IncidentTimeline {
  id          String   @id @default(cuid())
  incidentId  String
  incident    Incident @relation(fields: [incidentId], references: [id], onDelete: Cascade)
  action      String   // CREATED, ACKNOWLEDGED, ASSIGNED, SEVERITY_CHANGED, RESOLVED, CLOSED
  actorId     String?  // null for auto-actions
  oldValue    String?
  newValue    String?
  metadata    Json?
  createdAt   DateTime @default(now())

  @@index([incidentId, createdAt])
  @@map("incident_timeline")
}
```

### 6.2 SLA Timers

| Severity    | Acknowledge | Investigate | Resolve    | Example                        |
|-------------|:-----------:|:-----------:|:----------:|--------------------------------|
| P1_CRITICAL | 5 min       | 15 min      | 1 hour     | Region outage, 1000+ offline   |
| P2_HIGH     | 15 min      | 30 min      | 4 hours    | 100+ screens offline           |
| P3_MEDIUM   | 1 hour      | 4 hours     | 24 hours   | Single partner CDN issue       |
| P4_LOW      | 4 hours     | 24 hours    | 72 hours   | Minor device error pattern     |

```typescript
const SLA_DEADLINES: Record<IncidentSeverity, { ack: number; resolve: number }> = {
  P1_CRITICAL: { ack: 5 * 60_000,      resolve: 60 * 60_000 },
  P2_HIGH:     { ack: 15 * 60_000,     resolve: 4 * 60 * 60_000 },
  P3_MEDIUM:   { ack: 60 * 60_000,     resolve: 24 * 60 * 60_000 },
  P4_LOW:      { ack: 4 * 60 * 60_000, resolve: 72 * 60 * 60_000 },
};
```

### 6.3 Incident UI

```
┌─────────────────────────────────────────────────────────────────────┐
│  Incident Management                                                │
│  [Status ▾] [Severity ▾] [Type ▾] [Assigned ▾]  [+ New Incident]  │
│                                                                     │
│  ┌─ ACTIVE INCIDENTS ───────────────────────────────────────────┐   │
│  │  🔴 P1 INC-2026-0847 Region IDF Outage                      │   │
│  │     847 screens │ 3 partners │ Opened 12m ago │ SLA: ⏰ 48m  │   │
│  │     Assigned: @jean.dupont │ Status: INVESTIGATING           │   │
│  │                                                               │   │
│  │  🟠 P2 INC-2026-0845 Payment failure spike                  │   │
│  │     23 failures │ 5 min window │ Opened 18m ago │ Unassigned │   │
│  │     Status: OPEN │ [Acknowledge]                              │   │
│  │                                                               │   │
│  │  🟡 P3 INC-2026-0842 CDN latency PACA region                │   │
│  │     12 screens │ 1 partner │ Opened 2h ago │ SLA: OK         │   │
│  │     Assigned: @marie.tech │ Status: INVESTIGATING            │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Click incident → DETAIL VIEW:                                      │
│  ┌─ INC-2026-0847: Region IDF Outage ──────────────────────────┐   │
│  │                                                               │   │
│  │  Status: [OPEN] → [ACK] → [🔵 INVESTIGATING] → [RESOLVED]   │   │
│  │                                                               │   │
│  │  ┌─ TIMELINE ──────────────────────────────────────────────┐ │   │
│  │  │ 14:23  System detected 847 screens offline in IDF       │ │   │
│  │  │ 14:25  Auto-created incident (P1)                       │ │   │
│  │  │ 14:28  Acknowledged by @jean.dupont                     │ │   │
│  │  │ 14:30  Status → INVESTIGATING                           │ │   │
│  │  │ 14:32  Comment: "ISP Orange reports backbone issue"     │ │   │
│  │  │ 14:45  Affected screens reduced to 234                  │ │   │
│  │  └────────────────────────────────────────────────────────┘ │   │
│  │                                                               │   │
│  │  ┌─ COMMENTS ─────────────────────────────────────────────┐ │   │
│  │  │ [Add comment...]                                        │ │   │
│  │  └────────────────────────────────────────────────────────┘ │   │
│  │                                                               │   │
│  │  [Assign] [Change Severity] [Resolve] [Close]               │   │
│  └───────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.4 Event Ingestion Pipeline

```
┌─────────────┐
│ Kafka Topics │
├─────────────┤
│ device-      │──→ ┌──────────────────────────┐
│ heartbeats   │    │   Incident Detection      │
│              │    │   Workers (NestJS)         │
│ device-      │──→ │                           │
│ errors       │    │  Rules:                    │
│              │    │  1. screen_offline > 5m    │
│ diffusion-   │──→ │     → check: how many?    │
│ logs         │    │     → if >50 same region   │
│              │    │       → P1 REGION_OUTAGE   │
│ payment-     │──→ │     → if 1-50             │
│ events       │    │       → P3 SCREEN_OFFLINE  │
│              │    │                            │
│ system-      │──→ │  2. device_error FATAL     │
│ metrics      │    │     → 3+ in 10m same device│
│              │    │     → P2 DEVICE_CRASH      │
└─────────────┘    │                            │
                   │  3. no diffusion_log for    │
                   │     active campaign > 30m   │
                   │     → P2 DIFFUSION_BLACKOUT │
                   │                            │
                   │  4. payment FAILED          │
                   │     → 10+ in 5m            │
                   │     → P1 PAYMENT_SPIKE      │
                   │                            │
                   │  5. fraud signal detected   │
                   │     → P2 FRAUD_ANOMALY      │
                   └──────────┬─────────────────┘
                              │
                              ▼
                   ┌──────────────────────┐
                   │  Deduplication &      │
                   │  Grouping Logic       │
                   │                      │
                   │  - Same type + region │
                   │    within 10 min?     │
                   │    → attach to parent │
                   │                      │
                   │  - Same device within │
                   │    30 min?            │
                   │    → update existing  │
                   └──────────┬───────────┘
                              │
                              ▼
                   ┌──────────────────────┐
                   │  Notification Fan-out │
                   │                      │
                   │  P1 → Slack + PagerDuty
                   │  P2 → Slack + Email   │
                   │  P3 → Email           │
                   │  P4 → In-app only     │
                   └──────────────────────┘
```

### 6.5 Escalation Rules

```typescript
const ESCALATION_RULES = [
  {
    trigger: 'SLA_ACK_BREACH',
    condition: 'incident.status === OPEN && elapsed > sla.ack',
    actions: [
      { type: 'REASSIGN', target: 'on-call-lead' },
      { type: 'NOTIFY', channel: 'slack', message: 'SLA ACK breach' },
      { type: 'SEVERITY_BUMP', if: 'severity > P2' },
    ],
  },
  {
    trigger: 'SLA_RESOLVE_BREACH',
    condition: 'incident.status !== RESOLVED && elapsed > sla.resolve',
    actions: [
      { type: 'NOTIFY', channel: 'pagerduty', target: 'engineering-lead' },
      { type: 'SEVERITY_BUMP', by: 1 },
    ],
  },
  {
    trigger: 'CASCADING_FAILURE',
    condition: 'incident.childIncidents.length > 10',
    actions: [
      { type: 'SEVERITY_SET', value: 'P1_CRITICAL' },
      { type: 'NOTIFY', channel: 'slack', message: 'Cascading failure detected' },
    ],
  },
];
```

### 6.6 Auto-Resolution Logic

```typescript
// Runs every 2 minutes
@Cron('*/2 * * * *')
async checkAutoResolution() {
  // Auto-resolve SCREEN_OFFLINE incidents when screens come back
  const offlineIncidents = await this.prisma.incident.findMany({
    where: {
      type: 'SCREEN_OFFLINE',
      status: { in: ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING'] },
    },
  });

  for (const incident of offlineIncidents) {
    const stillOffline = await this.prisma.screenLiveStatus.count({
      where: {
        screenId: { in: incident.affectedScreenIds },
        isOnline: false,
      },
    });

    if (stillOffline === 0) {
      await this.resolveIncident(incident.id, {
        resolution: 'All affected screens are back online',
        rootCause: 'auto-detected recovery',
        actorId: null, // system
      });
    }
  }

  // Auto-close RESOLVED incidents after 24h
  await this.prisma.incident.updateMany({
    where: {
      status: 'RESOLVED',
      resolvedAt: { lt: subHours(new Date(), 24) },
    },
    data: { status: 'CLOSED', closedAt: new Date() },
  });
}
```

---

## 7. Fraud & Anomaly Monitoring

### 7.1 Fraud Signal Catalog

| # | Signal                         | Detection Method                     | Severity | Data Source         |
|---|--------------------------------|--------------------------------------|----------|---------------------|
| 1 | Impossible impression rate     | >200 diffusions/device/hour          | HIGH     | diffusion_logs      |
| 2 | Abnormal diffusion duration    | <20% or >200% of creative duration   | MEDIUM   | diffusion_logs + creatives |
| 3 | Media hash mismatch            | played hash ≠ expected hash          | CRITICAL | diffusion_logs + creatives |
| 4 | Duplicate device serial        | Same serialNumber, different screens | CRITICAL | devices             |
| 5 | Ghost device diffusions        | Logs from unassigned/decomm device   | HIGH     | diffusion_logs + devices |
| 6 | Offline screen generating logs | isOnline=false but new diffusion_log | HIGH     | screen_live_status + diffusion_logs |
| 7 | Replay attack (duplicate ts)   | Same device+campaign+time appears 2x | CRITICAL | diffusion_logs      |
| 8 | Volume spike (z-score >3)      | Device daily count 3σ above mean     | MEDIUM   | diffusion_logs (30d window) |
| 9 | Revenue spike per partner      | Partner monthly >150% previous month | LOW      | revenue_shares      |
| 10| Duplicate payout IBAN          | Multiple orgs, same Stripe bank acct | HIGH     | Stripe Connect API  |
| 11| Signature verification failure | HMAC mismatch                        | CRITICAL | diffusion_logs      |
| 12| Time drift attack              | Device clock >5 min from server time | HIGH     | device_heartbeats   |

### 7.2 Fraud Detection Pipeline

```
                    ┌─────────────────────────────┐
                    │    Kafka: diffusion-logs     │
                    └──────────┬──────────────────┘
                               │
                    ┌──────────▼──────────────────┐
                    │  Fraud Detection Workers      │
                    │  (NestJS Bull Queue)          │
                    │                              │
                    │  ┌─ Real-Time Checks ───────┐│
                    │  │ • Signature verification  ││
                    │  │ • Media hash mismatch     ││
                    │  │ • Ghost device check      ││
                    │  │ • Duplicate timestamp      ││
                    │  │ • Offline screen + log     ││
                    │  └───────────────────────────┘│
                    │                              │
                    │  ┌─ Batch Checks (hourly) ──┐│
                    │  │ • Volume spike (z-score)  ││
                    │  │ • Impossible rate          ││
                    │  │ • Duration anomaly         ││
                    │  │ • Time drift               ││
                    │  └───────────────────────────┘│
                    │                              │
                    │  ┌─ Daily Checks ───────────┐│
                    │  │ • Revenue spike per org   ││
                    │  │ • Duplicate IBAN check     ││
                    │  │ • Duplicate serial check   ││
                    │  └───────────────────────────┘│
                    └──────────┬───────────────────┘
                               │
                    ┌──────────▼──────────────────┐
                    │   Fraud Signal Store          │
                    │   (new table: fraud_signals)  │
                    └──────────┬───────────────────┘
                               │
                    ┌──────────▼──────────────────┐
                    │   Risk Score Calculator       │
                    │   (per partner, advertiser)   │
                    └──────────┬───────────────────┘
                               │
              ┌────────────────┼───────────────────┐
              │                │                    │
              ▼                ▼                    ▼
     Score < 30         30 ≤ Score < 70      Score ≥ 70
     (LOW RISK)         (MEDIUM RISK)        (HIGH RISK)
     No action          Flag for review      Auto-hold payout
                        Email FINANCE_ADMIN  Create P2 incident
                                             Notify SUPER_ADMIN
```

### 7.3 Fraud Signal Model

```prisma
enum FraudSignalSeverity {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

enum FraudSignalStatus {
  OPEN
  UNDER_REVIEW
  CONFIRMED_FRAUD
  FALSE_POSITIVE
  DISMISSED
}

model FraudSignal {
  id             String               @id @default(cuid())
  type           String               // matches signal catalog number
  severity       FraudSignalSeverity
  status         FraudSignalStatus    @default(OPEN)

  // Who/what is flagged
  orgId          String?
  orgType        OrgType?
  deviceId       String?
  screenId       String?
  campaignId     String?

  // Evidence
  description    String
  evidence       Json       // { diffusionLogIds: [...], metrics: {...} }
  riskScore      Float      // 0-100

  // Review
  reviewedBy     String?    // admin userId
  reviewedAt     DateTime?
  reviewNotes    String?

  // Actions taken
  payoutHeld     Boolean    @default(false)
  accountFrozen  Boolean    @default(false)

  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt

  @@index([orgId, createdAt])
  @@index([status])
  @@index([severity])
  @@index([type, createdAt])
  @@map("fraud_signals")
}
```

### 7.4 Risk Score Calculation

```typescript
interface RiskFactors {
  signalCount30d: number;          // fraud signals in last 30 days
  criticalSignals: number;         // CRITICAL severity count
  verificationFailureRate: number; // % of diffusion logs failing HMAC
  volumeAnomalyCount: number;      // z-score >3 days in 30d
  hashMismatchRate: number;        // % media hash mismatches
  revenueGrowthRate: number;       // month-over-month revenue change
}

function calculateRiskScore(factors: RiskFactors): number {
  let score = 0;

  // Signal history (0-30 points)
  score += Math.min(factors.signalCount30d * 3, 20);
  score += factors.criticalSignals * 10;

  // Verification failure (0-25 points)
  if (factors.verificationFailureRate > 0.05) score += 15;
  if (factors.verificationFailureRate > 0.10) score += 10;

  // Volume anomaly (0-15 points)
  score += Math.min(factors.volumeAnomalyCount * 5, 15);

  // Hash mismatch (0-20 points)
  if (factors.hashMismatchRate > 0.01) score += 10;
  if (factors.hashMismatchRate > 0.05) score += 10;

  // Revenue spike (0-10 points)
  if (factors.revenueGrowthRate > 1.5) score += 5;  // >150% growth
  if (factors.revenueGrowthRate > 3.0) score += 5;  // >300% growth

  return Math.min(score, 100);
}

// Risk levels:
// 0-29:   LOW         — green badge, no action
// 30-69:  MEDIUM      — yellow badge, flag for review
// 70-100: HIGH        — red badge, auto-hold payout, create incident
```

### 7.5 Fraud Dashboard UI

```
┌─────────────────────────────────────────────────────────────────────┐
│  Fraud & Anomaly Monitoring                                         │
│  [Period: 30d ▾] [Signal Type ▾] [Severity ▾] [Status ▾]          │
│                                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │    47    │ │    12    │ │     3    │ │  €12.4K  │              │
│  │ Open     │ │ Critical │ │ Accounts │ │ Payouts  │              │
│  │ Signals  │ │ Signals  │ │ Frozen   │ │ Held     │              │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘              │
│                                                                     │
│  ┌─ HIGH RISK ENTITIES ─────────────────────────────────────────┐   │
│  │  🔴 Partner: Gaumont (risk: 84)  — 5 signals, payout held    │   │
│  │  🔴 Device: NF-B3X-01234 (risk: 78)  — hash mismatch 12%    │   │
│  │  🟡 Advertiser: FakeAds Inc (risk: 56)  — volume anomaly     │   │
│  │  [View All]                                                   │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─ RECENT SIGNALS ─────────────────────────────────────────────┐   │
│  │ Signal    │ Type           │ Entity     │ Sev  │ Status       │   │
│  │ FRD-0847  │ Hash mismatch  │ NF-B3X-012 │ CRIT │ OPEN   [🔍] │   │
│  │ FRD-0845  │ Volume spike   │ Gaumont    │ HIGH │ REVIEW [🔍] │   │
│  │ FRD-0842  │ Offline+logs   │ Screen-456 │ HIGH │ OPEN   [🔍] │   │
│  │ FRD-0839  │ Replay attack  │ NF-A7X-089 │ CRIT │ CONFIRMED   │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Click signal → Detail panel with evidence, actions:                │
│  [Mark False Positive] [Confirm Fraud] [Freeze Account]            │
│  [Hold Payout] [Dismiss] [Create Incident]                          │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.6 Admin Override Controls

| Action               | Requires Role   | MFA | Audit Level | Reversible |
|----------------------|:---------------:|:---:|:-----------:|:----------:|
| Freeze account       | SUPER_ADMIN     | Yes | CRITICAL    | Yes        |
| Unfreeze account     | SUPER_ADMIN     | Yes | CRITICAL    | —          |
| Hold payout          | FINANCE_ADMIN+  | Yes | CRITICAL    | Yes        |
| Release held payout  | SUPER_ADMIN     | Yes | CRITICAL    | —          |
| Confirm fraud signal | FINANCE_ADMIN+  | No  | WARN        | Yes        |
| Dismiss signal       | PLATFORM_ADMIN+ | No  | INFO        | Yes        |
| Override fraud flag  | SUPER_ADMIN     | Yes | CRITICAL    | Yes        |

### 7.7 Audit Log Structure for Fraud Actions

```typescript
// Every fraud action generates a CRITICAL audit log entry:
{
  action: 'FRAUD_ACCOUNT_FREEZE' | 'FRAUD_PAYOUT_HOLD' | 'FRAUD_SIGNAL_CONFIRM' | ...,
  entity: 'FraudSignal' | 'Organization' | 'Payout',
  entityId: '...',
  severity: 'CRITICAL',
  oldData: { /* previous state */ },
  newData: { /* new state + reason */ },
  userId: admin.id,
  orgId: affectedOrg.id,
  ipAddress: request.ip,
  userAgent: request.headers['user-agent'],
  // Retained for 7 years per compliance
}
```

---

## 8. System Health & Observability

### 8.1 Service Inventory

| Service           | Port  | Protocol       | Health Endpoint        | Key Metrics                          |
|-------------------|-------|----------------|------------------------|--------------------------------------|
| API Gateway       | 3001  | HTTP + WS      | GET /health            | req/s, p95 latency, error rate       |
| Device Manager    | —     | Kafka consumer  | Internal heartbeat     | heartbeats/s, command latency        |
| Diffusion Engine  | —     | Kafka consumer  | Internal heartbeat     | logs/s, verification latency         |
| Billing Service   | —     | Kafka consumer  | Internal heartbeat     | webhooks/s, payment processing time  |
| Analytics Pipeline| —     | Kafka consumer  | Internal heartbeat     | events/s, aggregation lag            |
| WebSocket Gateway | 3001  | WS              | Connection count       | connections, messages/s, reconnects  |
| PostgreSQL        | 5432  | TCP             | pg_isready             | connections, query time, replication lag |
| Redis             | 6379  | TCP             | PING                   | memory, ops/s, keyspace              |
| Kafka             | 9092  | TCP             | Broker health          | consumer lag, partitions, throughput  |

### 8.2 Observability Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  System Observability                                               │
│                                                                     │
│  ┌─ SERVICE STATUS GRID ─────────────────────────────────────────┐ │
│  │  🟢 API Gateway      p95: 48ms    err: 0.02%   req: 1.2K/s   │ │
│  │  🟢 Device Manager   hb/s: 1.8K   cmd-lat: 120ms             │ │
│  │  🟢 Diffusion Engine log/s: 12.4K  ver-lat: 8ms              │ │
│  │  🟡 Billing Service  wh/s: 23     proc: 340ms  (elevated)    │ │
│  │  🟢 Analytics        evt/s: 45K    agg-lag: 12s              │ │
│  │  🟢 WebSocket GW     conn: 98.4K   msg/s: 24K               │ │
│  │  🟢 PostgreSQL       conn: 847/1000  qry-p95: 12ms          │ │
│  │  🟢 Redis            mem: 2.1GB/8GB  ops: 45K/s             │ │
│  │  🟢 Kafka            lag: 234       partitions: healthy       │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌─ API LATENCY (last 1h) ──────┐ ┌─ ERROR RATE (last 1h) ────┐  │
│  │  [Line chart: p50, p95, p99] │ │ [Line chart: 4xx, 5xx]    │  │
│  │  Current p95: 48ms           │ │ Current: 0.02%             │  │
│  │  Threshold: 200ms            │ │ Threshold: 1%              │  │
│  └──────────────────────────────┘ └─────────────────────────────┘  │
│                                                                     │
│  ┌─ KAFKA CONSUMER LAG ─────────┐ ┌─ DB CONNECTIONS ───────────┐  │
│  │  diffusion-logs:    12       │ │ Active:    847             │  │
│  │  device-heartbeats: 234      │ │ Idle:      124             │  │
│  │  analytics-events:  1,847    │ │ Max:       1,000           │  │
│  │  payment-events:    0        │ │ [Trend sparkline]          │  │
│  │  [Lag trend chart]           │ │                            │  │
│  └──────────────────────────────┘ └────────────────────────────┘  │
│                                                                     │
│  ┌─ LOG INGESTION THROUGHPUT ────────────────────────────────────┐ │
│  │  [Stacked area chart: diffusion logs, heartbeats, analytics] │ │
│  │  Total: 58.4K events/sec                                      │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.3 Health Status Calculation

```typescript
enum ServiceHealth {
  GREEN  = 'GREEN',   // All metrics within thresholds
  ORANGE = 'ORANGE',  // One or more metrics elevated (warning)
  RED    = 'RED',     // Critical threshold breached
}

interface ServiceThresholds {
  latencyP95Warning: number;   // ms
  latencyP95Critical: number;  // ms
  errorRateWarning: number;    // percentage
  errorRateCritical: number;   // percentage
  customChecks?: (metrics: ServiceMetrics) => ServiceHealth;
}

const SERVICE_THRESHOLDS: Record<string, ServiceThresholds> = {
  'api-gateway': {
    latencyP95Warning: 200,
    latencyP95Critical: 500,
    errorRateWarning: 0.5,
    errorRateCritical: 2.0,
  },
  'billing-service': {
    latencyP95Warning: 500,
    latencyP95Critical: 2000,
    errorRateWarning: 0.1,
    errorRateCritical: 1.0,
  },
  'postgresql': {
    latencyP95Warning: 50,
    latencyP95Critical: 200,
    errorRateWarning: 0,
    errorRateCritical: 0,
    customChecks: (m) => {
      if (m.connectionCount > m.maxConnections * 0.9) return ServiceHealth.RED;
      if (m.connectionCount > m.maxConnections * 0.7) return ServiceHealth.ORANGE;
      if (m.replicationLag > 30) return ServiceHealth.RED;
      if (m.replicationLag > 5) return ServiceHealth.ORANGE;
      return ServiceHealth.GREEN;
    },
  },
  'kafka': {
    latencyP95Warning: 100,
    latencyP95Critical: 500,
    errorRateWarning: 0,
    errorRateCritical: 0,
    customChecks: (m) => {
      if (m.consumerLag > 10000) return ServiceHealth.RED;
      if (m.consumerLag > 1000) return ServiceHealth.ORANGE;
      return ServiceHealth.GREEN;
    },
  },
};
```

### 8.4 Monitoring Integration

```
┌─────────────────────────────────────────────────────────────────┐
│                    Data Collection Layer                         │
│                                                                 │
│  NestJS Services ──→ Prometheus Exporter (prom-client)          │
│  PostgreSQL      ──→ postgres_exporter                          │
│  Redis           ──→ redis_exporter                             │
│  Kafka           ──→ kafka_exporter                             │
│  Node.js Runtime ──→ prom-client (GC, event loop, memory)       │
│                                                                 │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Prometheus (scrape every 15s)                 │
│                                                                 │
│  Metrics stored with 15-day retention                           │
│  Alert rules → Alertmanager → PagerDuty / Slack                 │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Grafana (visualization)                       │
│                                                                 │
│  Pre-built dashboards:                                          │
│  1. API Overview (latency, throughput, errors)                  │
│  2. Kafka Overview (consumer lag, throughput)                   │
│  3. PostgreSQL Overview (connections, queries, replication)     │
│  4. Redis Overview (memory, ops, keyspace)                      │
│  5. Node.js Runtime (GC, event loop, heap)                     │
│                                                                 │
│  Embedded in Admin Cockpit via <iframe> or Grafana API          │
└─────────────────────────────────────────────────────────────────┘
```

### 8.5 Alert Thresholds

| Metric                          | Warning           | Critical          | Action                       |
|---------------------------------|-------------------|-------------------|------------------------------|
| API p95 latency                 | >200ms for 2 min  | >500ms for 1 min  | P2 incident + Slack          |
| API error rate (5xx)            | >0.5% for 5 min   | >2% for 2 min     | P1 incident + PagerDuty      |
| Kafka consumer lag              | >1,000             | >10,000            | P2 incident + Slack          |
| PostgreSQL connections          | >70% capacity      | >90% capacity      | P1 incident + PagerDuty      |
| PostgreSQL replication lag      | >5s                | >30s               | P1 incident + PagerDuty      |
| Redis memory                    | >70% maxmemory     | >90% maxmemory     | P2 incident + Slack          |
| WebSocket connections drop      | >10% drop in 1 min | >30% drop in 1 min | P1 incident (likely outage)  |
| Log ingestion rate drop         | >20% drop          | >50% drop          | P2 incident                  |
| Diffusion verification backlog  | >5,000 unverified  | >50,000 unverified | P2 incident + Slack          |

### 8.6 Admin Cockpit Integration Strategy

```typescript
// Option 1: Grafana Embedded Panels (recommended for v1)
// Embed Grafana panels via iframe with service account token
// Pros: Leverages existing Grafana dashboards, no duplication
// Cons: Requires Grafana service account, slight UX mismatch

// packages/api/src/system/system.controller.ts
@Get('system/grafana-url')
@Permissions(AdminPermission.SYSTEM_OBSERVABILITY)
async getGrafanaEmbedUrl(@Query('dashboard') dashboard: string) {
  const token = this.config.get('GRAFANA_SERVICE_TOKEN');
  return {
    url: `${GRAFANA_BASE_URL}/d/${dashboard}?orgId=1&kiosk=tv`,
    token, // short-lived embed token
  };
}

// Option 2: Native Integration (recommended for v2)
// Query Prometheus directly via PromQL API
// Render charts with Recharts/Nivo in React
// Pros: Full control over UX, unified design system
// Cons: More development effort

@Get('system/metrics')
@Permissions(AdminPermission.SYSTEM_OBSERVABILITY)
async getSystemMetrics(@Query() query: MetricsQueryDto) {
  const [apiLatency, errorRate, wsConnections, kafkaLag] = await Promise.all([
    this.prometheus.query('histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))'),
    this.prometheus.query('rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])'),
    this.redis.scard('ws:connections'),
    this.prometheus.query('kafka_consumergroup_lag'),
  ]);
  return { apiLatency, errorRate, wsConnections, kafkaLag };
}
```

---

## 9. Data Pipeline Architecture

### 9.1 End-to-End Data Flow Diagram

```
═══════════════════════════════════════════════════════════════════
                     WRITE PATH (Event Producers)
═══════════════════════════════════════════════════════════════════

TV Device (100K)              Advertiser Apps            Stripe Webhooks
     │                              │                         │
     ├─ heartbeat (1/min)           ├─ campaign CRUD          ├─ invoice.*
     ├─ diffusion log               ├─ booking CRUD           ├─ payment_intent.*
     ├─ error log                   ├─ creative upload        ├─ subscription.*
     ├─ metrics (1/5min)            │                         ├─ payout.*
     │                              │                         │
     ▼                              ▼                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     NestJS API Gateway (port 3001)              │
│                                                                 │
│  Validates → Authenticates → Rate limits → Routes               │
│                                                                 │
│  High-volume writes go to Kafka (non-blocking):                 │
│  Low-volume writes go directly to PostgreSQL:                   │
└────────┬──────────────┬──────────────────────┬──────────────────┘
         │              │                      │
         ▼              ▼                      ▼
    ┌─────────┐   ┌───────────┐         ┌───────────┐
    │  Kafka  │   │ PostgreSQL│         │ PostgreSQL │
    │ (async) │   │ (sync)    │         │ (sync)     │
    └────┬────┘   └───────────┘         └───────────┘
         │        Campaign CRUD          Stripe mirrors
         │        Booking CRUD           (StripeInvoice,
         │        Screen CRUD             StripePayment, etc.)
         │        User CRUD
         │
═══════════╪═══════════════════════════════════════════════════════
           │       KAFKA TOPIC STRUCTURE
═══════════╪═══════════════════════════════════════════════════════
         │
         ├── Topic: device-heartbeats     (100K msgs/min)
         │     Key: deviceId
         │     Partitions: 32 (by device hash)
         │     Retention: 24h
         │
         ├── Topic: diffusion-logs        (12K msgs/sec peak)
         │     Key: screenId
         │     Partitions: 64 (by screen hash)
         │     Retention: 7d
         │
         ├── Topic: device-errors         (variable, bursty)
         │     Key: deviceId
         │     Partitions: 16
         │     Retention: 72h
         │
         ├── Topic: device-metrics        (20K msgs/5min)
         │     Key: deviceId
         │     Partitions: 16
         │     Retention: 24h
         │
         ├── Topic: analytics-events      (45K msgs/sec)
         │     Key: screenId
         │     Partitions: 64
         │     Retention: 48h
         │
         ├── Topic: payment-events        (low volume)
         │     Key: organizationId
         │     Partitions: 8
         │     Retention: 7d
         │
         ├── Topic: campaign-overrides    (rare)
         │     Key: campaignId
         │     Partitions: 8
         │     Retention: 72h
         │
         └── Topic: fraud-signals         (low volume)
               Key: orgId
               Partitions: 8
               Retention: 30d

═══════════════════════════════════════════════════════════════════
                     READ PATH (Event Consumers)
═══════════════════════════════════════════════════════════════════

┌───────────────────────────────────────────────────────────────┐
│                     Consumer Groups                            │
│                                                               │
│  ┌─ cg-screen-status-updater ─────────────────────────────┐  │
│  │  Consumes: device-heartbeats, device-metrics            │  │
│  │  Writes to: screen_live_status (UPSERT)                 │  │
│  │  Also: Redis Pub/Sub → WebSocket (fleet-status)         │  │
│  │  Concurrency: 8 workers                                 │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ cg-diffusion-processor ───────────────────────────────┐  │
│  │  Consumes: diffusion-logs                               │  │
│  │  Step 1: Verify HMAC signature                          │  │
│  │  Step 2: Write to PostgreSQL (diffusion_logs table)     │  │
│  │  Step 3: Update screen_live_status.currentCampaignId    │  │
│  │  Step 4: Emit to Redis Pub/Sub (fleet-status)           │  │
│  │  Step 5: Forward to cg-fraud-detector                   │  │
│  │  Concurrency: 16 workers                                │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ cg-fraud-detector ────────────────────────────────────┐  │
│  │  Consumes: diffusion-logs (separate consumer group)     │  │
│  │  Real-time checks: signature, hash, ghost, replay       │  │
│  │  Writes to: fraud_signals                               │  │
│  │  Concurrency: 4 workers                                 │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ cg-analytics-writer ──────────────────────────────────┐  │
│  │  Consumes: analytics-events                             │  │
│  │  Batch writes to: analytics_events (bulk INSERT)        │  │
│  │  Batch size: 1000, flush interval: 5s                   │  │
│  │  Future: route to ClickHouse instead of PostgreSQL      │  │
│  │  Concurrency: 8 workers                                 │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ cg-incident-detector ─────────────────────────────────┐  │
│  │  Consumes: device-heartbeats, device-errors,            │  │
│  │            payment-events, fraud-signals                 │  │
│  │  Applies incident detection rules (section 6.4)         │  │
│  │  Writes to: incidents, incident_timeline                │  │
│  │  Emits: Redis Pub/Sub → ws:incidents                    │  │
│  │  Concurrency: 2 workers                                 │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ cg-billing-processor ─────────────────────────────────┐  │
│  │  Consumes: payment-events                               │  │
│  │  Updates: stripe_payments, stripe_invoices,              │  │
│  │           stripe_subscriptions                           │  │
│  │  Emits: finance-alerts to ws:finance-alerts             │  │
│  │  Concurrency: 2 workers                                 │  │
│  └─────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

### 9.2 Read Models vs Write Models (CQRS)

```
WRITE MODELS (Source of Truth)          READ MODELS (Projections for Admin)
─────────────────────────────          ───────────────────────────────────

diffusion_logs (append-only)    ──→    campaign_delivery_stats_mv
  100/screen/day, partitioned          (materialized view, refresh 5min)
  HMAC-signed, immutable              Aggregated: delivery %, impressions/h

device_heartbeats (append-only) ──→    screen_live_status (projection table)
  1/device/min, 24h retention          1 row per screen, updated in real-time
                                       Fields: isOnline, lastHeartbeat, CPU, etc.

stripe_payments (mirrored)      ──→    admin_financial_summary_mv
stripe_invoices (mirrored)             (materialized view, refresh 5min)
stripe_subscriptions (mirrored)        Aggregated: MRR, revenue today, failures

revenue_shares (calculated)     ──→    payout_pipeline_summary
payouts (transactional)                (materialized view, refresh 1min)
                                       Aggregated: by status, total amounts

fraud_signals (append-mostly)   ──→    org_risk_scores (projection table)
                                       1 row per org, recalculated hourly
                                       Fields: riskScore, signalCount, lastSignal

incidents (transactional)       ──→    incident_summary_mv
                                       (materialized view, refresh 1min)
                                       Aggregated: by status, severity, SLA breach count
```

### 9.3 Projection Tables for Admin

```sql
-- 1. Screen Live Status (already in schema — updated by cg-screen-status-updater)
-- screen_live_status: 1 row per active screen, always current

-- 2. Campaign Delivery Stats (materialized view)
CREATE MATERIALIZED VIEW campaign_delivery_stats_mv AS
SELECT ... (see section 2.4);

-- 3. Financial Summary (materialized view)
CREATE MATERIALIZED VIEW admin_financial_summary_mv AS
SELECT ... (see section 2.4);

-- 4. Organization Risk Scores (projection table)
CREATE TABLE org_risk_scores (
  org_id          TEXT PRIMARY KEY,
  org_type        TEXT NOT NULL,
  risk_score      FLOAT NOT NULL DEFAULT 0,
  signal_count_30d INT NOT NULL DEFAULT 0,
  critical_signals INT NOT NULL DEFAULT 0,
  last_signal_at   TIMESTAMPTZ,
  payout_held      BOOLEAN NOT NULL DEFAULT false,
  account_frozen   BOOLEAN NOT NULL DEFAULT false,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Updated hourly by fraud batch job

-- 5. Payout Pipeline Summary
CREATE MATERIALIZED VIEW payout_pipeline_summary_mv AS
SELECT
  rs.status,
  COUNT(*) AS partner_count,
  SUM(rs.partner_share_cents) AS total_cents,
  rs.currency
FROM revenue_shares rs
WHERE rs.period_start >= date_trunc('month', now())
GROUP BY rs.status, rs.currency
WITH NO DATA;

-- 6. Incident Summary
CREATE MATERIALIZED VIEW incident_summary_mv AS
SELECT
  status,
  severity,
  COUNT(*) AS count,
  COUNT(*) FILTER (WHERE sla_deadline < now() AND status NOT IN ('RESOLVED', 'CLOSED'))
    AS sla_breached,
  MIN(opened_at) AS oldest_open
FROM incidents
WHERE status NOT IN ('CLOSED')
  OR closed_at > now() - interval '24 hours'
GROUP BY status, severity
WITH NO DATA;
```

### 9.4 Refresh Schedule

| Projection                    | Type                  | Refresh           | Trigger                    |
|-------------------------------|-----------------------|-------------------|----------------------------|
| screen_live_status            | Projection table      | Real-time         | Kafka consumer (heartbeat) |
| campaign_delivery_stats_mv    | Materialized view     | Every 5 min       | pg_cron                    |
| admin_financial_summary_mv    | Materialized view     | Every 5 min       | pg_cron                    |
| org_risk_scores               | Projection table      | Hourly            | Fraud batch job            |
| payout_pipeline_summary_mv    | Materialized view     | Every 1 min       | pg_cron                    |
| incident_summary_mv           | Materialized view     | Every 1 min       | pg_cron                    |

### 9.5 Future Scale: ClickHouse Migration Path

At 100K+ screens, append-only tables will exceed PostgreSQL comfortable range:

| Table              | Year-1 Volume | Action                                    |
|--------------------|---------------|-------------------------------------------|
| diffusion_logs     | ~3.6B rows    | Partition monthly in PG → migrate to CH   |
| analytics_events   | ~36B rows     | Direct to ClickHouse from day 1 if >10K   |
| device_heartbeats  | ~52B rows     | 24h in PG (for live status) → archive CH  |
| device_metrics     | ~10B rows     | 24h in PG → archive ClickHouse            |

```
Migration strategy:
1. Phase 1 (now): PostgreSQL with monthly partitions + pg_cron retention
2. Phase 2 (>50K screens): Dual-write to ClickHouse via Kafka consumer
3. Phase 3 (>100K screens): Admin dashboard reads from ClickHouse
   for historical analytics, PostgreSQL for real-time (last 24h)
```

---

## 10. Testing & Real-World Scenarios

### 10.1 Operational Scenarios

| # | Scenario | Steps | Expected Outcome | Verification |
|---|----------|-------|-------------------|--------------|
| O1 | **10K screens go offline (region outage)** | 1. Stop heartbeats for 10K devices in IDF region<br>2. Wait 5 min | P1 incident auto-created with `REGION_OUTAGE` type<br>Grouped under parent incident<br>Dashboard shows IDF region RED<br>Slack + PagerDuty alert fired<br>SLA timer starts (5 min ACK) | `incidents` table: 1 parent + N child incidents<br>`screen_live_status`: 10K rows isOnline=false<br>WebSocket: fleet-status events emitted |
| O2 | **Override campaign on 500 screens** | 1. Admin creates FORCE_CAMPAIGN override<br>2. Scope: 500 screens, 2h duration<br>3. Observe diffusion engine behavior | Override created with priority<br>Diffusion engine switches 500 screens<br>Original campaigns paused on those screens<br>AuditLog: CRITICAL entry<br>Auto-expiry after 2h | `campaign_overrides` table: 1 ACTIVE row<br>DiffusionLogs show new campaign within 60s<br>After 2h: status = EXPIRED, original schedule resumes |
| O3 | **Force OTA update on 1K devices** | 1. Admin selects 1K devices<br>2. Push PUSH_CONFIG command with OTA URL<br>3. Track progress | Bulk command created (10 batches of 100)<br>Progress tracked in real-time<br>Devices ACK, download, install, reboot<br>Updated appVersion in heartbeats | `device_commands`: 1000 rows<br>Progress: SENT → ACK → COMPLETED (per device)<br>Timeout handling for non-responsive devices |
| O4 | **Partner onboarding with 200 screens** | 1. Create partner org<br>2. Bulk import 200 screens via CSV<br>3. Pair 200 devices | Screens created, devices provisioned<br>Devices paired via token<br>ScreenLiveStatus rows created<br>Heartbeats begin flowing | `screens`: 200 new rows<br>`devices`: 200 provisioned<br>`screen_live_status`: 200 rows populated within 2 min |
| O5 | **Screen decommission workflow** | 1. Admin marks screen DECOMMISSIONED<br>2. Device unpairing<br>3. Active bookings affected | Screen status = DECOMMISSIONED<br>Device unpaired, activeDeviceId = null<br>Active bookings flagged for review<br>Revenue impact calculated | Booking screens affected notified<br>Revenue adjustment entry created<br>Partner notified |

### 10.2 Financial Scenarios

| # | Scenario | Steps | Expected Outcome | Verification |
|---|----------|-------|-------------------|--------------|
| F1 | **Payment failure spike (50 failures in 5 min)** | 1. Simulate 50 `payment_intent.failed` webhooks<br>2. Various failure codes | P1 incident auto-created: `PAYMENT_FAILURE_SPIKE`<br>Dashboard: failed payments counter spikes<br>Finance alert via WebSocket<br>Each failure logged in stripe_payments | `stripe_payments`: 50 FAILED rows<br>`incidents`: 1 P1 incident<br>Reconciliation flags mismatches |
| F2 | **Retrocession recalculation after rate change** | 1. Change RevenueRule for partner (70% → 65%)<br>2. Run monthly calculation<br>3. Compare with previous month | New rule effective from date<br>Revenue shares recalculated with new rate<br>Old shares unchanged (immutable)<br>Audit log shows rule change | `revenue_rules`: new row with effectiveFrom<br>`revenue_shares`: new period uses 0.65<br>Admin sees delta in reconciliation |
| F3 | **Payout threshold test** | 1. Partner with €85 revenue (below €100 threshold)<br>2. Run payout pipeline | RevenueShare calculated<br>Payout NOT created (below threshold)<br>Partner flagged in "needs attention" list<br>Carry forward to next month | `revenue_shares`: CALCULATED status<br>`payouts`: no row created<br>Dashboard shows partner in threshold hold list |
| F4 | **Stripe Connect onboarding incomplete** | 1. Partner without stripeConnectAccountId<br>2. Payout approved by FINANCE_ADMIN | Payout creation blocked<br>Error: "Partner not onboarded to Stripe Connect"<br>Partner added to onboarding-needed list | `payouts`: no row created<br>Dashboard: partner in "without Connect" list |
| F5 | **Invoice-booking reconciliation mismatch** | 1. Manually create Stripe invoice with wrong amount<br>2. Run reconciliation check | Mismatch detected (delta > €1 tolerance)<br>Flagged in reconciliation tab<br>P3 incident created if >€100 delta | `admin_financial_summary_mv` shows mismatch count<br>Reconciliation detail shows exact delta |

### 10.3 Fraud Scenarios

| # | Scenario | Steps | Expected Outcome | Verification |
|---|----------|-------|-------------------|--------------|
| FR1 | **Fake diffusion log injection** | 1. Device sends diffusion log with invalid HMAC<br>2. Also: log with wrong mediaHash | Signature verification fails<br>FraudSignal created: CRITICAL<br>Device flagged, partner risk score increases<br>If score >70: auto-hold payout | `diffusion_logs`: verified=false<br>`fraud_signals`: 1+ new rows<br>`org_risk_scores`: updated |
| FR2 | **Duplicate webhook replay** | 1. Replay a `payment_intent.succeeded` webhook<br>2. Same stripeEventId | StripeWebhookEvent dedup check catches duplicate<br>Processed=true for original, second rejected<br>No double payment recorded | `stripe_webhook_events`: only 1 row for eventId<br>`stripe_payments`: amount unchanged |
| FR3 | **Webhook replay with modified amount** | 1. Send webhook with valid stripeEventId but modified payload<br>2. Compare signatures | Stripe signature verification fails (wrong sig)<br>Webhook rejected with 400<br>FraudSignal: webhook_tampering | `stripe_webhook_events`: 0 new rows<br>API returns 400<br>`fraud_signals`: 1 CRITICAL signal |
| FR4 | **Ghost device generating diffusion logs** | 1. Device not assigned to any screen sends diffusion logs<br>2. Also: decommissioned device sends logs | Ghost device check catches mismatch<br>FraudSignal: CRITICAL for each<br>Logs stored but verified=false | `fraud_signals`: entries with type=ghost_device<br>`diffusion_logs`: verified=false |
| FR5 | **Impossible impression rate** | 1. Device sends 500 diffusion logs in 1 hour<br>2. Normal rate: ~100/hour | Hourly batch check detects z-score >3<br>FraudSignal: HIGH<br>Partner risk score increases | `fraud_signals`: volume_spike type<br>`org_risk_scores`: score increased |

### 10.4 Performance Scenarios

| # | Scenario | Target | Measurement | Approach |
|---|----------|--------|-------------|----------|
| P1 | **Dashboard load with 100K screens** | Initial load <3s | Time to first meaningful paint | screen_live_status projection table (100K rows)<br>Paginated API (50 per page)<br>Map uses clustering (no 100K markers)<br>KPIs from materialized views (single row) |
| P2 | **1M diffusion logs/hour ingestion** | 0 message loss, <5s lag | Kafka consumer lag, DB write throughput | 64 partitions on diffusion-logs topic<br>16 consumer workers<br>Batch INSERT (1000 rows per batch)<br>Monthly table partitioning |
| P3 | **Real-time fleet view latency** | Screen status update <5s end-to-end | Device heartbeat → admin browser | Device → API: <1s (HTTP POST)<br>API → Kafka: <100ms<br>Kafka → Consumer: <500ms<br>Consumer → Redis Pub/Sub: <100ms<br>Redis → WebSocket → Browser: <500ms<br>**Total: <2.5s** |
| P4 | **Financial dashboard with 1 year data** | Charts render <2s | Query + render time | Materialized views (pre-aggregated)<br>Monthly granularity for 12-month charts<br>Daily granularity only for last 30 days |
| P5 | **Concurrent admin users (50)** | No degradation | Response times, WS stability | WebSocket rooms (not broadcast all)<br>API rate limiting per admin<br>Materialized views avoid query storms<br>Redis cache for shared data |
| P6 | **Bulk operations (10K screen select)** | Complete <30s | Operation duration | Background job with progress tracking<br>Batch processing (100 per chunk)<br>WebSocket progress updates |

### 10.5 Security Scenarios

| # | Scenario | Attack Vector | Defense | Verification |
|---|----------|---------------|---------|--------------|
| S1 | **Unauthorized admin access** | Attempt to access /admin endpoints without platformRole | JwtAuthGuard checks platformRole existence<br>Returns 403 Forbidden<br>AuditLog: unauthorized attempt | API returns 403<br>`audit_logs`: entry with action=UNAUTHORIZED_ACCESS |
| S2 | **Role escalation attempt** | SUPPORT user calls FINANCE-only endpoint | PermissionsGuard checks role permissions<br>Returns 403<br>Rate-limit escalation attempts (3 → lock) | API returns 403<br>After 3 attempts: temporary IP block<br>`audit_logs`: CRITICAL entries |
| S3 | **WebSocket hijack attempt** | Connect to /admin/ws without valid JWT | WebSocket gateway validates JWT on connection<br>Unauthenticated connections rejected<br>No room subscriptions allowed | WebSocket connection refused<br>No data leakage |
| S4 | **CSRF on admin actions** | Cross-site request forgery on payout approval | CSRF token required for all mutations<br>SameSite=Strict cookies<br>Origin header validation | Forged request blocked<br>No payout created |
| S5 | **SQL injection via search** | Malicious input in fleet search bar | Prisma parameterized queries<br>Input validation via Zod schemas<br>No raw SQL in search endpoints | Query parameterized, no injection<br>Zod validation rejects bad input |
| S6 | **Admin session theft** | Stolen JWT used from different IP | IP comparison on sensitive actions (payout)<br>MFA re-challenge for financial mutations<br>Short-lived tokens (15 min) | IP mismatch → force re-auth<br>MFA challenge before payout approval |
| S7 | **Data exfiltration via export** | Admin exports all financial data | Export audit logged<br>Export rate limited (5/hour)<br>Export requires MFA confirmation<br>File encrypted at rest | `audit_logs`: EXPORT action logged<br>Rate limit enforced<br>MFA prompt shown |

### 10.6 Summary: UX Design Structure

```
apps/web-admin/src/app/
├── layout.tsx                    # Root layout with sidebar navigation
├── page.tsx                      # Redirect to /dashboard
│
├── dashboard/
│   └── page.tsx                  # Section 2: Executive overview
│
├── fleet/
│   ├── page.tsx                  # Section 3: Fleet map + list view
│   └── [screenId]/
│       └── page.tsx              # Section 3: Screen detail (or drawer)
│
├── campaigns/
│   ├── page.tsx                  # Section 4: Campaign list + supervision
│   ├── [campaignId]/
│   │   └── page.tsx              # Campaign detail + delivery stats
│   └── overrides/
│       └── page.tsx              # Active overrides management
│
├── organizations/
│   ├── page.tsx                  # Partner + advertiser list
│   └── [orgId]/
│       └── page.tsx              # Org detail + members
│
├── finance/
│   ├── page.tsx                  # Section 5: Revenue tab (default)
│   ├── payouts/
│   │   └── page.tsx              # Payouts tab
│   ├── reconciliation/
│   │   └── page.tsx              # Reconciliation tab
│   └── exports/
│       └── page.tsx              # Export tab
│
├── fraud/
│   ├── page.tsx                  # Section 7: Fraud signal list
│   └── [signalId]/
│       └── page.tsx              # Signal detail + actions
│
├── incidents/
│   ├── page.tsx                  # Section 6: Incident list
│   └── [incidentId]/
│       └── page.tsx              # Incident detail + timeline
│
├── system/
│   └── page.tsx                  # Section 8: Observability dashboard
│
├── audit/
│   └── page.tsx                  # Audit log viewer + search
│
└── settings/
    ├── page.tsx                  # Platform settings (SUPER_ADMIN only)
    ├── users/
    │   └── page.tsx              # Admin user management
    └── revenue-rules/
        └── page.tsx              # Revenue rule management
```

### 10.7 New Prisma Models Summary

Models to add to the existing schema:

| Model              | Purpose                        | Section |
|--------------------|--------------------------------|---------|
| CampaignOverride   | Campaign force/block overrides | 4       |
| DeviceCommand      | Remote command tracking        | 3       |
| Incident           | NOC incident management        | 6       |
| IncidentComment    | Internal incident discussion   | 6       |
| IncidentTimeline   | Incident status history        | 6       |
| FraudSignal        | Fraud detection results        | 7       |

Projection tables (raw SQL, not Prisma):

| Table/View                     | Purpose                           | Section |
|--------------------------------|-----------------------------------|---------|
| admin_financial_summary_mv     | Dashboard financial KPIs          | 2       |
| campaign_delivery_stats_mv     | Campaign health scores            | 2       |
| org_risk_scores                | Per-org fraud risk scores         | 7       |
| payout_pipeline_summary_mv     | Payout status aggregation         | 9       |
| incident_summary_mv            | Incident status aggregation       | 9       |

### 10.8 New Enums Summary

```prisma
// Add to PlatformRole
enum PlatformRole {
  SUPER_ADMIN
  ADMIN
  SUPPORT
  FINANCE_ADMIN       // NEW
  READ_ONLY_AUDITOR   // NEW
}

// New enums
enum OverrideType      { FORCE_CAMPAIGN, BLOCK_CAMPAIGN, EMERGENCY_BLANK }
enum OverrideStatus    { ACTIVE, EXPIRED, CANCELLED }
enum IncidentSeverity  { P1_CRITICAL, P2_HIGH, P3_MEDIUM, P4_LOW }
enum IncidentStatus    { OPEN, ACKNOWLEDGED, INVESTIGATING, RESOLVED, CLOSED }
enum IncidentType      { SCREEN_OFFLINE, DEVICE_CRASH, DIFFUSION_BLACKOUT, CDN_FAILURE,
                         PAYMENT_FAILURE_SPIKE, FRAUD_ANOMALY, API_DEGRADATION,
                         REGION_OUTAGE, MANUAL }
enum FraudSignalSeverity { LOW, MEDIUM, HIGH, CRITICAL }
enum FraudSignalStatus   { OPEN, UNDER_REVIEW, CONFIRMED_FRAUD, FALSE_POSITIVE, DISMISSED }
enum CommandStatus       { PENDING, SENT, ACK, EXECUTING, COMPLETED, FAILED, TIMEOUT }
```

### 10.9 Technology Stack Summary

| Layer              | Technology                    | Purpose                                |
|--------------------|-------------------------------|----------------------------------------|
| Frontend           | Next.js 15 + App Router       | Admin dashboard SPA                    |
| UI Components      | @neofilm/ui (Radix + Tailwind)| Consistent design system               |
| Charts             | Recharts or Nivo              | Dashboard visualizations               |
| Maps               | Mapbox GL JS or Leaflet       | Fleet map with clustering              |
| State Management   | React Query (TanStack)        | Server state + polling                 |
| WebSocket Client   | socket.io-client              | Real-time updates                      |
| Backend            | NestJS 11                     | API + WebSocket gateway                |
| Message Queue      | Apache Kafka                  | Event streaming (high-volume)          |
| Cache              | Redis                         | Pub/Sub, session cache, rate limiting  |
| Primary DB         | PostgreSQL                    | OLTP, materialized views               |
| Analytics DB       | ClickHouse (future)           | OLAP for historical queries            |
| Monitoring         | Prometheus + Grafana          | Metrics collection + visualization     |
| Alerting           | Alertmanager + PagerDuty      | Incident escalation                    |
| Payments           | Stripe + Stripe Connect       | Billing + partner payouts              |

---

## Appendix A: Implementation Priority

| Phase | Sections         | Duration | Dependencies      |
|-------|------------------|----------|-------------------|
| **1** | RBAC (1) + Dashboard (2) + Fleet (3) | 4 weeks | Kafka setup, WebSocket gateway |
| **2** | Campaigns (4) + Incidents (6)        | 3 weeks | Phase 1               |
| **3** | Finance (5) + Fraud (7)              | 4 weeks | Stripe Connect setup  |
| **4** | Observability (8) + Pipelines (9)    | 3 weeks | Prometheus/Grafana    |
| **5** | Testing (10) + Hardening             | 2 weeks | All phases            |

---

*Document generated: 2026-02-25*
*Schema version: Prisma v2 (production)*
*Target: 100K+ screens, enterprise-grade*

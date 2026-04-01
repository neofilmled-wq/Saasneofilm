# NeoFilm - Permission Matrix

## Roles

| Role | Description | Hierarchy |
|------|-------------|-----------|
| **SUPER_ADMIN** | Full platform access | Inherits ADMIN + SUPPORT |
| **ADMIN** | Platform management | Inherits SUPPORT |
| **SUPPORT** | Read-only customer support | - |
| **PARTNER** | Cinema/venue owner | Independent |
| **ADVERTISER** | Brand/agency | Independent |
| **DEVICE** | Android TV screen | Independent (machine) |

## Permission Matrix

| Permission | SUPER_ADMIN | ADMIN | SUPPORT | PARTNER | ADVERTISER | DEVICE |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Users** | | | | | | |
| users:read | x | x | x | - | - | - |
| users:create | x | x | - | - | - | - |
| users:update | x | x | - | - | - | - |
| users:delete | x | - | - | - | - | - |
| **Partners** | | | | | | |
| partners:read | x | x | x | own | - | - |
| partners:create | x | x | - | - | - | - |
| partners:update | x | x | - | own | - | - |
| partners:delete | x | x | - | - | - | - |
| **Venues** | | | | | | |
| venues:read | x | x | x | own | x | - |
| venues:create | x | x | - | x | - | - |
| venues:update | x | x | - | own | - | - |
| venues:delete | x | x | - | own | - | - |
| **Devices** | | | | | | |
| devices:read | x | x | x | own | - | own |
| devices:create | x | x | - | x | - | - |
| devices:update | x | x | - | own | - | own |
| devices:delete | x | x | - | own | - | - |
| devices:provision | x | x | - | x | - | - |
| **Campaigns** | | | | | | |
| campaigns:read | x | x | x | venue | own | sched |
| campaigns:create | x | x | - | - | x | - |
| campaigns:update | x | x | - | - | own | - |
| campaigns:delete | x | x | - | - | own | - |
| campaigns:approve | x | x | - | - | - | - |
| **Creatives** | | | | | | |
| creatives:read | x | x | x | - | own | sched |
| creatives:create | x | x | - | - | x | - |
| creatives:update | x | x | - | - | own | - |
| creatives:delete | x | x | - | - | own | - |
| creatives:approve | x | x | - | - | - | - |
| **Schedules** | | | | | | |
| schedules:read | x | x | x | own | x | own |
| schedules:create | x | x | - | x | - | - |
| schedules:update | x | x | - | own | - | - |
| schedules:delete | x | x | - | own | - | - |
| **Invoices** | | | | | | |
| invoices:read | x | x | x | own | own | - |
| invoices:create | x | x | - | - | - | - |
| invoices:update | x | x | - | - | - | - |
| **Analytics** | | | | | | |
| analytics:read | x | x | x | own | own | - |
| analytics:export | x | x | - | - | - | - |
| **Audit** | | | | | | |
| audit:read | x | x | - | - | - | - |
| **System** | | | | | | |
| system:settings | x | x | - | - | - | - |
| system:mfa-manage | x | - | - | - | - | - |

**Legend:**
- `x` = Full access
- `own` = Only own resources (filtered by partnerId/advertiserId)
- `venue` = Only campaigns for own venues
- `sched` = Only scheduled/assigned content
- `-` = No access

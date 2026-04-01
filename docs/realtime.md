# docs/realtime.md — WebSocket & Realtime Contract

> Reference for all WebSocket gateways, events, rooms, and client integration patterns.
> Source of truth for the Event Catalog.

---

## Architecture Overview

NeoFilm uses **Socket.IO 4.8** for real-time communication. The NestJS API hosts **6 WebSocket gateways**, each on its own namespace. A **Redis adapter** is used in production for multi-instance scaling.

```
Client Apps                      API (port 3001)
─────────                        ───────────────
TV Device      ──/devices──→     DeviceGateway
Admin UI       ──/admin──→       AdminGateway
Admin UI       ──/screen-status  ScreenStatusGateway
Partner UI     ──/partner──→     PartnerGateway
All apps       ──/messaging──→   MessagingGateway
Adv/Partner    ──/dashboard──→   DashboardGateway
```

---

## Connection Pattern (Frontend)

All Next.js frontends connect via `socket.io-client`. Each app has a `SocketProvider` context.

```typescript
// Advertiser / Partner pattern
import { io } from 'socket.io-client';

const socket = io(process.env.NEXT_PUBLIC_WS_URL, {
  namespace: '/partner',       // or '/admin', '/messaging', etc.
  auth: { token: jwt },        // Bearer JWT from session
  transports: ['websocket'],   // skip polling for TV devices
});

// Join org room after connection
socket.emit('join', { orgId: session.orgId });
socket.on('connect', () => console.log('connected'));
socket.on('disconnect', (reason) => handleReconnect(reason));
```

---

## Gateway 1: DeviceGateway (`/devices`)

**File:** `packages/api/src/modules/device-gateway/device.gateway.ts`

**Who connects:** Android TV devices (100k+ concurrent)

**Authentication:** Device JWT token passed as `?token=<deviceJwt>` in query string

### TV Device → Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `heartbeat` | `{ deviceId, isOnline, appVersion, uptime, cpu, memory, temperature }` | Health signal every 30s |
| `metrics` | `{ deviceId, cpuPercent, memoryPercent, diskPercent, networkLatencyMs }` | Perf metrics every 60s |
| `error` | `{ deviceId, code, message, stackTrace? }` | Error report |

### Server → TV Device Events

| Event | Payload | Description |
|-------|---------|-------------|
| `tv:ads:update` | `{}` | Trigger ad refetch — TV calls `GET /tv/ads` |
| `schedule` | `ScheduleSlot[]` | New playlist pushed to device |
| `command` | `{ type: 'reboot'\|'refresh'\|'purge'\|'update', params?: any }` | Remote control |
| `tv:activities:update` | `{}` | Trigger activities refetch |
| `tv:macros:update` | `TvMacro` | Config update (spot duration, split ratio) |

### Rooms

```
device:<deviceId>          Individual TV device
screen:<screenId>          All devices on a screen (usually 1)
org:<partnerOrgId>         All screens for a partner org
```

### Key Methods (called by other services)

```typescript
gateway.pushToScreen(screenId, event, data?)     // Send to all devices on a screen
gateway.pushToOrgScreens(orgId, event, data?)    // Send to all devices in partner org
gateway.sendCommandToDevice(deviceId, command)   // Direct command
gateway.isDeviceConnected(deviceId): boolean     // Health check
gateway.getConnectedCount(): number              // Fleet size
```

---

## Gateway 2: ScreenStatusGateway (`/screen-status`)

**File:** `packages/api/src/modules/device-gateway/screen-status.gateway.ts`

**Who connects:** Admin app, Partner app

**Broadcast interval:** Every 10 seconds

### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `status:broadcast` | `ScreenStatusEntry[]` | All screens with live status |

```typescript
interface ScreenStatusEntry {
  screenId: string;
  isOnline: boolean;
  cpuPercent: number;
  memoryPercent: number;
  appVersion: string;
  errorCount24h: number;
  lastHeartbeatAt: string;
}
```

---

## Gateway 3: PartnerGateway (`/partner`)

**File:** `packages/api/src/modules/partner-gateway/partner.gateway.ts`

**Who connects:** Partner app users

**Authentication:** JWT (partner user session)

**Room on connect:** `partner:<orgId>` — client joins this room automatically

### Server → Partner Events

| Event | Payload | Trigger |
|-------|---------|---------|
| `screens:changed` | `{ partnerOrgId }` | Screen CRUD, status change |
| `screen:status:changed` | `{ screenId, connectivity: 'ONLINE'\|'OFFLINE'\|'MAINTENANCE' }` | Heartbeat missed or restored |
| `device:paired` | `{ screenId, deviceId }` | New TV device paired |
| `commission:rate:changed` | `{ partnerOrgId, newRate }` | Admin updated commission |
| `statement:updated` | `{ partnerOrgId, statementId }` | Monthly statement ready |

### Emit Methods (called by services)

```typescript
partnerGateway.emitScreensChanged(partnerOrgId)
partnerGateway.emitScreenStatusChanged(partnerOrgId, screenId, connectivity)
partnerGateway.emitDevicePaired(partnerOrgId, screenId, deviceId)
partnerGateway.emitCommissionRateChanged(partnerOrgId, newRate)
partnerGateway.emitStatementUpdated(partnerOrgId, statementId)
```

---

## Gateway 4: AdminGateway (`/admin`)

**File:** `packages/api/src/modules/admin/admin.gateway.ts`

**Who connects:** Admin app users

**Authentication:** JWT (admin platformRole)

**Room:** All admin users join `admin` room

**Broadcast interval:** Every 10 seconds (dashboard summary)

### Server → Admin Events

| Event | Payload | Trigger |
|-------|---------|---------|
| `dashboard:update` | `AdminDashboardSummary` | Periodic + on mutation |
| `users:changed` | `{}` | User created/updated/deleted |
| `partners:changed` | `{}` | Partner org mutated |
| `advertisers:changed` | `{}` | Advertiser org mutated |
| `screens:changed` | `{}` | Any screen change |
| `moderation:changed` | `{}` | Creative submitted for review |
| `activity:new` | `{ activity: AuditLog }` | Any audit event |

```typescript
interface AdminDashboardSummary {
  userCount: number;
  partnerCount: number;
  advertiserCount: number;
  activeScreens: number;
  onlineDevices: number;
  totalRevenueCents: number;
  pendingModeration: number;
}
```

---

## Gateway 5: MessagingGateway (`/messaging`)

**File:** `packages/api/src/modules/messaging/messaging.gateway.ts`

**Who connects:** All app users (admin, partner, advertiser)

**Authentication:** JWT (any authenticated user)

### Room Strategy

```
admin:messages                   All admin users (see all conversations)
user:<userId>                    Individual user inbox
conversation:<conversationId>    Active conversation participants
```

### Client → Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `join:conversation` | `{ conversationId }` | Subscribe to conversation updates |
| `leave:conversation` | `{ conversationId }` | Unsubscribe |

### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `message:new` | `{ conversationId, message: Message }` | New message in conversation |
| `conversation:updated` | `{ conversationId, lastMessage, unreadCount }` | Conversation metadata change |
| `conversation:closed` | `{ conversationId }` | Admin closed ticket |

---

## Gateway 6: DashboardGateway (`/dashboard`)

**File:** `packages/api/src/modules/analytics/dashboard.gateway.ts`

**Who connects:** Advertiser app, Partner app

**Broadcast interval:** Every 10 seconds

### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `summary:update` | `DashboardSummary` | Revenue, campaign, screen stats |

---

## Full Event Catalog

| Namespace | Event | Direction | Frequency | Notes |
|-----------|-------|-----------|-----------|-------|
| `/devices` | `heartbeat` | TV→Server | 30s | Updates ScreenLiveStatus |
| `/devices` | `metrics` | TV→Server | 60s | DeviceMetrics table |
| `/devices` | `error` | TV→Server | On error | DeviceErrorLog table |
| `/devices` | `tv:ads:update` | Server→TV | On publish/deactivate | TV refetches |
| `/devices` | `tv:activities:update` | Server→TV | On activity change | TV refetches |
| `/devices` | `tv:macros:update` | Server→TV | On TvMacro save | TV updates config |
| `/devices` | `schedule` | Server→TV | On schedule change | Full slot list |
| `/devices` | `command` | Server→TV | Manual / admin | reboot, refresh, purge |
| `/screen-status` | `status:broadcast` | Server→UI | Every 10s | All screens batch |
| `/partner` | `screens:changed` | Server→Partner | On mutation | Trigger UI refetch |
| `/partner` | `screen:status:changed` | Server→Partner | Heartbeat events | Connectivity status |
| `/partner` | `device:paired` | Server→Partner | On pairing | New device paired |
| `/partner` | `commission:rate:changed` | Server→Partner | Admin action | Rate updated |
| `/partner` | `statement:updated` | Server→Partner | Month-end | Statement ready |
| `/admin` | `dashboard:update` | Server→Admin | Every 10s | KPI summary |
| `/admin` | `users:changed` | Server→Admin | On mutation | |
| `/admin` | `partners:changed` | Server→Admin | On mutation | |
| `/admin` | `advertisers:changed` | Server→Admin | On mutation | |
| `/admin` | `screens:changed` | Server→Admin | On mutation | |
| `/admin` | `moderation:changed` | Server→Admin | Creative submitted | |
| `/admin` | `activity:new` | Server→Admin | Any audit | AuditLog entry |
| `/messaging` | `message:new` | Server→User | On send | |
| `/messaging` | `conversation:updated` | Server→User | On send/close | |
| `/messaging` | `conversation:closed` | Server→User | Admin closes | |
| `/dashboard` | `summary:update` | Server→Adv/Partner | Every 10s | Dashboard stats |

---

## Adding a New Realtime Feature

### Checklist

- [ ] Define event name: `domain:action` pattern (e.g., `booking:expired`)
- [ ] Add payload type to `packages/shared/src/types/` and export from `@neofilm/shared`
- [ ] Add emit method in the appropriate gateway class
- [ ] Call emit from the correct service (not from controllers)
- [ ] Frontend: subscribe in the correct provider/hook
- [ ] Handle disconnect/reconnect gracefully (re-subscribe to rooms)
- [ ] Test with 2 browser tabs simultaneously
- [ ] Add to Event Catalog table above

### Template: New Service → Gateway → Frontend

```typescript
// 1. packages/api/src/modules/partner-gateway/partner.gateway.ts
async emitBookingExpired(partnerOrgId: string, bookingId: string) {
  this.server
    .to(`partner:${partnerOrgId}`)
    .emit('booking:expired', { bookingId });
}

// 2. packages/api/src/modules/bookings/bookings.service.ts
async expireBooking(bookingId: string) {
  const booking = await this.prisma.booking.update({ ... });
  await this.partnerGateway.emitBookingExpired(booking.partnerOrgId, bookingId);
}

// 3. apps/web-partner/src/lib/socket-provider.tsx
socket.on('booking:expired', ({ bookingId }) => {
  queryClient.invalidateQueries(['bookings']);
  toast.warning(`Booking ${bookingId} has expired`);
});
```

---

## Production Scaling Notes

- **Redis adapter** required for horizontal scaling (multiple API instances)
- Configure `@nestjs/platform-socket.io` with `RedisIoAdapter`
- TV devices use `transports: ['websocket']` only (no polling)
- Browser clients use default transports (websocket with polling fallback)
- MQTT is the fallback for TV devices when WebSocket is unavailable (Mosquitto broker)

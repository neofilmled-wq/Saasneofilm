# Real-Time Synchronization Engine — Scale Strategy (100K TV)

## Architecture for Horizontal Scaling

```
Load Balancer (sticky sessions via socket.io sid cookie)
       ├── App Node A ──┐
       ├── App Node B ──┤── Redis Pub/Sub (adapter)
       ├── App Node C ──┤── Redis Pub/Sub (domain events)
       └── App Node N ──┘
```

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Max simultaneous connections per node | 50,000 | With Redis adapter |
| Total platform connections | 100,000+ | N nodes behind LB |
| Events/sec (publish) | 10,000 | Per node, Redis pub/sub |
| Events/sec (Socket.IO emit) | 50,000 | Per node, room-based |
| Memory per socket connection | ~4 KB | Socket.IO default |
| Memory per node (100K sockets) | ~400 MB | Socket connections only |
| Event latency (DB → client) | < 50ms | p95, same datacenter |

## Socket.IO Configuration

```typescript
{
  // Heartbeat
  pingInterval: 25000,    // 25s between pings
  pingTimeout: 20000,     // 20s to respond

  // Transport
  transports: ['websocket'],  // Skip polling for TV devices
  allowUpgrades: false,       // TV devices go straight to WS

  // Performance
  perMessageDeflate: false,   // Disable compression (CPU trade-off)
  maxHttpBufferSize: 1e5,     // 100KB max message
}
```

## Auto-Disconnect Strategy

- **TV devices**: Disconnect after 60s without heartbeat
- **Web clients**: Disconnect after 120s without heartbeat
- **Reconnection**: Exponential backoff 1s → 30s max
- **On reconnect**: Replay queued events via OfflineTvQueue

## Redis Adapter Requirements

- **Connections per node**: 2 (pub + sub) for adapter + 1 for domain events
- **Memory**: Minimal (pub/sub is fire-and-forget)
- **Bandwidth**: ~1KB per event × events/sec
- **Recommended**: Redis 7+ with at least 2GB RAM for 100K devices

## Capacity Planning

### Per 10,000 TV Devices

| Resource | Usage |
|----------|-------|
| Socket connections | 10,000 |
| Heartbeats/sec | ~333 (every 30s) |
| Domain events/sec | ~50 (campaign/screen changes) |
| Redis pub/sub messages/sec | ~400 |
| Memory (sockets) | ~40 MB |
| Memory (offline queues, worst case) | ~10 MB |

### Scaling to 100,000 TVs

- **Minimum nodes**: 3 (with headroom)
- **Recommended nodes**: 5 (allows 1 node failure)
- **Redis**: Single instance sufficient; cluster for HA
- **Load balancer**: Sticky sessions required (IP hash or cookie)

## Event Volume Control

### High-Frequency Model Throttling

`ScreenLiveStatus` updates on every heartbeat (~30s per device).
At 100K devices = ~3,333 updates/sec — this is too high.

**Mitigation**: The Prisma middleware tracks this model but the EventMapper
can be configured to skip or throttle ScreenLiveStatus events:

1. Only emit on status **change** (ONLINE→OFFLINE), not on every upsert
2. Debounce at EventBus level: max 1 event per screen per 60s

### Payload Size Budget

All events use minimal payloads (< 200 bytes):
```json
{
  "eventId": "evt_1709...",
  "entity": "Campaign",
  "entityId": "clx...",
  "action": "updated",
  "payload": { "id": "clx...", "status": "ACTIVE" },
  "timestamp": "2024-..."
}
```

Frontend does targeted API refetch for full data — never send full objects.

## Deployment Strategy (Zero Downtime)

1. **Rolling deploy**: Update nodes one at a time
2. **Socket.IO reconnection**: Clients auto-reconnect to new nodes
3. **Redis adapter**: Events propagate across old + new nodes during rollout
4. **Offline queue**: Events queued during brief disconnects are replayed
5. **Feature flag**: `REALTIME_SYNC_ENABLED=true` env var to enable/disable

## Monitoring Checklist

- [ ] Socket.IO connected clients gauge (per namespace, per node)
- [ ] Domain events published/sec counter
- [ ] Redis pub/sub lag metric
- [ ] Offline queue depth per device
- [ ] Event processing latency histogram
- [ ] Socket disconnection rate
- [ ] Memory usage per node

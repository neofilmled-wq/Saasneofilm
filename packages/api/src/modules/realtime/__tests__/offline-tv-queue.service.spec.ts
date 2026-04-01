import { OfflineTvQueueService } from '../offline-tv-queue.service';
import type { DomainEvent } from '@neofilm/shared';

function makeEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    entity: 'AdPlacement',
    entityId: 'ap_1',
    action: 'updated',
    actorRoleTargets: ['device'],
    rooms: ['device:dev_1', 'screen:screen_1'],
    payload: { id: 'ap_1', screenId: 'screen_1' },
    timestamp: new Date().toISOString(),
    source: 'test',
    ...overrides,
  };
}

describe('OfflineTvQueueService', () => {
  let service: OfflineTvQueueService;
  let redisMock: any;
  let eventBusMock: any;
  let eventHandler: (event: DomainEvent) => void;

  beforeEach(() => {
    const zcardValue = 0;
    redisMock = {
      zadd: jest.fn().mockResolvedValue(1),
      zrangebyscore: jest.fn().mockResolvedValue([]),
      del: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(true),
      getClient: jest.fn().mockReturnValue({
        zcard: jest.fn().mockResolvedValue(zcardValue),
        zremrangebyrank: jest.fn().mockResolvedValue(0),
      }),
    };

    eventBusMock = {
      subscribe: jest.fn((handler: any) => {
        eventHandler = handler;
      }),
    };

    service = new OfflineTvQueueService(redisMock, eventBusMock);
  });

  it('should subscribe to EventBus on construction', () => {
    expect(eventBusMock.subscribe).toHaveBeenCalledTimes(1);
  });

  it('should queue events for offline devices', async () => {
    const event = makeEvent({ rooms: ['device:dev_1'] });
    eventHandler(event);

    // Allow async queueIfOffline to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(redisMock.zadd).toHaveBeenCalledWith(
      'realtime:offline:device:dev_1',
      expect.any(Number),
      JSON.stringify(event),
    );
  });

  it('should not queue for online devices', async () => {
    service.markOnline('dev_1');

    const event = makeEvent({ rooms: ['device:dev_1'] });
    eventHandler(event);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(redisMock.zadd).not.toHaveBeenCalled();
  });

  it('should not queue non-device events', async () => {
    const event = makeEvent({
      actorRoleTargets: ['admin'],
      rooms: ['admin'],
    });
    eventHandler(event);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(redisMock.zadd).not.toHaveBeenCalled();
  });

  it('should replay queued events in order', async () => {
    const events = [
      makeEvent({ eventId: 'e1', timestamp: '2024-01-01T00:00:00Z' }),
      makeEvent({ eventId: 'e2', timestamp: '2024-01-01T00:01:00Z' }),
    ];

    redisMock.zrangebyscore.mockResolvedValue(
      events.map((e) => JSON.stringify(e)),
    );

    const result = await service.getQueuedEvents('dev_1');

    expect(result).toHaveLength(2);
    expect(result[0].eventId).toBe('e1');
    expect(result[1].eventId).toBe('e2');
  });

  it('should clear queue after retrieval', async () => {
    redisMock.zrangebyscore.mockResolvedValue([]);

    await service.getQueuedEvents('dev_1');

    expect(redisMock.del).toHaveBeenCalledWith('realtime:offline:device:dev_1');
  });

  it('should filter by sinceTimestamp', async () => {
    await service.getQueuedEvents('dev_1', '2024-01-01T00:00:00Z');

    expect(redisMock.zrangebyscore).toHaveBeenCalledWith(
      'realtime:offline:device:dev_1',
      new Date('2024-01-01T00:00:00Z').getTime(),
      '+inf',
    );
  });

  it('should handle markOnline/markOffline lifecycle', () => {
    service.markOnline('dev_1');
    service.markOffline('dev_1');
    // No errors thrown
  });
});

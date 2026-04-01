import { EventBusService } from '../event-bus.service';
import type { DomainEvent } from '@neofilm/shared';

function makeEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    entity: 'Campaign',
    entityId: 'camp_1',
    action: 'created',
    actorRoleTargets: ['admin'],
    rooms: ['admin'],
    payload: { id: 'camp_1' },
    timestamp: new Date().toISOString(),
    source: 'test',
    ...overrides,
  };
}

describe('EventBusService', () => {
  let service: EventBusService;
  let redisMock: any;

  beforeEach(async () => {
    redisMock = {
      createSubscriber: jest.fn().mockReturnValue({
        subscribe: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
        unsubscribe: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined),
      }),
      publish: jest.fn().mockResolvedValue(1),
    };
    service = new EventBusService(redisMock);
    await service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  describe('publish', () => {
    it('should emit event to local subscribers', async () => {
      const handler = jest.fn();
      service.subscribe(handler);

      const event = makeEvent();
      await service.publish(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should deduplicate events with same eventId', async () => {
      const handler = jest.fn();
      service.subscribe(handler);

      const event = makeEvent({ eventId: 'evt_duplicate' });
      await service.publish(event);
      await service.publish(event);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should publish to Redis for cross-instance delivery', async () => {
      const event = makeEvent();
      await service.publish(event);

      expect(redisMock.publish).toHaveBeenCalledWith(
        'neofilm:domain-events',
        JSON.stringify(event),
      );
    });

    it('should handle Redis publish failure gracefully', async () => {
      redisMock.publish.mockRejectedValue(new Error('Redis down'));

      const handler = jest.fn();
      service.subscribe(handler);

      const event = makeEvent();
      await service.publish(event);

      // Should still emit locally even if Redis fails
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('subscribeToEntity', () => {
    it('should only receive events for matching entity', async () => {
      const handler = jest.fn();
      service.subscribeToEntity('Campaign', handler);

      await service.publish(makeEvent({ eventId: 'e1', entity: 'Campaign' }));
      await service.publish(makeEvent({ eventId: 'e2', entity: 'Screen' }));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].entity).toBe('Campaign');
    });
  });

  describe('subscribeToPattern', () => {
    it('should only receive events for matching entity+action', async () => {
      const handler = jest.fn();
      service.subscribeToPattern('Campaign', 'updated', handler);

      await service.publish(makeEvent({ eventId: 'e1', entity: 'Campaign', action: 'created' }));
      await service.publish(makeEvent({ eventId: 'e2', entity: 'Campaign', action: 'updated' }));
      await service.publish(makeEvent({ eventId: 'e3', entity: 'Screen', action: 'updated' }));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].action).toBe('updated');
    });
  });

  describe('unsubscribe', () => {
    it('should stop receiving events after unsubscribe', async () => {
      const handler = jest.fn();
      service.subscribe(handler);

      await service.publish(makeEvent({ eventId: 'e1' }));
      expect(handler).toHaveBeenCalledTimes(1);

      service.unsubscribe(handler);

      await service.publish(makeEvent({ eventId: 'e2' }));
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('idempotence', () => {
    it('should evict oldest eventIds when exceeding max', async () => {
      const handler = jest.fn();
      service.subscribe(handler);

      // Publish 1001 events to exceed the 1000 limit
      for (let i = 0; i < 1001; i++) {
        await service.publish(makeEvent({ eventId: `evt_${i}` }));
      }

      expect(handler).toHaveBeenCalledTimes(1001);

      // The first event should now be evicted from dedup set
      // So publishing it again should succeed
      handler.mockClear();
      await service.publish(makeEvent({ eventId: 'evt_0' }));
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});

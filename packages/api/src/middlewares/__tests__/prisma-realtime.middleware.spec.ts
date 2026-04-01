import { PrismaRealtimeMiddleware } from '../prisma-realtime.middleware';
import type { DomainEvent } from '@neofilm/shared';

describe('PrismaRealtimeMiddleware', () => {
  let middleware: PrismaRealtimeMiddleware;
  let prismaMock: any;
  let eventBusMock: any;
  let eventMapperMock: any;
  let registeredMiddleware: (params: any, next: any) => Promise<any>;

  beforeEach(() => {
    prismaMock = {
      $use: jest.fn((fn: any) => {
        registeredMiddleware = fn;
      }),
    };

    eventBusMock = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    eventMapperMock = {
      resolve: jest.fn().mockReturnValue({
        clientEventName: 'realtime:campaign:created',
        actorRoleTargets: ['admin', 'advertiser'],
        rooms: ['admin', 'advertiser:org_1'],
      }),
    };

    middleware = new PrismaRealtimeMiddleware(
      prismaMock,
      eventBusMock,
      eventMapperMock,
    );
  });

  it('should register middleware on PrismaService', () => {
    middleware.onModuleInit();
    expect(prismaMock.$use).toHaveBeenCalledTimes(1);
  });

  it('should publish event after tracked model create', async () => {
    middleware.onModuleInit();

    const result = { id: 'camp_1', advertiserOrgId: 'org_1', status: 'DRAFT' };
    const next = jest.fn().mockResolvedValue(result);

    await registeredMiddleware(
      { model: 'Campaign', action: 'create' },
      next,
    );

    // Wait for setImmediate
    await new Promise((resolve) => setImmediate(resolve));

    expect(next).toHaveBeenCalled();
    expect(eventMapperMock.resolve).toHaveBeenCalledWith(
      'Campaign',
      'created',
      expect.objectContaining({ id: 'camp_1', advertiserOrgId: 'org_1' }),
    );
    expect(eventBusMock.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: 'Campaign',
        action: 'created',
        entityId: 'camp_1',
      }),
    );
  });

  it('should not publish for untracked models', async () => {
    middleware.onModuleInit();

    const next = jest.fn().mockResolvedValue({ id: 'user_1' });

    await registeredMiddleware(
      { model: 'User', action: 'create' },
      next,
    );

    await new Promise((resolve) => setImmediate(resolve));

    expect(next).toHaveBeenCalled();
    expect(eventBusMock.publish).not.toHaveBeenCalled();
  });

  it('should not publish for non-mutation actions', async () => {
    middleware.onModuleInit();

    const next = jest.fn().mockResolvedValue([{ id: 'camp_1' }]);

    await registeredMiddleware(
      { model: 'Campaign', action: 'findMany' },
      next,
    );

    await new Promise((resolve) => setImmediate(resolve));

    expect(next).toHaveBeenCalled();
    expect(eventBusMock.publish).not.toHaveBeenCalled();
  });

  it('should not block Prisma response pipeline', async () => {
    middleware.onModuleInit();

    // Make publish slow
    eventBusMock.publish.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100)),
    );

    const result = { id: 'camp_1', advertiserOrgId: 'org_1' };
    const next = jest.fn().mockResolvedValue(result);

    const startTime = Date.now();
    const returnedResult = await registeredMiddleware(
      { model: 'Campaign', action: 'create' },
      next,
    );
    const elapsed = Date.now() - startTime;

    // Should return immediately, not wait for publish
    expect(returnedResult).toBe(result);
    expect(elapsed).toBeLessThan(50);
  });

  it('should handle update and delete actions', async () => {
    middleware.onModuleInit();

    const next = jest.fn().mockResolvedValue({ id: 'screen_1', partnerOrgId: 'org_p1' });

    // Update
    await registeredMiddleware({ model: 'Screen', action: 'update' }, next);
    await new Promise((resolve) => setImmediate(resolve));

    expect(eventMapperMock.resolve).toHaveBeenCalledWith(
      'Screen',
      'updated',
      expect.any(Object),
    );

    // Delete
    eventMapperMock.resolve.mockClear();
    await registeredMiddleware({ model: 'Screen', action: 'delete' }, next);
    await new Promise((resolve) => setImmediate(resolve));

    expect(eventMapperMock.resolve).toHaveBeenCalledWith(
      'Screen',
      'deleted',
      expect.any(Object),
    );
  });

  it('should extract correct payload fields for routing', async () => {
    middleware.onModuleInit();

    const result = {
      id: 'book_1',
      advertiserOrgId: 'org_adv',
      partnerOrgId: 'org_partner',
      screenId: 'screen_1',
      campaignId: 'camp_1',
      status: 'ACTIVE',
      somePrivateField: 'should-not-be-included',
    };

    const next = jest.fn().mockResolvedValue(result);
    await registeredMiddleware({ model: 'Booking', action: 'create' }, next);
    await new Promise((resolve) => setImmediate(resolve));

    const publishedEvent = eventBusMock.publish.mock.calls[0][0] as DomainEvent;
    expect(publishedEvent.payload).toHaveProperty('id', 'book_1');
    expect(publishedEvent.payload).toHaveProperty('advertiserOrgId', 'org_adv');
    expect(publishedEvent.payload).toHaveProperty('partnerOrgId', 'org_partner');
    expect(publishedEvent.payload).not.toHaveProperty('somePrivateField');
  });
});

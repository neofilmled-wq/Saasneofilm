import { RealtimeGateway } from '../realtime.gateway';
import type { DomainEvent } from '@neofilm/shared';

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;
  let eventBusMock: any;
  let offlineTvQueueMock: any;
  let serverMock: any;
  let subscribedHandler: (event: DomainEvent) => void;

  beforeEach(() => {
    eventBusMock = {
      subscribe: jest.fn((handler: any) => {
        subscribedHandler = handler;
      }),
      unsubscribe: jest.fn(),
    };

    offlineTvQueueMock = {
      markOnline: jest.fn(),
      markOffline: jest.fn(),
      getQueuedEvents: jest.fn().mockResolvedValue([]),
    };

    gateway = new RealtimeGateway(eventBusMock, offlineTvQueueMock);

    serverMock = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };
    (gateway as any).server = serverMock;

    gateway.afterInit();
  });

  afterEach(() => {
    gateway.onModuleDestroy();
  });

  describe('afterInit', () => {
    it('should subscribe to EventBus', () => {
      expect(eventBusMock.subscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('event routing', () => {
    it('should route events to correct Socket.IO rooms', () => {
      const event: DomainEvent = {
        eventId: 'evt_1',
        entity: 'Campaign',
        entityId: 'camp_1',
        action: 'updated',
        actorRoleTargets: ['admin', 'advertiser'],
        rooms: ['admin', 'advertiser:org_1'],
        payload: { id: 'camp_1' },
        timestamp: new Date().toISOString(),
        source: 'test',
      };

      subscribedHandler(event);

      expect(serverMock.to).toHaveBeenCalledWith('admin');
      expect(serverMock.to).toHaveBeenCalledWith('advertiser:org_1');
      expect(serverMock.emit).toHaveBeenCalledWith(
        'realtime:campaign:updated',
        expect.objectContaining({
          eventId: 'evt_1',
          entity: 'Campaign',
          entityId: 'camp_1',
        }),
      );
    });

    it('should emit to each room separately', () => {
      const event: DomainEvent = {
        eventId: 'evt_2',
        entity: 'Booking',
        entityId: 'book_1',
        action: 'created',
        actorRoleTargets: ['admin', 'advertiser', 'partner'],
        rooms: ['admin', 'advertiser:org_adv', 'partner:org_partner'],
        payload: {},
        timestamp: new Date().toISOString(),
        source: 'test',
      };

      subscribedHandler(event);

      expect(serverMock.to).toHaveBeenCalledTimes(3);
    });
  });

  describe('handleConnection', () => {
    it('should auto-join admin room for admin role', () => {
      const clientMock = {
        id: 'socket_1',
        handshake: { auth: { role: 'admin' } },
        join: jest.fn(),
      };

      gateway.handleConnection(clientMock as any);

      expect(clientMock.join).toHaveBeenCalledWith('admin');
    });

    it('should auto-join partner room with orgId', () => {
      const clientMock = {
        id: 'socket_2',
        handshake: { auth: { role: 'partner', orgId: 'org_p1' } },
        join: jest.fn(),
      };

      gateway.handleConnection(clientMock as any);

      expect(clientMock.join).toHaveBeenCalledWith('partner:org_p1');
    });

    it('should auto-join device and screen rooms', () => {
      const clientMock = {
        id: 'socket_3',
        handshake: {
          auth: { role: 'device', deviceId: 'dev_1', screenId: 'screen_1' },
        },
        join: jest.fn(),
      };

      gateway.handleConnection(clientMock as any);

      expect(clientMock.join).toHaveBeenCalledWith('device:dev_1');
      expect(clientMock.join).toHaveBeenCalledWith('screen:screen_1');
      expect(offlineTvQueueMock.markOnline).toHaveBeenCalledWith('dev_1');
    });
  });

  describe('handleDisconnect', () => {
    it('should mark device offline on disconnect', () => {
      const clientMock = {
        id: 'socket_3',
        handshake: { auth: { deviceId: 'dev_1' } },
      };

      gateway.handleDisconnect(clientMock as any);

      expect(offlineTvQueueMock.markOffline).toHaveBeenCalledWith('dev_1');
    });
  });

  describe('join-room', () => {
    it('should allow joining rooms with valid prefixes', () => {
      const clientMock = { join: jest.fn() };

      const result = gateway.handleJoinRoom(clientMock as any, {
        room: 'partner:org_1',
      });

      expect(clientMock.join).toHaveBeenCalledWith('partner:org_1');
      expect(result).toEqual({ status: 'joined', room: 'partner:org_1' });
    });

    it('should reject invalid room join requests', () => {
      const clientMock = { join: jest.fn() };

      const result = gateway.handleJoinRoom(clientMock as any, {
        room: 'secret:data',
      });

      expect(clientMock.join).not.toHaveBeenCalled();
      expect(result).toEqual({ status: 'denied', reason: 'Invalid room prefix' });
    });
  });

  describe('onModuleDestroy', () => {
    it('should unsubscribe from EventBus', () => {
      gateway.onModuleDestroy();
      expect(eventBusMock.unsubscribe).toHaveBeenCalled();
    });
  });
});

import { DeviceGateway } from './device.gateway';

describe('DeviceGateway', () => {
  let gateway: DeviceGateway;
  let prismaMock: any;
  let redisMock: any;
  let partnerGatewayMock: any;

  beforeEach(() => {
    prismaMock = {
      device: { findUnique: jest.fn() },
      deviceHeartbeat: { create: jest.fn() },
      deviceMetrics: { create: jest.fn() },
      deviceErrorLog: { create: jest.fn() },
      screenLiveStatus: { upsert: jest.fn() },
    };

    redisMock = {
      setDeviceStatus: jest.fn(),
    };

    partnerGatewayMock = {
      notifyScreenStatusChange: jest.fn(),
    };

    gateway = new DeviceGateway(prismaMock, redisMock, partnerGatewayMock);
    // Mock the server
    (gateway as any).server = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };
  });

  describe('getConnectedCount', () => {
    it('should return 0 when no devices connected', () => {
      expect(gateway.getConnectedCount()).toBe(0);
    });
  });

  describe('isDeviceConnected', () => {
    it('should return false for unknown device', () => {
      expect(gateway.isDeviceConnected('unknown')).toBe(false);
    });
  });

  describe('handleConnection', () => {
    it('should reject connection without deviceId', async () => {
      const mockClient = {
        id: 'socket-1',
        handshake: { query: {} },
        disconnect: jest.fn(),
        join: jest.fn(),
      };

      await gateway.handleConnection(mockClient as any);

      expect(mockClient.disconnect).toHaveBeenCalled();
      expect(gateway.getConnectedCount()).toBe(0);
    });

    it('should accept connection with deviceId', async () => {
      const mockClient = {
        id: 'socket-1',
        handshake: { query: { deviceId: 'dev-001' } },
        disconnect: jest.fn(),
        join: jest.fn(),
      };

      await gateway.handleConnection(mockClient as any);

      expect(mockClient.join).toHaveBeenCalledWith('device:dev-001');
      expect(gateway.getConnectedCount()).toBe(1);
      expect(gateway.isDeviceConnected('dev-001')).toBe(true);
      expect(redisMock.setDeviceStatus).toHaveBeenCalledWith('dev-001', expect.objectContaining({ isOnline: true }));
    });
  });

  describe('handleDisconnect', () => {
    it('should handle disconnect of known device', async () => {
      // First connect
      const mockClient = {
        id: 'socket-1',
        handshake: { query: { deviceId: 'dev-001' } },
        disconnect: jest.fn(),
        join: jest.fn(),
      };
      await gateway.handleConnection(mockClient as any);
      expect(gateway.getConnectedCount()).toBe(1);

      // Then disconnect
      prismaMock.device.findUnique.mockResolvedValue(null);
      await gateway.handleDisconnect(mockClient as any);

      expect(gateway.getConnectedCount()).toBe(0);
      expect(gateway.isDeviceConnected('dev-001')).toBe(false);
    });

    it('should update screen live status on disconnect', async () => {
      const mockClient = {
        id: 'socket-1',
        handshake: { query: { deviceId: 'dev-001' } },
        disconnect: jest.fn(),
        join: jest.fn(),
      };
      await gateway.handleConnection(mockClient as any);

      prismaMock.device.findUnique.mockResolvedValue({ screenId: 'screen-1' });
      await gateway.handleDisconnect(mockClient as any);

      expect(prismaMock.screenLiveStatus.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { screenId: 'screen-1' },
          update: expect.objectContaining({ isOnline: false }),
        }),
      );
    });
  });

  describe('sendCommandToDevice', () => {
    it('should emit command to device room', () => {
      gateway.sendCommandToDevice('dev-001', 'REBOOT', { force: true });

      expect((gateway as any).server.to).toHaveBeenCalledWith('device:dev-001');
      expect((gateway as any).server.emit).toHaveBeenCalledWith(
        'command',
        expect.objectContaining({ command: 'REBOOT', params: { force: true } }),
      );
    });

    it('should default params to empty object', () => {
      gateway.sendCommandToDevice('dev-001', 'STATUS');

      expect((gateway as any).server.emit).toHaveBeenCalledWith(
        'command',
        expect.objectContaining({ command: 'STATUS', params: {} }),
      );
    });
  });

  describe('pushScheduleToDevice', () => {
    it('should emit schedule to device room', () => {
      const schedule = { slots: [{ time: '10:00', creativeId: 'c1' }] };
      gateway.pushScheduleToDevice('dev-001', schedule);

      expect((gateway as any).server.to).toHaveBeenCalledWith('device:dev-001');
      expect((gateway as any).server.emit).toHaveBeenCalledWith('schedule', schedule);
    });
  });

  describe('handleHeartbeat', () => {
    it('should store heartbeat and update redis', async () => {
      const mockClient = {
        id: 'socket-1',
        handshake: { query: { deviceId: 'dev-001' } },
        disconnect: jest.fn(),
        join: jest.fn(),
      };
      await gateway.handleConnection(mockClient as any);

      const data = { deviceId: 'dev-001', isOnline: true, appVersion: '2.4.1', uptime: 3600 };
      const result = await gateway.handleHeartbeat(mockClient as any, data);

      expect(result).toEqual({ status: 'ok' });
      expect(prismaMock.deviceHeartbeat.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ deviceId: 'dev-001', isOnline: true }),
      });
      expect(redisMock.setDeviceStatus).toHaveBeenCalled();
    });

    it('should update screen live status when screenId present', async () => {
      const mockClient = {
        id: 'socket-1',
        handshake: { query: { deviceId: 'dev-001' } },
        disconnect: jest.fn(),
        join: jest.fn(),
      };
      await gateway.handleConnection(mockClient as any);

      const data = { deviceId: 'dev-001', isOnline: true, appVersion: '2.4.1', uptime: 3600, screenId: 'screen-1' };
      await gateway.handleHeartbeat(mockClient as any, data);

      expect(prismaMock.screenLiveStatus.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { screenId: 'screen-1' },
        }),
      );
    });
  });
});

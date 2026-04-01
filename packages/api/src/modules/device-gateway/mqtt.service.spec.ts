import { MqttService, MQTT_TOPICS } from './mqtt.service';

describe('MqttService', () => {
  describe('extractDeviceId', () => {
    it('should extract deviceId from heartbeat topic', () => {
      expect(MqttService.extractDeviceId('neofilm/devices/dev123/heartbeat')).toBe('dev123');
    });

    it('should extract deviceId from metrics topic', () => {
      expect(MqttService.extractDeviceId('neofilm/devices/NF-2026-001/metrics')).toBe('NF-2026-001');
    });

    it('should return null for invalid topic', () => {
      expect(MqttService.extractDeviceId('invalid/topic')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(MqttService.extractDeviceId('')).toBeNull();
    });

    it('should handle topics with extra segments', () => {
      expect(MqttService.extractDeviceId('neofilm/devices/dev123/sub/deep')).toBe('dev123');
    });
  });

  describe('MQTT_TOPICS', () => {
    it('should have correct heartbeat topic pattern', () => {
      expect(MQTT_TOPICS.HEARTBEAT).toBe('neofilm/devices/+/heartbeat');
    });

    it('should have correct schedule topic template', () => {
      expect(MQTT_TOPICS.SCHEDULE).toBe('neofilm/devices/{deviceId}/schedule');
    });

    it('should have correct command topic template', () => {
      expect(MQTT_TOPICS.COMMAND).toBe('neofilm/devices/{deviceId}/command');
    });
  });

  describe('matchTopic (via onMessage routing)', () => {
    let service: MqttService;

    beforeEach(() => {
      // Create instance without connecting (ConfigService mock)
      const configMock = { get: jest.fn().mockReturnValue('mqtt://localhost:1883') };
      service = new MqttService(configMock as any);
    });

    it('should match single-level wildcard (+)', () => {
      const handler = jest.fn();
      service.onMessage('neofilm/devices/+/heartbeat', handler);

      // Access private method via any cast
      (service as any).handleMessage('neofilm/devices/dev001/heartbeat', Buffer.from('{}'));

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should not match wrong topic', () => {
      const handler = jest.fn();
      service.onMessage('neofilm/devices/+/heartbeat', handler);

      (service as any).handleMessage('neofilm/devices/dev001/metrics', Buffer.from('{}'));

      expect(handler).not.toHaveBeenCalled();
    });

    it('should match multi-level wildcard (#)', () => {
      const handler = jest.fn();
      service.onMessage('neofilm/#', handler);

      (service as any).handleMessage('neofilm/devices/dev001/heartbeat', Buffer.from('{}'));

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should route to multiple handlers for same pattern', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      service.onMessage('neofilm/devices/+/heartbeat', handler1);
      service.onMessage('neofilm/devices/+/heartbeat', handler2);

      (service as any).handleMessage('neofilm/devices/dev001/heartbeat', Buffer.from('{}'));

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });
});

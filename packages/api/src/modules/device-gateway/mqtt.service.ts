import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mqtt from 'mqtt';

/** MQTT topic patterns for NeoFilm device communication */
export const MQTT_TOPICS = {
  /** Device → Server: heartbeat */
  HEARTBEAT: 'neofilm/devices/+/heartbeat',
  /** Device → Server: playback proof */
  PROOF: 'neofilm/devices/+/proof',
  /** Device → Server: error report */
  ERROR: 'neofilm/devices/+/error',
  /** Device → Server: metrics */
  METRICS: 'neofilm/devices/+/metrics',
  /** Server → Device: schedule push */
  SCHEDULE: 'neofilm/devices/{deviceId}/schedule',
  /** Server → Device: command (reboot, update, etc.) */
  COMMAND: 'neofilm/devices/{deviceId}/command',
  /** Server → Device: config update */
  CONFIG: 'neofilm/devices/{deviceId}/config',
} as const;

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client: mqtt.MqttClient | null = null;
  private messageHandlers = new Map<string, ((topic: string, payload: Buffer) => void)[]>();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const brokerUrl = this.config.get<string>('MQTT_BROKER_URL', 'mqtt://localhost:1883');
    const username = this.config.get<string>('MQTT_USERNAME');
    const password = this.config.get<string>('MQTT_PASSWORD');

    try {
      this.client = mqtt.connect(brokerUrl, {
        username: username || undefined,
        password: password || undefined,
        clientId: `neofilm-api-${process.pid}`,
        clean: true,
        reconnectPeriod: 5000,
        connectTimeout: 10000,
      });

      this.client.on('connect', () => {
        this.logger.log(`MQTT connected to ${brokerUrl}`);
        this.subscribeToDeviceTopics();
      });

      this.client.on('message', (topic, payload) => {
        this.handleMessage(topic, payload);
      });

      this.client.on('error', (err) => {
        this.logger.warn(`MQTT error: ${err.message}`);
      });

      this.client.on('reconnect', () => {
        this.logger.debug('MQTT reconnecting...');
      });
    } catch (err) {
      this.logger.warn(`MQTT connection failed (will retry): ${(err as Error).message}`);
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      this.client.end(true);
      this.logger.log('MQTT connection closed');
    }
  }

  /** Subscribe to all device-to-server topics */
  private subscribeToDeviceTopics() {
    if (!this.client) return;

    const topics = [
      MQTT_TOPICS.HEARTBEAT,
      MQTT_TOPICS.PROOF,
      MQTT_TOPICS.ERROR,
      MQTT_TOPICS.METRICS,
    ];

    this.client.subscribe(topics, { qos: 1 }, (err) => {
      if (err) {
        this.logger.error(`MQTT subscribe failed: ${err.message}`);
      } else {
        this.logger.log(`MQTT subscribed to ${topics.length} device topics`);
      }
    });
  }

  /** Register a handler for a topic pattern */
  onMessage(topicPattern: string, handler: (topic: string, payload: Buffer) => void) {
    const handlers = this.messageHandlers.get(topicPattern) ?? [];
    handlers.push(handler);
    this.messageHandlers.set(topicPattern, handlers);
  }

  /** Route incoming messages to registered handlers */
  private handleMessage(topic: string, payload: Buffer) {
    for (const [pattern, handlers] of this.messageHandlers) {
      if (this.matchTopic(pattern, topic)) {
        for (const handler of handlers) {
          try {
            handler(topic, payload);
          } catch (err) {
            this.logger.error(`MQTT handler error for ${topic}: ${(err as Error).message}`);
          }
        }
      }
    }
  }

  /** Check if a topic matches a pattern (supports + and # wildcards) */
  private matchTopic(pattern: string, topic: string): boolean {
    const patternParts = pattern.split('/');
    const topicParts = topic.split('/');

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] === '#') return true;
      if (patternParts[i] === '+') continue;
      if (patternParts[i] !== topicParts[i]) return false;
    }

    return patternParts.length === topicParts.length;
  }

  /** Publish a message to a specific device */
  async publishToDevice(deviceId: string, channel: string, payload: Record<string, any>): Promise<void> {
    if (!this.client?.connected) {
      this.logger.warn(`MQTT not connected, cannot publish to ${channel}`);
      return;
    }

    const topic = `neofilm/devices/${deviceId}/${channel}`;
    const message = JSON.stringify(payload);

    return new Promise((resolve, reject) => {
      this.client!.publish(topic, message, { qos: 1 }, (err) => {
        if (err) {
          this.logger.error(`MQTT publish failed: ${err.message}`);
          reject(err);
        } else {
          this.logger.debug(`MQTT published to ${topic}`);
          resolve();
        }
      });
    });
  }

  /** Push a schedule to a device */
  async pushSchedule(deviceId: string, schedule: Record<string, any>): Promise<void> {
    await this.publishToDevice(deviceId, 'schedule', schedule);
  }

  /** Send a command to a device (reboot, update, screenshot, etc.) */
  async sendCommand(deviceId: string, command: string, params?: Record<string, any>): Promise<void> {
    await this.publishToDevice(deviceId, 'command', {
      command,
      params: params ?? {},
      timestamp: new Date().toISOString(),
    });
  }

  /** Push config update to a device */
  async pushConfig(deviceId: string, config: Record<string, any>): Promise<void> {
    await this.publishToDevice(deviceId, 'config', config);
  }

  /** Extract deviceId from a topic like "neofilm/devices/{deviceId}/heartbeat" */
  static extractDeviceId(topic: string): string | null {
    const parts = topic.split('/');
    if (parts.length >= 3 && parts[0] === 'neofilm' && parts[1] === 'devices') {
      return parts[2];
    }
    return null;
  }
}

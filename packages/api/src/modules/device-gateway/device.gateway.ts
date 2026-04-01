import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PartnerGateway } from '../partner-gateway/partner.gateway';

interface DeviceHeartbeatPayload {
  deviceId: string;
  isOnline: boolean;
  appVersion: string;
  uptime: number;
  screenId?: string;
}

interface DeviceMetricsPayload {
  deviceId: string;
  cpuPercent?: number;
  memoryPercent?: number;
  diskPercent?: number;
  temperature?: number;
  networkType?: string;
  networkSpeed?: number;
}

@WebSocketGateway({
  namespace: '/devices',
  cors: { origin: '*' },
})
export class DeviceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(DeviceGateway.name);
  /** Map socket.id → deviceId for connected devices */
  private readonly connectedDevices = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly partnerGateway: PartnerGateway,
  ) {}

  async handleConnection(client: Socket) {
    const deviceId = client.handshake.query?.deviceId as string;
    if (!deviceId) {
      this.logger.warn(`WS connection rejected: no deviceId (socket=${client.id})`);
      client.disconnect();
      return;
    }

    this.connectedDevices.set(client.id, deviceId);
    client.join(`device:${deviceId}`);

    // Cache device status in Redis
    await this.redis.setDeviceStatus(deviceId, {
      isOnline: true,
      connectedAt: new Date().toISOString(),
      socketId: client.id,
    });

    // Update ScreenLiveStatus immediately on connect
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { screenId: true, screen: { select: { partnerOrgId: true } } },
    });
    if (device?.screenId) {
      await this.prisma.screenLiveStatus.upsert({
        where: { screenId: device.screenId },
        create: { screenId: device.screenId, isOnline: true, lastHeartbeatAt: new Date() },
        update: { isOnline: true, lastHeartbeatAt: new Date() },
      });
      if (device.screen?.partnerOrgId) {
        this.partnerGateway.emitScreenStatusChanged(device.screen.partnerOrgId, device.screenId, 'ONLINE');
      }
    }

    this.logger.log(`Device ${deviceId} connected (socket=${client.id})`);
  }

  async handleDisconnect(client: Socket) {
    const deviceId = this.connectedDevices.get(client.id);
    if (deviceId) {
      this.connectedDevices.delete(client.id);

      // Update Redis cache
      await this.redis.setDeviceStatus(deviceId, {
        isOnline: false,
        disconnectedAt: new Date().toISOString(),
      });

      // Update screen live status
      const device = await this.prisma.device.findUnique({
        where: { id: deviceId },
        select: { screenId: true },
      });

      if (device?.screenId) {
        await this.prisma.screenLiveStatus.upsert({
          where: { screenId: device.screenId },
          create: {
            screenId: device.screenId,
            isOnline: false,
            lastHeartbeatAt: new Date(),
          },
          update: {
            isOnline: false,
            lastHeartbeatAt: new Date(),
          },
        });

        // Notify partner in real time
        const screen = await this.prisma.screen.findUnique({
          where: { id: device.screenId },
          select: { partnerOrgId: true },
        });
        if (screen?.partnerOrgId) {
          this.partnerGateway.emitScreenStatusChanged(screen.partnerOrgId, device.screenId, 'OFFLINE');
        }
      }

      this.logger.log(`Device ${deviceId} disconnected (socket=${client.id})`);
    }
  }

  @SubscribeMessage('heartbeat')
  async handleHeartbeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: DeviceHeartbeatPayload,
  ) {
    const deviceId = this.connectedDevices.get(client.id) ?? data.deviceId;

    // Store heartbeat
    await this.prisma.deviceHeartbeat.create({
      data: {
        deviceId,
        isOnline: data.isOnline,
        appVersion: data.appVersion,
        uptime: data.uptime,
      },
    });

    // Update screen live status
    if (data.screenId) {
      await this.prisma.screenLiveStatus.upsert({
        where: { screenId: data.screenId },
        create: {
          screenId: data.screenId,
          isOnline: data.isOnline,
          lastHeartbeatAt: new Date(),
        },
        update: {
          isOnline: data.isOnline,
          lastHeartbeatAt: new Date(),
        },
      });

      // Notify the owning partner in real time
      try {
        const screen = await this.prisma.screen.findUnique({
          where: { id: data.screenId },
          select: { partnerOrgId: true },
        });
        if (screen?.partnerOrgId) {
          this.partnerGateway.emitScreenStatusChanged(
            screen.partnerOrgId,
            data.screenId,
            data.isOnline ? 'ONLINE' : 'OFFLINE',
          );
        }
      } catch { /* non-fatal */ }
    }

    // Update Redis cache
    await this.redis.setDeviceStatus(deviceId, {
      isOnline: data.isOnline,
      appVersion: data.appVersion,
      uptime: data.uptime,
      lastHeartbeat: new Date().toISOString(),
    });

    return { status: 'ok' };
  }

  @SubscribeMessage('metrics')
  async handleMetrics(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: DeviceMetricsPayload,
  ) {
    const deviceId = this.connectedDevices.get(client.id) ?? data.deviceId;

    await this.prisma.deviceMetrics.create({
      data: {
        deviceId,
        cpuPercent: data.cpuPercent,
        memoryPercent: data.memoryPercent,
        diskPercent: data.diskPercent,
        temperature: data.temperature,
        networkType: data.networkType,
        networkSpeed: data.networkSpeed,
      },
    });

    return { status: 'ok' };
  }

  @SubscribeMessage('error')
  async handleError(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { deviceId: string; severity: string; code: string; message: string; stackTrace?: string },
  ) {
    const deviceId = this.connectedDevices.get(client.id) ?? data.deviceId;

    await this.prisma.deviceErrorLog.create({
      data: {
        deviceId,
        severity: data.severity,
        code: data.code,
        message: data.message,
        stackTrace: data.stackTrace,
      },
    });

    this.logger.warn(`Device ${deviceId} error: [${data.severity}] ${data.code} - ${data.message}`);
    return { status: 'ok' };
  }

  /** Push a schedule to a specific device via WebSocket */
  pushScheduleToDevice(deviceId: string, schedule: Record<string, any>) {
    this.server.to(`device:${deviceId}`).emit('schedule', schedule);
  }

  /** Send a command to a specific device via WebSocket */
  sendCommandToDevice(deviceId: string, command: string, params?: Record<string, any>) {
    this.server.to(`device:${deviceId}`).emit('command', {
      command,
      params: params ?? {},
      timestamp: new Date().toISOString(),
    });
  }

  /** Broadcast to all connected devices */
  broadcastToAll(event: string, data: Record<string, any>) {
    this.server.emit(event, data);
  }

  /** Push an event to a specific screen's active device */
  async pushToScreen(screenId: string, event: string, data: Record<string, any>) {
    try {
      const screen = await this.prisma.screen.findUnique({
        where: { id: screenId },
        select: { activeDeviceId: true },
      });
      if (screen?.activeDeviceId) {
        this.server.to(`device:${screen.activeDeviceId}`).emit(event, data);
        this.logger.debug(`Pushed ${event} to screen ${screenId} (device=${screen.activeDeviceId})`);
      }
    } catch {
      // Non-fatal — device may not be connected
    }
  }

  /** Push an event to all screens of an organization */
  async pushToOrgScreens(orgId: string, event: string, data: Record<string, any>) {
    try {
      const screens = await this.prisma.screen.findMany({
        where: { partnerOrgId: orgId, activeDeviceId: { not: null } },
        select: { activeDeviceId: true },
      });
      for (const screen of screens) {
        if (screen.activeDeviceId) {
          this.server.to(`device:${screen.activeDeviceId}`).emit(event, data);
        }
      }
      if (screens.length > 0) {
        this.logger.debug(`Pushed ${event} to ${screens.length} screens of org ${orgId}`);
      }
    } catch {
      // Non-fatal
    }
  }

  /** Get count of connected devices */
  getConnectedCount(): number {
    return this.connectedDevices.size;
  }

  /** Check if a specific device is connected */
  isDeviceConnected(deviceId: string): boolean {
    for (const id of this.connectedDevices.values()) {
      if (id === deviceId) return true;
    }
    return false;
  }
}

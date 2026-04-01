import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { AdminService } from './admin.service';
import { PrismaService } from '../../prisma/prisma.service';

@WebSocketGateway({
  namespace: '/admin',
  cors: { origin: '*' },
})
export class AdminGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AdminGateway.name);
  private intervalRef: NodeJS.Timeout | null = null;

  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit() {
    this.logger.log('Admin gateway initialized on /admin namespace');
    // Broadcast dashboard summary + screen statuses every 10s
    this.intervalRef = setInterval(() => this.broadcastAll(), 10_000);
  }

  handleConnection(client: Socket) {
    this.logger.log(`Admin client connected: ${client.id}`);
    // Send initial data immediately
    this.sendInitialData(client);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Admin client disconnected: ${client.id}`);
  }

  // ── Public methods for controllers to call after mutations ──

  emitDashboardUpdate() {
    this.broadcastDashboard();
  }

  emitUsersChanged() {
    this.server.emit('admin:users:changed', { ts: new Date().toISOString() });
  }

  emitPartnersChanged() {
    this.server.emit('admin:partners:changed', { ts: new Date().toISOString() });
  }

  emitAdvertisersChanged() {
    this.server.emit('admin:advertisers:changed', { ts: new Date().toISOString() });
  }

  emitScreensChanged() {
    this.server.emit('admin:screens:changed', { ts: new Date().toISOString() });
  }

  emitModerationChanged() {
    this.server.emit('admin:moderation:changed', { ts: new Date().toISOString() });
  }

  emitActivityNew(activity: any) {
    this.server.emit('admin:activity:new', activity);
  }

  emitFinanceUpdate() {
    this.server.emit('admin:finance:update', { ts: new Date().toISOString() });
  }

  emitRetrocessionUpdate() {
    this.server.emit('admin:retrocession:update', { ts: new Date().toISOString() });
  }

  emitScreenFillUpdate(screenId: string, fill: number, max: number) {
    this.server.emit('admin:screens:fill:update', {
      screenId,
      activeAdvertiserCount: fill,
      maxAdvertisers: max,
      ts: new Date().toISOString(),
    });
  }

  // ── Internal broadcast methods ──

  private async sendInitialData(client: Socket) {
    try {
      const [summary, statuses] = await Promise.all([
        this.adminService.getAdminDashboardSummary(),
        this.getScreenStatuses(),
      ]);
      client.emit('admin:dashboard:update', summary);
      client.emit('admin:screens:status', statuses);
    } catch (err) {
      this.logger.error(`Failed to send initial data: ${err}`);
    }
  }

  private async broadcastAll() {
    try {
      const [summary, statuses] = await Promise.all([
        this.adminService.getAdminDashboardSummary(),
        this.getScreenStatuses(),
      ]);
      this.server.emit('admin:dashboard:update', summary);
      this.server.emit('admin:screens:status', statuses);
    } catch (err) {
      this.logger.error(`Failed to broadcast admin data: ${err}`);
    }
  }

  private async broadcastDashboard() {
    try {
      const summary = await this.adminService.getAdminDashboardSummary();
      this.server.emit('admin:dashboard:update', summary);
    } catch (err) {
      this.logger.error(`Failed to broadcast dashboard: ${err}`);
    }
  }

  private async getScreenStatuses() {
    const screens = await this.prisma.screen.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        city: true,
        maintenanceMode: true,
        screenLiveStatus: {
          select: {
            isOnline: true,
            lastHeartbeatAt: true,
            cpuPercent: true,
            memoryPercent: true,
            errorCount24h: true,
            appVersion: true,
          },
        },
      },
    });

    return screens.map((screen: any) => ({
      screenId: screen.id,
      screenName: screen.name,
      city: screen.city,
      status: screen.status,
      maintenanceMode: screen.maintenanceMode ?? false,
      isOnline: screen.screenLiveStatus?.isOnline ?? false,
      lastHeartbeatAt: screen.screenLiveStatus?.lastHeartbeatAt ?? null,
      cpuPercent: screen.screenLiveStatus?.cpuPercent ?? null,
      memoryPercent: screen.screenLiveStatus?.memoryPercent ?? null,
      errorCount24h: screen.screenLiveStatus?.errorCount24h ?? 0,
      appVersion: screen.screenLiveStatus?.appVersion ?? null,
      updatedAt: new Date().toISOString(),
    }));
  }

  onModuleDestroy() {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
    }
  }
}

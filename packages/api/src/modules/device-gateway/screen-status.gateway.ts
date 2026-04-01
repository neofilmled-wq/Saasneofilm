import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';

@WebSocketGateway({
  namespace: '/screen-status',
  cors: { origin: '*' },
})
export class ScreenStatusGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ScreenStatusGateway.name);
  private intervalRef: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  afterInit() {
    this.logger.log('Screen status gateway initialized');
    // Emit screen status every 10 seconds
    this.intervalRef = setInterval(() => this.broadcastScreenStatuses(), 10_000);
  }

  handleConnection(client: Socket) {
    this.logger.log(`Dashboard client connected: ${client.id}`);
    // Send initial status immediately
    this.sendScreenStatuses(client);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Dashboard client disconnected: ${client.id}`);
  }

  private async sendScreenStatuses(client: Socket) {
    try {
      const statuses = await this.getScreenStatuses();
      client.emit('screen.status', statuses);
    } catch (err) {
      this.logger.error(`Failed to send screen statuses: ${err}`);
    }
  }

  private async broadcastScreenStatuses() {
    try {
      const statuses = await this.getScreenStatuses();
      this.server.emit('screen.status', statuses);
    } catch (err) {
      this.logger.error(`Failed to broadcast screen statuses: ${err}`);
    }
  }

  private async getScreenStatuses() {
    const screens = await this.prisma.screen.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        city: true,
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

    // Simulate slight variations in CPU/memory for realism
    return screens.map((screen) => {
      const live = screen.screenLiveStatus;
      return {
        screenId: screen.id,
        screenName: screen.name,
        city: screen.city,
        status: screen.status,
        isOnline: live?.isOnline ?? false,
        lastHeartbeatAt: live?.lastHeartbeatAt ?? null,
        cpuPercent: live ? Math.max(5, Math.min(95, (live.cpuPercent ?? 20) + (Math.random() * 10 - 5))) : null,
        memoryPercent: live ? Math.max(10, Math.min(90, (live.memoryPercent ?? 40) + (Math.random() * 6 - 3))) : null,
        errorCount24h: live?.errorCount24h ?? 0,
        appVersion: live?.appVersion ?? null,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  onModuleDestroy() {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
    }
  }
}

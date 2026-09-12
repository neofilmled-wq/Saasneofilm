import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';
import { authenticateSocket, type WsPrincipal } from '../auth/ws-auth.util';

interface ScopedSocket extends Socket {
  data: { principal?: WsPrincipal };
}

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  afterInit() {
    this.logger.log('Screen status gateway initialized');
    // Emit screen status every 10 seconds
    this.intervalRef = setInterval(() => this.broadcastScreenStatuses(), 10_000);
  }

  async handleConnection(client: ScopedSocket) {
    const principal = await authenticateSocket(client, this.config, this.prisma);
    // Only admins (all screens) or a partner (their own screens) may subscribe.
    const allowed =
      principal?.kind === 'user' &&
      (principal.isAdmin || principal.orgType === 'PARTNER');
    if (!allowed) {
      this.logger.warn(`Screen-status WS rejected (unauthenticated/not admin-or-partner): ${client.id}`);
      client.disconnect();
      return;
    }
    client.data = { principal };
    this.logger.log(`Screen-status client connected: ${client.id}`);
    // Send initial status immediately, scoped to this client
    this.sendScreenStatuses(client);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Screen-status client disconnected: ${client.id}`);
  }

  private async sendScreenStatuses(client: ScopedSocket) {
    try {
      const statuses = await this.getScreenStatuses(client.data?.principal);
      client.emit('screen.status', statuses);
    } catch (err) {
      this.logger.error(`Failed to send screen statuses: ${err}`);
    }
  }

  /** Emit per-socket so each client only sees screens it is entitled to. */
  private async broadcastScreenStatuses() {
    try {
      const sockets = await this.server.fetchSockets();
      for (const s of sockets) {
        const principal = (s.data as { principal?: WsPrincipal })?.principal;
        if (!principal) continue;
        const statuses = await this.getScreenStatuses(principal);
        s.emit('screen.status', statuses);
      }
    } catch (err) {
      this.logger.error(`Failed to broadcast screen statuses: ${err}`);
    }
  }

  private async getScreenStatuses(principal?: WsPrincipal) {
    // Admins see every screen; a partner only their own org's screens.
    const where =
      principal?.kind === 'user' && !principal.isAdmin && principal.orgType === 'PARTNER'
        ? { partnerOrgId: principal.orgId ?? '__none__' }
        : {};
    const screens = await this.prisma.screen.findMany({
      where,
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

import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { DashboardSummaryService } from './dashboard-summary.service';
import { PrismaService } from '../../prisma/prisma.service';
import { authenticateSocket } from '../auth/ws-auth.util';

@WebSocketGateway({
  namespace: '/dashboard',
  cors: { origin: '*' },
})
export class DashboardGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(DashboardGateway.name);
  private intervalRef: NodeJS.Timeout | null = null;

  constructor(
    private readonly summaryService: DashboardSummaryService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  afterInit() {
    this.logger.log('Dashboard gateway initialized');
    this.intervalRef = setInterval(() => this.broadcastSummary(), 10_000);
  }

  async handleConnection(client: Socket) {
    const principal = await authenticateSocket(client, this.config, this.prisma);
    if (!principal || principal.kind !== 'user') {
      this.logger.warn(`Dashboard WS rejected (unauthenticated): ${client.id}`);
      client.disconnect();
      return;
    }
    this.logger.log(`Dashboard client connected: ${client.id} (user=${principal.userId})`);
    this.sendSummary(client);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Dashboard client disconnected: ${client.id}`);
  }

  private async sendSummary(client: Socket) {
    try {
      const summary = await this.summaryService.getSummary();
      client.emit('dashboard:summary', summary);
    } catch (err) {
      this.logger.error(`Failed to send dashboard summary: ${err}`);
    }
  }

  private async broadcastSummary() {
    try {
      const summary = await this.summaryService.getSummary();
      this.server.emit('dashboard:summary', summary);
    } catch (err) {
      this.logger.error(`Failed to broadcast dashboard summary: ${err}`);
    }
  }

  onModuleDestroy() {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
    }
  }
}

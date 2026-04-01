import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { DashboardSummaryService } from './dashboard-summary.service';

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

  constructor(private readonly summaryService: DashboardSummaryService) {}

  afterInit() {
    this.logger.log('Dashboard gateway initialized');
    this.intervalRef = setInterval(() => this.broadcastSummary(), 10_000);
  }

  handleConnection(client: Socket) {
    this.logger.log(`Dashboard client connected: ${client.id}`);
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

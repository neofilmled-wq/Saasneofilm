import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';
import { authenticateSocket } from '../auth/ws-auth.util';

/**
 * WebSocket gateway for advertiser web clients.
 * Advertisers connect and join a room keyed by their orgId: `advertiser:<orgId>`
 * The room is derived from the VERIFIED JWT, never from a client-supplied field.
 * Services call emit* methods to push real-time updates.
 */
@WebSocketGateway({
  namespace: '/advertiser',
  cors: { origin: '*' },
  path: '/ws/advertiser',
})
export class AdvertiserGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AdvertiserGateway.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    const principal = await authenticateSocket(client, this.config, this.prisma);
    if (!principal || principal.kind !== 'user' || principal.orgType !== 'ADVERTISER' || !principal.orgId) {
      this.logger.warn(`Advertiser WS rejected (unauthenticated/not an advertiser): ${client.id}`);
      client.disconnect();
      return;
    }
    client.join(`advertiser:${principal.orgId}`);
    this.logger.log(`Advertiser ${principal.orgId} connected (socket=${client.id})`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Advertiser socket disconnected (socket=${client.id})`);
  }

  // ─── Emit helpers called by services ─────────────────────────────────────

  /** Subscription status changed (ACTIVE, PAST_DUE, CANCELLED, etc.) */
  emitSubscriptionUpdate(advertiserOrgId: string, data: { bookingId: string; status?: string; monthlyAmountEur?: number }) {
    this.server.to(`advertiser:${advertiserOrgId}`).emit('advertiser:subscription:update', {
      advertiserOrgId,
      ...data,
      ts: new Date().toISOString(),
    });
  }

  /** Campaign status changed */
  emitCampaignsUpdate(advertiserOrgId: string) {
    this.server.to(`advertiser:${advertiserOrgId}`).emit('advertiser:campaigns:update', {
      advertiserOrgId,
      ts: new Date().toISOString(),
    });
  }

  /** Screen fill changed (for map — hide full screens) */
  emitScreenFillUpdate(screenId: string, fill: number, max: number) {
    // Broadcast to all advertiser connections (global)
    this.server.emit('advertiser:screens:fill', {
      screenId,
      activeAdvertiserCount: fill,
      maxAdvertisers: max,
      isFull: fill >= max,
      ts: new Date().toISOString(),
    });
  }
}

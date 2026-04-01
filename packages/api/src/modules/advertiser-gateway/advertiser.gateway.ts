import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

/**
 * WebSocket gateway for advertiser web clients.
 * Advertisers connect and join a room keyed by their orgId: `advertiser:<orgId>`
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

  handleConnection(client: Socket) {
    const orgId = client.handshake.auth?.advertiserOrgId as string | undefined;
    if (orgId) {
      client.join(`advertiser:${orgId}`);
      this.logger.log(`Advertiser ${orgId} connected (socket=${client.id})`);
    } else {
      this.logger.warn(`Advertiser WS connection without orgId (socket=${client.id})`);
    }
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

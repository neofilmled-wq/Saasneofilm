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
 * WebSocket gateway for partner web clients.
 * Partners connect and join a room keyed by their orgId:  `partner:<orgId>`
 * The room is derived from the VERIFIED JWT, never from a client-supplied field.
 * Other services call the emit* methods to push real-time updates.
 */
@WebSocketGateway({
  namespace: '/partner',
  cors: { origin: '*' },
  path: '/ws/partner',
})
export class PartnerGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(PartnerGateway.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    const principal = await authenticateSocket(client, this.config, this.prisma);
    // Admins may observe any partner room via /realtime; here we bind a partner
    // strictly to their own org room. Non-partners are rejected.
    if (!principal || principal.kind !== 'user' || principal.orgType !== 'PARTNER' || !principal.orgId) {
      this.logger.warn(`Partner WS rejected (unauthenticated/not a partner): ${client.id}`);
      client.disconnect();
      return;
    }
    client.join(`partner:${principal.orgId}`);
    this.logger.log(`Partner ${principal.orgId} connected (socket=${client.id})`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Partner socket disconnected (socket=${client.id})`);
  }

  // ─── Emit helpers called by services ─────────────────────────────────────

  /** Screen list changed (add / remove / status change) */
  emitScreensChanged(partnerOrgId: string) {
    this.server.to(`partner:${partnerOrgId}`).emit('partner:screensChanged', {
      partnerOrgId,
      ts: new Date().toISOString(),
    });
    // Also notify advertisers (global event for map refresh)
    this.server.emit('map:screensUpdated', { ts: new Date().toISOString() });
  }

  /** Single screen status changed (online/offline/maintenance) */
  emitScreenStatusChanged(partnerOrgId: string, screenId: string, connectivity: string) {
    this.server.to(`partner:${partnerOrgId}`).emit('partner:screenStatusChanged', {
      partnerOrgId,
      screenId,
      connectivity,
      ts: new Date().toISOString(),
    });
    if (connectivity === 'ONLINE') {
      this.server.to(`partner:${partnerOrgId}`).emit('screen.online', { screenId });
    } else if (connectivity === 'OFFLINE') {
      this.server.to(`partner:${partnerOrgId}`).emit('screen.offline', { screenId });
    }
  }

  /** A device was paired to a screen */
  emitDevicePaired(partnerOrgId: string, screenId: string, deviceId: string) {
    this.server.to(`partner:${partnerOrgId}`).emit('device:paired', {
      partnerOrgId,
      screenId,
      deviceId,
      ts: new Date().toISOString(),
    });
  }

  /** Commission rate changed by admin */
  emitCommissionRateChanged(partnerOrgId: string, newRate: number) {
    this.server.to(`partner:${partnerOrgId}`).emit('commissions:rateChanged', {
      partnerOrgId,
      newRate,
      ts: new Date().toISOString(),
    });
  }

  /** A revenue statement was updated */
  emitStatementUpdated(partnerOrgId: string, statementId: string) {
    this.server.to(`partner:${partnerOrgId}`).emit('commissions:statementUpdated', {
      partnerOrgId,
      statementId,
      ts: new Date().toISOString(),
    });
  }

  /** Partner wallet was updated (new retrocession, payment received) */
  emitWalletUpdate(partnerOrgId: string) {
    this.server.to(`partner:${partnerOrgId}`).emit('partner:wallet:update', {
      partnerOrgId,
      ts: new Date().toISOString(),
    });
  }

  /** Screen fill (capacity) changed */
  emitScreenFillUpdate(partnerOrgId: string, screenId: string, fill: number, max: number) {
    this.server.to(`partner:${partnerOrgId}`).emit('partner:screens:update', {
      partnerOrgId,
      screenId,
      activeAdvertiserCount: fill,
      maxAdvertisers: max,
      ts: new Date().toISOString(),
    });
  }
}

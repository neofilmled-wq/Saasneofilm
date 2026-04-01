import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

/**
 * WebSocket gateway for partner web clients.
 * Partners connect and join a room keyed by their orgId:  `partner:<orgId>`
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

  handleConnection(client: Socket) {
    const orgId = client.handshake.auth?.partnerOrgId as string | undefined;
    if (orgId) {
      client.join(`partner:${orgId}`);
      this.logger.log(`Partner ${orgId} connected (socket=${client.id})`);
    } else {
      this.logger.warn(`Partner WS connection without orgId (socket=${client.id})`);
    }
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

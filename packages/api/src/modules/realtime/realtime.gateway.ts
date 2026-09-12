import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { EventBusService } from '../../services/realtime/event-bus.service';
import { OfflineTvQueueService } from './offline-tv-queue.service';
import { PrismaService } from '../../prisma/prisma.service';
import { authenticateSocket, type WsPrincipal } from '../auth/ws-auth.util';
import type { DomainEvent } from '@neofilm/shared';

interface RealtimeSocket extends Socket {
  data: { principal?: WsPrincipal };
}

@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: '*' },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private eventHandler!: (event: DomainEvent) => void;

  constructor(
    private readonly eventBus: EventBusService,
    private readonly offlineTvQueue: OfflineTvQueueService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  afterInit() {
    this.eventHandler = (event: DomainEvent) => {
      const clientEventName = `realtime:${event.entity.toLowerCase()}:${event.action}`;

      const envelope = {
        eventId: event.eventId,
        entity: event.entity,
        entityId: event.entityId,
        action: event.action,
        payload: event.payload,
        timestamp: event.timestamp,
      };

      for (const room of event.rooms) {
        this.server.to(room).emit(clientEventName, envelope);
      }

      this.logger.debug(
        `Routed ${clientEventName} (${event.entityId}) -> rooms: [${event.rooms.join(', ')}]`,
      );
    };

    this.eventBus.subscribe(this.eventHandler);
    this.logger.log('RealtimeGateway initialized on /realtime namespace');
  }

  async handleConnection(client: RealtimeSocket) {
    const principal = await authenticateSocket(client, this.config, this.prisma);
    if (!principal) {
      this.logger.warn(`/realtime rejected (unauthenticated): ${client.id}`);
      client.disconnect();
      return;
    }
    client.data = { principal };

    // Rooms are derived from the VERIFIED identity — never from client input.
    if (principal.kind === 'device') {
      client.join(`device:${principal.deviceId}`);
      this.offlineTvQueue.markOnline(principal.deviceId);
      if (principal.screenId) client.join(`screen:${principal.screenId}`);
      this.logger.log(`Device ${principal.deviceId} joined /realtime (socket=${client.id})`);
      return;
    }
    if (principal.isAdmin) {
      client.join('admin');
      this.logger.log(`Admin joined /realtime (socket=${client.id})`);
    }
    if (principal.orgType === 'PARTNER' && principal.orgId) {
      client.join(`partner:${principal.orgId}`);
      this.logger.log(`Partner ${principal.orgId} joined /realtime (socket=${client.id})`);
    }
    if (principal.orgType === 'ADVERTISER' && principal.orgId) {
      client.join(`advertiser:${principal.orgId}`);
      this.logger.log(`Advertiser ${principal.orgId} joined /realtime (socket=${client.id})`);
    }
  }

  handleDisconnect(client: RealtimeSocket) {
    const principal = client.data?.principal;
    if (principal?.kind === 'device') {
      this.offlineTvQueue.markOffline(principal.deviceId);
    }
    this.logger.debug(`Client disconnected from /realtime (socket=${client.id})`);
  }

  /**
   * Explicit room join — validated against the authenticated principal so a
   * client can only (re)join a room it is already entitled to. Prevents joining
   * another tenant's / the admin room.
   */
  @SubscribeMessage('join-room')
  handleJoinRoom(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() data: { room: string },
  ) {
    const principal = client.data?.principal;
    if (!principal || !data?.room) return { status: 'denied' };

    const allowed = ((): boolean => {
      if (data.room === 'admin') return principal.kind === 'user' && principal.isAdmin;
      if (principal.kind === 'user' && principal.isAdmin) return true; // admins may observe any room
      if (principal.kind === 'device') {
        return (
          data.room === `device:${principal.deviceId}` ||
          (!!principal.screenId && data.room === `screen:${principal.screenId}`)
        );
      }
      if (principal.orgType === 'PARTNER') return data.room === `partner:${principal.orgId}`;
      if (principal.orgType === 'ADVERTISER') return data.room === `advertiser:${principal.orgId}`;
      return false;
    })();

    if (allowed) {
      client.join(data.room);
      return { status: 'joined', room: data.room };
    }
    this.logger.warn(`join-room denied: ${client.id} -> ${data.room}`);
    return { status: 'denied', reason: 'Not entitled to this room' };
  }

  @SubscribeMessage('get-queued-events')
  async handleGetQueuedEvents(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() data: { sinceTimestamp?: string },
  ) {
    // Device id comes from the verified token, not the message body.
    const principal = client.data?.principal;
    if (principal?.kind !== 'device') return;
    const events = await this.offlineTvQueue.getQueuedEvents(
      principal.deviceId,
      data?.sinceTimestamp,
    );
    client.emit('queued-events', events);
  }

  onModuleDestroy() {
    this.eventBus.unsubscribe(this.eventHandler);
  }
}

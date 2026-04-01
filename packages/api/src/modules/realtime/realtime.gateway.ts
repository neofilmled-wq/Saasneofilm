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
import { Server, Socket } from 'socket.io';
import { EventBusService } from '../../services/realtime/event-bus.service';
import { OfflineTvQueueService } from './offline-tv-queue.service';
import type { DomainEvent } from '@neofilm/shared';

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

  handleConnection(client: Socket) {
    const role = client.handshake.auth?.role as string;
    const orgId = client.handshake.auth?.orgId as string;
    const deviceId = client.handshake.auth?.deviceId as string;

    if (role === 'admin') {
      client.join('admin');
      this.logger.log(`Admin client joined /realtime (socket=${client.id})`);
    }
    if (role === 'partner' && orgId) {
      client.join(`partner:${orgId}`);
      this.logger.log(`Partner ${orgId} joined /realtime (socket=${client.id})`);
    }
    if (role === 'advertiser' && orgId) {
      client.join(`advertiser:${orgId}`);
      this.logger.log(`Advertiser ${orgId} joined /realtime (socket=${client.id})`);
    }
    if (role === 'device' && deviceId) {
      client.join(`device:${deviceId}`);
      this.offlineTvQueue.markOnline(deviceId);
      const screenId = client.handshake.auth?.screenId as string;
      if (screenId) {
        client.join(`screen:${screenId}`);
      }
      this.logger.log(`Device ${deviceId} joined /realtime (socket=${client.id})`);
    }
  }

  handleDisconnect(client: Socket) {
    const deviceId = client.handshake.auth?.deviceId as string;
    if (deviceId) {
      this.offlineTvQueue.markOffline(deviceId);
    }
    this.logger.debug(`Client disconnected from /realtime (socket=${client.id})`);
  }

  @SubscribeMessage('join-room')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { room: string },
  ) {
    const allowedPrefixes = ['partner:', 'advertiser:', 'screen:', 'device:', 'admin'];
    const isAllowed = allowedPrefixes.some((prefix) => data.room.startsWith(prefix));

    if (isAllowed) {
      client.join(data.room);
      return { status: 'joined', room: data.room };
    }
    return { status: 'denied', reason: 'Invalid room prefix' };
  }

  @SubscribeMessage('get-queued-events')
  async handleGetQueuedEvents(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { deviceId: string; sinceTimestamp?: string },
  ) {
    const events = await this.offlineTvQueue.getQueuedEvents(
      data.deviceId,
      data.sinceTimestamp,
    );
    client.emit('queued-events', events);
  }

  onModuleDestroy() {
    this.eventBus.unsubscribe(this.eventHandler);
  }
}

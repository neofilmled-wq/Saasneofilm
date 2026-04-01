import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../../prisma/prisma.service';

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    platformRole: string | null;
  };
}

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'];

@WebSocketGateway({
  namespace: '/messaging',
  cors: { origin: '*' },
})
export class MessagingGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(MessagingGateway.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit() {
    this.logger.log('Messaging gateway initialized on /messaging namespace');
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = client.handshake.auth?.token as string;
      if (!token) {
        this.logger.warn(`Client ${client.id} rejected: no token`);
        client.disconnect();
        return;
      }

      const secret = this.configService.get<string>(
        'JWT_SECRET',
        'change-this-in-production-minimum-32-chars',
      );
      const payload = jwt.verify(token, secret) as {
        sub: string;
        platformRole: string | null;
        type?: string;
      };

      if (payload.type === 'mfa_pending') {
        client.disconnect();
        return;
      }

      // Verify user is active
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, isActive: true, platformRole: true },
      });
      if (!user || !user.isActive) {
        client.disconnect();
        return;
      }

      client.data = {
        userId: user.id,
        platformRole: user.platformRole,
      };

      // Join personal room
      client.join(`user:${user.id}`);

      // Admin users also join admin inbox room
      if (user.platformRole && ADMIN_ROLES.includes(user.platformRole)) {
        client.join('admin:messages');
      }

      this.logger.log(
        `Client ${client.id} authenticated as user ${user.id} (${user.platformRole ?? 'org-user'})`,
      );
    } catch (err) {
      this.logger.warn(`Client ${client.id} rejected: invalid token`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`Client ${client.id} disconnected`);
  }

  @SubscribeMessage('joinConversation')
  async handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    const { userId, platformRole } = client.data;
    const { conversationId } = data;

    // Access check: admin can join any, org users must be a participant
    if (platformRole && ADMIN_ROLES.includes(platformRole)) {
      client.join(`conversation:${conversationId}`);
      return { success: true };
    }

    // Check participant membership
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!participant) {
      // Also check org ownership
      const membership = await this.prisma.membership.findFirst({
        where: { userId },
        select: { organizationId: true },
      });
      const conv = await this.prisma.conversation.findFirst({
        where: { id: conversationId, organizationId: membership?.organizationId },
      });
      if (!conv) {
        return { success: false, error: 'Access denied' };
      }
    }

    client.join(`conversation:${conversationId}`);
    return { success: true };
  }

  @SubscribeMessage('leaveConversation')
  handleLeaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.leave(`conversation:${data.conversationId}`);
    return { success: true };
  }

  // ── Public emit methods (called from controllers) ──

  emitMessageCreated(conversationId: string, message: any) {
    this.server
      .to(`conversation:${conversationId}`)
      .emit('message:created', { conversationId, message });
  }

  emitConversationUpdated(conversationId: string, patch: any) {
    this.server
      .to(`conversation:${conversationId}`)
      .emit('conversation:updated', { conversationId, ...patch });
  }

  emitConversationsChanged(participantUserIds: string[]) {
    // Notify admin inbox
    this.server.to('admin:messages').emit('conversations:changed', { ts: new Date().toISOString() });

    // Notify each participant's personal room
    for (const uid of participantUserIds) {
      this.server.to(`user:${uid}`).emit('conversations:changed', { ts: new Date().toISOString() });
    }
  }

  emitUnreadUpdated(userId: string, count: number) {
    this.server.to(`user:${userId}`).emit('unread:updated', { count });
  }
}

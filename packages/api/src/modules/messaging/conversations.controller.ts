import { Controller, Get, Post, Param, Body, Query, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators';
import { ConversationsService } from './conversations.service';
import { MessagingGateway } from './messaging.gateway';
import { CreateConversationDto, SendMessageDto } from './dto';

@ApiTags('Messaging (Org)')
@ApiBearerAuth()
@Controller('me/conversations')
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly messagingGateway: MessagingGateway,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List my conversations' })
  async getMyConversations(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const orgId = await this.conversationsService.resolveOrgId(userId);
    if (!orgId) return { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };

    return this.conversationsService.getMyConversations(
      userId,
      orgId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread conversation count' })
  async getUnreadCount(@CurrentUser('id') userId: string) {
    return this.conversationsService.getUnreadCount(userId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new conversation' })
  async createConversation(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateConversationDto,
  ) {
    const orgId = await this.conversationsService.resolveOrgId(userId);
    if (!orgId) throw new ForbiddenException('Aucune organisation associée à votre compte');

    const conversation = await this.conversationsService.createConversation(userId, orgId, dto);

    // Notify all participants via WS
    const participantIds = await this.conversationsService.getParticipantUserIds(conversation.id);
    this.messagingGateway.emitConversationsChanged(participantIds);

    // Emit unread update for admin participants
    for (const p of conversation.participants) {
      if (p.role === 'ADMIN') {
        const unread = await this.conversationsService.getAdminUnreadCount(p.userId);
        this.messagingGateway.emitUnreadUpdated(p.userId, unread.count);
      }
    }

    return conversation;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a conversation with messages' })
  async getConversation(
    @CurrentUser('id') userId: string,
    @Param('id') conversationId: string,
  ) {
    const orgId = await this.conversationsService.resolveOrgId(userId);
    if (!orgId) throw new ForbiddenException('Aucune organisation associée à votre compte');

    return this.conversationsService.getConversation(userId, orgId, conversationId);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Send a message in a conversation' })
  async sendMessage(
    @CurrentUser('id') userId: string,
    @Param('id') conversationId: string,
    @Body() dto: SendMessageDto,
  ) {
    const orgId = await this.conversationsService.resolveOrgId(userId);
    if (!orgId) throw new ForbiddenException('Aucune organisation associée à votre compte');

    const message = await this.conversationsService.sendMessage(userId, orgId, conversationId, dto);

    // WS notifications
    this.messagingGateway.emitMessageCreated(conversationId, message);
    this.messagingGateway.emitConversationUpdated(conversationId, {
      lastMessageAt: message.createdAt,
    });

    const participantIds = await this.conversationsService.getParticipantUserIds(conversationId);
    this.messagingGateway.emitConversationsChanged(participantIds);

    // Update unread counts for all OTHER participants
    for (const pid of participantIds) {
      if (pid !== userId) {
        // Determine if admin or org user
        const user = await this.conversationsService.resolveOrgId(pid);
        if (user) {
          const unread = await this.conversationsService.getUnreadCount(pid);
          this.messagingGateway.emitUnreadUpdated(pid, unread.count);
        } else {
          const unread = await this.conversationsService.getAdminUnreadCount(pid);
          this.messagingGateway.emitUnreadUpdated(pid, unread.count);
        }
      }
    }

    return message;
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark conversation as read' })
  async markRead(
    @CurrentUser('id') userId: string,
    @Param('id') conversationId: string,
  ) {
    const orgId = await this.conversationsService.resolveOrgId(userId);
    if (!orgId) throw new ForbiddenException('Aucune organisation associée à votre compte');

    const result = await this.conversationsService.markRead(userId, orgId, conversationId);

    // Update unread count via WS
    const unread = await this.conversationsService.getUnreadCount(userId);
    this.messagingGateway.emitUnreadUpdated(userId, unread.count);

    return result;
  }

  @Post(':id/reopen')
  @ApiOperation({ summary: 'Reopen a closed conversation' })
  async reopenConversation(
    @CurrentUser('id') userId: string,
    @Param('id') conversationId: string,
  ) {
    const orgId = await this.conversationsService.resolveOrgId(userId);
    if (!orgId) throw new ForbiddenException('Aucune organisation associée à votre compte');

    const updated = await this.conversationsService.reopenConversation(userId, orgId, conversationId);

    this.messagingGateway.emitConversationUpdated(conversationId, {
      status: updated.status,
    });

    const participantIds = await this.conversationsService.getParticipantUserIds(conversationId);
    this.messagingGateway.emitConversationsChanged(participantIds);

    return updated;
  }
}

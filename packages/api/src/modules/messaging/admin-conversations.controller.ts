import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Roles, CurrentUser } from '../../common/decorators';
import { ConversationsService } from './conversations.service';
import { MessagingGateway } from './messaging.gateway';
import { SendMessageDto } from './dto';

@ApiTags('Messaging (Admin)')
@ApiBearerAuth()
@Controller('admin/conversations')
export class AdminConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly messagingGateway: MessagingGateway,
  ) {}

  @Get()
  @Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @ApiOperation({ summary: 'List all conversations (admin)' })
  async getAdminConversations(
    @CurrentUser('id') adminUserId: string,
    @Query('status') status?: string,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('q') q?: string,
    @Query('orgType') orgType?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.conversationsService.getAdminConversations({
      adminUserId,
      status,
      unreadOnly: unreadOnly === 'true',
      q,
      orgType,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get('unread-count')
  @Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @ApiOperation({ summary: 'Get unread conversation count (admin)' })
  async getAdminUnreadCount(@CurrentUser('id') adminUserId: string) {
    return this.conversationsService.getAdminUnreadCount(adminUserId);
  }

  @Get(':id')
  @Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @ApiOperation({ summary: 'Get a conversation detail (admin)' })
  async getAdminConversation(@Param('id') conversationId: string) {
    return this.conversationsService.getAdminConversation(conversationId);
  }

  @Post(':id/messages')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Send a message in a conversation (admin)' })
  async adminSendMessage(
    @CurrentUser('id') adminUserId: string,
    @Param('id') conversationId: string,
    @Body() dto: SendMessageDto,
  ) {
    const message = await this.conversationsService.adminSendMessage(adminUserId, conversationId, dto);

    // WS notifications
    this.messagingGateway.emitMessageCreated(conversationId, message);
    this.messagingGateway.emitConversationUpdated(conversationId, {
      lastMessageAt: message.createdAt,
    });

    const participantIds = await this.conversationsService.getParticipantUserIds(conversationId);
    this.messagingGateway.emitConversationsChanged(participantIds);

    // Update unread counts for org participants
    for (const pid of participantIds) {
      if (pid !== adminUserId) {
        const unread = await this.conversationsService.getUnreadCount(pid);
        this.messagingGateway.emitUnreadUpdated(pid, unread.count);
      }
    }

    return message;
  }

  @Post(':id/read')
  @Roles('ADMIN', 'SUPER_ADMIN', 'SUPPORT')
  @ApiOperation({ summary: 'Mark conversation as read (admin)' })
  async adminMarkRead(
    @CurrentUser('id') adminUserId: string,
    @Param('id') conversationId: string,
  ) {
    const result = await this.conversationsService.adminMarkRead(adminUserId, conversationId);

    const unread = await this.conversationsService.getAdminUnreadCount(adminUserId);
    this.messagingGateway.emitUnreadUpdated(adminUserId, unread.count);

    return result;
  }

  @Post(':id/close')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Close a conversation' })
  async closeConversation(
    @CurrentUser('id') adminUserId: string,
    @Param('id') conversationId: string,
  ) {
    const updated = await this.conversationsService.closeConversation(adminUserId, conversationId);

    this.messagingGateway.emitConversationUpdated(conversationId, { status: 'CLOSED' });
    const participantIds = await this.conversationsService.getParticipantUserIds(conversationId);
    this.messagingGateway.emitConversationsChanged(participantIds);

    return updated;
  }

  @Post(':id/archive')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Archive a conversation' })
  async archiveConversation(
    @CurrentUser('id') adminUserId: string,
    @Param('id') conversationId: string,
  ) {
    const updated = await this.conversationsService.archiveConversation(adminUserId, conversationId);

    this.messagingGateway.emitConversationUpdated(conversationId, { status: 'ARCHIVED' });
    const participantIds = await this.conversationsService.getParticipantUserIds(conversationId);
    this.messagingGateway.emitConversationsChanged(participantIds);

    return updated;
  }

  @Post(':id/reopen')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Reopen a conversation' })
  async reopenConversation(
    @CurrentUser('id') adminUserId: string,
    @Param('id') conversationId: string,
  ) {
    const updated = await this.conversationsService.reopenConversationAdmin(adminUserId, conversationId);

    this.messagingGateway.emitConversationUpdated(conversationId, { status: 'OPEN' });
    const participantIds = await this.conversationsService.getParticipantUserIds(conversationId);
    this.messagingGateway.emitConversationsChanged(participantIds);

    return updated;
  }
}

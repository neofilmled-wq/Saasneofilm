import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // ── Helpers ──────────────────────────────

  /**
   * Resolve the user's orgId from their first membership.
   * Returns null if the user has no membership (admin-only user).
   */
  async resolveOrgId(userId: string): Promise<string | null> {
    const membership = await this.prisma.membership.findFirst({
      where: { userId },
      select: { organizationId: true },
    });
    return membership?.organizationId ?? null;
  }

  /**
   * Verify a user belongs to the conversation's organization.
   */
  private async assertOrgAccess(
    conversationId: string,
    orgId: string,
  ): Promise<void> {
    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, organizationId: orgId },
      select: { id: true },
    });
    if (!conv) {
      throw new NotFoundException('Conversation not found');
    }
  }

  // ── Org-scoped (partner / advertiser) ────

  async getMyConversations(userId: string, orgId: string, page = 1, limit = 20) {
    const where: Prisma.ConversationWhereInput = { organizationId: orgId };
    const skip = (page - 1) * limit;

    const [conversations, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastMessageAt: 'desc' },
        select: {
          id: true,
          subject: true,
          status: true,
          lastMessageAt: true,
          createdAt: true,
          organization: { select: { id: true, name: true, type: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              body: true,
              createdAt: true,
              sender: { select: { firstName: true, lastName: true } },
            },
          },
          participants: {
            where: { userId },
            select: { lastReadAt: true },
          },
          _count: { select: { messages: true } },
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);

    // Compute unread per conversation
    const data = conversations.map((c) => {
      const lastRead = c.participants[0]?.lastReadAt ?? new Date(0);
      const lastMsg = c.messages[0];
      return {
        id: c.id,
        subject: c.subject,
        status: c.status,
        lastMessageAt: c.lastMessageAt,
        createdAt: c.createdAt,
        organization: c.organization,
        lastMessage: lastMsg
          ? {
              body: lastMsg.body.slice(0, 100),
              createdAt: lastMsg.createdAt,
              senderName: `${lastMsg.sender.firstName} ${lastMsg.sender.lastName}`,
            }
          : null,
        totalMessages: c._count.messages,
        unreadCount: 0, // will be filled below
        _lastReadAt: lastRead,
      };
    });

    // Batch compute unread counts
    for (const item of data) {
      item.unreadCount = await this.prisma.message.count({
        where: {
          conversationId: item.id,
          createdAt: { gt: item._lastReadAt },
          senderUserId: { not: userId },
        },
      });
    }

    // Sort unread first
    data.sort((a, b) => {
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
      return b.lastMessageAt.getTime() - a.lastMessageAt.getTime();
    });

    return {
      data: data.map(({ _lastReadAt, ...rest }) => rest),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async createConversation(
    userId: string,
    orgId: string,
    input: { subject?: string; body: string },
  ) {
    // Find the first available admin user to add as participant
    const adminUser = await this.prisma.user.findFirst({
      where: {
        platformRole: { in: ['SUPER_ADMIN', 'ADMIN'] },
        isActive: true,
      },
      select: { id: true },
    });

    const conversation = await this.prisma.conversation.create({
      data: {
        subject: input.subject || null,
        status: 'OPEN',
        createdByUserId: userId,
        organizationId: orgId,
        lastMessageAt: new Date(),
        participants: {
          create: [
            { userId, role: 'REQUESTER', lastReadAt: new Date() },
            ...(adminUser
              ? [
                  {
                    userId: adminUser.id,
                    role: 'ADMIN' as const,
                    lastReadAt: new Date(0), // unread for admin
                  },
                ]
              : []),
          ],
        },
        messages: {
          create: {
            senderUserId: userId,
            body: input.body,
            type: 'TEXT',
          },
        },
      },
      include: {
        organization: { select: { id: true, name: true, type: true } },
        participants: { select: { userId: true, role: true } },
        messages: {
          select: {
            id: true,
            body: true,
            createdAt: true,
            sender: { select: { id: true, firstName: true, lastName: true, platformRole: true } },
          },
        },
      },
    });

    return conversation;
  }

  async getConversation(userId: string, orgId: string, conversationId: string) {
    await this.assertOrgAccess(conversationId, orgId);

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        organization: {
          select: { id: true, name: true, type: true, contactEmail: true },
        },
        participants: {
          select: {
            userId: true,
            role: true,
            lastReadAt: true,
            user: { select: { id: true, firstName: true, lastName: true, platformRole: true } },
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            body: true,
            type: true,
            createdAt: true,
            sender: {
              select: { id: true, firstName: true, lastName: true, platformRole: true, avatar: true },
            },
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return conversation;
  }

  async sendMessage(
    userId: string,
    orgId: string,
    conversationId: string,
    input: { body: string },
  ) {
    await this.assertOrgAccess(conversationId, orgId);

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { status: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    if (conversation.status !== 'OPEN') {
      throw new BadRequestException('Conversation is closed. Reopen it to send messages.');
    }

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderUserId: userId,
        body: input.body,
        type: 'TEXT',
      },
      select: {
        id: true,
        body: true,
        type: true,
        createdAt: true,
        conversationId: true,
        sender: {
          select: { id: true, firstName: true, lastName: true, platformRole: true, avatar: true },
        },
      },
    });

    // Update conversation lastMessageAt
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });

    // Update sender's lastReadAt
    await this.prisma.conversationParticipant.updateMany({
      where: { conversationId, userId },
      data: { lastReadAt: new Date() },
    });

    return message;
  }

  async markRead(userId: string, orgId: string, conversationId: string) {
    await this.assertOrgAccess(conversationId, orgId);

    await this.prisma.conversationParticipant.updateMany({
      where: { conversationId, userId },
      data: { lastReadAt: new Date() },
    });

    return { success: true };
  }

  async reopenConversation(userId: string, orgId: string, conversationId: string) {
    await this.assertOrgAccess(conversationId, orgId);

    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { status: true },
    });

    if (!conv) throw new NotFoundException('Conversation not found');
    if (conv.status === 'OPEN') throw new BadRequestException('Conversation is already open');

    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { status: 'OPEN' },
      select: { id: true, status: true, lastMessageAt: true },
    });

    return updated;
  }

  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { userId },
      select: { conversationId: true, lastReadAt: true },
    });

    let count = 0;
    for (const p of participants) {
      const unread = await this.prisma.message.count({
        where: {
          conversationId: p.conversationId,
          createdAt: { gt: p.lastReadAt },
          senderUserId: { not: userId },
        },
      });
      if (unread > 0) count++;
    }

    return { count };
  }

  // ── Admin-scoped ─────────────────────────

  async getAdminConversations(filters: {
    status?: string;
    unreadOnly?: boolean;
    q?: string;
    orgType?: string;
    page?: number;
    limit?: number;
    adminUserId: string;
  }) {
    const { status, q, orgType, page = 1, limit = 20, adminUserId } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.ConversationWhereInput = {};

    if (status) {
      where.status = status as any;
    }
    if (orgType) {
      where.organization = { type: orgType as any };
    }
    if (q) {
      where.OR = [
        { subject: { contains: q, mode: 'insensitive' } },
        { organization: { name: { contains: q, mode: 'insensitive' } } },
        { organization: { contactEmail: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [conversations, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastMessageAt: 'desc' },
        select: {
          id: true,
          subject: true,
          status: true,
          lastMessageAt: true,
          createdAt: true,
          organization: { select: { id: true, name: true, type: true, contactEmail: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              body: true,
              createdAt: true,
              sender: { select: { firstName: true, lastName: true } },
            },
          },
          participants: {
            where: { userId: adminUserId },
            select: { lastReadAt: true },
          },
          _count: { select: { messages: true } },
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);

    // Compute unread per conversation
    const data = await Promise.all(
      conversations.map(async (c) => {
        const lastRead = c.participants[0]?.lastReadAt ?? new Date(0);
        const unreadCount = await this.prisma.message.count({
          where: {
            conversationId: c.id,
            createdAt: { gt: lastRead },
            senderUserId: { not: adminUserId },
          },
        });
        const lastMsg = c.messages[0];
        return {
          id: c.id,
          subject: c.subject,
          status: c.status,
          lastMessageAt: c.lastMessageAt,
          createdAt: c.createdAt,
          organization: c.organization,
          createdBy: c.createdBy,
          lastMessage: lastMsg
            ? {
                body: lastMsg.body.slice(0, 100),
                createdAt: lastMsg.createdAt,
                senderName: `${lastMsg.sender.firstName} ${lastMsg.sender.lastName}`,
              }
            : null,
          totalMessages: c._count.messages,
          unreadCount,
        };
      }),
    );

    // Sort unread first if requested or by default
    if (filters.unreadOnly) {
      const filtered = data.filter((c) => c.unreadCount > 0);
      return {
        data: filtered,
        total: filtered.length,
        page,
        limit,
        totalPages: Math.ceil(filtered.length / limit),
      };
    }

    data.sort((a, b) => {
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
      return b.lastMessageAt.getTime() - a.lastMessageAt.getTime();
    });

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getAdminConversation(conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        organization: {
          select: { id: true, name: true, type: true, contactEmail: true, contactPhone: true, city: true },
        },
        participants: {
          select: {
            userId: true,
            role: true,
            lastReadAt: true,
            user: { select: { id: true, firstName: true, lastName: true, platformRole: true, avatar: true } },
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            body: true,
            type: true,
            createdAt: true,
            sender: {
              select: { id: true, firstName: true, lastName: true, platformRole: true, avatar: true },
            },
          },
        },
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return conversation;
  }

  async adminSendMessage(
    adminUserId: string,
    conversationId: string,
    input: { body: string },
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, status: true, organizationId: true },
    });

    if (!conversation) throw new NotFoundException('Conversation not found');

    // Ensure admin is a participant (auto-join on first reply)
    const existing = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId: adminUserId } },
    });
    if (!existing) {
      await this.prisma.conversationParticipant.create({
        data: {
          conversationId,
          userId: adminUserId,
          role: 'ADMIN',
          lastReadAt: new Date(),
        },
      });
    }

    // Reopen if closed (admin can always reply)
    if (conversation.status !== 'OPEN') {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { status: 'OPEN' },
      });
    }

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderUserId: adminUserId,
        body: input.body,
        type: 'TEXT',
      },
      select: {
        id: true,
        body: true,
        type: true,
        createdAt: true,
        conversationId: true,
        sender: {
          select: { id: true, firstName: true, lastName: true, platformRole: true, avatar: true },
        },
      },
    });

    // Update lastMessageAt + sender's lastReadAt
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });
    await this.prisma.conversationParticipant.updateMany({
      where: { conversationId, userId: adminUserId },
      data: { lastReadAt: new Date() },
    });

    // Audit log
    this.auditService.log({
      action: 'CREATE',
      entity: 'Message',
      entityId: message.id,
      userId: adminUserId,
      newData: { conversationId, body: input.body.slice(0, 100) },
    });

    return message;
  }

  async adminMarkRead(adminUserId: string, conversationId: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    // Ensure admin participant exists
    const existing = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId: adminUserId } },
    });
    if (!existing) {
      await this.prisma.conversationParticipant.create({
        data: { conversationId, userId: adminUserId, role: 'ADMIN', lastReadAt: new Date() },
      });
    } else {
      await this.prisma.conversationParticipant.update({
        where: { id: existing.id },
        data: { lastReadAt: new Date() },
      });
    }

    return { success: true };
  }

  async closeConversation(adminUserId: string, conversationId: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, status: true },
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    if (conv.status === 'CLOSED') throw new BadRequestException('Already closed');

    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { status: 'CLOSED' },
      select: { id: true, status: true, lastMessageAt: true },
    });

    this.auditService.log({
      action: 'UPDATE',
      entity: 'Conversation',
      entityId: conversationId,
      userId: adminUserId,
      newData: { status: 'CLOSED' },
    });

    return updated;
  }

  async archiveConversation(adminUserId: string, conversationId: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, status: true },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { status: 'ARCHIVED' },
      select: { id: true, status: true, lastMessageAt: true },
    });

    this.auditService.log({
      action: 'UPDATE',
      entity: 'Conversation',
      entityId: conversationId,
      userId: adminUserId,
      newData: { status: 'ARCHIVED' },
    });

    return updated;
  }

  async reopenConversationAdmin(adminUserId: string, conversationId: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, status: true },
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    if (conv.status === 'OPEN') throw new BadRequestException('Already open');

    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { status: 'OPEN' },
      select: { id: true, status: true, lastMessageAt: true },
    });

    this.auditService.log({
      action: 'UPDATE',
      entity: 'Conversation',
      entityId: conversationId,
      userId: adminUserId,
      newData: { status: 'OPEN' },
    });

    return updated;
  }

  async getAdminUnreadCount(adminUserId: string): Promise<{ count: number }> {
    // Get all conversations where admin is a participant
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { userId: adminUserId, role: 'ADMIN' },
      select: { conversationId: true, lastReadAt: true },
    });

    let count = 0;
    for (const p of participants) {
      const unread = await this.prisma.message.count({
        where: {
          conversationId: p.conversationId,
          createdAt: { gt: p.lastReadAt },
          senderUserId: { not: adminUserId },
        },
      });
      if (unread > 0) count++;
    }

    // Also count conversations where admin is NOT a participant yet
    const participatedIds = participants.map((p) => p.conversationId);
    const orphanCount = await this.prisma.conversation.count({
      where: {
        id: { notIn: participatedIds.length > 0 ? participatedIds : ['__none__'] },
        status: 'OPEN',
        messages: { some: {} },
      },
    });

    return { count: count + orphanCount };
  }

  /**
   * Get participant userIds for a conversation (for WS notifications).
   */
  async getParticipantUserIds(conversationId: string): Promise<string[]> {
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    return participants.map((p) => p.userId);
  }
}

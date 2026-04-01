import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdvertiserGateway } from '../advertiser-gateway/advertiser.gateway';
import { EventBusService } from '../../services/realtime/event-bus.service';
import { DeviceGateway } from '../device-gateway/device.gateway';
import * as bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'crypto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly advertiserGateway: AdvertiserGateway,
    private readonly eventBus: EventBusService,
    private readonly deviceGateway: DeviceGateway,
  ) {}

  // --- Users ---

  private generatePassword(): string {
    return randomBytes(6).toString('base64url') + 'A1!';
  }

  async createUser(data: {
    email: string;
    firstName: string;
    lastName: string;
    platformRole: string;
    isActive?: boolean;
    password?: string;
    autoGeneratePassword?: boolean;
  }) {
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new ConflictException('Email already in use');

    const password = data.autoGeneratePassword ? this.generatePassword() : data.password;
    if (!password) throw new BadRequestException('Password is required');
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        platformRole: data.platformRole as any,
        isActive: data.isActive ?? true,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        platformRole: true,
        isActive: true,
        createdAt: true,
      },
    });

    return { ...user, ...(data.autoGeneratePassword ? { temporaryPassword: password } : {}) };
  }

  async searchUsers(params: { q?: string; page: number; limit: number; platformRole?: string; isActive?: string }) {
    const { q, page, limit, platformRole, isActive } = params;
    const where: any = {
      // Exclude soft-deleted users (email rewritten to ...-deleted-timestamp)
      NOT: { email: { contains: '-deleted-' } },
    };
    if (platformRole) where.platformRole = platformRole;
    if (isActive === 'true') where.isActive = true;
    if (isActive === 'false') where.isActive = false;
    if (q) {
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          platformRole: true,
          isActive: true,
          createdAt: true,
          lastLoginAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data: users, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async resetPassword(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const tempPassword = this.generatePassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return { temporaryPassword: tempPassword };
  }

  async toggleUserStatus(userId: string, isActive: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: { id: true, email: true, isActive: true },
    });
  }

  async updateUser(userId: string, data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    platformRole?: string;
    isActive?: boolean;
  }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (data.email && data.email !== user.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
      if (existing) throw new ConflictException('Email already in use');
    }

    const updateData: any = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.platformRole !== undefined) updateData.platformRole = data.platformRole;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    return this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        platformRole: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });
  }

  async softDeleteUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        email: `${user.email}-deleted-${Date.now()}`,
      },
      select: { id: true, email: true, isActive: true },
    });
  }

  // --- Settings ---

  async getSettings() {
    const settings = await this.prisma.platformSetting.findMany();
    const map: Record<string, string> = {};
    for (const s of settings) {
      map[s.key] = s.value;
    }
    return map;
  }

  async updateSettings(data: Record<string, string>) {
    const ops = Object.entries(data).map(([key, value]) =>
      this.prisma.platformSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      }),
    );
    await this.prisma.$transaction(ops);
    return this.getSettings();
  }

  // --- Blackouts ---

  async getBlackouts(params: { page: number; limit: number }) {
    const { page, limit } = params;
    const [blackouts, total] = await Promise.all([
      this.prisma.scheduleBlackout.findMany({
        skip: (page - 1) * limit,
        take: limit,
        include: {
          screen: { select: { id: true, name: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { startAt: 'desc' },
      }),
      this.prisma.scheduleBlackout.count(),
    ]);
    return { data: blackouts, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async createBlackout(data: { name: string; reason?: string; startAt: string; endAt: string; screenId?: string; createdById?: string }) {
    return this.prisma.scheduleBlackout.create({
      data: {
        name: data.name,
        reason: data.reason,
        startAt: new Date(data.startAt),
        endAt: new Date(data.endAt),
        screenId: data.screenId || null,
        createdById: data.createdById || null,
      },
      include: {
        screen: { select: { id: true, name: true } },
      },
    });
  }

  async deleteBlackout(id: string) {
    const blackout = await this.prisma.scheduleBlackout.findUnique({ where: { id } });
    if (!blackout) throw new NotFoundException('Blackout not found');
    await this.prisma.scheduleBlackout.delete({ where: { id } });
    return { message: 'Blackout deleted' };
  }

  // --- Campaign Workflow ---

  async approveCampaign(campaignId: string, reviewerId: string, notes?: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.status !== 'PENDING_REVIEW') {
      throw new BadRequestException('Campaign is not pending review');
    }
    const updated = await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'ACTIVE',
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: notes || null,
      },
    });

    // Auto-approve all pending creatives of this campaign
    await this.prisma.creative.updateMany({
      where: { campaignId, moderationStatus: 'PENDING_REVIEW' },
      data: {
        moderationStatus: 'APPROVED',
        isApproved: true,
        moderatedBy: reviewerId,
        moderatedAt: new Date(),
      },
    });

    // Activate catalogue listings linked to this campaign
    await this.prisma.catalogueListing.updateMany({
      where: { campaignId, status: 'DRAFT' },
      data: { status: 'ACTIVE' },
    });

    // Push tv:ads:update to targeted screens
    const targeting = await this.prisma.campaignTargeting.findUnique({
      where: { campaignId },
      select: { includedScreens: { select: { id: true } } },
    });
    for (const screen of targeting?.includedScreens ?? []) {
      this.deviceGateway.pushToScreen(screen.id, 'tv:ads:update', {});
    }

    this.advertiserGateway.emitCampaignsUpdate(campaign.advertiserOrgId);
    void this.eventBus.publish({
      eventId: randomUUID(),
      entity: 'Campaign',
      entityId: campaignId,
      action: 'approved',
      actorRoleTargets: ['admin', 'advertiser'],
      rooms: ['admin', `advertiser:${campaign.advertiserOrgId}`],
      payload: { campaignId, advertiserOrgId: campaign.advertiserOrgId, reviewNotes: notes ?? null },
      timestamp: new Date().toISOString(),
      source: 'admin.service',
    });
    return updated;
  }

  async rejectCampaign(campaignId: string, reviewerId: string, reason: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.status !== 'PENDING_REVIEW') {
      throw new BadRequestException('Campaign is not pending review');
    }
    const updated = await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'REJECTED',
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: reason,
      },
    });
    this.advertiserGateway.emitCampaignsUpdate(campaign.advertiserOrgId);
    void this.eventBus.publish({
      eventId: randomUUID(),
      entity: 'Campaign',
      entityId: campaignId,
      action: 'rejected',
      actorRoleTargets: ['admin', 'advertiser'],
      rooms: ['admin', `advertiser:${campaign.advertiserOrgId}`],
      payload: { campaignId, advertiserOrgId: campaign.advertiserOrgId, reason },
      timestamp: new Date().toISOString(),
      source: 'admin.service',
    });
    return updated;
  }

  // --- Analytics ---

  async getAnalytics(params: { startDate?: string; endDate?: string; partnerOrgId?: string; advertiserOrgId?: string }) {
    const where: any = {};
    if (params.startDate || params.endDate) {
      where.timestamp = {};
      if (params.startDate) where.timestamp.gte = new Date(params.startDate);
      if (params.endDate) where.timestamp.lte = new Date(params.endDate);
    }
    if (params.partnerOrgId) {
      where.orgId = params.partnerOrgId;
    }

    const [totalEvents, impressions, recentEvents] = await Promise.all([
      this.prisma.analyticsEvent.count({ where }),
      this.prisma.analyticsEvent.count({ where: { ...where, eventType: 'IMPRESSION' } }),
      this.prisma.analyticsEvent.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: 500,
        select: { eventType: true, timestamp: true, screenId: true, campaignId: true },
      }),
    ]);

    // Group by day for chart
    const dailyMap = new Map<string, number>();
    recentEvents.forEach((e) => {
      const day = e.timestamp.toISOString().slice(0, 10);
      dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
    });
    const dailyEvents = Array.from(dailyMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Revenue from active bookings
    const bookingWhere: any = { status: 'ACTIVE' };
    if (params.advertiserOrgId) bookingWhere.advertiserOrgId = params.advertiserOrgId;
    const revenueAgg = await this.prisma.booking.aggregate({
      where: bookingWhere,
      _sum: { monthlyPriceCents: true },
    });

    // Top campaigns
    const campaignWhere: any = {};
    if (params.advertiserOrgId) campaignWhere.advertiserOrgId = params.advertiserOrgId;
    const topCampaigns = await this.prisma.campaign.findMany({
      where: { ...campaignWhere, status: 'ACTIVE' },
      take: 5,
      orderBy: { spentCents: 'desc' },
      select: { id: true, name: true, budgetCents: true, spentCents: true, advertiserOrg: { select: { name: true } } },
    });

    return {
      totalEvents,
      impressions,
      dailyEvents,
      totalRevenueCents: revenueAgg._sum.monthlyPriceCents ?? 0,
      topCampaigns,
    };
  }

  // --- Invoice Export ---

  async getInvoicesForExport(params: { status?: string }) {
    const where: any = {};
    if (params.status) where.status = params.status;
    return this.prisma.stripeInvoice.findMany({
      where,
      include: { organization: { select: { name: true, type: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // --- Screens (admin) ---

  async getScreens(params: { status?: string; partnerOrgId?: string; city?: string; online?: string; page: number; limit: number }) {
    const { page, limit, status, partnerOrgId, city, online } = params;
    const where: any = {};
    if (status) where.status = status;
    if (partnerOrgId) where.partnerOrgId = partnerOrgId;
    if (city) where.city = city;

    const [screens, total] = await Promise.all([
      this.prisma.screen.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          partnerOrg: { select: { id: true, name: true } },
          screenLiveStatus: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.screen.count({ where }),
    ]);

    let filtered = screens;
    if (online === 'true') {
      filtered = screens.filter((s: any) => s.screenLiveStatus?.isOnline);
    } else if (online === 'false') {
      filtered = screens.filter((s: any) => !s.screenLiveStatus?.isOnline);
    }

    return { data: filtered, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async updateScreen(id: string, data: any) {
    const screen = await this.prisma.screen.findUnique({ where: { id } });
    if (!screen) throw new NotFoundException('Screen not found');
    return this.prisma.screen.update({
      where: { id },
      data,
      include: {
        partnerOrg: { select: { id: true, name: true } },
        screenLiveStatus: true,
      },
    });
  }

  async bulkApproveScreens(ids: string[], approvedBy: string) {
    const result = await this.prisma.screen.updateMany({
      where: { id: { in: ids }, status: 'PENDING_APPROVAL' },
      data: { status: 'ACTIVE', approvedAt: new Date(), approvedBy },
    });
    return { approved: result.count };
  }

  async bulkRejectScreens(ids: string[], reason: string) {
    const result = await this.prisma.screen.updateMany({
      where: { id: { in: ids }, status: 'PENDING_APPROVAL' },
      data: { status: 'SUSPENDED', suspendedAt: new Date(), suspensionReason: reason },
    });
    return { rejected: result.count };
  }

  // --- Moderation (Creatives/Videos) ---

  async getModerationQueue(params: { status?: string; search?: string; page: number; limit: number }) {
    const { page, limit, status, search } = params;
    const where: any = {};
    if (status) where.moderationStatus = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { campaign: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [creatives, total] = await Promise.all([
      this.prisma.creative.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          campaign: {
            select: { id: true, name: true, advertiserOrg: { select: { id: true, name: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.creative.count({ where }),
    ]);

    return { data: creatives, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async moderateCreative(id: string, action: 'approve' | 'reject' | 'flag' | 'unflag', moderatorId: string, reason?: string) {
    const creative = await this.prisma.creative.findUnique({
      where: { id },
      include: { campaign: { select: { id: true, advertiserOrgId: true, targeting: { select: { includedScreens: { select: { id: true } } } } } } },
    });
    if (!creative) throw new NotFoundException('Creative not found');

    const statusMap: Record<string, string> = {
      approve: 'APPROVED',
      reject: 'REJECTED',
      flag: 'FLAGGED',
      unflag: 'PENDING_REVIEW',
    };

    const updated = await this.prisma.creative.update({
      where: { id },
      data: {
        moderationStatus: statusMap[action] as any,
        moderationReason: action === 'reject' || action === 'flag' ? reason : null,
        moderatedBy: moderatorId,
        moderatedAt: new Date(),
        isApproved: action === 'approve',
      },
      include: {
        campaign: { select: { id: true, name: true, advertiserOrg: { select: { id: true, name: true } } } },
      },
    });

    const advertiserOrgId = (creative.campaign as any)?.advertiserOrgId as string | undefined;
    const domainAction = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : null;

    if (domainAction) {
      void this.eventBus.publish({
        eventId: randomUUID(),
        entity: 'Creative',
        entityId: id,
        action: domainAction as any,
        actorRoleTargets: ['admin', 'advertiser'],
        rooms: ['admin', ...(advertiserOrgId ? [`advertiser:${advertiserOrgId}`] : [])],
        payload: { creativeId: id, advertiserOrgId: advertiserOrgId ?? null, reason: reason ?? null },
        timestamp: new Date().toISOString(),
        source: 'admin.service',
      });
    }

    // On approval, check if all creatives of the campaign are approved → auto-approve campaign
    if (action === 'approve' && creative.campaignId) {
      const pendingCreatives = await this.prisma.creative.count({
        where: { campaignId: creative.campaignId, moderationStatus: { not: 'APPROVED' } },
      });

      if (pendingCreatives === 0) {
        const campaign = await this.prisma.campaign.findUnique({ where: { id: creative.campaignId } });
        if (campaign && campaign.status === 'PENDING_REVIEW') {
          await this.prisma.campaign.update({
            where: { id: creative.campaignId },
            data: { status: 'APPROVED', reviewedAt: new Date(), reviewedBy: moderatorId },
          });
        }
      }

      // Push tv:ads:update to all screens targeted by this creative's campaign
      const screens = (creative.campaign as any)?.targeting?.includedScreens ?? [];
      for (const screen of screens as { id: string }[]) {
        this.deviceGateway.pushToScreen(screen.id, 'tv:ads:update', {});
      }
    }

    return updated;
  }

  async bulkModerateCreatives(ids: string[], action: 'approve' | 'reject', moderatorId: string, reason?: string) {
    const statusMap: Record<string, string> = { approve: 'APPROVED', reject: 'REJECTED' };
    const result = await this.prisma.creative.updateMany({
      where: { id: { in: ids } },
      data: {
        moderationStatus: statusMap[action] as any,
        moderationReason: action === 'reject' ? reason : null,
        moderatedBy: moderatorId,
        moderatedAt: new Date(),
        isApproved: action === 'approve',
      },
    });
    return { moderated: result.count };
  }

  // --- Membership (add user to org) ---

  async addMember(orgId: string, data: { userId: string; role?: string }) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    const user = await this.prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new NotFoundException('User not found');

    const existing = await this.prisma.membership.findFirst({
      where: { userId: data.userId, organizationId: orgId },
    });
    if (existing) throw new ConflictException('User is already a member');

    return this.prisma.membership.create({
      data: {
        userId: data.userId,
        organizationId: orgId,
        role: (data.role as any) || 'MEMBER',
      },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
  }

  // --- Enhanced Dashboard Summary (admin-specific DTO) ---

  async getAdminDashboardSummary() {
    const [
      totalUsers,
      totalPartners,
      totalAdvertisers,
      screensActive,
      screensPending,
      campaignsActive,
      devicesOnline,
      devicesTotal,
      videosTotal,
      videosPendingReview,
      videosFlagged,
      pendingInvoices,
      recentActivity,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.organization.count({ where: { type: 'PARTNER' } }),
      this.prisma.organization.count({ where: { type: 'ADVERTISER' } }),
      this.prisma.screen.count({ where: { status: 'ACTIVE' } }),
      this.prisma.screen.count({ where: { status: 'PENDING_APPROVAL' } }),
      this.prisma.campaign.count({ where: { status: 'ACTIVE' } }),
      this.prisma.screenLiveStatus.count({ where: { isOnline: true } }),
      this.prisma.device.count().catch(() => 0),
      this.prisma.creative.count(),
      this.prisma.creative.count({ where: { moderationStatus: 'PENDING_REVIEW' } }),
      this.prisma.creative.count({ where: { moderationStatus: 'FLAGGED' } }),
      this.prisma.stripeInvoice.count({ where: { status: 'OPEN' } }).catch(() => 0),
      this.prisma.auditLog.findMany({
        orderBy: { timestamp: 'desc' },
        take: 10,
        select: {
          id: true, action: true, entity: true, entityId: true,
          severity: true, timestamp: true, userId: true,
        },
      }),
    ]);

    const revenueAgg = await this.prisma.booking.aggregate({
      where: { status: 'ACTIVE' },
      _sum: { monthlyPriceCents: true },
    }).catch(() => ({ _sum: { monthlyPriceCents: null } }));

    // Delta percentages (compare to 30 days ago)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [usersOld, screensOld] = await Promise.all([
      this.prisma.user.count({ where: { createdAt: { lt: thirtyDaysAgo } } }),
      this.prisma.screen.count({ where: { createdAt: { lt: thirtyDaysAgo } } }),
    ]);
    const usersDelta = usersOld > 0 ? Math.round(((totalUsers - usersOld) / usersOld) * 100) : 0;
    const screensDelta = screensOld > 0 ? Math.round(((screensActive - screensOld) / screensOld) * 100) : 0;

    return {
      users: { total: totalUsers ?? 0, advertisers: totalAdvertisers ?? 0, partners: totalPartners ?? 0, deltaPct: usersDelta },
      screens: { active: screensActive ?? 0, pending: screensPending ?? 0, deltaPct: screensDelta },
      videos: { total: videosTotal ?? 0, aiGenerated: 0, pendingReview: videosPendingReview ?? 0, deltaPct: 0 },
      revenue: { monthly: revenueAgg._sum.monthlyPriceCents ?? 0, deltaPct: 0 },
      urgent: { videosToModerate: (videosPendingReview ?? 0) + (videosFlagged ?? 0), screensToApprove: screensPending ?? 0 },
      system: {
        socketConnected: true,
        lastUpdatedAt: new Date().toISOString(),
        activeCampaigns: campaignsActive ?? 0,
        conversionRate: null,
      },
      // Flat fields for backward compat with existing dashboard
      totalUsers: totalUsers ?? 0,
      totalPartners: totalPartners ?? 0,
      totalAdvertisers: totalAdvertisers ?? 0,
      totalScreens: (screensActive ?? 0) + (screensPending ?? 0),
      campaignsActive: campaignsActive ?? 0,
      activeCampaigns: campaignsActive ?? 0,
      devicesOnline: devicesOnline ?? 0,
      onlineDevices: devicesOnline ?? 0,
      devicesTotal: devicesTotal ?? 0,
      monthlyRevenueCents: revenueAgg._sum.monthlyPriceCents ?? 0,
      pendingCampaigns: 0,
      pendingInvoices: pendingInvoices ?? 0,
      recentActivity: recentActivity ?? [],
    };
  }

  // --- Activity Feed ---

  async getRecentActivity(limit: number = 20) {
    return this.prisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: limit,
      select: {
        id: true, action: true, entity: true, entityId: true,
        severity: true, timestamp: true, userId: true, ipAddress: true,
      },
    });
  }

  // ─── Finance KPIs ────────────────────────────────────────────────────────

  private getRangeDate(range: string): Date {
    const now = new Date();
    switch (range) {
      case 'day':   return new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
      case 'week':  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '6m':    return new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      case '12m':   return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      case 'month':
      default:      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
  }

  async getFinanceKPIs(range: string = 'month') {
    const since = this.getRangeDate(range);

    // Paid invoices in the period
    const [invoiceAgg, invoiceCount] = await Promise.all([
      this.prisma.stripeInvoice.aggregate({
        where: { status: 'PAID', paidAt: { gte: since } },
        _sum: { amountPaidCents: true },
        _count: { id: true },
      }).catch(() => ({ _sum: { amountPaidCents: null }, _count: { id: 0 } })),
      this.prisma.stripeInvoice.count({ where: { status: 'PAID', paidAt: { gte: since } } }).catch(() => 0),
    ]);

    const grossRevenueCents = invoiceAgg._sum?.amountPaidCents ?? 0;

    // Active subscriptions monthly revenue (always current)
    const activeBookingAgg = await this.prisma.booking.aggregate({
      where: { status: 'ACTIVE' },
      _sum: { monthlyPriceCents: true },
    }).catch(() => ({ _sum: { monthlyPriceCents: null } }));
    const monthlyActiveRevenueCents = activeBookingAgg._sum?.monthlyPriceCents ?? 0;

    // Commission payouts in the period (money owed to partners)
    const payoutAgg = await this.prisma.payout.aggregate({
      where: { status: 'PAID', paidAt: { gte: since } },
      _sum: { amountCents: true },
    }).catch(() => ({ _sum: { amountCents: null } }));
    const partnerPayoutsCents = payoutAgg._sum?.amountCents ?? 0;

    // Pending revenue shares (calculated but not yet paid)
    const pendingShareAgg = await this.prisma.revenueShare.aggregate({
      where: { status: { in: ['PENDING', 'CALCULATED', 'APPROVED'] } },
      _sum: { partnerShareCents: true },
    }).catch(() => ({ _sum: { partnerShareCents: null } }));
    const pendingPartnerPayoutsCents = pendingShareAgg._sum?.partnerShareCents ?? 0;

    // Revenue net (after partner commissions)
    const netRevenueCents = grossRevenueCents - partnerPayoutsCents;

    // Subscription period breakdown: 6m vs 12m
    const [subs6m, subs12m] = await Promise.all([
      this.prisma.booking.count({ where: { status: 'ACTIVE', billingCycle: 'MONTHLY' } }).catch(() => 0),
      this.prisma.booking.count({ where: { status: 'ACTIVE', billingCycle: { in: ['QUARTERLY', 'YEARLY'] } } }).catch(() => 0),
    ]);

    // Average basket (avg payment per invoice in period)
    const avgBasketCents = invoiceCount > 0 ? Math.round(grossRevenueCents / invoiceCount) : 0;

    // Average screens per advertiser
    const [advertiserCount, bookingScreenCount] = await Promise.all([
      this.prisma.organization.count({ where: { type: 'ADVERTISER' } }),
      this.prisma.bookingScreen.count({ where: { booking: { status: 'ACTIVE' } } }).catch(() => 0),
    ]);
    const avgScreensPerAdvertiser = advertiserCount > 0 ? Math.round(bookingScreenCount / advertiserCount * 10) / 10 : 0;

    // Previous period for delta
    const prevSince = new Date(since.getTime() - (Date.now() - since.getTime()));
    const prevInvoiceAgg = await this.prisma.stripeInvoice.aggregate({
      where: { status: 'PAID', paidAt: { gte: prevSince, lt: since } },
      _sum: { amountPaidCents: true },
    }).catch(() => ({ _sum: { amountPaidCents: null } }));
    const prevGross = prevInvoiceAgg._sum?.amountPaidCents ?? 0;
    const revenueDeltaPct = prevGross > 0 ? Math.round(((grossRevenueCents - prevGross) / prevGross) * 100) : 0;

    return {
      range,
      grossRevenueCents: grossRevenueCents ?? 0,
      netRevenueCents: netRevenueCents ?? 0,
      monthlyActiveRevenueCents: monthlyActiveRevenueCents ?? 0,
      partnerPayoutsCents: partnerPayoutsCents ?? 0,
      pendingPartnerPayoutsCents: pendingPartnerPayoutsCents ?? 0,
      invoiceCount,
      avgBasketCents: avgBasketCents ?? 0,
      avgScreensPerAdvertiser: avgScreensPerAdvertiser ?? 0,
      subscriptionBreakdown: {
        short: subs6m ?? 0,  // monthly
        long: subs12m ?? 0,  // quarterly/yearly
      },
      revenueDeltaPct: revenueDeltaPct ?? 0,
    };
  }

  // ─── Network KPIs ────────────────────────────────────────────────────────

  async getNetworkKPIs(range: string = 'month') {
    const since = this.getRangeDate(range);
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);

    const [
      totalPartners,
      totalAdvertisers,
      screensTotal,
      screensConnected,
      screensMaintenance,
      campaignsPending,
      diffusionAgg,
    ] = await Promise.all([
      this.prisma.organization.count({ where: { type: 'PARTNER' } }),
      this.prisma.organization.count({ where: { type: 'ADVERTISER' } }),
      this.prisma.screen.count({ where: { status: 'ACTIVE' } }),
      this.prisma.screenLiveStatus.count({ where: { isOnline: true } }),
      this.prisma.screen.count({ where: { maintenanceMode: true } }),
      this.prisma.creative.count({ where: { moderationStatus: { in: ['PENDING_REVIEW', 'FLAGGED'] } } }),
      this.prisma.diffusionLog.aggregate({
        where: { startTime: { gte: since } },
        _count: { id: true },
        _sum: { durationMs: true },
      }).catch(() => ({ _count: { id: 0 }, _sum: { durationMs: null } })),
    ]);

    // Active advertisers = orgs with at least one ACTIVE booking
    const activeAdvertisers = await this.prisma.organization.count({
      where: {
        type: 'ADVERTISER',
        bookingsAsAdv: { some: { status: 'ACTIVE' } },
      },
    }).catch(() => 0);

    // Active ads in rotation = active campaigns
    const [activeCampaignsCount, activeCampaignsPeriod] = await Promise.all([
      this.prisma.campaign.count({ where: { status: 'ACTIVE' } }),
      this.prisma.campaign.count({ where: { status: 'ACTIVE', createdAt: { gte: since } } }),
    ]);

    // Total diffusion minutes
    const totalDiffusionMs = diffusionAgg._sum?.durationMs ?? 0;
    const totalDiffusionMinutes = Math.round(totalDiffusionMs / 60000);
    const totalDiffusionCount = diffusionAgg._count?.id ?? 0;

    // Screens offline (active screens that are not connected)
    const screensOffline = screensTotal - screensConnected;

    return {
      range,
      totalPartners: totalPartners ?? 0,
      totalAdvertisers: totalAdvertisers ?? 0,
      activeAdvertisers: activeAdvertisers ?? 0,
      screensTotal: screensTotal ?? 0,
      screensConnected: screensConnected ?? 0,
      screensMaintenance: screensMaintenance ?? 0,
      screensOffline: screensOffline ?? 0,
      activeCampaigns: activeCampaignsCount ?? 0,
      activeCampaignsPeriod: activeCampaignsPeriod ?? 0,
      campaignsPendingModeration: campaignsPending ?? 0,
      totalDiffusionMinutes: totalDiffusionMinutes ?? 0,
      totalDiffusionCount: totalDiffusionCount ?? 0,
    };
  }

  // ─── Admin Partners (enhanced list with metrics) ──────────────────────────

  async getAdminPartners(params: { q?: string; status?: string; page: number; limit: number }) {
    const { q, page, limit } = params;

    const where: any = { type: 'PARTNER' };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { contactEmail: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [orgs, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { screens: true, memberships: true } },
          screens: {
            select: {
              id: true,
              status: true,
              maintenanceMode: true,
              screenLiveStatus: { select: { isOnline: true } },
            },
          },
          revenueShares: {
            where: { status: { in: ['PENDING', 'CALCULATED', 'APPROVED'] } },
            select: { partnerShareCents: true },
          },
          payouts: {
            where: { status: 'PAID' },
            select: { amountCents: true },
            orderBy: { paidAt: 'desc' },
            take: 12,
          },
          partnerProfile: { select: { isVerified: true, isSuspended: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.organization.count({ where }),
    ]);

    const data = orgs.map((org: any) => {
      const screensConnected = (org.screens as any[]).filter((s: any) => s.screenLiveStatus?.isOnline).length;
      const screensMaintenance = (org.screens as any[]).filter((s: any) => s.maintenanceMode).length;
      const upcomingCommissionCents = (org.revenueShares as any[]).reduce((sum: number, rs: any) => sum + (rs.partnerShareCents ?? 0), 0);
      const paidCommissionCents = (org.payouts as any[]).reduce((sum: number, p: any) => sum + (p.amountCents ?? 0), 0);

      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        contactEmail: org.contactEmail,
        city: org.city,
        commissionRate: org.commissionRate,
        createdAt: org.createdAt,
        isVerified: org.partnerProfile?.isVerified ?? false,
        isSuspended: org.partnerProfile?.isSuspended ?? false,
        screensTotal: org._count.screens,
        screensConnected,
        screensMaintenance,
        upcomingCommissionCents,
        paidCommissionCents,
        memberCount: org._count.memberships,
      };
    });

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─── Admin Partner Detail ─────────────────────────────────────────────────

  async getAdminPartnerDetail(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        screens: {
          include: {
            screenLiveStatus: true,
            tvConfig: true,
            devices: { select: { id: true, status: true, appVersion: true, lastPingAt: true }, take: 1 },
            _count: { select: { bookingScreens: { where: { booking: { status: 'ACTIVE' } } } } },
          },
          orderBy: { createdAt: 'desc' },
        },
        memberships: {
          include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true, lastLoginAt: true } },
          },
        },
        revenueShares: {
          orderBy: { periodStart: 'desc' },
          take: 12,
          include: { payout: { select: { id: true, status: true, paidAt: true } } },
        },
        payouts: {
          orderBy: { paidAt: 'desc' },
          take: 12,
        },
        partnerProfile: true,
        _count: { select: { screens: true, memberships: true } },
      },
    });

    if (!org) throw new NotFoundException('Partner not found');

    // Compute summary metrics
    const screensConnected = (org.screens as any[]).filter((s: any) => s.screenLiveStatus?.isOnline).length;
    const screensMaintenance = (org.screens as any[]).filter((s: any) => s.maintenanceMode).length;
    const screensWithCampaign = (org.screens as any[]).filter((s: any) => (s._count?.bookingScreens ?? 0) > 0).length;

    const upcomingCommissionCents = (org.revenueShares as any[])
      .filter((rs: any) => ['PENDING', 'CALCULATED', 'APPROVED'].includes(rs.status))
      .reduce((sum: number, rs: any) => sum + (rs.partnerShareCents ?? 0), 0);

    const paidCommissionCents = (org.payouts as any[])
      .filter((p: any) => p.status === 'PAID')
      .reduce((sum: number, p: any) => sum + (p.amountCents ?? 0), 0);

    return {
      ...org,
      metrics: {
        screensTotal: org._count.screens,
        screensConnected,
        screensMaintenance,
        screensOffline: org._count.screens - screensConnected - screensMaintenance,
        screensWithCampaign,
        upcomingCommissionCents,
        paidCommissionCents,
        memberCount: org._count.memberships,
      },
    };
  }

  // ─── Update Partner (admin) ───────────────────────────────────────────────

  async updateAdminPartner(id: string, data: {
    name?: string;
    contactEmail?: string;
    city?: string;
    address?: string;
    commissionRate?: number;
    isSuspended?: boolean;
    suspensionReason?: string;
    isVerified?: boolean;
    kbisUrl?: string;
    directorFullName?: string;
    directorIdCardUrl?: string;
    siretNumber?: string;
  }) {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException('Partner not found');

    const orgUpdate: any = {};
    if (data.name !== undefined) orgUpdate.name = data.name;
    if (data.contactEmail !== undefined) orgUpdate.contactEmail = data.contactEmail;
    if (data.city !== undefined) orgUpdate.city = data.city;
    if (data.address !== undefined) orgUpdate.address = data.address;
    if (data.commissionRate !== undefined) orgUpdate.commissionRate = Math.min(0.20, Math.max(0.05, data.commissionRate));

    const profileUpdate: any = {};
    if (data.isSuspended !== undefined) {
      profileUpdate.isSuspended = data.isSuspended;
      profileUpdate.suspendedAt = data.isSuspended ? new Date() : null;
      profileUpdate.suspensionReason = data.isSuspended ? (data.suspensionReason || null) : null;
    }
    if (data.isVerified !== undefined) {
      profileUpdate.isVerified = data.isVerified;
      profileUpdate.verifiedAt = data.isVerified ? new Date() : null;
    }
    if (data.kbisUrl !== undefined) profileUpdate.kbisUrl = data.kbisUrl;
    if (data.directorFullName !== undefined) profileUpdate.directorFullName = data.directorFullName;
    if (data.directorIdCardUrl !== undefined) profileUpdate.directorIdCardUrl = data.directorIdCardUrl;
    if (data.siretNumber !== undefined) profileUpdate.siretNumber = data.siretNumber;

    const [updatedOrg] = await this.prisma.$transaction([
      this.prisma.organization.update({
        where: { id },
        data: orgUpdate,
      }),
      ...(Object.keys(profileUpdate).length > 0 ? [
        this.prisma.partnerProfile.upsert({
          where: { orgId: id },
          update: profileUpdate as any,
          create: { orgId: id, ...profileUpdate } as any,
        }),
      ] : []),
    ]);

    return updatedOrg;
  }

  // ─── Send Password Reset to Partner Owner ─────────────────────────────────

  async resetPartnerOwnerPassword(partnerId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: partnerId },
      include: {
        memberships: {
          where: { role: 'OWNER' },
          include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
          take: 1,
        },
      },
    });
    if (!org) throw new NotFoundException('Partner not found');

    const owner = org.memberships[0]?.user;
    if (!owner) throw new BadRequestException('No owner found for this partner');

    const result = await this.resetPassword(owner.id);
    return {
      userId: owner.id,
      email: owner.email,
      firstName: owner.firstName,
      temporaryPassword: result.temporaryPassword,
    };
  }

  // ─── Partner Screens (admin view with capacity) ───────────────────────────

  async getPartnerScreensAdmin(partnerId: string, params: { status?: string; online?: string; page: number; limit: number }) {
    const { status, online, page, limit } = params;

    const where: any = { partnerOrgId: partnerId };
    if (status) where.status = status;

    const [screens, total] = await Promise.all([
      this.prisma.screen.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          screenLiveStatus: true,
          devices: { select: { id: true, status: true, appVersion: true, lastPingAt: true }, take: 1 },
          _count: {
            select: {
              bookingScreens: { where: { booking: { status: 'ACTIVE' } } },
            },
          },
          tvConfig: { select: { enabledModules: true, defaultTab: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.screen.count({ where }),
    ]);

    let filtered = screens;
    if (online === 'true') filtered = screens.filter((s: any) => s.screenLiveStatus?.isOnline);
    else if (online === 'false') filtered = screens.filter((s: any) => !s.screenLiveStatus?.isOnline);

    const data = filtered.map((s: any) => ({
      id: s.id,
      name: s.name,
      city: s.city,
      address: s.address,
      status: s.status,
      maintenanceMode: s.maintenanceMode ?? false,
      monthlyPriceCents: s.monthlyPriceCents,
      currency: s.currency,
      isOnline: s.screenLiveStatus?.isOnline ?? false,
      lastHeartbeatAt: s.screenLiveStatus?.lastHeartbeatAt ?? null,
      cpuPercent: s.screenLiveStatus?.cpuPercent ?? null,
      memoryPercent: s.screenLiveStatus?.memoryPercent ?? null,
      appVersion: s.screenLiveStatus?.appVersion ?? null,
      activeAdsCount: s._count?.bookingScreens ?? 0,
      capacityMax: s.capacityMaxAdvertisers ?? 40,
      tvConfig: s.tvConfig,
      createdAt: s.createdAt,
    }));

    return { data, total: filtered.length, page, limit, totalPages: Math.ceil(filtered.length / limit) };
  }

  // ─── Partner TV Config (admin view) ──────────────────────────────────────

  async getPartnerTvConfig(partnerId: string) {
    const screens = await this.prisma.screen.findMany({
      where: { partnerOrgId: partnerId, status: 'ACTIVE' },
      include: {
        tvConfig: true,
        tvMacro: true,
      },
      orderBy: { name: 'asc' },
    });

    return screens.map((s: any) => ({
      screenId: s.id,
      screenName: s.name,
      city: s.city,
      tvConfig: s.tvConfig ? {
        enabledModules: s.tvConfig.enabledModules ?? [],
        defaultTab: s.tvConfig.defaultTab ?? 'TNT',
        welcomeMessage: s.tvConfig.welcomeMessage ?? null,
        tickerText: s.tvConfig.tickerText ?? null,
      } : null,
      tvMacro: s.tvMacro ? {
        spotDuration15s: s.tvMacro.spotDuration15s,
        spotDuration30s: s.tvMacro.spotDuration30s,
        splitRatio: s.tvMacro.splitRatio,
        adRotationMs: s.tvMacro.adRotationMs,
      } : null,
    }));
  }

  // ─── Force TV Reload ─────────────────────────────────────────────────────

  async forceReloadScreen(screenId: string) {
    const screen = await this.prisma.screen.findUnique({
      where: { id: screenId },
      select: { id: true, partnerOrgId: true },
    });
    if (!screen) throw new NotFoundException('Screen not found');

    this.deviceGateway.pushToScreen(screenId, 'command', { type: 'refresh' });

    void this.eventBus.publish({
      eventId: randomUUID(),
      entity: 'TvConfig',
      entityId: screenId,
      action: 'force_reload',
      actorRoleTargets: ['device'],
      rooms: [`screen:${screenId}`],
      payload: { screenId, partnerOrgId: screen.partnerOrgId },
      timestamp: new Date().toISOString(),
      source: 'admin.service',
    });

    return { screenId, command: 'refresh', sentAt: new Date().toISOString() };
  }

  // ─── Update TV Config for a screen (admin) ────────────────────────────────

  async updateScreenTvConfig(screenId: string, data: {
    enabledModules?: string[];
    defaultTab?: string;
    welcomeMessage?: string;
    tickerText?: string;
    splitRatio?: number;
  }) {
    const screen = await this.prisma.screen.findUnique({
      where: { id: screenId },
      select: { id: true, partnerOrgId: true },
    });
    if (!screen) throw new NotFoundException('Screen not found');

    const tvConfig = await this.prisma.tvConfig.upsert({
      where: { screenId },
      update: {
        ...(data.enabledModules !== undefined && { enabledModules: data.enabledModules }),
        ...(data.defaultTab !== undefined && { defaultTab: data.defaultTab as any }),
        ...(data.welcomeMessage !== undefined && { welcomeMessage: data.welcomeMessage }),
        ...(data.tickerText !== undefined && { tickerText: data.tickerText }),
      },
      create: {
        screenId,
        orgId: screen.partnerOrgId,
        enabledModules: data.enabledModules ?? ['TNT', 'STREAMING', 'ACTIVITIES'],
        defaultTab: (data.defaultTab as any) ?? 'TNT',
        welcomeMessage: data.welcomeMessage ?? null,
        tickerText: data.tickerText ?? null,
      },
    });

    if (data.splitRatio !== undefined) {
      await this.prisma.tvMacro.upsert({
        where: { screenId },
        update: { splitRatio: data.splitRatio },
        create: {
          screenId,
          orgId: screen.partnerOrgId,
          splitRatio: data.splitRatio,
        },
      });
    }

    return tvConfig;
  }

  // ── Campaign Management (Admin on behalf of Advertiser) ──────────

  /**
   * Create a campaign for an advertiser from the admin panel.
   */
  async createCampaignForAdvertiser(data: {
    advertiserOrgId: string;
    name: string;
    description?: string;
    type?: string;
    startDate: string;
    endDate: string;
    budgetCents: number;
    selectedScreenIds?: string[];
  }) {
    const org = await this.prisma.organization.findUnique({ where: { id: data.advertiserOrgId } });
    if (!org || org.type !== 'ADVERTISER') throw new NotFoundException('Annonceur introuvable');

    const result = await this.prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.create({
        data: {
          name: data.name,
          description: data.description || null,
          type: (data.type as any) || 'AD_SPOT',
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
          budgetCents: data.budgetCents,
          advertiserOrgId: data.advertiserOrgId,
          status: 'ACTIVE',
        },
      });

      if (data.selectedScreenIds?.length) {
        await tx.campaignTargeting.create({
          data: {
            campaignId: campaign.id,
            includedScreens: { connect: data.selectedScreenIds.map((id) => ({ id })) },
          },
        });
      }

      return campaign;
    });

    // Notify advertiser in real-time
    this.advertiserGateway.emitCampaignsUpdate(data.advertiserOrgId);

    return result;
  }

  /**
   * Update any campaign from admin panel.
   */
  async updateCampaignFromAdmin(campaignId: string, data: any) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundException('Campagne introuvable');

    const allowedFields = ['name', 'description', 'status', 'startDate', 'endDate', 'budgetCents', 'type'];
    const updateData: any = {};
    for (const key of allowedFields) {
      if (data[key] !== undefined) {
        if (key === 'startDate' || key === 'endDate') {
          updateData[key] = new Date(data[key]);
        } else {
          updateData[key] = data[key];
        }
      }
    }

    const updated = await this.prisma.campaign.update({
      where: { id: campaignId },
      data: updateData,
      include: { advertiserOrg: { select: { id: true, name: true } } },
    });

    // Notify advertiser
    this.advertiserGateway.emitCampaignsUpdate(updated.advertiserOrgId);

    return updated;
  }

  /**
   * Delete a campaign from admin panel.
   */
  async deleteCampaignFromAdmin(campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundException('Campagne introuvable');

    // Delete targeting first (cascade may not handle M2M)
    await this.prisma.campaignTargeting.deleteMany({ where: { campaignId } });
    await this.prisma.campaign.delete({ where: { id: campaignId } });

    // Notify advertiser
    this.advertiserGateway.emitCampaignsUpdate(campaign.advertiserOrgId);

    return { message: 'Campagne supprimée' };
  }

  // ── Screen Management (Admin on behalf of Partner) ──────────────

  /**
   * Create a screen for a partner from admin panel.
   */
  async createScreenForPartner(data: {
    partnerOrgId: string;
    name: string;
    address?: string;
    city?: string;
    postCode?: string;
    environment?: string;
    screenType?: string;
    resolution?: string;
    orientation?: string;
    monthlyPriceCents?: number;
    latitude?: number;
    longitude?: number;
    venueId?: string;
    siteId?: string;
  }) {
    const org = await this.prisma.organization.findUnique({ where: { id: data.partnerOrgId } });
    if (!org || org.type !== 'PARTNER') throw new NotFoundException('Partenaire introuvable');

    const screen = await this.prisma.screen.create({
      data: {
        name: data.name,
        partnerOrgId: data.partnerOrgId,
        address: data.address || null,
        city: data.city || null,
        postCode: data.postCode || null,
        environment: (data.environment as any) || 'OTHER',
        screenType: (data.screenType as any) || 'OTHER',
        resolution: data.resolution || '1920x1080',
        orientation: data.orientation || 'LANDSCAPE',
        monthlyPriceCents: data.monthlyPriceCents || 0,
        latitude: data.latitude || null,
        longitude: data.longitude || null,
        venueId: data.venueId || null,
        siteId: data.siteId || null,
        status: 'ACTIVE',
      },
      include: {
        screenLiveStatus: true,
        partnerOrg: { select: { id: true, name: true } },
      },
    });

    // Create ScreenLiveStatus projection
    await this.prisma.screenLiveStatus.create({
      data: { screenId: screen.id, isOnline: false },
    }).catch(() => {}); // ignore if already exists

    return screen;
  }

  /**
   * Delete a screen from admin panel.
   */
  async deleteScreenFromAdmin(screenId: string) {
    const screen = await this.prisma.screen.findUnique({ where: { id: screenId } });
    if (!screen) throw new NotFoundException('Écran introuvable');

    // Clean up related records
    await this.prisma.screenLiveStatus.deleteMany({ where: { screenId } });
    await this.prisma.screen.delete({ where: { id: screenId } });

    return { message: 'Écran supprimé', partnerOrgId: screen.partnerOrgId };
  }

  /**
   * Generate a pairing PIN for a screen (admin-initiated pairing).
   */
  async generatePairingForScreen(screenId: string) {
    const screen = await this.prisma.screen.findUnique({
      where: { id: screenId },
      include: { partnerOrg: true },
    });
    if (!screen) throw new NotFoundException('Écran introuvable');

    const pin = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit PIN
    const pinExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    const pairingRequest = await this.prisma.devicePairingRequest.create({
      data: {
        serialNumber: `admin-pair-${randomUUID().slice(0, 8)}`,
        pin,
        pinExpiresAt,
        status: 'PENDING',
        screenId: screen.id,
        claimedByOrgId: screen.partnerOrgId,
      },
    });

    return { pin, expiresAt: pinExpiresAt, pairingRequestId: pairingRequest.id };
  }

  // ── Venue / Site Management (Admin on behalf of Partner) ────────

  /**
   * List venues/sites for a partner.
   */
  async getPartnerVenues(partnerOrgId: string) {
    return this.prisma.venue.findMany({
      where: { partnerOrgId },
      include: { _count: { select: { screens: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Create a venue/site for a partner from admin.
   */
  async createVenueForPartner(data: {
    partnerOrgId: string;
    name: string;
    category?: string;
    address?: string;
    city?: string;
    postCode?: string;
  }) {
    const org = await this.prisma.organization.findUnique({ where: { id: data.partnerOrgId } });
    if (!org || org.type !== 'PARTNER') throw new NotFoundException('Partenaire introuvable');

    return this.prisma.venue.create({
      data: {
        name: data.name,
        partnerOrgId: data.partnerOrgId,
        category: (data.category as any) || 'OTHER',
        address: data.address || null,
        city: data.city || null,
        postCode: data.postCode || null,
      },
      include: { _count: { select: { screens: true } } },
    });
  }

  /**
   * Update a venue/site.
   */
  async updateVenue(venueId: string, data: any) {
    const venue = await this.prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) throw new NotFoundException('Site introuvable');

    const allowedFields = ['name', 'category', 'address', 'city', 'postCode'];
    const updateData: any = {};
    for (const key of allowedFields) {
      if (data[key] !== undefined) updateData[key] = data[key];
    }

    return this.prisma.venue.update({
      where: { id: venueId },
      data: updateData,
      include: { _count: { select: { screens: true } } },
    });
  }

  /**
   * Delete a venue/site.
   */
  async deleteVenue(venueId: string) {
    const venue = await this.prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) throw new NotFoundException('Site introuvable');

    // Unlink screens from venue before deleting
    await this.prisma.screen.updateMany({ where: { venueId }, data: { venueId: null } });
    await this.prisma.venue.delete({ where: { id: venueId } });

    return { message: 'Site supprimé', partnerOrgId: venue.partnerOrgId };
  }

  // ── Member Management ───────────────────────────────────────────

  /**
   * Remove a member from an organization.
   */
  async removeMember(orgId: string, membershipId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, organizationId: orgId },
    });
    if (!membership) throw new NotFoundException('Membre introuvable');

    await this.prisma.membership.delete({ where: { id: membershipId } });
    return { message: 'Membre supprimé' };
  }

  /**
   * Update a member's role.
   */
  async updateMemberRole(orgId: string, membershipId: string, role: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, organizationId: orgId },
    });
    if (!membership) throw new NotFoundException('Membre introuvable');

    return this.prisma.membership.update({
      where: { id: membershipId },
      data: { role: role as any },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async ingestEvent(data: { eventType: string; screenId?: string; deviceId?: string; campaignId?: string; creativeId?: string; payload?: any }) {
    return this.prisma.analyticsEvent.create({ data: { ...data, timestamp: new Date() } });
  }

  async getDashboardStats() {
    const [
      totalUsers,
      totalOrganizations,
      totalScreens,
      totalDevices,
      activeCampaigns,
      onlineDevices,
      totalRevenue,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.organization.count(),
      this.prisma.screen.count(),
      this.prisma.device.count(),
      this.prisma.campaign.count({ where: { status: 'ACTIVE' } }),
      this.prisma.device.count({ where: { status: 'ONLINE' } }),
      this.prisma.stripeInvoice.aggregate({ where: { status: 'PAID' }, _sum: { amountPaidCents: true } }),
    ]);

    return {
      totalUsers,
      totalOrganizations,
      totalScreens,
      totalDevices,
      activeCampaigns,
      onlineDevices,
      totalRevenueCents: totalRevenue._sum?.amountPaidCents || 0,
    };
  }

  async getCampaignAnalytics(campaignId: string) {
    const events = await this.prisma.analyticsEvent.findMany({
      where: { campaignId },
      orderBy: { timestamp: 'desc' },
      take: 1000,
    });

    const impressions = events.filter((e) => e.eventType === 'IMPRESSION').length;
    const views = events.filter((e) => e.eventType === 'VIEW').length;

    return {
      campaignId,
      impressions,
      views,
      totalEvents: events.length,
    };
  }

  /**
   * Advertiser analytics: total views, views per creative, top 5 screens
   * Based on DiffusionLog (real playback proofs)
   */
  async getAdvertiserAnalytics(advertiserOrgId: string) {
    const campaigns = await this.prisma.campaign.findMany({
      where: { advertiserOrgId },
      select: { id: true, name: true, status: true },
    });
    const campaignIds = campaigns.map((c) => c.id);

    if (campaignIds.length === 0) {
      return {
        totalViews: 0,
        totalCampaigns: 0,
        activeCampaigns: 0,
        viewsByCreative: [],
        topScreens: [],
        viewsTimeline: [],
      };
    }

    // Total views
    const totalViews = await this.prisma.diffusionLog.count({
      where: { campaignId: { in: campaignIds } },
    });

    // Views grouped by creative
    const viewsByCreativeRaw = await this.prisma.diffusionLog.groupBy({
      by: ['creativeId'],
      where: { campaignId: { in: campaignIds } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    const creativeIds = viewsByCreativeRaw.map((v) => v.creativeId);
    const creatives = creativeIds.length > 0
      ? await this.prisma.creative.findMany({
          where: { id: { in: creativeIds } },
          select: { id: true, name: true, type: true, fileUrl: true, campaignId: true },
        })
      : [];
    const creativesMap = new Map(creatives.map((c) => [c.id, c]));

    // Per-creative: also get number of distinct screens
    const screenCountsByCreative = creativeIds.length > 0
      ? await this.prisma.diffusionLog.groupBy({
          by: ['creativeId', 'screenId'],
          where: { campaignId: { in: campaignIds } },
          _count: { id: true },
        })
      : [];
    const screensPerCreative = new Map<string, number>();
    const tempSet = new Map<string, Set<string>>();
    for (const row of screenCountsByCreative) {
      if (!tempSet.has(row.creativeId)) tempSet.set(row.creativeId, new Set());
      tempSet.get(row.creativeId)!.add(row.screenId);
    }
    for (const [cid, set] of tempSet) {
      screensPerCreative.set(cid, set.size);
    }

    const viewsByCreative = viewsByCreativeRaw.map((v) => {
      const creative = creativesMap.get(v.creativeId);
      const campaign = campaigns.find((c) => c.id === creative?.campaignId);
      return {
        creativeId: v.creativeId,
        creativeName: creative?.name ?? 'Inconnu',
        creativeType: creative?.type ?? 'VIDEO',
        fileUrl: creative?.fileUrl ?? null,
        campaignId: creative?.campaignId ?? null,
        campaignName: campaign?.name ?? 'Inconnu',
        totalViews: v._count.id,
        screensCount: screensPerCreative.get(v.creativeId) ?? 0,
      };
    });

    // Top 5 screens by views (always return 5 screens even with 0 views)
    const viewsByScreenRaw = await this.prisma.diffusionLog.groupBy({
      by: ['screenId'],
      where: { campaignId: { in: campaignIds } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });

    // Fetch screen details for the top 5 screens by views
    const topScreenIds = viewsByScreenRaw.map((v) => v.screenId);
    const topScreenDetails = topScreenIds.length > 0
      ? await this.prisma.screen.findMany({
          where: { id: { in: topScreenIds } },
          select: { id: true, name: true, city: true },
        })
      : [];
    const topScreenMap = new Map(topScreenDetails.map((s) => [s.id, s]));

    const screensWithViews = viewsByScreenRaw.map((v) => {
      const screen = topScreenMap.get(v.screenId);
      return {
        screenId: v.screenId,
        screenName: screen?.name ?? 'Écran inconnu',
        city: screen?.city ?? '',
        totalViews: v._count.id,
      };
    });

    // Fill remaining slots with 0-view screens if less than 5
    let topScreens = screensWithViews;
    if (screensWithViews.length < 5) {
      const usedIds = new Set(screensWithViews.map((s) => s.screenId));
      const remaining = await this.prisma.screen.findMany({
        where: { id: { notIn: Array.from(usedIds) } },
        select: { id: true, name: true, city: true },
        orderBy: { name: 'asc' },
        take: 5 - screensWithViews.length,
      });
      topScreens = [
        ...screensWithViews,
        ...remaining.map((s) => ({
          screenId: s.id,
          screenName: s.name,
          city: s.city ?? '',
          totalViews: 0,
        })),
      ];
    }

    // Views timeline (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const timelineLogs = await this.prisma.diffusionLog.findMany({
      where: {
        campaignId: { in: campaignIds },
        startTime: { gte: thirtyDaysAgo },
      },
      select: { startTime: true },
      orderBy: { startTime: 'asc' },
    });

    const timelineMap = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      timelineMap.set(d.toISOString().split('T')[0], 0);
    }
    for (const log of timelineLogs) {
      const dateKey = log.startTime.toISOString().split('T')[0];
      if (timelineMap.has(dateKey)) {
        timelineMap.set(dateKey, (timelineMap.get(dateKey) ?? 0) + 1);
      }
    }
    const viewsTimeline = Array.from(timelineMap.entries()).map(([date, views]) => ({ date, views }));

    return {
      totalViews,
      totalCampaigns: campaigns.length,
      activeCampaigns: campaigns.filter((c) => c.status === 'ACTIVE').length,
      viewsByCreative,
      topScreens,
      viewsTimeline,
    };
  }
}

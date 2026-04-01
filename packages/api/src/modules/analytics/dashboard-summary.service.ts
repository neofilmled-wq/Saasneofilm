import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface DashboardSummaryDto {
  totalUsers: number;
  totalPartners: number;
  totalAdvertisers: number;
  totalScreens: number;
  campaignsActive: number;
  devicesOnline: number;
  devicesTotal: number;
  monthlyRevenueCents: number;
  pendingCampaigns: number;
  pendingInvoices: number;
  recentActivity: Array<{
    id: string;
    action: string;
    entity: string;
    entityId: string | null;
    severity: string;
    timestamp: Date;
    userId: string | null;
  }>;
  // Backward-compatible aliases
  activeCampaigns: number;
  onlineDevices: number;
}

@Injectable()
export class DashboardSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(): Promise<DashboardSummaryDto> {
    const [
      totalUsers,
      totalPartners,
      totalAdvertisers,
      totalScreens,
      campaignsActive,
      devicesOnline,
      pendingCampaigns,
      recentAuditLogs,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.organization.count({ where: { type: 'PARTNER' } }),
      this.prisma.organization.count({ where: { type: 'ADVERTISER' } }),
      this.prisma.screen.count(),
      this.prisma.campaign.count({ where: { status: 'ACTIVE' } }),
      this.prisma.screenLiveStatus.count({ where: { isOnline: true } }),
      this.prisma.campaign.count({ where: { status: 'PENDING_REVIEW' } }),
      this.prisma.auditLog.findMany({
        orderBy: { timestamp: 'desc' },
        take: 10,
        select: {
          id: true,
          action: true,
          entity: true,
          entityId: true,
          severity: true,
          timestamp: true,
          userId: true,
        },
      }),
    ]);

    const devicesTotal = await this.prisma.device.count().catch(() => 0);

    const revenueAgg = await this.prisma.booking.aggregate({
      where: { status: 'ACTIVE' },
      _sum: { monthlyPriceCents: true },
    }).catch(() => ({ _sum: { monthlyPriceCents: null } }));

    const pendingInvoices = await this.prisma.stripeInvoice.count({
      where: { status: 'OPEN' },
    }).catch(() => 0);

    const safeDevicesOnline = devicesOnline ?? 0;
    const safeCampaignsActive = campaignsActive ?? 0;

    return {
      totalUsers: totalUsers ?? 0,
      totalPartners: totalPartners ?? 0,
      totalAdvertisers: totalAdvertisers ?? 0,
      totalScreens: totalScreens ?? 0,
      campaignsActive: safeCampaignsActive,
      devicesOnline: safeDevicesOnline,
      devicesTotal: devicesTotal ?? 0,
      monthlyRevenueCents: revenueAgg._sum.monthlyPriceCents ?? 0,
      pendingCampaigns: pendingCampaigns ?? 0,
      pendingInvoices: pendingInvoices ?? 0,
      recentActivity: recentAuditLogs ?? [],
      // Backward-compatible aliases
      activeCampaigns: safeCampaignsActive,
      onlineDevices: safeDevicesOnline,
    };
  }
}

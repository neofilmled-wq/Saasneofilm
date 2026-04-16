import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DeviceGateway } from '../device-gateway/device.gateway';
import { ScreenFillService } from '../screens/screen-fill.service';

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING_REVIEW: ['ACTIVE', 'REJECTED'],
  ACTIVE: ['FINISHED'],
  REJECTED: ['PENDING_REVIEW'],
  FINISHED: [],
};

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deviceGateway: DeviceGateway,
    private readonly screenFillService: ScreenFillService,
  ) {}

  private addMonths(date: Date, months: number): Date {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
  }

  /**
   * Reject any screen IDs that have reached max advertiser capacity.
   * Throws BadRequestException listing the full screen names.
   */
  private async rejectFullScreens(screenIds: string[]): Promise<void> {
    if (!screenIds || screenIds.length === 0) return;

    const max = this.screenFillService.getMaxAdvertisersPerScreen();
    const fullFills = await this.prisma.screenFill.findMany({
      where: {
        screenId: { in: screenIds },
        activeAdvertiserCount: { gte: max },
      },
      select: { screenId: true },
    });

    if (fullFills.length > 0) {
      const fullScreenIds = fullFills.map((f) => f.screenId);
      const screens = await this.prisma.screen.findMany({
        where: { id: { in: fullScreenIds } },
        select: { name: true, city: true },
      });
      const names = screens.map((s) => `${s.name} (${s.city})`).join(', ');
      throw new BadRequestException(
        `Les écrans suivants sont complets et ne peuvent pas être ciblés : ${names}`,
      );
    }
  }

  async findAll(params: {
    page: number;
    limit: number;
    status?: string;
    advertiserOrgId?: string;
    groupId?: string;
  }) {
    const { page, limit, status, advertiserOrgId, groupId } = params;
    const where: any = {};
    if (status) where.status = status;
    if (advertiserOrgId) where.advertiserOrgId = advertiserOrgId;
    if (groupId) where.groupId = groupId;

    const [campaigns, total] = await Promise.all([
      this.prisma.campaign.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          advertiserOrg: { select: { name: true } },
          _count: { select: { creatives: true } },
          creatives: {
            select: { id: true, type: true, fileUrl: true },
            take: 1,
          },
          catalogueListings: {
            select: { id: true, title: true, imageUrl: true },
            take: 1,
          },
          targeting: {
            select: {
              includedScreens: {
                select: { id: true, name: true, city: true, latitude: true, longitude: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.campaign.count({ where }),
    ]);

    const data = campaigns.map((c: any) => ({
      ...c,
      screensCount: c.targeting?.includedScreens?.length ?? 0,
    }));

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getBusyScreens(advertiserOrgId: string) {
    if (!advertiserOrgId) return { AD_SPOT: [], CATALOG_LISTING: [] };

    const MAX_VIDEO_PER_SCREEN = 40;

    // 1. Screens already used by THIS advertiser
    const activeCampaigns = await this.prisma.campaign.findMany({
      where: {
        advertiserOrgId,
        status: { in: ['PENDING_REVIEW', 'APPROVED', 'ACTIVE'] },
      },
      select: {
        type: true,
        targeting: {
          select: {
            includedScreens: { select: { id: true } },
          },
        },
      },
    });

    const adSpotIds = new Set<string>();
    const catalogIds = new Set<string>();

    for (const c of activeCampaigns) {
      const screenIds = c.targeting?.includedScreens?.map((s) => s.id) ?? [];
      if (c.type === 'AD_SPOT') {
        screenIds.forEach((id) => adSpotIds.add(id));
      } else if (c.type === 'CATALOG_LISTING') {
        screenIds.forEach((id) => catalogIds.add(id));
      }
    }

    // 2. Screens at max video capacity (40 AD_SPOT campaigns across ALL advertisers)
    const allAdSpotCampaigns = await this.prisma.campaign.findMany({
      where: {
        type: 'AD_SPOT',
        status: { in: ['PENDING_REVIEW', 'APPROVED', 'ACTIVE'] },
      },
      select: {
        targeting: {
          select: {
            includedScreens: { select: { id: true } },
          },
        },
      },
    });

    const screenVideoCount = new Map<string, number>();
    for (const c of allAdSpotCampaigns) {
      const screenIds = c.targeting?.includedScreens?.map((s) => s.id) ?? [];
      for (const id of screenIds) {
        screenVideoCount.set(id, (screenVideoCount.get(id) || 0) + 1);
      }
    }

    for (const [screenId, count] of screenVideoCount) {
      if (count >= MAX_VIDEO_PER_SCREEN) {
        adSpotIds.add(screenId);
      }
    }

    return {
      AD_SPOT: Array.from(adSpotIds),
      CATALOG_LISTING: Array.from(catalogIds),
    };
  }

  async findById(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        advertiserOrg: true,
        creatives: true,
        catalogueListings: {
          select: { id: true, title: true, clickCount: true },
        },
        targeting: {
          include: {
            includedScreens: {
              select: { id: true, name: true, city: true, activeDeviceId: true },
            },
          },
        },
      },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return {
      ...campaign,
      screensCount: campaign.targeting?.includedScreens?.length ?? 0,
      impressions: 0,
    };
  }

  async create(data: {
    name: string;
    description?: string;
    type?: string;
    startDate: string | Date;
    endDate: string | Date;
    budgetCents?: number;
    advertiserOrgId: string;
    selectedScreenIds?: string[];
    groupId?: string;
  }) {
    const { selectedScreenIds, ...campaignData } = data;

    // Server-side validation: reject full screens
    await this.rejectFullScreens(selectedScreenIds ?? []);

    const result = await this.prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.create({
        data: {
          name: campaignData.name,
          description: campaignData.description,
          type: (campaignData.type as any) ?? 'AD_SPOT',
          startDate: new Date(campaignData.startDate),
          endDate: new Date(campaignData.endDate),
          budgetCents: campaignData.budgetCents ?? 0,
          advertiserOrgId: campaignData.advertiserOrgId,
          groupId: campaignData.groupId ?? null,
          status: 'ACTIVE',
        },
      });

      if (selectedScreenIds && selectedScreenIds.length > 0) {
        await tx.campaignTargeting.create({
          data: {
            campaignId: campaign.id,
            includedScreens: {
              connect: selectedScreenIds.map((screenId) => ({ id: screenId })),
            },
          },
        });
      }

      return tx.campaign.findUnique({
        where: { id: campaign.id },
        include: {
          advertiserOrg: { select: { name: true } },
          creatives: true,
          targeting: {
            include: {
              includedScreens: { select: { id: true, name: true, city: true } },
            },
          },
        },
      });
    });

    // Recalculate screen fill AFTER transaction is committed
    if (selectedScreenIds && selectedScreenIds.length > 0) {
      for (const screenId of selectedScreenIds) {
        await this.screenFillService.recalculateFill(screenId);
      }
    }

    return result;
  }

  /**
   * Atomic campaign creation: campaigns + creatives + catalogue listing
   * in a single Prisma transaction. If anything fails, nothing is saved.
   */
  async createFull(payload: {
    advertiserOrgId: string;
    name: string;
    description?: string;
    objective?: string;
    category?: string;
    startDate?: string | Date;
    endDate?: string | Date;
    durationMonths?: number;
    groupId?: string;
    // AD_SPOT
    adSpot?: {
      budgetCents: number;
      selectedScreenIds: string[];
      video?: {
        name: string;
        fileUrl: string;
        mimeType: string;
        durationMs?: number;
      };
    };
    // CATALOG_LISTING
    catalog?: {
      budgetCents: number;
      selectedScreenIds: string[];
      image?: {
        name: string;
        fileUrl: string;
        mimeType: string;
      };
      listing?: {
        title: string;
        description?: string;
        category?: string;
        imageUrl?: string;
        ctaUrl?: string;
        promoCode?: string;
        phone?: string;
        address?: string;
        keywords?: string[];
      };
    };
  }) {
    // Server-side validation: reject full screens
    const allScreenIdsToValidate = [
      ...(payload.adSpot?.selectedScreenIds ?? []),
      ...(payload.catalog?.selectedScreenIds ?? []),
    ];
    await this.rejectFullScreens(allScreenIdsToValidate);

    const result = await this.prisma.$transaction(async (tx) => {
      let adSpotCampaignId: string | undefined;
      let catalogCampaignId: string | undefined;
      let firstId: string | undefined;

      // 1. Create AD_SPOT campaign
      if (payload.adSpot) {
        const campaign = await tx.campaign.create({
          data: {
            name: payload.name,
            description: payload.description,
            objective: payload.objective ?? '',
            category: payload.category ?? '',
            type: 'AD_SPOT',
            startDate: payload.startDate ? new Date(payload.startDate) : new Date(),
            endDate: payload.endDate ? new Date(payload.endDate) : this.addMonths(new Date(), payload.durationMonths ?? 6),
            durationMonths: payload.durationMonths ?? 6,
            budgetCents: payload.adSpot.budgetCents,
            advertiserOrgId: payload.advertiserOrgId,
            groupId: payload.groupId ?? null,
            status: 'PENDING_REVIEW',
          },
        });
        adSpotCampaignId = campaign.id;
        firstId = campaign.id;

        if (payload.adSpot.selectedScreenIds.length > 0) {
          const targeting = await tx.campaignTargeting.create({
            data: { campaignId: campaign.id },
          });
          // Bulk insert M2M relations in one query instead of N individual connects
          const screenIds = payload.adSpot.selectedScreenIds;
          if (screenIds.length > 0) {
            const values = screenIds.map((sid) => `('${targeting.id}', '${sid}')`).join(',');
            await tx.$executeRawUnsafe(
              `INSERT INTO "_IncludedScreens" ("A", "B") VALUES ${values} ON CONFLICT DO NOTHING`
            );
          }
        }

        // Create video creative
        if (payload.adSpot.video) {
          await tx.creative.create({
            data: {
              campaignId: campaign.id,
              name: payload.adSpot.video.name,
              type: 'VIDEO',
              source: 'UPLOAD',
              fileUrl: payload.adSpot.video.fileUrl,
              mimeType: payload.adSpot.video.mimeType,
              durationMs: payload.adSpot.video.durationMs,
              status: 'READY',
            },
          });
        }
      }

      // 2. Create CATALOG_LISTING campaign
      if (payload.catalog) {
        const campaign = await tx.campaign.create({
          data: {
            name: payload.name,
            description: payload.description,
            objective: payload.objective ?? '',
            category: payload.category ?? '',
            type: 'CATALOG_LISTING',
            startDate: payload.startDate ? new Date(payload.startDate) : new Date(),
            endDate: payload.endDate ? new Date(payload.endDate) : this.addMonths(new Date(), payload.durationMonths ?? 6),
            durationMonths: payload.durationMonths ?? 6,
            budgetCents: payload.catalog.budgetCents,
            advertiserOrgId: payload.advertiserOrgId,
            groupId: payload.groupId ?? null,
            status: 'PENDING_REVIEW',
          },
        });
        catalogCampaignId = campaign.id;
        if (!firstId) firstId = campaign.id;

        if (payload.catalog.selectedScreenIds.length > 0) {
          const targeting = await tx.campaignTargeting.create({
            data: { campaignId: campaign.id },
          });
          const screenIds = payload.catalog.selectedScreenIds;
          if (screenIds.length > 0) {
            const values = screenIds.map((sid) => `('${targeting.id}', '${sid}')`).join(',');
            await tx.$executeRawUnsafe(
              `INSERT INTO "_IncludedScreens" ("A", "B") VALUES ${values} ON CONFLICT DO NOTHING`
            );
          }
        }

        // Create image creative
        if (payload.catalog.image) {
          await tx.creative.create({
            data: {
              campaignId: campaign.id,
              name: payload.catalog.image.name,
              type: 'IMAGE',
              source: 'UPLOAD',
              fileUrl: payload.catalog.image.fileUrl,
              mimeType: payload.catalog.image.mimeType,
              status: 'READY',
            },
          });
        }

        // Create catalogue listing linked to the campaign
        if (payload.catalog.listing) {
          const listing = payload.catalog.listing;
          await tx.catalogueListing.create({
            data: {
              advertiserOrgId: payload.advertiserOrgId,
              campaignId: campaign.id,
              title: listing.title,
              description: listing.description,
              category: listing.category ?? 'OTHER',
              imageUrl: listing.imageUrl,
              ctaUrl: listing.ctaUrl,
              promoCode: listing.promoCode,
              phone: listing.phone,
              address: listing.address,
              keywords: listing.keywords ?? [],
              status: 'ACTIVE',
              startDate: payload.startDate ? new Date(payload.startDate) : new Date(),
              endDate: payload.endDate ? new Date(payload.endDate) : this.addMonths(new Date(), payload.durationMonths ?? 6),
              ...(payload.catalog.selectedScreenIds.length > 0
                ? { screens: { create: payload.catalog.selectedScreenIds.map((screenId) => ({ screenId })) } }
                : {}),
            },
          });
        }
      }

      return { firstId, adSpotCampaignId, catalogCampaignId };
    });

    // Recalculate screen fill AFTER transaction is committed
    const allScreenIds = [
      ...(payload.adSpot?.selectedScreenIds ?? []),
      ...(payload.catalog?.selectedScreenIds ?? []),
    ];
    for (const screenId of allScreenIds) {
      await this.screenFillService.recalculateFill(screenId);
    }

    return result;
  }

  async update(id: string, data: any) {
    await this.findById(id);
    const { selectedScreenIds, ...updateData } = data;

    // Server-side validation: reject full screens
    if (selectedScreenIds) {
      await this.rejectFullScreens(selectedScreenIds);
    }

    return this.prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.update({
        where: { id },
        data: updateData,
      });

      if (selectedScreenIds !== undefined) {
        const existing = await tx.campaignTargeting.findUnique({
          where: { campaignId: id },
        });
        if (existing) {
          await tx.campaignTargeting.update({
            where: { campaignId: id },
            data: {
              includedScreens: {
                set: selectedScreenIds.map((sid: string) => ({ id: sid })),
              },
            },
          });
        } else if (selectedScreenIds.length > 0) {
          await tx.campaignTargeting.create({
            data: {
              campaignId: id,
              includedScreens: {
                connect: selectedScreenIds.map((sid: string) => ({ id: sid })),
              },
            },
          });
        }
      }

      return campaign;
    });
  }

  /** Publish a campaign → ACTIVE and notify TV screens */
  async publish(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        targeting: {
          include: { includedScreens: { select: { id: true } } },
        },
      },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const publishableStatuses = ['PENDING_REVIEW', 'APPROVED'];
    if (!publishableStatuses.includes(campaign.status)) {
      throw new BadRequestException(
        `Cannot publish campaign with status ${campaign.status}`,
      );
    }

    // PENDING_REVIEW → APPROVED (admin validates)
    // APPROVED → ACTIVE (advertiser pays/confirms diffusion)
    const newStatus = campaign.status === 'APPROVED' ? 'ACTIVE' : 'APPROVED';

    const updated = await this.prisma.campaign.update({
      where: { id },
      data: {
        status: newStatus,
        ...(newStatus === 'APPROVED' ? { reviewedAt: new Date() } : {}),
        ...(newStatus === 'ACTIVE' ? { startDate: new Date(), endDate: this.addMonths(new Date(), campaign.durationMonths ?? 6) } : {}),
      },
    });

    // Push tv:ads:update to each targeted screen + recalculate fill
    const screenIds = campaign.targeting?.includedScreens?.map((s) => s.id) ?? [];
    for (const screenId of screenIds) {
      await this.deviceGateway.pushToScreen(screenId, 'tv:ads:update', {
        screenId,
        campaignId: id,
        action: 'ACTIVATED',
      });
      await this.screenFillService.recalculateFill(screenId);
    }

    return { ...updated, screensCount: screenIds.length, impressions: 0 };
  }

  /** Deactivate an active campaign (ACTIVE → FINISHED) and notify TV screens */
  async deactivate(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        targeting: {
          include: { includedScreens: { select: { id: true } } },
        },
      },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    if (campaign.status !== 'ACTIVE') {
      throw new BadRequestException('Campaign is not active');
    }

    const updated = await this.prisma.campaign.update({
      where: { id },
      data: { status: 'FINISHED' },
    });

    const screenIds = campaign.targeting?.includedScreens?.map((s) => s.id) ?? [];
    for (const screenId of screenIds) {
      await this.deviceGateway.pushToScreen(screenId, 'tv:ads:update', {
        screenId,
        campaignId: id,
        action: 'DEACTIVATED',
      });
      await this.screenFillService.recalculateFill(screenId);
    }

    return { ...updated, screensCount: screenIds.length, impressions: 0 };
  }

  async updateStatus(id: string, newStatus: string) {
    const campaign = await this.findById(id);
    const allowed = VALID_TRANSITIONS[campaign.status] || [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from ${campaign.status} to ${newStatus}`,
      );
    }
    return this.prisma.campaign.update({
      where: { id },
      data: { status: newStatus as any },
    });
  }

  async remove(id: string) {
    const campaign = await this.findById(id);
    if (campaign.status === 'ACTIVE') {
      throw new BadRequestException('Cannot delete an active campaign');
    }

    // If CATALOG_LISTING, remove screen associations from linked catalogue listings (but keep the listing)
    if (campaign.type === 'CATALOG_LISTING') {
      const listings = await this.prisma.catalogueListing.findMany({
        where: { campaignId: id },
        select: { id: true },
      });
      if (listings.length > 0) {
        await this.prisma.catalogueListingScreen.deleteMany({
          where: { catalogueListingId: { in: listings.map((l) => l.id) } },
        });
      }
    }

    await this.prisma.campaign.delete({ where: { id } });
    return { message: 'Campaign deleted successfully' };
  }
}

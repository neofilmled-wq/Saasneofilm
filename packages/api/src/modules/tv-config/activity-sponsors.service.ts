import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ActivityWithSponsor {
  id: string;
  name: string;
  description: string | null;
  category: string;
  imageUrl: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  sortOrder: number;
  isSponsored: boolean;
  sponsorBadge: string | null;
}

@Injectable()
export class ActivitySponsorsService {
  private readonly logger = new Logger(ActivitySponsorsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get activities with sponsor info for an org.
   * Sponsored activities are sorted to the top of their category.
   */
  async getActivitiesWithSponsors(orgId: string): Promise<ActivityWithSponsor[]> {
    const now = new Date();

    const activities = await this.prisma.activityPlace.findMany({
      where: { orgId, isActive: true },
      include: {
        sponsors: {
          where: {
            isActive: true,
            startDate: { lte: now },
            endDate: { gte: now },
            campaign: { status: 'ACTIVE' },
          },
          include: {
            campaign: {
              select: {
                id: true,
                name: true,
                advertiserOrg: { select: { name: true } },
              },
            },
          },
          take: 1, // Only need first active sponsor
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    // Map to response format with sponsor info
    const result: ActivityWithSponsor[] = activities.map((a) => {
      const sponsor = a.sponsors[0];
      return {
        id: a.id,
        name: a.name,
        description: a.description,
        category: a.category,
        imageUrl: a.imageUrl,
        address: a.address,
        phone: a.phone,
        website: a.website,
        sortOrder: a.sortOrder,
        isSponsored: !!sponsor,
        sponsorBadge: sponsor
          ? `Recommande par ${sponsor.campaign.advertiserOrg.name}`
          : null,
      };
    });

    // Sort: sponsored first within the same category
    result.sort((a, b) => {
      if (a.isSponsored && !b.isSponsored) return -1;
      if (!a.isSponsored && b.isSponsored) return 1;
      return a.sortOrder - b.sortOrder;
    });

    return result;
  }

  /** Create a sponsored link between campaign and activity. */
  async createSponsor(data: {
    activityPlaceId: string;
    campaignId: string;
    startDate: string;
    endDate: string;
    priorityBoost?: number;
  }) {
    // Verify activity exists
    const activity = await this.prisma.activityPlace.findUnique({
      where: { id: data.activityPlaceId },
    });
    if (!activity) throw new NotFoundException('Activity not found');

    // Verify campaign exists and is owned by an advertiser
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: data.campaignId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    // Check for duplicate
    const existing = await this.prisma.activitySponsor.findUnique({
      where: {
        activityPlaceId_campaignId: {
          activityPlaceId: data.activityPlaceId,
          campaignId: data.campaignId,
        },
      },
    });
    if (existing) throw new BadRequestException('Sponsorship already exists');

    const sponsor = await this.prisma.activitySponsor.create({
      data: {
        activityPlaceId: data.activityPlaceId,
        campaignId: data.campaignId,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        priorityBoost: data.priorityBoost ?? 100,
        isActive: true,
      },
    });

    this.logger.log(
      `Sponsor created: activity=${data.activityPlaceId} campaign=${data.campaignId}`,
    );
    return sponsor;
  }

  /** Remove a sponsorship. */
  async removeSponsor(id: string) {
    const sponsor = await this.prisma.activitySponsor.findUnique({
      where: { id },
    });
    if (!sponsor) throw new NotFoundException('Sponsor not found');

    await this.prisma.activitySponsor.delete({ where: { id } });
    this.logger.log(`Sponsor removed: ${id}`);
    return { deleted: true };
  }
}

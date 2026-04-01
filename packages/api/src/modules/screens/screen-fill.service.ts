import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventBusService } from '../../services/realtime/event-bus.service';
import { randomUUID } from 'crypto';

/** Maximum number of distinct advertisers per screen. */
const MAX_ADVERTISERS_PER_SCREEN = 40;

@Injectable()
export class ScreenFillService {
  private readonly logger = new Logger(ScreenFillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * Recalculate the fill (active advertiser count) for a single screen.
   * Counts distinct advertiserOrgIds from ACTIVE bookings targeting this screen.
   */
  async recalculateFill(screenId: string): Promise<number> {
    // Count from active bookings
    const bookingResults = await this.prisma.bookingScreen.findMany({
      where: {
        screenId,
        removedAt: null,
        booking: { status: 'ACTIVE' },
      },
      select: {
        booking: { select: { advertiserOrgId: true } },
      },
    });

    // Count from active campaigns targeting this screen
    const campaignResults = await this.prisma.campaignTargeting.findMany({
      where: {
        includedScreens: { some: { id: screenId } },
        campaign: { status: 'ACTIVE' },
      },
      select: {
        campaign: { select: { advertiserOrgId: true } },
      },
    });

    const distinctAdvertisers = new Set([
      ...bookingResults.map((bs) => bs.booking.advertiserOrgId),
      ...campaignResults.map((ct) => ct.campaign.advertiserOrgId),
    ]);
    const count = distinctAdvertisers.size;

    const previous = await this.prisma.screenFill.findUnique({ where: { screenId }, select: { activeAdvertiserCount: true } });

    await this.prisma.screenFill.upsert({
      where: { screenId },
      create: { screenId, activeAdvertiserCount: count },
      update: { activeAdvertiserCount: count },
    });

    // Emit capacity_full event only when transitioning from below threshold to at/above threshold
    const wasBelow = (previous?.activeAdvertiserCount ?? 0) < MAX_ADVERTISERS_PER_SCREEN;
    if (count >= MAX_ADVERTISERS_PER_SCREEN && wasBelow) {
      const screen = await this.prisma.screen.findUnique({
        where: { id: screenId },
        select: { partnerOrgId: true },
      });
      void this.eventBus.publish({
        eventId: randomUUID(),
        entity: 'ScreenFill',
        entityId: screenId,
        action: 'capacity_full',
        actorRoleTargets: ['admin', 'partner', 'advertiser'],
        rooms: ['admin', ...(screen?.partnerOrgId ? [`partner:${screen.partnerOrgId}`] : [])],
        payload: { screenId, activeAdvertiserCount: count, maxAdvertisers: MAX_ADVERTISERS_PER_SCREEN, partnerOrgId: screen?.partnerOrgId ?? null },
        timestamp: new Date().toISOString(),
        source: 'screen-fill.service',
      });
    }

    return count;
  }

  /**
   * Batch recalculate fill for all screens.
   * Used for initial seeding or periodic reconciliation.
   */
  async recalculateAll(): Promise<number> {
    const screens = await this.prisma.screen.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });

    let updated = 0;
    for (const screen of screens) {
      await this.recalculateFill(screen.id);
      updated++;
    }

    this.logger.log(`Recalculated fill for ${updated} screens`);
    return updated;
  }

  /**
   * Recalculate fill for all screens in a booking.
   * Called after booking activation/cancellation.
   */
  async recalculateForBooking(bookingId: string): Promise<void> {
    const bookingScreens = await this.prisma.bookingScreen.findMany({
      where: { bookingId },
      select: { screenId: true },
    });

    for (const bs of bookingScreens) {
      await this.recalculateFill(bs.screenId);
    }
  }

  /** Check if a screen has reached capacity (40 advertisers). */
  async isFull(screenId: string): Promise<boolean> {
    const fill = await this.prisma.screenFill.findUnique({
      where: { screenId },
    });
    return (fill?.activeAdvertiserCount ?? 0) >= MAX_ADVERTISERS_PER_SCREEN;
  }

  /** Get the current fill for a screen. */
  async getFill(screenId: string): Promise<number> {
    const fill = await this.prisma.screenFill.findUnique({
      where: { screenId },
    });
    return fill?.activeAdvertiserCount ?? 0;
  }

  /** Get screens that are NOT full (for advertiser screen selection). */
  async getAvailableScreenIds(): Promise<string[]> {
    // Screens with no ScreenFill record are considered available (0 advertisers)
    const fullScreens = await this.prisma.screenFill.findMany({
      where: { activeAdvertiserCount: { gte: MAX_ADVERTISERS_PER_SCREEN } },
      select: { screenId: true },
    });

    return fullScreens.map((sf) => sf.screenId);
  }

  /** Static max constant for use in queries/UI. */
  getMaxAdvertisersPerScreen(): number {
    return MAX_ADVERTISERS_PER_SCREEN;
  }
}

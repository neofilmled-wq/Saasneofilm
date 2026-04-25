import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DeviceGateway } from '../device-gateway/device.gateway';

export interface CatalogueListingData {
  title: string;
  description?: string | null;
  category?: string;
  imageUrl?: string | null;
  ctaUrl?: string | null;
  promoCode?: string | null;
  promoDescription?: string | null;
  phone?: string | null;
  address?: string | null;
  keywords?: string[];
  startDate?: string | null;
  endDate?: string | null;
  screenIds?: string[];
  visibilityMode?: 'PUB_ONLY' | 'CATALOGUE_ONLY' | 'PUB_AND_CATALOGUE';
}

@Injectable()
export class CatalogueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deviceGateway: DeviceGateway,
  ) {}

  async findAll(advertiserOrgId: string, status?: string) {
    return this.prisma.catalogueListing.findMany({
      where: {
        advertiserOrgId,
        ...(status ? { status: status as any } : {}),
      },
      include: {
        screens: {
          include: { screen: { select: { id: true, name: true, city: true } } },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findById(id: string, advertiserOrgId: string) {
    const listing = await this.prisma.catalogueListing.findFirst({
      where: { id, advertiserOrgId },
      include: {
        screens: {
          include: { screen: { select: { id: true, name: true, city: true } } },
        },
      },
    });
    if (!listing) throw new NotFoundException('Catalogue listing not found');
    return listing;
  }

  async create(advertiserOrgId: string, data: CatalogueListingData) {
    return this.prisma.catalogueListing.create({
      data: {
        advertiserOrgId,
        title: data.title,
        description: data.description,
        category: data.category ?? 'OTHER',
        imageUrl: data.imageUrl,
        ctaUrl: data.ctaUrl,
        promoCode: data.promoCode,
        promoDescription: data.promoDescription,
        phone: data.phone,
        address: data.address,
        keywords: data.keywords ?? [],
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        ...(data.visibilityMode !== undefined && { visibilityMode: data.visibilityMode as any }),
        ...(data.screenIds?.length
          ? { screens: { create: data.screenIds.map((screenId) => ({ screenId })) } }
          : {}),
      },
      include: {
        screens: {
          include: { screen: { select: { id: true, name: true, city: true } } },
        },
      },
    });
  }

  async update(id: string, advertiserOrgId: string, data: Partial<CatalogueListingData>) {
    await this.findById(id, advertiserOrgId);

    // Replace screen targeting if provided
    if (data.screenIds !== undefined) {
      await this.prisma.catalogueListingScreen.deleteMany({
        where: { catalogueListingId: id },
      });
      if (data.screenIds.length > 0) {
        await this.prisma.catalogueListingScreen.createMany({
          data: data.screenIds.map((screenId) => ({ catalogueListingId: id, screenId })),
        });
      }
    }

    const updated = await this.prisma.catalogueListing.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
        ...(data.ctaUrl !== undefined && { ctaUrl: data.ctaUrl }),
        ...(data.promoCode !== undefined && { promoCode: data.promoCode }),
        ...(data.promoDescription !== undefined && { promoDescription: data.promoDescription }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.keywords !== undefined && { keywords: data.keywords }),
        ...(data.startDate !== undefined && {
          startDate: data.startDate ? new Date(data.startDate) : null,
        }),
        ...(data.endDate !== undefined && {
          endDate: data.endDate ? new Date(data.endDate) : null,
        }),
      },
      include: {
        screens: {
          include: { screen: { select: { id: true, name: true, city: true } } },
        },
      },
    });

    // Build content-only patch (no screenIds — each campaign keeps its own targeting)
    const contentPatch = {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
      ...(data.ctaUrl !== undefined && { ctaUrl: data.ctaUrl }),
      ...(data.promoCode !== undefined && { promoCode: data.promoCode }),
      ...(data.promoDescription !== undefined && { promoDescription: data.promoDescription }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.address !== undefined && { address: data.address }),
      ...(data.keywords !== undefined && { keywords: data.keywords }),
      ...(data.startDate !== undefined && { startDate: data.startDate ? new Date(data.startDate) : null }),
      ...(data.endDate !== undefined && { endDate: data.endDate ? new Date(data.endDate) : null }),
    };

    // Propagate content changes to all other listings of this advertiser (each campaign has its own listing)
    if (Object.keys(contentPatch).length > 0) {
      await this.prisma.catalogueListing.updateMany({
        where: { advertiserOrgId, id: { not: id } },
        data: contentPatch,
      });
    }

    // Push real-time update to all targeted screens (this listing + all siblings)
    const allListings = await this.prisma.catalogueListing.findMany({
      where: { advertiserOrgId },
      include: { screens: { select: { screenId: true } } },
    });
    const screenIdsSeen = new Set<string>();
    for (const listing of allListings) {
      for (const { screenId } of listing.screens) {
        if (!screenIdsSeen.has(screenId)) {
          screenIdsSeen.add(screenId);
          await this.deviceGateway.pushToScreen(screenId, 'tv:catalogue:updated', {
            reason: 'listing_updated',
            listingId: id,
          });
        }
      }
    }

    return updated;
  }

  async publish(id: string, advertiserOrgId: string) {
    await this.findById(id, advertiserOrgId);

    const updated = await this.prisma.catalogueListing.update({
      where: { id },
      data: { status: 'ACTIVE' },
      include: { screens: { select: { screenId: true } } },
    });

    for (const { screenId } of updated.screens) {
      await this.deviceGateway.pushToScreen(screenId, 'tv:catalogue:updated', {
        reason: 'listing_published',
        listingId: id,
      });
    }

    return updated;
  }

  async unpublish(id: string, advertiserOrgId: string) {
    await this.findById(id, advertiserOrgId);

    const updated = await this.prisma.catalogueListing.update({
      where: { id },
      data: { status: 'PAUSED' },
      include: { screens: { select: { screenId: true } } },
    });

    for (const { screenId } of updated.screens) {
      await this.deviceGateway.pushToScreen(screenId, 'tv:catalogue:updated', {
        reason: 'listing_unpublished',
        listingId: id,
      });
    }

    return updated;
  }

  async remove(id: string, advertiserOrgId: string) {
    await this.findById(id, advertiserOrgId);
    await this.prisma.catalogueListing.delete({ where: { id } });
    return { deleted: true };
  }

  /** Called by TV device — returns active listings targeting this screen, within validity dates */
  async getCatalogueForScreen(screenId: string) {
    const now = new Date();
    return this.prisma.catalogueListing.findMany({
      where: {
        status: 'ACTIVE',
        visibilityMode: { in: ['CATALOGUE_ONLY', 'PUB_AND_CATALOGUE'] as any[] },
        screens: { some: { screenId } },
        OR: [{ startDate: null }, { startDate: { lte: now } }],
        AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }],
      },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        imageUrl: true,
        ctaUrl: true,
        promoCode: true,
        promoDescription: true,
        phone: true,
        address: true,
        keywords: true,
        visibilityMode: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** Increment click counter for a catalogue listing (called by TV app). */
  async registerClick(id: string) {
    const listing = await this.prisma.catalogueListing.findUnique({ where: { id }, select: { id: true } });
    if (!listing) throw new NotFoundException('Catalogue listing not found');

    const updated = await this.prisma.catalogueListing.update({
      where: { id },
      data: { clickCount: { increment: 1 } },
      select: { id: true, clickCount: true },
    });

    return { id: updated.id, clickCount: updated.clickCount };
  }
}

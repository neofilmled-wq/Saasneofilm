import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SitesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string) {
    const sites = await this.prisma.site.findMany({
      where: { organizationId },
      include: { _count: { select: { screens: true } } },
      orderBy: { name: 'asc' },
    });

    return sites.map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address,
      city: s.city,
      postCode: s.postCode,
      country: s.country,
      timezone: s.timezone,
      category: s.category,
      screenCount: s._count.screens,
      partnerId: s.organizationId,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));
  }

  async getById(organizationId: string, siteId: string) {
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, organizationId },
      include: { _count: { select: { screens: true } } },
    });

    if (!site) throw new NotFoundException('Site not found');

    return {
      id: site.id,
      name: site.name,
      address: site.address,
      city: site.city,
      postCode: site.postCode,
      country: site.country,
      timezone: site.timezone,
      category: site.category,
      screenCount: site._count.screens,
      partnerId: site.organizationId,
      createdAt: site.createdAt.toISOString(),
      updatedAt: site.updatedAt.toISOString(),
    };
  }

  async create(
    organizationId: string,
    data: {
      name: string;
      address?: string;
      city?: string;
      postCode?: string;
      country?: string;
      timezone?: string;
      category?: string;
    },
  ) {
    const site = await this.prisma.site.create({
      data: {
        name: data.name,
        address: data.address,
        city: data.city,
        postCode: data.postCode,
        country: data.country ?? 'FR',
        timezone: data.timezone ?? 'Europe/Paris',
        category: data.category ?? 'other',
        organizationId,
      },
      include: { _count: { select: { screens: true } } },
    });

    return {
      id: site.id,
      name: site.name,
      address: site.address,
      city: site.city,
      postCode: site.postCode,
      country: site.country,
      timezone: site.timezone,
      category: site.category,
      screenCount: site._count.screens,
      partnerId: site.organizationId,
      createdAt: site.createdAt.toISOString(),
      updatedAt: site.updatedAt.toISOString(),
    };
  }

  async update(
    organizationId: string,
    siteId: string,
    data: {
      name?: string;
      address?: string;
      city?: string;
      postCode?: string;
      country?: string;
      timezone?: string;
      category?: string;
    },
  ) {
    const existing = await this.prisma.site.findFirst({
      where: { id: siteId, organizationId },
    });
    if (!existing) throw new NotFoundException('Site not found');

    const site = await this.prisma.site.update({
      where: { id: siteId },
      data,
      include: { _count: { select: { screens: true } } },
    });

    return {
      id: site.id,
      name: site.name,
      address: site.address,
      city: site.city,
      postCode: site.postCode,
      country: site.country,
      timezone: site.timezone,
      category: site.category,
      screenCount: site._count.screens,
      partnerId: site.organizationId,
      createdAt: site.createdAt.toISOString(),
      updatedAt: site.updatedAt.toISOString(),
    };
  }

  async delete(organizationId: string, siteId: string) {
    const existing = await this.prisma.site.findFirst({
      where: { id: siteId, organizationId },
    });
    if (!existing) throw new NotFoundException('Site not found');

    // Unlink screens before deleting (set siteId to null)
    await this.prisma.screen.updateMany({
      where: { siteId },
      data: { siteId: null },
    });

    await this.prisma.site.delete({ where: { id: siteId } });
  }
}

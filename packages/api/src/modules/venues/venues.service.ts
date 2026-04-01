import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class VenuesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(partnerOrgId: string) {
    const venues = await this.prisma.venue.findMany({
      where: { partnerOrgId },
      include: {
        _count: { select: { screens: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return venues.map((v) => ({
      ...v,
      screenCount: v._count.screens,
      _count: undefined,
    }));
  }

  async findById(id: string, partnerOrgId: string) {
    const venue = await this.prisma.venue.findFirst({
      where: { id, partnerOrgId },
      include: {
        _count: { select: { screens: true } },
        screens: {
          select: { id: true, name: true, status: true, city: true },
          orderBy: { name: 'asc' },
        },
      },
    });
    if (!venue) throw new NotFoundException('Venue not found');
    return { ...venue, screenCount: venue._count.screens, _count: undefined };
  }

  async create(data: {
    name: string;
    category?: string;
    address?: string;
    city?: string;
    postCode?: string;
    country?: string;
    timezone?: string;
    partnerOrgId: string;
  }) {
    const venue = await this.prisma.venue.create({
      data: {
        name: data.name,
        category: (data.category as any) || 'OTHER',
        address: data.address,
        city: data.city,
        postCode: data.postCode,
        country: data.country || 'FR',
        timezone: data.timezone || 'Europe/Paris',
        partnerOrgId: data.partnerOrgId,
      },
    });
    return { ...venue, screenCount: 0 };
  }

  async update(
    id: string,
    partnerOrgId: string,
    data: Partial<{
      name: string;
      category: string;
      address: string;
      city: string;
      postCode: string;
      country: string;
      timezone: string;
    }>,
  ) {
    // Verify ownership
    const existing = await this.prisma.venue.findFirst({
      where: { id, partnerOrgId },
    });
    if (!existing) throw new NotFoundException('Venue not found');

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.city !== undefined) updateData.city = data.city;
    if (data.postCode !== undefined) updateData.postCode = data.postCode;
    if (data.country !== undefined) updateData.country = data.country;
    if (data.timezone !== undefined) updateData.timezone = data.timezone;

    return this.prisma.venue.update({ where: { id }, data: updateData });
  }

  async remove(id: string, partnerOrgId: string) {
    const existing = await this.prisma.venue.findFirst({
      where: { id, partnerOrgId },
    });
    if (!existing) throw new NotFoundException('Venue not found');

    // Detach screens from this venue before deleting
    await this.prisma.screen.updateMany({
      where: { venueId: id },
      data: { venueId: null },
    });

    await this.prisma.venue.delete({ where: { id } });
    return { message: 'Venue deleted successfully' };
  }
}

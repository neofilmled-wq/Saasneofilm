import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CreativesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: {
    page: number;
    limit: number;
    campaignId?: string;
    advertiserOrgId?: string;
    type?: string;
    status?: string;
  }) {
    const { page, limit, campaignId, advertiserOrgId, type, status } = params;
    const where: any = {};
    if (campaignId) where.campaignId = campaignId;
    if (type) where.type = type;
    if (status) where.status = status;
    if (advertiserOrgId) {
      where.campaign = { advertiserOrgId };
    }
    const [creatives, total] = await Promise.all([
      this.prisma.creative.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: { campaign: { select: { name: true, status: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.creative.count({ where }),
    ]);
    return { data: creatives, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const creative = await this.prisma.creative.findUnique({
      where: { id },
      include: { campaign: true },
    });
    if (!creative) throw new NotFoundException('Creative not found');
    return creative;
  }

  async create(data: any) {
    return this.prisma.creative.create({ data });
  }

  async update(id: string, data: any) {
    await this.findById(id);
    return this.prisma.creative.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findById(id);
    await this.prisma.creative.delete({ where: { id } });
    return { message: 'Creative deleted successfully' };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// A creative belongs to a campaign, which belongs to an advertiser org. Every
// read/write must be bounded to the caller's org (platform staff bypass),
// exactly like CampaignsService — otherwise any advertiser could list, read,
// edit or delete a competitor's creatives by id. `__no_org__` is a value no row
// carries, so a caller with no org (and not staff) matches nothing.
export type CreativeScopeCtx = { orgId?: string | null; isAdmin?: boolean };

@Injectable()
export class CreativesService {
  constructor(private readonly prisma: PrismaService) {}

  private scopedWhere(id: string, ctx?: CreativeScopeCtx) {
    if (ctx && !ctx.isAdmin) {
      return { id, campaign: { advertiserOrgId: ctx.orgId ?? '__no_org__' } };
    }
    return { id };
  }

  async findAll(params: {
    page: number;
    limit: number;
    campaignId?: string;
    advertiserOrgId?: string;
    type?: string;
    status?: string;
    ctx?: CreativeScopeCtx;
  }) {
    const { page, limit, campaignId, advertiserOrgId, type, status, ctx } = params;
    const where: any = {};
    if (campaignId) where.campaignId = campaignId;
    if (type) where.type = type;
    if (status) where.status = status;
    // A non-staff caller is ALWAYS pinned to its own org, whatever it passed in
    // advertiserOrgId. Staff may filter by the given advertiserOrgId or see all.
    if (ctx && !ctx.isAdmin) {
      where.campaign = { advertiserOrgId: ctx.orgId ?? '__no_org__' };
    } else if (advertiserOrgId) {
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

  async findById(id: string, ctx?: CreativeScopeCtx) {
    const creative = await this.prisma.creative.findFirst({
      where: this.scopedWhere(id, ctx),
      include: { campaign: true },
    });
    if (!creative) throw new NotFoundException('Creative not found');
    return creative;
  }

  async create(data: any) {
    return this.prisma.creative.create({ data });
  }

  async update(id: string, data: any, ctx?: CreativeScopeCtx) {
    await this.findById(id, ctx); // borne l'ownership (IDOR)
    // Whitelist: never let a caller re-parent a creative to another campaign
    // (campaignId), self-approve, or flip its own moderation state
    // (status / isApproved / moderationStatus / reviewedBy / moderatedBy).
    const ALLOWED = [
      'name', 'fileUrl', 'fileHash', 'fileSizeBytes', 'mimeType',
      'durationMs', 'width', 'height',
    ];
    const clean: any = {};
    for (const k of ALLOWED) if (data[k] !== undefined) clean[k] = data[k];
    return this.prisma.creative.update({ where: { id }, data: clean });
  }

  async remove(id: string, ctx?: CreativeScopeCtx) {
    await this.findById(id, ctx); // borne l'ownership (IDOR)
    await this.prisma.creative.delete({ where: { id } });
    return { message: 'Creative deleted successfully' };
  }
}

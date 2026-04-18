import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateTvStreamDto {
  orgId: string;
  url: string;
  isGlobal: boolean;
  channelName?: string | null;
}

export interface UpdateTvStreamDto {
  url?: string;
  isGlobal?: boolean;
  channelName?: string | null;
}

@Injectable()
export class TvStreamsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(orgId: string) {
    return this.prisma.tvStreamSource.findMany({
      where: { partnerOrgId: orgId },
      orderBy: [{ isGlobal: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async create(data: CreateTvStreamDto) {
    this.validateStreamPayload(data);

    const org = await this.prisma.organization.findUnique({
      where: { id: data.orgId },
      select: { id: true, name: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    return this.prisma.tvStreamSource.create({
      data: {
        partnerOrgId: org.id,
        partnerName: org.name,
        url: data.url.trim(),
        isGlobal: data.isGlobal,
        channelName: data.isGlobal ? null : (data.channelName?.trim() || null),
      },
    });
  }

  async update(id: string, data: UpdateTvStreamDto) {
    const existing = await this.prisma.tvStreamSource.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Stream source not found');

    const nextIsGlobal = data.isGlobal ?? existing.isGlobal;
    const nextChannelName = data.channelName !== undefined ? data.channelName : existing.channelName;

    if (!nextIsGlobal && !nextChannelName?.trim()) {
      throw new BadRequestException('channelName is required when isGlobal=false');
    }

    return this.prisma.tvStreamSource.update({
      where: { id },
      data: {
        url: data.url?.trim() ?? existing.url,
        isGlobal: nextIsGlobal,
        channelName: nextIsGlobal ? null : (nextChannelName?.trim() || null),
      },
    });
  }

  async delete(id: string) {
    const existing = await this.prisma.tvStreamSource.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Stream source not found');
    await this.prisma.tvStreamSource.delete({ where: { id } });
    return { id, deleted: true };
  }

  private validateStreamPayload(data: CreateTvStreamDto) {
    if (!data.orgId) throw new BadRequestException('orgId is required');
    if (!data.url?.trim()) throw new BadRequestException('url is required');

    const url = data.url.trim();
    if (!/^https?:\/\//i.test(url)) {
      throw new BadRequestException('url must be http(s)');
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('url is not a valid URL');
    }
    const path = parsed.pathname.toLowerCase();
    if (!path.endsWith('.m3u8') && !path.endsWith('.m3u')) {
      throw new BadRequestException('url must point to a .m3u8 or .m3u file');
    }

    if (!data.isGlobal && !data.channelName?.trim()) {
      throw new BadRequestException('channelName is required when isGlobal=false');
    }
  }
}

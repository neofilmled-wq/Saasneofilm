import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: { page: number; limit: number; screenId?: string }) {
    const { page, limit, screenId } = params;
    const where: any = {};
    if (screenId) where.screenId = screenId;

    const [schedules, total] = await Promise.all([
      this.prisma.schedule.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          screen: { select: { name: true } },
          _count: { select: { slots: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.schedule.count({ where }),
    ]);
    return { data: schedules, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id },
      include: {
        screen: true,
        slots: {
          include: { campaign: { include: { creatives: true } }, creative: true },
          orderBy: { priority: 'asc' },
        },
      },
    });
    if (!schedule) throw new NotFoundException('Schedule not found');
    return schedule;
  }

  async resolvePlaylist(id: string) {
    const schedule = await this.findById(id);
    const playlist = schedule.slots
      .filter((slot) => slot.campaign?.status === 'ACTIVE')
      .map((slot) => ({
        slotId: slot.id,
        creativeId: slot.creativeId,
        campaignId: slot.campaignId,
        type: slot.creative.type,
        url: slot.creative.fileUrl,
        durationMs: slot.creative.durationMs,
        priority: slot.priority,
        startTime: slot.startTime,
        endTime: slot.endTime,
      }));
    return { scheduleId: id, playlist };
  }

  async create(data: any) {
    return this.prisma.schedule.create({ data });
  }

  async update(id: string, data: any) {
    await this.findById(id);
    return this.prisma.schedule.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findById(id);
    await this.prisma.schedule.delete({ where: { id } });
    return { message: 'Schedule deleted successfully' };
  }
}

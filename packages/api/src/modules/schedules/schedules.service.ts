import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DeviceGateway } from '../device-gateway/device.gateway';

@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deviceGateway: DeviceGateway,
  ) {}

  // Pousse un refetch temps réel vers le TV du screen concerné. Best-effort :
  // une panne WS ne doit jamais faire échouer l'écriture DB. Le TV legacy
  // écoute 'tv:ads:update' (use-device-socket.ts) → refetch de la playlist.
  private notifyScreen(screenId?: string | null) {
    if (!screenId) return;
    Promise.resolve(
      this.deviceGateway.pushToScreen(screenId, 'tv:ads:update', {}),
    ).catch(() => undefined);
  }

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
    const schedule = await this.prisma.schedule.create({ data });
    this.notifyScreen(schedule.screenId);
    return schedule;
  }

  async update(id: string, data: any) {
    await this.findById(id);
    const schedule = await this.prisma.schedule.update({ where: { id }, data });
    this.notifyScreen(schedule.screenId);
    return schedule;
  }

  async remove(id: string) {
    // Capture le screenId AVANT suppression pour pouvoir notifier son TV.
    const existing = await this.findById(id);
    await this.prisma.schedule.delete({ where: { id } });
    this.notifyScreen(existing.screenId);
    return { message: 'Schedule deleted successfully' };
  }
}

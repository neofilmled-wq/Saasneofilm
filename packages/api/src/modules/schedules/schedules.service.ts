import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DeviceGateway } from '../device-gateway/device.gateway';

/** Org scope derived from the JWT: a partner may only touch schedules of its
 *  own screens; platform staff (isAdmin) bypass the check. */
export interface ScheduleScopeCtx {
  orgId: string | null;
  isAdmin: boolean;
}

@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deviceGateway: DeviceGateway,
  ) {}

  /** A schedule is owned by the org that owns its screen. Non-admins may only
   *  act on a screen belonging to their org; anything else 404s (no existence
   *  leak). Used before create and by findById for read/update/delete. */
  private async assertScreenInScope(
    screenId: string | null | undefined,
    scope: ScheduleScopeCtx,
  ) {
    if (scope.isAdmin) return;
    if (!scope.orgId) throw new ForbiddenException('No organization context on this token');
    if (!screenId) throw new NotFoundException('Schedule not found');
    const screen = await this.prisma.screen.findUnique({
      where: { id: screenId },
      select: { partnerOrgId: true },
    });
    if (!screen || screen.partnerOrgId !== scope.orgId) {
      throw new NotFoundException('Schedule not found');
    }
  }

  // Pousse un refetch temps réel vers le TV du screen concerné. Best-effort :
  // une panne WS ne doit jamais faire échouer l'écriture DB. Le TV legacy
  // écoute 'tv:ads:update' (use-device-socket.ts) → refetch de la playlist.
  private notifyScreen(screenId?: string | null) {
    if (!screenId) return;
    Promise.resolve(
      this.deviceGateway.pushToScreen(screenId, 'tv:ads:update', {}),
    ).catch(() => undefined);
  }

  async findAll(
    params: { page: number; limit: number; screenId?: string },
    scope: ScheduleScopeCtx,
  ) {
    const { page, limit, screenId } = params;
    const where: any = {};
    if (screenId) where.screenId = screenId;
    // Non-admins only ever see schedules of their own org's screens.
    if (!scope.isAdmin) {
      where.screen = { partnerOrgId: scope.orgId ?? '__none__' };
    }

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

  async findById(id: string, scope?: ScheduleScopeCtx) {
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
    // Enforce tenant ownership when a scope is provided (all HTTP callers).
    if (scope && !scope.isAdmin) {
      if (!scope.orgId || schedule.screen?.partnerOrgId !== scope.orgId) {
        throw new NotFoundException('Schedule not found');
      }
    }
    return schedule;
  }

  async resolvePlaylist(id: string, scope?: ScheduleScopeCtx) {
    const schedule = await this.findById(id, scope);
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

  async create(data: any, scope: ScheduleScopeCtx) {
    // The target screen must belong to the caller's org (admins bypass).
    await this.assertScreenInScope(data?.screenId, scope);
    const schedule = await this.prisma.schedule.create({ data });
    this.notifyScreen(schedule.screenId);
    return schedule;
  }

  async update(id: string, data: any, scope: ScheduleScopeCtx) {
    await this.findById(id, scope);
    // If the update tries to move the schedule to another screen, that target
    // must also be in scope.
    if (data?.screenId) await this.assertScreenInScope(data.screenId, scope);
    const schedule = await this.prisma.schedule.update({ where: { id }, data });
    this.notifyScreen(schedule.screenId);
    return schedule;
  }

  async remove(id: string, scope: ScheduleScopeCtx) {
    // Capture le screenId AVANT suppression pour pouvoir notifier son TV.
    const existing = await this.findById(id, scope);
    await this.prisma.schedule.delete({ where: { id } });
    this.notifyScreen(existing.screenId);
    return { message: 'Schedule deleted successfully' };
  }
}

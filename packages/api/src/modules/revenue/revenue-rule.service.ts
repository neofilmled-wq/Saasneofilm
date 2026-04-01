import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

// ─── DTO Types ───────────────────────────────────────────────────────────────

export interface CreateRevenueRuleDto {
  platformRate: number;
  partnerRate: number;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  partnerOrgId?: string | null;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class RevenueRuleService {
  private readonly logger = new Logger(RevenueRuleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  //  createRule — validate rates sum to 1.0, persist
  // ═══════════════════════════════════════════════════════════════════════════

  async createRule(dto: CreateRevenueRuleDto, actorUserId?: string) {
    // Validate that rates sum to 1.0 (within floating point tolerance)
    const sum = dto.platformRate + dto.partnerRate;
    if (Math.abs(sum - 1.0) > 0.001) {
      throw new BadRequestException(
        `platformRate (${dto.platformRate}) + partnerRate (${dto.partnerRate}) ` +
          `must equal 1.0 — got ${sum}`,
      );
    }

    // Validate rate bounds
    if (dto.platformRate < 0 || dto.platformRate > 1) {
      throw new BadRequestException(
        `platformRate must be between 0 and 1 — got ${dto.platformRate}`,
      );
    }
    if (dto.partnerRate < 0 || dto.partnerRate > 1) {
      throw new BadRequestException(
        `partnerRate must be between 0 and 1 — got ${dto.partnerRate}`,
      );
    }

    // Validate effectiveFrom < effectiveTo if effectiveTo is provided
    if (dto.effectiveTo && dto.effectiveFrom >= dto.effectiveTo) {
      throw new BadRequestException(
        `effectiveFrom must be before effectiveTo`,
      );
    }

    // If partner-specific, verify the partner organization exists
    if (dto.partnerOrgId) {
      const org = await this.prisma.organization.findUnique({
        where: { id: dto.partnerOrgId },
        select: { id: true, type: true },
      });
      if (!org) {
        throw new NotFoundException(
          `Organization ${dto.partnerOrgId} not found`,
        );
      }
      if (org.type !== 'PARTNER') {
        throw new BadRequestException(
          `Organization ${dto.partnerOrgId} is not a PARTNER organization`,
        );
      }
    }

    const rule = await this.prisma.revenueRule.create({
      data: {
        platformRate: dto.platformRate,
        partnerRate: dto.partnerRate,
        effectiveFrom: dto.effectiveFrom,
        effectiveTo: dto.effectiveTo ?? null,
        partnerOrgId: dto.partnerOrgId ?? null,
      },
    });

    await this.audit.log({
      action: 'CREATE',
      entity: 'RevenueRule',
      entityId: rule.id,
      userId: actorUserId,
      newData: {
        platformRate: rule.platformRate,
        partnerRate: rule.partnerRate,
        effectiveFrom: rule.effectiveFrom,
        effectiveTo: rule.effectiveTo,
        partnerOrgId: rule.partnerOrgId,
        isGlobal: !rule.partnerOrgId,
      },
    });

    this.logger.log(
      `Created revenue rule ${rule.id}: ` +
        `platform=${rule.platformRate} partner=${rule.partnerRate} ` +
        `${rule.partnerOrgId ? `partner=${rule.partnerOrgId}` : 'GLOBAL'}`,
    );

    return rule;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  findRules — list rules, optionally filtered by partner
  // ═══════════════════════════════════════════════════════════════════════════

  async findRules(partnerOrgId?: string) {
    const where: any = {};

    if (partnerOrgId) {
      // Return both partner-specific and global rules
      where.OR = [{ partnerOrgId }, { partnerOrgId: null }];
    }

    return this.prisma.revenueRule.findMany({
      where,
      orderBy: [{ effectiveFrom: 'desc' }],
      include: {
        partnerOrg: {
          select: { id: true, name: true, slug: true },
        },
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  findApplicableRule — partner-specific first, then global fallback
  // ═══════════════════════════════════════════════════════════════════════════

  async findApplicableRule(partnerOrgId: string, effectiveDate: Date) {
    // Step 1: Try partner-specific rule
    const partnerRule = await this.prisma.revenueRule.findFirst({
      where: {
        partnerOrgId,
        effectiveFrom: { lte: effectiveDate },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: effectiveDate } },
        ],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (partnerRule) {
      return partnerRule;
    }

    // Step 2: Fallback to global rule (partnerOrgId IS NULL)
    const globalRule = await this.prisma.revenueRule.findFirst({
      where: {
        partnerOrgId: null,
        effectiveFrom: { lte: effectiveDate },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: effectiveDate } },
        ],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    // Returns null if no rule found — caller must handle
    return globalRule;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  deactivateRule — set effectiveTo to now
  // ═══════════════════════════════════════════════════════════════════════════

  async deactivateRule(ruleId: string, actorUserId?: string) {
    const rule = await this.prisma.revenueRule.findUnique({
      where: { id: ruleId },
    });

    if (!rule) {
      throw new NotFoundException(`Revenue rule ${ruleId} not found`);
    }

    if (rule.effectiveTo && rule.effectiveTo <= new Date()) {
      throw new BadRequestException(
        `Revenue rule ${ruleId} is already deactivated`,
      );
    }

    const now = new Date();
    const updated = await this.prisma.revenueRule.update({
      where: { id: ruleId },
      data: { effectiveTo: now },
    });

    await this.audit.log({
      action: 'DEACTIVATE',
      entity: 'RevenueRule',
      entityId: ruleId,
      userId: actorUserId,
      oldData: {
        effectiveTo: rule.effectiveTo,
      },
      newData: {
        effectiveTo: now,
      },
    });

    this.logger.log(`Deactivated revenue rule ${ruleId}`);
    return updated;
  }
}

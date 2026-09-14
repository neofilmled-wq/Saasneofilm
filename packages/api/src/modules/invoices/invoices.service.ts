import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// An invoice belongs to one organization. Reads must be pinned to the caller's
// org (staff bypass); otherwise any authenticated user reads every tenant's
// Stripe invoices — amounts, periods, customer ids.
export type InvoiceScopeCtx = { orgId?: string | null; isAdmin?: boolean };

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: { page: number; limit: number; status?: string; organizationId?: string; ctx?: InvoiceScopeCtx }) {
    const { page, limit, status, organizationId, ctx } = params;
    const where: any = {};
    if (status) where.status = status;
    if (ctx && !ctx.isAdmin) {
      where.organizationId = ctx.orgId ?? '__no_org__';
    } else if (organizationId) {
      where.organizationId = organizationId;
    }

    const [invoices, total] = await Promise.all([
      this.prisma.stripeInvoice.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: { organization: { select: { name: true, type: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stripeInvoice.count({ where }),
    ]);
    return { data: invoices, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string, ctx?: InvoiceScopeCtx) {
    const where: any = { id };
    if (ctx && !ctx.isAdmin) where.organizationId = ctx.orgId ?? '__no_org__';
    const invoice = await this.prisma.stripeInvoice.findFirst({
      where,
      include: { organization: true, customer: true, payments: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async updateStatus(id: string, status: string) {
    await this.findById(id);
    const data: any = { status };
    if (status === 'PAID') {
      data.paidAt = new Date();
    }
    return this.prisma.stripeInvoice.update({ where: { id }, data });
  }
}

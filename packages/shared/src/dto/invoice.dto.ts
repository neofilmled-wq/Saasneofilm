import { z } from 'zod';
import { InvoiceStatus } from '../enums';

export const createInvoiceSchema = z.object({
  type: z.enum(['ADVERTISER_CHARGE', 'PARTNER_PAYOUT']),
  amountCents: z.coerce.number().int().positive('Amount must be positive'),
  currency: z.string().length(3, 'Currency must be a 3-letter ISO code').default('EUR'),
  dueAt: z.coerce.date(),
  advertiserId: z.string().uuid().optional(),
  partnerId: z.string().uuid().optional(),
  lineItems: z
    .array(
      z.object({
        description: z.string().min(1).max(500),
        quantity: z.coerce.number().int().positive(),
        unitPriceCents: z.coerce.number().int().nonnegative(),
      }),
    )
    .optional(),
});

export type CreateInvoiceDto = z.infer<typeof createInvoiceSchema>;

export const invoiceQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  status: z.nativeEnum(InvoiceStatus).optional(),
  type: z.enum(['ADVERTISER_CHARGE', 'PARTNER_PAYOUT']).optional(),
  advertiserId: z.string().uuid().optional(),
  partnerId: z.string().uuid().optional(),
  issuedFrom: z.coerce.date().optional(),
  issuedTo: z.coerce.date().optional(),
});

export type InvoiceQueryDto = z.infer<typeof invoiceQuerySchema>;

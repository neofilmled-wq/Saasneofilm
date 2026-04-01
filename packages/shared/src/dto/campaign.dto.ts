import { z } from 'zod';
import { CampaignStatus } from '../enums';

export const createCampaignSchema = z
  .object({
    name: z.string().min(1, 'Campaign name is required').max(200),
    description: z.string().max(2000).optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    budgetCents: z.coerce.number().int().positive('Budget must be positive'),
    currency: z.string().length(3, 'Currency must be a 3-letter ISO code').default('EUR'),
    advertiserId: z.string().uuid('Invalid advertiser ID'),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: 'End date must be after start date',
    path: ['endDate'],
  });

export type CreateCampaignDto = z.infer<typeof createCampaignSchema>;

export const updateCampaignSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  budgetCents: z.coerce.number().int().positive().optional(),
  currency: z.string().length(3).optional(),
});

export type UpdateCampaignDto = z.infer<typeof updateCampaignSchema>;

export const updateCampaignStatusSchema = z.object({
  status: z.nativeEnum(CampaignStatus),
  reason: z.string().max(500).optional(),
});

export type UpdateCampaignStatusDto = z.infer<typeof updateCampaignStatusSchema>;

export const campaignQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  status: z.nativeEnum(CampaignStatus).optional(),
  advertiserId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  startDateFrom: z.coerce.date().optional(),
  startDateTo: z.coerce.date().optional(),
});

export type CampaignQueryDto = z.infer<typeof campaignQuerySchema>;

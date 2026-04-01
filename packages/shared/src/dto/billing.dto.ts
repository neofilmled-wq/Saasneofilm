import { z } from 'zod';

// ─── Checkout ───

export const createCheckoutSchema = z.object({
  bookingId: z.string().min(1),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

export type CreateCheckoutDto = z.infer<typeof createCheckoutSchema>;

// ─── Booking Draft ───

export const createBookingDraftSchema = z.object({
  screenIds: z.array(z.string().min(1)).min(1, 'At least one screen required'),
  campaignId: z.string().min(1).optional(),
  billingCycle: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']).default('MONTHLY'),
});

export type CreateBookingDraftDto = z.infer<typeof createBookingDraftSchema>;

// ─── Update Screens Mid-Cycle ───

export const updateBookingScreensSchema = z.object({
  addScreenIds: z.array(z.string().min(1)).optional(),
  removeScreenIds: z.array(z.string().min(1)).optional(),
});

export type UpdateBookingScreensDto = z.infer<typeof updateBookingScreensSchema>;

// ─── Revenue Share Approve ───

export const approveRevenueShareSchema = z.object({
  revenueShareId: z.string().min(1),
});

export type ApproveRevenueShareDto = z.infer<typeof approveRevenueShareSchema>;

// ─── Revenue Rule ───

export const createRevenueRuleSchema = z.object({
  platformRate: z.number().min(0).max(1),
  partnerRate: z.number().min(0).max(1),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().optional(),
  partnerOrgId: z.string().min(1).optional(),
});

export type CreateRevenueRuleDto = z.infer<typeof createRevenueRuleSchema>;

// ─── Payout ───

export const initiatePayoutBatchSchema = z.object({
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
});

export type InitiatePayoutBatchDto = z.infer<typeof initiatePayoutBatchSchema>;

// ─── Partner Connect Onboarding ───

export const connectOnboardingSchema = z.object({
  refreshUrl: z.string().url(),
  returnUrl: z.string().url(),
});

export type ConnectOnboardingDto = z.infer<typeof connectOnboardingSchema>;

// ─── Admin Actions ───

export const freezeEntitySchema = z.object({
  reason: z.string().min(1).max(500),
});

export type FreezeEntityDto = z.infer<typeof freezeEntitySchema>;

// ─── AI Credits Purchase ───

export const purchaseAiCreditsSchema = z.object({
  creditsPackage: z.enum(['100', '500']),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

export type PurchaseAiCreditsDto = z.infer<typeof purchaseAiCreditsSchema>;

// ─── Subscription Draft (NeoFilm Business Model) ───

const ALLOWED_TV_COUNTS = [50, 100, 150, 200, 300] as const;

export const createSubscriptionDraftSchema = z.object({
  diffusionTvCount: z
    .number()
    .refine((v) => ALLOWED_TV_COUNTS.includes(v as any), {
      message: `Must be one of: ${ALLOWED_TV_COUNTS.join(', ')}`,
    })
    .optional(),
  catalogueTvCount: z
    .number()
    .refine((v) => ALLOWED_TV_COUNTS.includes(v as any), {
      message: `Must be one of: ${ALLOWED_TV_COUNTS.join(', ')}`,
    })
    .optional(),
  durationMonths: z.number().refine((v) => [6, 12].includes(v), {
    message: 'Duration must be 6 or 12 months',
  }),
  screenIds: z.array(z.string().min(1)).min(1, 'At least one screen required'),
  campaignId: z.string().min(1).optional(),
}).refine(
  (data) => data.diffusionTvCount || data.catalogueTvCount,
  { message: 'At least one of diffusionTvCount or catalogueTvCount is required' },
);

export type CreateSubscriptionDraftDto = z.infer<typeof createSubscriptionDraftSchema>;

// ─── Export Query ───

export const exportQuerySchema = z.object({
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  format: z.enum(['csv', 'json']).default('csv'),
});

export type ExportQueryDto = z.infer<typeof exportQuerySchema>;

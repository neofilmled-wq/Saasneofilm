import { z } from 'zod';

export const createAdvertiserSchema = z.object({
  companyName: z.string().min(1, 'Company name is required').max(200),
  contactEmail: z.string().email('Invalid contact email'),
  contactPhone: z.string().max(30).optional(),
  billingAddress: z.string().max(500).optional(),
  vatNumber: z
    .string()
    .max(30)
    .regex(/^[A-Z]{2}\d+$/, 'VAT number must be in format: CC followed by digits')
    .optional(),
});

export type CreateAdvertiserDto = z.infer<typeof createAdvertiserSchema>;

export const updateAdvertiserSchema = z.object({
  companyName: z.string().min(1).max(200).optional(),
  contactEmail: z.string().email('Invalid contact email').optional(),
  contactPhone: z.string().max(30).nullable().optional(),
  billingAddress: z.string().max(500).nullable().optional(),
  vatNumber: z.string().max(30).nullable().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateAdvertiserDto = z.infer<typeof updateAdvertiserSchema>;

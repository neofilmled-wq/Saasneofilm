import { z } from 'zod';

export const createPartnerSchema = z.object({
  name: z.string().min(1, 'Partner name is required').max(200),
  contactEmail: z.string().email('Invalid contact email'),
  contactPhone: z.string().max(30).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  country: z.string().length(2, 'Country must be a 2-letter ISO code'),
});

export type CreatePartnerDto = z.infer<typeof createPartnerSchema>;

export const updatePartnerSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  contactEmail: z.string().email('Invalid contact email').optional(),
  contactPhone: z.string().max(30).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  country: z.string().length(2, 'Country must be a 2-letter ISO code').optional(),
  isActive: z.boolean().optional(),
});

export type UpdatePartnerDto = z.infer<typeof updatePartnerSchema>;

export const createVenueSchema = z.object({
  name: z.string().min(1, 'Venue name is required').max(200),
  address: z.string().min(1, 'Address is required').max(500),
  city: z.string().min(1, 'City is required').max(100),
  postCode: z.string().max(20).optional(),
  country: z.string().max(10).default('FR'),
  timezone: z.string().max(50).default('Europe/Paris'),
  category: z.string().max(50).default('other'),
  partnerId: z.string(),
});

export type CreateVenueDto = z.infer<typeof createVenueSchema>;

export const updateVenueSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  address: z.string().min(1).max(500).optional(),
  city: z.string().min(1).max(100).optional(),
  postCode: z.string().max(20).optional(),
  country: z.string().max(10).optional(),
  timezone: z.string().max(50).optional(),
  category: z.string().max(50).optional(),
});

export type UpdateVenueDto = z.infer<typeof updateVenueSchema>;

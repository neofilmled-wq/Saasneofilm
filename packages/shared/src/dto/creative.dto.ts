import { z } from 'zod';
import { CreativeType } from '../enums';

export const createCreativeSchema = z.object({
  name: z.string().min(1, 'Creative name is required').max(200),
  type: z.nativeEnum(CreativeType),
  fileUrl: z.string().url('File URL must be a valid URL'),
  fileSizeBytes: z.coerce.number().int().positive().optional(),
  durationMs: z.coerce.number().int().positive().optional(),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
  campaignId: z.string().uuid('Invalid campaign ID'),
});

export type CreateCreativeDto = z.infer<typeof createCreativeSchema>;

export const updateCreativeSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z.nativeEnum(CreativeType).optional(),
  fileUrl: z.string().url().optional(),
  fileSizeBytes: z.coerce.number().int().positive().optional(),
  durationMs: z.coerce.number().int().positive().nullable().optional(),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
  isApproved: z.boolean().optional(),
});

export type UpdateCreativeDto = z.infer<typeof updateCreativeSchema>;

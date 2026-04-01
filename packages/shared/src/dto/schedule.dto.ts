import { z } from 'zod';

export const createScheduleSlotSchema = z
  .object({
    creativeId: z.string().uuid('Invalid creative ID'),
    deviceId: z.string().uuid('Invalid device ID'),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Start time must be in HH:mm format'),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, 'End time must be in HH:mm format'),
    daysOfWeek: z
      .array(z.coerce.number().int().min(0).max(6))
      .min(1, 'At least one day of week is required'),
    priority: z.coerce.number().int().min(0).max(100).default(50),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: 'End time must be after start time',
    path: ['endTime'],
  });

export type CreateScheduleSlotDto = z.infer<typeof createScheduleSlotSchema>;

export const createScheduleSchema = z.object({
  name: z.string().min(1, 'Schedule name is required').max(200),
  campaignId: z.string().uuid('Invalid campaign ID'),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  slots: z.array(createScheduleSlotSchema).min(1, 'At least one slot is required'),
});

export type CreateScheduleDto = z.infer<typeof createScheduleSchema>;

export const updateScheduleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateScheduleDto = z.infer<typeof updateScheduleSchema>;

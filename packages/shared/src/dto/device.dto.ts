import { z } from 'zod';
import { DeviceStatus } from '../enums';

export const createDeviceSchema = z.object({
  name: z.string().min(1, 'Device name is required').max(200),
  serialNumber: z.string().min(1, 'Serial number is required').max(100),
  resolution: z.string().max(20).optional(),
  firmwareVersion: z.string().max(50).optional(),
  venueId: z.string().uuid('Invalid venue ID'),
});

export type CreateDeviceDto = z.infer<typeof createDeviceSchema>;

export const updateDeviceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  resolution: z.string().max(20).nullable().optional(),
  firmwareVersion: z.string().max(50).nullable().optional(),
  status: z.nativeEnum(DeviceStatus).optional(),
  venueId: z.string().uuid().optional(),
});

export type UpdateDeviceDto = z.infer<typeof updateDeviceSchema>;

export const heartbeatSchema = z.object({
  serialNumber: z.string().min(1),
  firmwareVersion: z.string().optional(),
  ipAddress: z.string().ip().optional(),
  cpuUsage: z.coerce.number().min(0).max(100).optional(),
  memoryUsage: z.coerce.number().min(0).max(100).optional(),
  diskUsage: z.coerce.number().min(0).max(100).optional(),
  uptimeSeconds: z.coerce.number().int().nonnegative().optional(),
  timestamp: z.coerce.date().default(() => new Date()),
});

export type HeartbeatDto = z.infer<typeof heartbeatSchema>;

export const deviceQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  status: z.nativeEnum(DeviceStatus).optional(),
  venueId: z.string().uuid().optional(),
  partnerId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
});

export type DeviceQueryDto = z.infer<typeof deviceQuerySchema>;

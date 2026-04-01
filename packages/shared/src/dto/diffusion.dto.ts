import { z } from 'zod';

// ────────────────────────────────────────────────────────────────────────────
// Device-facing: GET /diffusion/schedule
// ────────────────────────────────────────────────────────────────────────────

export const scheduleQuerySchema = z.object({
  deviceId: z.string().min(1, 'Device ID is required'),
  since: z.coerce.number().int().nonnegative().optional(),
});

export type ScheduleQueryDto = z.infer<typeof scheduleQuerySchema>;

// ────────────────────────────────────────────────────────────────────────────
// Device-facing: POST /diffusion/log
// ────────────────────────────────────────────────────────────────────────────

export const diffusionProofSchema = z.object({
  proofId: z.string().min(1, 'Proof ID is required'),
  screenId: z.string().min(1, 'Screen ID is required'),
  campaignId: z.string().min(1, 'Campaign ID is required'),
  creativeId: z.string().min(1, 'Creative ID is required'),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  durationMs: z.coerce.number().int().positive('Duration must be positive'),
  triggerContext: z.enum([
    'POWER_ON',
    'OPEN_APP',
    'CHANGE_APP',
    'CATALOG_OPEN',
    'SCHEDULED',
    'MANUAL',
  ]),
  appVersion: z.string().min(1, 'App version is required'),
  mediaHash: z.string().min(1, 'Media hash is required'),
  signature: z.string().min(1, 'Signature is required'),
});

export type DiffusionProofDto = z.infer<typeof diffusionProofSchema>;

export const diffusionLogBatchSchema = z.object({
  deviceId: z.string().min(1, 'Device ID is required'),
  batchId: z.string().min(1, 'Batch ID is required'),
  proofs: z
    .array(diffusionProofSchema)
    .min(1, 'At least one proof is required')
    .max(100, 'Maximum 100 proofs per batch'),
});

export type DiffusionLogBatchDto = z.infer<typeof diffusionLogBatchSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Device-facing: POST /diffusion/heartbeat
// ────────────────────────────────────────────────────────────────────────────

export const diffusionHeartbeatSchema = z.object({
  deviceId: z.string().min(1, 'Device ID is required'),
  timestamp: z.coerce.date(),
  isOnline: z.boolean(),
  appVersion: z.string().min(1),
  uptime: z.coerce.number().int().nonnegative().optional(),
  scheduleVersion: z.coerce.number().int().nonnegative().optional(),
  currentlyPlaying: z
    .object({
      campaignId: z.string().min(1),
      creativeId: z.string().min(1),
      startedAt: z.coerce.date(),
    })
    .optional(),
  cacheStatus: z
    .object({
      totalBytes: z.coerce.number().int().nonnegative(),
      usedBytes: z.coerce.number().int().nonnegative(),
      creativesCount: z.coerce.number().int().nonnegative(),
    })
    .optional(),
  metrics: z
    .object({
      cpuPercent: z.coerce.number().min(0).max(100).optional(),
      memoryPercent: z.coerce.number().min(0).max(100).optional(),
      diskPercent: z.coerce.number().min(0).max(100).optional(),
      temperature: z.coerce.number().optional(),
      networkType: z.string().optional(),
      networkSpeed: z.coerce.number().nonnegative().optional(),
      signalStrength: z.coerce.number().optional(),
    })
    .optional(),
});

export type DiffusionHeartbeatDto = z.infer<typeof diffusionHeartbeatSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Device-facing: POST /diffusion/cache/report
// ────────────────────────────────────────────────────────────────────────────

export const cacheReportSchema = z.object({
  deviceId: z.string().min(1, 'Device ID is required'),
  cachedCreatives: z.array(
    z.object({
      creativeId: z.string().min(1),
      fileHash: z.string().min(1),
      bitrate: z.enum(['high', 'medium', 'low']),
      sizeBytes: z.coerce.number().int().nonnegative(),
      cachedAt: z.coerce.date(),
    }),
  ),
  totalCacheBytes: z.coerce.number().int().nonnegative(),
  usedCacheBytes: z.coerce.number().int().nonnegative(),
  freeCacheBytes: z.coerce.number().int().nonnegative(),
});

export type CacheReportDto = z.infer<typeof cacheReportSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Admin-facing: POST /admin/diffusion/override
// ────────────────────────────────────────────────────────────────────────────

export const adminOverrideSchema = z.object({
  action: z.enum(['FORCE', 'BLOCK', 'PAUSE']),
  campaignId: z.string().min(1, 'Campaign ID is required'),
  creativeId: z.string().min(1).optional(),
  screenIds: z.array(z.string().min(1)).optional(),
  scope: z.enum(['SPECIFIC', 'ALL', 'PARTNER', 'GEO']).default('SPECIFIC'),
  partnerOrgId: z.string().min(1).optional(),
  geoHash: z.string().min(1).optional(),
  expiresAt: z.coerce.date().optional(),
  reason: z.string().min(1, 'Reason is required').max(500),
});

export type AdminOverrideDto = z.infer<typeof adminOverrideSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Admin-facing: POST /admin/diffusion/pause-campaign
// ────────────────────────────────────────────────────────────────────────────

export const pauseCampaignSchema = z.object({
  campaignId: z.string().min(1, 'Campaign ID is required'),
  reason: z.string().min(1, 'Reason is required').max(500),
});

export type PauseCampaignDto = z.infer<typeof pauseCampaignSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Admin-facing: POST /admin/diffusion/block-screen
// ────────────────────────────────────────────────────────────────────────────

export const blockScreenSchema = z.object({
  screenId: z.string().min(1, 'Screen ID is required'),
  reason: z.string().min(1, 'Reason is required').max(500),
  blockAds: z.boolean().default(true),
  blockHouseAds: z.boolean().default(false),
});

export type BlockScreenDto = z.infer<typeof blockScreenSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Response types (not Zod — pure TS interfaces for internal use)
// ────────────────────────────────────────────────────────────────────────────

export interface CreativeManifest {
  creativeId: string;
  fileUrl: string;
  fileUrlMedium?: string;
  fileUrlLow?: string;
  fileHash: string;
  durationMs: number;
  width: number;
  height: number;
  mimeType: string;
  fileSizeBytes: number;
}

export interface ScheduleEntry {
  slotIndex: number;
  campaignId: string;
  creativeId: string;
  durationMs: number;
  priority: number;
  tier: 'FORCED' | 'PREMIUM' | 'STANDARD' | 'HOUSE';
  validFrom: string;
  validUntil: string;
  triggerTypes: string[];
}

export interface ScheduleBundle {
  version: number;
  generatedAt: string;
  screenId: string;
  validFrom: string;
  validUntil: string;
  entries: ScheduleEntry[];
  houseAds: CreativeManifest[];
  creativeManifest: Record<string, CreativeManifest>;
}

export interface RankedCreative {
  campaignId: string;
  creativeId: string;
  score: number;
  tier: 'FORCED' | 'PREMIUM' | 'STANDARD' | 'HOUSE';
  fileUrl: string;
  fileHash: string;
  durationMs: number;
}

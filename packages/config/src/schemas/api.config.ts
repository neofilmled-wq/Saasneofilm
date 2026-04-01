import { z } from 'zod';

export const apiConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((val) => val.split(',').map((origin) => origin.trim())),
  GLOBAL_PREFIX: z.string().default('api/v1'),
  NODE_ENV: z
    .enum(['development', 'production', 'test', 'staging'])
    .default('development'),
});

export type ApiConfig = z.infer<typeof apiConfigSchema>;

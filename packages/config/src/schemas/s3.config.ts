import { z } from 'zod';

export const s3ConfigSchema = z.object({
  S3_ENDPOINT: z.string().url({ message: 'S3_ENDPOINT must be a valid URL' }),
  S3_REGION: z.string().default('eu-west-1'),
  S3_ACCESS_KEY: z.string().min(1, 'S3_ACCESS_KEY is required'),
  S3_SECRET_KEY: z.string().min(1, 'S3_SECRET_KEY is required'),
  S3_BUCKET_CREATIVES: z.string().default('neofilm-creatives'),
  S3_BUCKET_UPLOADS: z.string().default('neofilm-uploads'),
  CDN_BASE_URL: z.string().url().optional(),
});

export type S3Config = z.infer<typeof s3ConfigSchema>;

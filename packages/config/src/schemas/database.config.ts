import { z } from 'zod';

export const databaseConfigSchema = z.object({
  DATABASE_URL: z
    .string()
    .url({ message: 'DATABASE_URL must be a valid connection string' }),
});

export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;

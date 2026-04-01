import { ZodSchema } from 'zod';

export function validateConfig<T>(schema: ZodSchema<T>, env: Record<string, unknown>): T {
  const result = schema.safeParse(env);
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    throw new Error(
      `Configuration validation failed:\n${JSON.stringify(errors, null, 2)}`,
    );
  }
  return result.data;
}

import { z } from 'zod';
import { PlatformRole } from '../enums';

export const adminCreateUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  platformRole: z.nativeEnum(PlatformRole),
  isActive: z.boolean().default(true),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  autoGeneratePassword: z.boolean().default(false),
}).refine(
  (data) => data.autoGeneratePassword || (data.password && data.password.length >= 8),
  { message: 'Password is required when autoGeneratePassword is false', path: ['password'] },
);

export type AdminCreateUserDto = z.infer<typeof adminCreateUserSchema>;

export const adminUpdateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email('Invalid email address').optional(),
  platformRole: z.nativeEnum(PlatformRole).optional(),
  isActive: z.boolean().optional(),
});

export type AdminUpdateUserDto = z.infer<typeof adminUpdateUserSchema>;

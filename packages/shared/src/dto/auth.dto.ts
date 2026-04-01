import { z } from 'zod';
import { UserRole, OrgType } from '../enums';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginDto = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number',
    ),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  interfaceType: z.nativeEnum(OrgType),
  role: z.nativeEnum(UserRole).optional().default(UserRole.ADVERTISER),
});

export type RegisterDto = z.infer<typeof registerSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>;

export const tokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive(),
  tokenType: z.literal('Bearer').default('Bearer'),
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    firstName: z.string(),
    lastName: z.string(),
    role: z.nativeEnum(UserRole),
  }),
});

export type TokenResponseDto = z.infer<typeof tokenResponseSchema>;

// MFA
export const mfaSetupResponseSchema = z.object({
  secret: z.string(),
  qrCodeUrl: z.string(),
  otpauthUrl: z.string(),
});

export type MfaSetupResponseDto = z.infer<typeof mfaSetupResponseSchema>;

export const mfaVerifySchema = z.object({
  code: z.string().length(6, 'MFA code must be 6 digits'),
});

export type MfaVerifyDto = z.infer<typeof mfaVerifySchema>;

export const mfaLoginSchema = z.object({
  mfaToken: z.string().min(1, 'MFA token is required'),
  code: z.string().length(6, 'MFA code must be 6 digits'),
});

export type MfaLoginDto = z.infer<typeof mfaLoginSchema>;

export const mfaRequiredResponseSchema = z.object({
  mfaRequired: z.literal(true),
  mfaToken: z.string(),
});

export type MfaRequiredResponseDto = z.infer<typeof mfaRequiredResponseSchema>;

// Device auth
export const deviceAuthSchema = z.object({
  provisioningToken: z.string().min(1, 'Provisioning token is required'),
  deviceFingerprint: z.string().optional(),
});

export type DeviceAuthDto = z.infer<typeof deviceAuthSchema>;

export const deviceTokenResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int().positive(),
  tokenType: z.literal('Bearer').default('Bearer'),
  device: z.object({
    id: z.string(),
    name: z.string(),
    venueId: z.string(),
  }),
});

export type DeviceTokenResponseDto = z.infer<typeof deviceTokenResponseSchema>;

import { UserRole } from '@neofilm/shared';

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  partnerId?: string;
  advertiserId?: string;
  accessToken: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  partnerId?: string;
  advertiserId?: string;
  iat: number;
  exp: number;
}

import type { ConfigService } from '@nestjs/config';
import type { Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import type { PrismaService } from '../../prisma/prisma.service';
import { resolveJwtSecret } from './jwt-secret.util';

/**
 * Shared WebSocket handshake authentication.
 *
 * Every gateway must derive room membership from a VERIFIED principal, never
 * from client-supplied `handshake.auth.orgId` / `deviceId` / `role`. This util
 * verifies the JWT (same secret + payload shape as the HTTP JwtStrategy) and
 * loads the minimal identity needed to scope rooms. Returns null when the
 * socket is unauthenticated or the token is invalid — callers MUST disconnect.
 */

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'];

export interface WsUserPrincipal {
  kind: 'user';
  userId: string;
  platformRole: string | null;
  orgId: string | null;
  orgType: 'PARTNER' | 'ADVERTISER' | null;
  orgRole: string | null;
  isAdmin: boolean;
}

export interface WsDevicePrincipal {
  kind: 'device';
  deviceId: string;
  screenId: string | null;
  orgId: string | null;
}

export type WsPrincipal = WsUserPrincipal | WsDevicePrincipal;

/** Read the bearer token from handshake auth (preferred) or the auth header. */
function extractToken(client: Socket): string | undefined {
  const auth = client.handshake.auth as Record<string, unknown> | undefined;
  const fromAuth = (auth?.token ?? auth?.accessToken) as string | undefined;
  if (fromAuth) return fromAuth;
  const header = client.handshake.headers?.authorization;
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7);
  }
  return undefined;
}

export async function authenticateSocket(
  client: Socket,
  config: ConfigService,
  prisma: PrismaService,
): Promise<WsPrincipal | null> {
  const token = extractToken(client);
  if (!token) return null;

  let payload: { sub: string; type?: string; orgId?: string; orgRole?: string | null };
  try {
    payload = jwt.verify(token, resolveJwtSecret(config)) as typeof payload;
  } catch {
    return null;
  }
  if (!payload?.sub || payload.type === 'mfa_pending') return null;

  // Device token (issued at pairing): { sub: deviceId, screenId, type: 'device' }
  if (payload.type === 'device') {
    const device = await prisma.device.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        status: true,
        screenId: true,
        screen: { select: { partnerOrgId: true } },
      },
    });
    if (!device || device.status === 'DECOMMISSIONED') return null;
    return {
      kind: 'device',
      deviceId: device.id,
      screenId: device.screenId ?? null,
      orgId: device.screen?.partnerOrgId ?? payload.orgId ?? null,
    };
  }

  // User token: { sub, platformRole, orgRole, orgId }
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, isActive: true, platformRole: true },
  });
  if (!user || !user.isActive) return null;

  const orgId = payload.orgId ?? null;
  let orgType: 'PARTNER' | 'ADVERTISER' | null = null;
  if (orgId) {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { type: true },
    });
    orgType = (org?.type as 'PARTNER' | 'ADVERTISER' | undefined) ?? null;
  }

  return {
    kind: 'user',
    userId: user.id,
    platformRole: user.platformRole,
    orgId,
    orgType,
    orgRole: payload.orgRole ?? null,
    isAdmin: !!user.platformRole && ADMIN_ROLES.includes(user.platformRole),
  };
}

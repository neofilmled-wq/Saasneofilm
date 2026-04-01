'use client';
import { useSession } from 'next-auth/react';
import { UserRole } from '@neofilm/shared';

export function usePermissions() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as UserRole | undefined;
  return {
    role,
    isAdmin: role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN,
    isSuperAdmin: role === UserRole.SUPER_ADMIN,
    isSupport: role === UserRole.SUPPORT,
    isStaff: role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN || role === UserRole.SUPPORT,
    isPartner: role === UserRole.PARTNER,
    isAdvertiser: role === UserRole.ADVERTISER,
    hasRole: (...roles: UserRole[]) => role ? roles.includes(role) : false,
  };
}

'use client';

import { useAuth } from '@/providers/auth-provider';

interface PartnerOrgInfo {
  orgId: string | null;
  orgName: string | null;
  orgRole: string | null;
  userId: string | null;
  userName: string | null;
  isLoading: boolean;
}

export function usePartnerOrg(): PartnerOrgInfo {
  const { user, isLoading } = useAuth();

  return {
    orgId: user?.orgId ?? null,
    orgName: user?.orgName ?? null,
    orgRole: user?.orgRole ?? 'OWNER',
    userId: user?.id ?? null,
    userName: user ? `${user.firstName} ${user.lastName}` : null,
    isLoading,
  };
}

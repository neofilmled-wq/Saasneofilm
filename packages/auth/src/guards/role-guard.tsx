'use client';
import { usePermissions } from '../hooks/use-permissions';
import { UserRole } from '@neofilm/shared';

interface RoleGuardProps {
  roles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGuard({ roles, children, fallback = null }: RoleGuardProps) {
  const { hasRole } = usePermissions();
  if (!hasRole(...roles)) return <>{fallback}</>;
  return <>{children}</>;
}

import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

// Permission definitions for platform roles
const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: ['*'],
  ADMIN: [
    'users:read', 'users:write',
    'organizations:read', 'organizations:write',
    'screens:read', 'screens:write',
    'campaigns:read', 'campaigns:write', 'campaigns:approve',
    'devices:read', 'devices:write',
    'analytics:read',
    'invoices:read', 'invoices:write',
    'billing:read', 'billing:write',
  ],
  SUPPORT: [
    'users:read',
    'organizations:read',
    'screens:read',
    'campaigns:read',
    'devices:read',
    'analytics:read',
    'invoices:read',
  ],
};

// Org role permissions (for partner/advertiser users)
const ORG_ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: ['billing:read', 'billing:write', 'campaigns:read', 'campaigns:write', 'screens:read', 'screens:write', 'analytics:read', 'invoices:read'],
  ADMIN: ['billing:read', 'billing:write', 'campaigns:read', 'campaigns:write', 'screens:read', 'screens:write', 'analytics:read', 'invoices:read'],
  MANAGER: ['billing:read', 'campaigns:read', 'campaigns:write', 'screens:read', 'analytics:read'],
  MEMBER: ['billing:read', 'campaigns:read', 'screens:read', 'analytics:read'],
  VIEWER: ['campaigns:read', 'screens:read'],
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('Access denied');
    }

    // Check platform role permissions
    const userRole = user.platformRole;
    if (userRole) {
      const platformPerms = ROLE_PERMISSIONS[userRole] || [];
      if (platformPerms.includes('*')) return true;
      const hasAll = requiredPermissions.every((perm) => platformPerms.includes(perm));
      if (hasAll) return true;
    }

    // Check org role permissions (for partner/advertiser users)
    const orgRole = user.orgRole;
    if (orgRole) {
      const orgPerms = ORG_ROLE_PERMISSIONS[orgRole] || [];
      const hasAll = requiredPermissions.every((perm) => orgPerms.includes(perm));
      if (hasAll) return true;
    }

    throw new ForbiddenException('Insufficient permissions');
  }
}

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

    const userRole = user.platformRole;
    if (!userRole) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const userPermissions = ROLE_PERMISSIONS[userRole] || [];
    if (userPermissions.includes('*')) return true;

    const hasAll = requiredPermissions.every((perm) => userPermissions.includes(perm));
    if (!hasAll) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}

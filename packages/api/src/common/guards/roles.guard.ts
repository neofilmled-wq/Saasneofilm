import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators';

// PlatformRole hierarchy: SUPER_ADMIN > ADMIN > SUPPORT
const ROLE_HIERARCHY: Record<string, string[]> = {
  SUPER_ADMIN: ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'],
  ADMIN: ['ADMIN', 'SUPPORT'],
  SUPPORT: ['SUPPORT'],
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('Access denied');
    }

    const userRole = user.platformRole;
    if (!userRole) {
      throw new ForbiddenException('Insufficient role');
    }

    const inheritedRoles = ROLE_HIERARCHY[userRole] || [userRole];
    const hasRole = requiredRoles.some((role) => inheritedRoles.includes(role));
    if (!hasRole) {
      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }
}

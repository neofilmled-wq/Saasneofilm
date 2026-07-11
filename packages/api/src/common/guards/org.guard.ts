import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'];

/**
 * OrgGuard — multi-tenant isolation for org-scoped endpoints.
 *
 * Several partner/advertiser endpoints accept the target organization id as a
 * query/body param (e.g. `?orgId=` or `?partnerOrgId=`) and previously trusted
 * it blindly — letting any authenticated user read another tenant's data by
 * changing the id (IDOR).
 *
 * This guard resolves the requested org id from the request and enforces:
 *   - platform admins (SUPER_ADMIN / ADMIN / SUPPORT) may access any org
 *   - everyone else may only access their OWN org (JWT `orgId`)
 *
 * It is deliberately permissive when NO org id is present in the request, so
 * it never blocks endpoints that scope internally — attach it only to routes
 * that carry an explicit org id you want verified.
 */
@Injectable()
export class OrgGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) throw new ForbiddenException('Access denied');

    // Platform staff bypass tenant isolation (cross-org admin views).
    if (user.platformRole && ADMIN_ROLES.includes(user.platformRole)) {
      return true;
    }

    const requested =
      req.query?.orgId ??
      req.query?.partnerOrgId ??
      req.query?.advertiserOrgId ??
      req.params?.orgId ??
      req.body?.orgId ??
      req.body?.partnerOrgId ??
      req.body?.advertiserOrgId;

    // No org id in the request → nothing to verify here.
    if (!requested) return true;

    if (!user.orgId || user.orgId !== requested) {
      throw new ForbiddenException('You do not have access to this organization');
    }
    return true;
  }
}

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionsGuard(reflector);
  });

  function createMockContext(user: any, permissions?: string[]): ExecutionContext {
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;
    if (permissions) {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(permissions);
    } else {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    }
    return ctx;
  }

  it('should allow when no permissions are required', () => {
    const ctx = createMockContext({ platformRole: 'SUPPORT' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow SUPER_ADMIN for any permission (wildcard)', () => {
    const ctx = createMockContext({ platformRole: 'SUPER_ADMIN' }, ['users:read', 'campaigns:approve']);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow ADMIN for permissions they have', () => {
    const ctx = createMockContext({ platformRole: 'ADMIN' }, ['users:read', 'campaigns:approve']);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should deny SUPPORT for write permissions', () => {
    const ctx = createMockContext({ platformRole: 'SUPPORT' }, ['users:write']);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should allow SUPPORT for read permissions', () => {
    const ctx = createMockContext({ platformRole: 'SUPPORT' }, ['users:read']);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should deny user with no platformRole', () => {
    const ctx = createMockContext({ platformRole: null }, ['users:read']);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});

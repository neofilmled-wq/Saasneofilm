import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function createMockContext(user: any, roles?: string[]): ExecutionContext {
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;
    if (roles) {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);
    } else {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    }
    return ctx;
  }

  it('should allow when no roles are required', () => {
    const ctx = createMockContext({ platformRole: 'ADMIN' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow SUPER_ADMIN access to ADMIN routes (hierarchy)', () => {
    const ctx = createMockContext({ platformRole: 'SUPER_ADMIN' }, ['ADMIN']);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow SUPER_ADMIN access to SUPPORT routes (hierarchy)', () => {
    const ctx = createMockContext({ platformRole: 'SUPER_ADMIN' }, ['SUPPORT']);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow ADMIN access to SUPPORT routes (hierarchy)', () => {
    const ctx = createMockContext({ platformRole: 'ADMIN' }, ['SUPPORT']);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should deny SUPPORT access to ADMIN routes', () => {
    const ctx = createMockContext({ platformRole: 'SUPPORT' }, ['ADMIN']);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should deny SUPPORT access to SUPER_ADMIN routes', () => {
    const ctx = createMockContext({ platformRole: 'SUPPORT' }, ['SUPER_ADMIN']);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should deny user with no platformRole', () => {
    const ctx = createMockContext({ platformRole: null }, ['ADMIN']);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should deny when no user on request', () => {
    const ctx = createMockContext(undefined, ['ADMIN']);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});

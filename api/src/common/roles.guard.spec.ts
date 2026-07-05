import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

function contextWithRoles(roles: string[] | undefined, required: string[]): ExecutionContext {
  const req = { session: { user: roles ? { roles } : undefined } };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => (() => required),
    getClass: () => class {},
  } as unknown as ExecutionContext;
  return ctx;
}

describe('RolesGuard', () => {
  it('allows the request when no roles are required', () => {
    const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(contextWithRoles(['tenant_user'], []))).toBe(true);
  });

  it('allows the request when the user has a required role', () => {
    const reflector = { getAllAndOverride: () => ['tenant_admin'] } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(contextWithRoles(['tenant_admin', 'tenant_user'], ['tenant_admin']))).toBe(true);
  });

  it('rejects when the user lacks a required role', () => {
    const reflector = { getAllAndOverride: () => ['tenant_admin'] } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(contextWithRoles(['tenant_user'], ['tenant_admin']))).toThrow(ForbiddenException);
  });

  it('rejects when there is no session at all', () => {
    const reflector = { getAllAndOverride: () => ['tenant_admin'] } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(contextWithRoles(undefined, ['tenant_admin']))).toThrow(UnauthorizedException);
  });
});

import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { TenantGuard } from './tenant.guard';
import { TenantContext } from './tenant-context';

function contextWithSession(sessionUser?: { tenantId: string }): ExecutionContext {
  const req = { session: { user: sessionUser } };
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

describe('TenantGuard', () => {
  const guard = new TenantGuard();

  it('allows the request when the session tenantId matches the resolved tenant', () => {
    const ctx = contextWithSession({ tenantId: 'tenant-1' });
    TenantContext.run({ tenantId: 'tenant-1', schemaName: 'tenant_demo', slug: 'demo' }, () => {
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  it('rejects when no tenant was resolved for this request', () => {
    const ctx = contextWithSession({ tenantId: 'tenant-1' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rejects when there is no authenticated session', () => {
    const ctx = contextWithSession(undefined);
    TenantContext.run({ tenantId: 'tenant-1', schemaName: 'tenant_demo', slug: 'demo' }, () => {
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  it('rejects when the session tenantId does not match the resolved tenant', () => {
    const ctx = contextWithSession({ tenantId: 'tenant-OTHER' });
    TenantContext.run({ tenantId: 'tenant-1', schemaName: 'tenant_demo', slug: 'demo' }, () => {
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });
});

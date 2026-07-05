import { TenantResolutionMiddleware } from './tenant-resolution.middleware';

describe('TenantResolutionMiddleware.extractSlug', () => {
  const middleware = new TenantResolutionMiddleware({} as any);

  it('extracts the slug from a tenant subdomain', () => {
    expect((middleware as any).extractSlug('demo.localhost')).toBe('demo');
  });

  it('returns null for a bare host', () => {
    expect((middleware as any).extractSlug('localhost')).toBeNull();
  });

  it('returns null for a www subdomain', () => {
    expect((middleware as any).extractSlug('www.example.com')).toBeNull();
  });

  it('extracts the slug from a production-style host', () => {
    expect((middleware as any).extractSlug('acme.platform.example.com')).toBe('acme');
  });
});

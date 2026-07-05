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

  it('returns null for an IPv4 address (e.g. supertest/health checks connecting via 127.0.0.1)', () => {
    expect((middleware as any).extractSlug('127.0.0.1')).toBeNull();
    expect((middleware as any).extractSlug('192.168.1.10')).toBeNull();
  });
});

import { Inject, Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { ControlTenant } from '../database/models/control/tenant.model';
import { TenantContext } from './tenant-context';

interface CachedTenant {
  id: string;
  schemaName: string;
  status: string;
}

@Injectable()
export class TenantResolutionMiddleware implements NestMiddleware {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const slug = this.extractSlug(req.hostname);
    if (!slug) {
      next();
      return;
    }

    const tenant = await this.lookupTenant(slug);
    if (!tenant) {
      throw new NotFoundException(`Unknown tenant "${slug}"`);
    }
    if (tenant.status !== 'active') {
      throw new NotFoundException(`Tenant "${slug}" is not active`);
    }

    TenantContext.run({ tenantId: tenant.id, schemaName: tenant.schemaName, slug }, () => next());
  }

  private async lookupTenant(slug: string): Promise<CachedTenant | null> {
    const cacheKey = `tenant:${slug}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as CachedTenant;

    const record = await ControlTenant.findOne({ where: { slug } });
    if (!record) return null;

    const value: CachedTenant = { id: record.id, schemaName: record.schemaName, status: record.status };
    await this.redis.set(cacheKey, JSON.stringify(value), 'EX', 60);
    return value;
  }

  private extractSlug(hostname: string): string | null {
    if (this.isIpAddress(hostname)) return null;
    const parts = hostname.split('.');
    if (parts.length < 2) return null;
    if (parts[0] === 'www') return null;
    return parts[0];
  }

  // Supertest/CI/health-check clients commonly connect via a raw IPv4 address
  // (e.g. 127.0.0.1). Without this check, extractSlug would treat "127" as a
  // tenant slug and 404 every request before it reaches any route.
  private isIpAddress(hostname: string): boolean {
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
  }
}

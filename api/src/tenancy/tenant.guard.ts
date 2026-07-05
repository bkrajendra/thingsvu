import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { TenantContext } from './tenant-context';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const tenant = TenantContext.get();

    if (!tenant) {
      throw new ForbiddenException('This route requires a tenant subdomain');
    }
    if (!req.session.user) {
      throw new ForbiddenException('Not authenticated');
    }
    if (req.session.user.tenantId !== tenant.tenantId) {
      throw new ForbiddenException('Resolved tenant does not match your session');
    }
    return true;
  }
}

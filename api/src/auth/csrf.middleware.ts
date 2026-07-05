import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXEMPT_PREFIXES = ['/api/v1/auth/', '/api/v1/device/'];

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    if (SAFE_METHODS.has(req.method)) return next();
    if (EXEMPT_PREFIXES.some((prefix) => req.path.startsWith(prefix)))
      return next();

    // @types/cookie-parser declares `Request.cookies` as `any`; narrow it explicitly.
    const cookieToken = req.cookies?.['csrf_token'] as string | undefined;
    const headerToken = req.headers['x-csrf-token'];

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw new ForbiddenException('Invalid or missing CSRF token');
    }
    next();
  }
}

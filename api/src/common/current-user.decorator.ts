import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { SessionUser } from '../auth/session.types';

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): SessionUser | undefined => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return req.session.user;
});

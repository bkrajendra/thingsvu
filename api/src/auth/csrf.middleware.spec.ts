import { CsrfMiddleware } from './csrf.middleware';
import type { Request, Response } from 'express';

function mockReqRes(opts: {
  method: string;
  path: string;
  cookieToken?: string;
  headerToken?: string;
}) {
  const req = {
    method: opts.method,
    path: opts.path,
    cookies: opts.cookieToken ? { csrf_token: opts.cookieToken } : {},
    headers: opts.headerToken ? { 'x-csrf-token': opts.headerToken } : {},
  } as unknown as Request;
  const res = {} as Response;
  return { req, res };
}

describe('CsrfMiddleware', () => {
  const middleware = new CsrfMiddleware();

  it('allows GET requests through without a token', () => {
    const { req, res } = mockReqRes({ method: 'GET', path: '/api/v1/devices' });
    const next = jest.fn();
    middleware.use(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('allows device-facing POST routes through without a CSRF token', () => {
    const { req, res } = mockReqRes({
      method: 'POST',
      path: '/api/v1/device/telemetry',
    });
    const next = jest.fn();
    middleware.use(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a state-changing request with a missing token', () => {
    const { req, res } = mockReqRes({
      method: 'POST',
      path: '/api/v1/devices',
    });
    const next = jest.fn();
    expect(() => middleware.use(req, res, next)).toThrow();
  });

  it('rejects a state-changing request when header and cookie tokens differ', () => {
    const { req, res } = mockReqRes({
      method: 'POST',
      path: '/api/v1/devices',
      cookieToken: 'aaa',
      headerToken: 'bbb',
    });
    const next = jest.fn();
    expect(() => middleware.use(req, res, next)).toThrow();
  });

  it('allows a state-changing request when header and cookie tokens match', () => {
    const { req, res } = mockReqRes({
      method: 'POST',
      path: '/api/v1/devices',
      cookieToken: 'aaa',
      headerToken: 'aaa',
    });
    const next = jest.fn();
    middleware.use(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });
});

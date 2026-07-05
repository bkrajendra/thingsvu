import type { HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const csrfToken = readCookie('csrf_token');
  const outgoing =
    MUTATING_METHODS.has(req.method) && csrfToken
      ? req.clone({ setHeaders: { 'X-CSRF-Token': csrfToken } })
      : req;

  return next(outgoing).pipe(
    catchError((error: unknown) => {
      const isUnauthorized = typeof error === 'object' && error !== null && 'status' in error && (error as { status: number }).status === 401;
      if (isUnauthorized && !req.url.includes('/auth/me')) {
        window.location.href = '/api/v1/auth/login';
      }
      return throwError(() => error);
    }),
  );
};

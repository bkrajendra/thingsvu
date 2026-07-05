import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const response = await fetch('/api/v1/auth/me', { credentials: 'include' });
  if (response.ok) return true;
  return router.createUrlTree(['/login']);
};

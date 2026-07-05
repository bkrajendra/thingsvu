import { Service, computed } from '@angular/core';
import { httpResource } from '@angular/common/http';
import type { MeResponse } from '../models/session';

@Service()
export class AuthService {
  private readonly meResource = httpResource<MeResponse>(() => '/api/v1/auth/me');

  readonly user = computed(() => this.meResource.value()?.user);
  readonly isAuthenticated = computed(() => this.meResource.value()?.user !== undefined);
  readonly isLoading = this.meResource.isLoading;

  login(): void {
    window.location.href = '/api/v1/auth/login';
  }

  async logout(): Promise<void> {
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/login';
  }
}

import { Component, inject } from '@angular/core';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login-page',
  imports: [HlmButtonImports],
  template: `
    <div class="flex min-h-dvh items-center justify-center">
      <div class="flex flex-col items-center gap-4 rounded-lg border p-8">
        <h1 class="text-xl font-semibold">Sign in to IoT Platform</h1>
        <button hlmBtn (click)="auth.login()">Sign in with Keycloak</button>
      </div>
    </div>
  `,
})
export class LoginPage {
  protected readonly auth = inject(AuthService);
}

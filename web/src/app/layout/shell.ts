import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { AuthService } from '../core/auth/auth.service';

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, HlmButtonImports],
  template: `
    <div class="flex h-dvh flex-col">
      <header class="flex items-center justify-between border-b px-4 py-3">
        <div class="flex items-center gap-3">
          <button
            hlmBtn
            variant="ghost"
            size="icon"
            class="md:hidden"
            aria-label="Toggle navigation"
            (click)="toggleDrawer()"
          >
            &#9776;
          </button>
          <span class="font-semibold">IoT Platform</span>
        </div>
        <div class="flex items-center gap-3">
          @if (auth.user(); as user) {
            <span class="text-sm text-muted-foreground">{{ user.email }}</span>
          }
          <button hlmBtn variant="outline" size="sm" (click)="auth.logout()">Sign out</button>
        </div>
      </header>
      <div class="flex flex-1 overflow-hidden">
        <nav class="w-56 shrink-0 border-r p-3 md:block" [class.hidden]="!drawerOpen()">
          <a routerLink="/devices" routerLinkActive="font-semibold" class="block rounded px-2 py-1.5 hover:bg-muted">
            Devices
          </a>
          <a routerLink="/telemetry" routerLinkActive="font-semibold" class="block rounded px-2 py-1.5 hover:bg-muted">
            Telemetry
          </a>
        </nav>
        <main class="flex-1 overflow-auto p-4">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly drawerOpen = signal(false);

  protected toggleDrawer(): void {
    this.drawerOpen.update((open) => !open);
  }
}

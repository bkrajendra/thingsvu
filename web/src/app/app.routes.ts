import type { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
  },
  {
    path: '',
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'devices', pathMatch: 'full' },
      {
        path: 'devices',
        loadComponent: () => import('./features/devices/devices-list.page').then((m) => m.DevicesListPage),
      },
      {
        path: 'telemetry',
        loadComponent: () => import('./features/telemetry/telemetry-view.page').then((m) => m.TelemetryViewPage),
      },
    ],
  },
];

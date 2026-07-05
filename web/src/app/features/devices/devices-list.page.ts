import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { DevicesService } from './devices.service';

@Component({
  selector: 'app-devices-list-page',
  imports: [HlmButtonImports],
  template: `
    <div class="space-y-6">
      <h1 class="text-lg font-semibold">Devices</h1>

      <div class="flex items-end gap-2">
        <div class="flex flex-col gap-1">
          <label for="device-name" class="text-sm font-medium">New device name</label>
          <input
            id="device-name"
            class="rounded border px-3 py-1.5 text-sm"
            [value]="newDeviceName()"
            (input)="newDeviceName.set($any($event.target).value)"
          />
        </div>
        <button hlmBtn [disabled]="creating() || !newDeviceName().trim()" (click)="createDevice()">
          Create device
        </button>
      </div>

      @if (revealedToken(); as revealed) {
        <div class="rounded border border-amber-400 bg-amber-50 p-3 text-sm dark:bg-amber-950">
          <p class="font-medium">Access token for this device (shown once — copy it now):</p>
          <code class="break-all">{{ revealed.token }}</code>
        </div>
      }

      @if (devicesService.devicesResource.value(); as devices) {
        <table class="w-full border-collapse text-sm">
          <thead>
            <tr class="border-b text-left">
              <th class="py-2">Name</th>
              <th class="py-2">Status</th>
              <th class="py-2">Last seen</th>
              <th class="py-2">Credential</th>
            </tr>
          </thead>
          <tbody>
            @for (device of devices; track device.id) {
              <tr class="border-b">
                <td class="py-2">{{ device.name }}</td>
                <td class="py-2">{{ device.status }}</td>
                <td class="py-2">{{ device.lastSeenAt ?? '—' }}</td>
                <td class="py-2">
                  <button hlmBtn variant="outline" size="sm" (click)="issueToken(device.id)">Issue token</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      } @else if (devicesService.devicesResource.isLoading()) {
        <p>Loading devices…</p>
      } @else {
        <p>No devices yet.</p>
      }
    </div>
  `,
})
export class DevicesListPage {
  protected readonly devicesService = inject(DevicesService);
  protected readonly newDeviceName = signal('');
  protected readonly creating = signal(false);
  protected readonly revealedToken = signal<{ deviceId: string; token: string } | null>(null);

  protected async createDevice(): Promise<void> {
    const name = this.newDeviceName().trim();
    if (!name) return;
    this.creating.set(true);
    try {
      await firstValueFrom(this.devicesService.create({ name }));
      this.newDeviceName.set('');
      this.devicesService.refresh();
    } finally {
      this.creating.set(false);
    }
  }

  protected async issueToken(deviceId: string): Promise<void> {
    const result = await firstValueFrom(this.devicesService.issueCredential(deviceId));
    this.revealedToken.set({ deviceId, token: result.token });
  }
}

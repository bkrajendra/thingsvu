import { Component, computed, inject, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { NgxEchartsDirective } from 'ngx-echarts';
import type { EChartsCoreOption } from 'echarts/core';
import { DevicesService } from '../devices/devices.service';
import type { TelemetryPoint } from '../../core/models/telemetry';

@Component({
  selector: 'app-telemetry-view-page',
  imports: [NgxEchartsDirective],
  template: `
    <div class="space-y-4">
      <h1 class="text-lg font-semibold">Telemetry</h1>

      <select
        class="rounded border px-2 py-1 text-sm"
        [value]="selectedDeviceId()"
        (change)="selectedDeviceId.set($any($event.target).value)"
      >
        <option value="" disabled>Select a device</option>
        @for (device of devicesService.devicesResource.value() ?? []; track device.id) {
          <option [value]="device.id">{{ device.name }}</option>
        }
      </select>

      @if (latestResource.value(); as points) {
        @if (points.length > 0) {
          <table class="w-full border-collapse text-sm">
            <thead>
              <tr class="border-b text-left">
                <th class="py-2">Key</th>
                <th class="py-2">Value</th>
                <th class="py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              @for (point of points; track point.key) {
                <tr class="border-b">
                  <td class="py-2">{{ point.key }}</td>
                  <td class="py-2">{{ point.value_num ?? point.value_str ?? point.value_bool }}</td>
                  <td class="py-2">{{ point.ts }}</td>
                </tr>
              }
            </tbody>
          </table>
        } @else if (selectedDeviceId()) {
          <p>No telemetry recorded for this device yet.</p>
        }
      }

      @if (chartOption(); as option) {
        <div echarts [options]="option" class="h-80 w-full"></div>
      }
    </div>
  `,
})
export class TelemetryViewPage {
  protected readonly devicesService = inject(DevicesService);
  protected readonly selectedDeviceId = signal('');

  protected readonly latestResource = httpResource<TelemetryPoint[]>(() => {
    const deviceId = this.selectedDeviceId();
    return deviceId
      ? { url: '/api/v1/telemetry/latest', params: { deviceIds: deviceId } }
      : undefined;
  });

  private readonly firstNumericKey = computed(() => {
    const points = this.latestResource.value() ?? [];
    return points.find((p) => p.value_num !== null)?.key;
  });

  protected readonly seriesResource = httpResource<TelemetryPoint[]>(() => {
    const deviceId = this.selectedDeviceId();
    const key = this.firstNumericKey();
    return deviceId && key
      ? { url: '/api/v1/telemetry/series', params: { deviceId, key } }
      : undefined;
  });

  protected readonly chartOption = computed<EChartsCoreOption | null>(() => {
    const series = this.seriesResource.value();
    if (!series || series.length === 0) return null;
    return {
      xAxis: { type: 'category', data: series.map((p) => new Date(p.ts).toLocaleTimeString()) },
      yAxis: { type: 'value' },
      series: [{ type: 'line', data: series.map((p) => p.value_num) }],
    };
  });
}

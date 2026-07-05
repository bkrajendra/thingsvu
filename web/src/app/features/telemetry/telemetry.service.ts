import { Service, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import type { TelemetryPoint } from '../../core/models/telemetry';

// Observable-returning wrapper for imperative (non-httpResource) call sites,
// e.g. a future export/download action. TelemetryViewPage reads via
// httpResource directly since it needs reactive, conditional refetching.
@Service()
export class TelemetryService {
  private readonly http = inject(HttpClient);

  latest(deviceIds: string[], keys?: string[]) {
    let params = new HttpParams().set('deviceIds', deviceIds.join(','));
    if (keys && keys.length > 0) params = params.set('keys', keys.join(','));
    return this.http.get<TelemetryPoint[]>('/api/v1/telemetry/latest', { params });
  }

  series(deviceId: string, key: string) {
    const params = new HttpParams().set('deviceId', deviceId).set('key', key);
    return this.http.get<TelemetryPoint[]>('/api/v1/telemetry/series', { params });
  }
}

import { Service, inject } from '@angular/core';
import { HttpClient, httpResource } from '@angular/common/http';
import type { Device } from '../../core/models/device';

export interface CreateDevicePayload {
  name: string;
  deviceProfileId?: string;
  label?: string;
}

export interface IssuedCredential {
  token: string;
  credential: { id: string; deviceId: string; credentialType: string };
}

@Service()
export class DevicesService {
  private readonly http = inject(HttpClient);

  readonly devicesResource = httpResource<Device[]>(() => '/api/v1/devices');

  create(payload: CreateDevicePayload) {
    return this.http.post<Device>('/api/v1/devices', payload);
  }

  issueCredential(deviceId: string) {
    return this.http.post<IssuedCredential>(`/api/v1/devices/${deviceId}/credentials`, {});
  }

  refresh(): void {
    this.devicesResource.reload();
  }
}

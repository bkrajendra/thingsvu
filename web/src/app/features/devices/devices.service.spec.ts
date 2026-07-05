import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { DevicesService } from './devices.service';

describe('DevicesService', () => {
  let service: DevicesService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DevicesService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DevicesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('POSTs a new device', async () => {
    const promise = firstValueFrom(service.create({ name: 'Sensor 1' }));
    const req = httpMock.expectOne('/api/v1/devices');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Sensor 1' });
    req.flush({ id: 'd1', name: 'Sensor 1' });
    await expect(promise).resolves.toEqual({ id: 'd1', name: 'Sensor 1' });
  });

  it('POSTs to issue a credential for a device', async () => {
    const promise = firstValueFrom(service.issueCredential('d1'));
    const req = httpMock.expectOne('/api/v1/devices/d1/credentials');
    expect(req.request.method).toBe('POST');
    req.flush({ token: 'plaintext-token', credential: { id: 'c1', deviceId: 'd1', credentialType: 'access_token' } });
    await expect(promise).resolves.toEqual(
      expect.objectContaining({ token: 'plaintext-token' }),
    );
  });
});

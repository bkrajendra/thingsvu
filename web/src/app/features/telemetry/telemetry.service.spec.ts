import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { TelemetryService } from './telemetry.service';

describe('TelemetryService', () => {
  let service: TelemetryService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TelemetryService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TelemetryService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('requests latest values with a comma-joined deviceIds param', async () => {
    const promise = firstValueFrom(service.latest(['d1', 'd2']));
    const req = httpMock.expectOne((r) => r.url === '/api/v1/telemetry/latest');
    expect(req.request.params.get('deviceIds')).toBe('d1,d2');
    req.flush([]);
    await promise;
  });

  it('requests a series for a device/key pair', async () => {
    const promise = firstValueFrom(service.series('d1', 'temp'));
    const req = httpMock.expectOne((r) => r.url === '/api/v1/telemetry/series');
    expect(req.request.params.get('deviceId')).toBe('d1');
    expect(req.request.params.get('key')).toBe('temp');
    req.flush([]);
    await promise;
  });
});

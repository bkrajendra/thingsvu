import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { apiInterceptor } from './api.interceptor';

describe('apiInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    document.cookie = 'csrf_token=test-csrf-value; path=/';
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('attaches the CSRF header to a POST request', () => {
    http.post('/api/v1/devices', { name: 'x' }).subscribe();
    const req = httpMock.expectOne('/api/v1/devices');
    expect(req.request.headers.get('X-CSRF-Token')).toBe('test-csrf-value');
    req.flush({});
  });

  it('does not attach the CSRF header to a GET request', () => {
    http.get('/api/v1/devices').subscribe();
    const req = httpMock.expectOne('/api/v1/devices');
    expect(req.request.headers.has('X-CSRF-Token')).toBe(false);
    req.flush([]);
  });
});

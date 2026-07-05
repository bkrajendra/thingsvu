import { Test } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    // AuthController is declared with `version: '1'` — without enableVersioning() here,
    // Nest ignores that metadata and maps the route as `/api/auth/me` (no `v1` segment),
    // so a request to `/api/v1/auth/me` 404s before reaching the controller at all.
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/auth/me returns 401 when not logged in', () => {
    return request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });
});

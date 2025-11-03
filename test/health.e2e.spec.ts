import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Health Endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({
      logger: ['log', 'error', 'warn', 'debug', 'verbose'],
    });
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200)
        .timeout(10000);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('checks');
      expect(response.body.checks).toHaveProperty('database');
      expect(response.body.checks).toHaveProperty('solana');
    });

    it('should include database health check', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200)
        .timeout(10000);

      const dbCheck = response.body.checks.database;
      expect(dbCheck).toHaveProperty('status');
      expect(['healthy', 'unhealthy']).toContain(dbCheck.status);
    });

    it('should include Solana RPC health check', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

      const solanaCheck = response.body.checks.solana;
      expect(solanaCheck).toHaveProperty('status');
      expect(['healthy', 'unhealthy']).toContain(solanaCheck.status);
    });

    it('should return uptime in seconds', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

      expect(typeof response.body.uptime).toBe('number');
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /health/readiness', () => {
    it('should return readiness status', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health/readiness')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body.status).toBe('ready');
    });

    it('should validate database connectivity', async () => {
      // Readiness should check database is accessible
      await request(app.getHttpServer()).get('/api/v1/health/readiness').expect(200);
    });
  });

  describe('GET /health/liveness', () => {
    it('should return liveness status', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health/liveness')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body.status).toBe('alive');
    });

    it('should always return 200 when server is running', async () => {
      await request(app.getHttpServer()).get('/api/v1/health/liveness').expect(200);
    });
  });

  describe('Kubernetes Probes', () => {
    it('readiness probe should be suitable for K8s', async () => {
      // Readiness should fail fast if dependencies are down
      const response = await request(app.getHttpServer())
        .get('/api/v1/health/readiness')
        .expect(200);

      expect(response.body.status).toBe('ready');
    });

    it('liveness probe should not check dependencies', async () => {
      // Liveness should only check if app is running
      // Not if dependencies are healthy
      const response = await request(app.getHttpServer())
        .get('/api/v1/health/liveness')
        .expect(200);

      expect(response.body.status).toBe('alive');
      expect(response.body).not.toHaveProperty('checks');
    });
  });
});

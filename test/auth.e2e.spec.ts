import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TestHelpers } from './test-helpers';
import { cleanDatabase } from './setup';

describe('Auth Endpoints (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testWallet: ReturnType<typeof TestHelpers.generateTestWallet>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({
      logger: ['log', 'error', 'warn', 'debug', 'verbose'],
    });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api/v1');

    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    await cleanDatabase(prisma);

    testWallet = TestHelpers.generateTestWallet();
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  describe('POST /auth/nonce', () => {
    it('should return a nonce for valid wallet', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/nonce')
        .send({ wallet: testWallet.publicKey })
        .expect(200);

      expect(response.body).toHaveProperty('nonce');
      expect(response.body.nonce).toContain('Sign this message');
      expect(response.body.nonce).toContain('Nonce:');
      expect(response.body.nonce).toContain('Timestamp:');
    });

    it('should reject invalid wallet address', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/nonce')
        .send({ wallet: 'invalid-wallet' })
        .expect(400);
    });

    it('should reject missing wallet', async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/nonce').send({}).expect(400);
    });
  });

  describe('POST /auth/verify', () => {
    it('should verify signature and return JWT token', async () => {
      // Get nonce
      const nonceResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/nonce')
        .send({ wallet: testWallet.publicKey })
        .expect(200);

      const { nonce } = nonceResponse.body;

      // Sign nonce
      const signature = TestHelpers.signMessage(nonce, testWallet.keypair);

      // Verify signature
      const verifyResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/verify')
        .send({
          wallet: testWallet.publicKey,
          signature,
          message: nonce,
        })
        .expect(200);

      expect(verifyResponse.body).toHaveProperty('accessToken');
      expect(verifyResponse.body).toHaveProperty('user');
      expect(verifyResponse.body.user.wallet).toBe(testWallet.publicKey);
      expect(typeof verifyResponse.body.accessToken).toBe('string');
    });

    it('should reject invalid signature', async () => {
      const nonceResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/nonce')
        .send({ wallet: testWallet.publicKey })
        .expect(200);

      const { nonce } = nonceResponse.body;

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify')
        .send({
          wallet: testWallet.publicKey,
          signature: 'invalid-signature',
          message: nonce,
        })
        .expect(401);
    });

    it('should reject expired nonce (5+ minutes old)', async () => {
      const oldNonce = `Sign this message to authenticate with Solana Staking Platform.\n\nNonce: test-123\nTimestamp: ${Date.now() - 6 * 60 * 1000}`;
      const signature = TestHelpers.signMessage(oldNonce, testWallet.keypair);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify')
        .send({
          wallet: testWallet.publicKey,
          signature,
          message: oldNonce,
        })
        .expect(401);
    });

    it('should create user on first authentication', async () => {
      const newWallet = TestHelpers.generateTestWallet();

      const nonceResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/nonce')
        .send({ wallet: newWallet.publicKey })
        .expect(200);

      const signature = TestHelpers.signMessage(nonceResponse.body.nonce, newWallet.keypair);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify')
        .send({
          wallet: newWallet.publicKey,
          signature,
          message: nonceResponse.body.nonce,
        })
        .expect(200);

      // Verify user created in database
      const user = await prisma.user.findUnique({
        where: { wallet: newWallet.publicKey },
      });

      expect(user).toBeTruthy();
      expect(user!.wallet).toBe(newWallet.publicKey);
    });
  });

  describe('POST /auth/logout', () => {
    it('should logout authenticated user', async () => {
      const token = await TestHelpers.authenticateWallet(request(app.getHttpServer()), testWallet);

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Token should no longer work
      await request(app.getHttpServer())
        .get('/api/v1/staking/positions')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('should reject unauthenticated logout', async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/logout').expect(401);
    });
  });
});

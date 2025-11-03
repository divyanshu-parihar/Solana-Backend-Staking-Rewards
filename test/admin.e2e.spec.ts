/* eslint-disable @typescript-eslint/no-unused-vars */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TestHelpers } from './test-helpers';
import { cleanDatabase } from './setup';
import { Keypair } from '@solana/web3.js';
import * as bs58 from 'bs58';

describe('Admin Endpoints (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminWallet: ReturnType<typeof TestHelpers.generateTestWallet>;
  let normalUserWallet: ReturnType<typeof TestHelpers.generateTestWallet>;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    // Generate admin wallet
    adminWallet = TestHelpers.generateTestWallet();
    normalUserWallet = TestHelpers.generateTestWallet();

    // Set admin key in environment
    process.env.ADMIN_PRIVATE_KEY = adminWallet.secretKey;

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

    // Authenticate both wallets
    adminToken = await TestHelpers.authenticateWallet(request(app.getHttpServer()), adminWallet);
    userToken = await TestHelpers.authenticateWallet(
      request(app.getHttpServer()),
      normalUserWallet,
    );

    // Create program state
    await prisma.programState.create({
      data: {
        id: 'test-program-state',
        ...TestHelpers.createMockProgramState(),
      },
    });
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
    delete process.env.ADMIN_PRIVATE_KEY;
  });

  describe('POST /admin/tiers', () => {
    it('should create staking tier as admin', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/admin/tiers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tierId: 1,
          multiplier: 150,
          minMonths: 1,
          maxMonths: 12,
          isActive: true,
        })
        .expect(201);

      expect(response.body).toHaveProperty('tierId', 1);
      expect(response.body.multiplier).toBe('150');
      expect(response.body.minMonths).toBe(1);
      expect(response.body.maxMonths).toBe(12);
      expect(response.body.isActive).toBe(true);

      // Verify in database
      const tier = await prisma.stakingTier.findUnique({
        where: { tierId: 1 },
      });

      expect(tier).toBeTruthy();
    });

    it('should reject tier creation by non-admin', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/tiers')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          tierId: 2,
          multiplier: 200,
          minMonths: 3,
          maxMonths: 24,
          isActive: true,
        })
        .expect(403);
    });

    it('should reject invalid multiplier', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/tiers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tierId: 3,
          multiplier: 600, // > 500
          minMonths: 1,
          maxMonths: 12,
        })
        .expect(400);
    });

    it('should reject duplicate tier ID', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/tiers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tierId: 1, // Already exists
          multiplier: 150,
          minMonths: 1,
          maxMonths: 12,
        })
        .expect(400);
    });

    it('should reject invalid duration range', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/tiers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tierId: 4,
          multiplier: 150,
          minMonths: 12,
          maxMonths: 6, // min > max
        })
        .expect(400);
    });
  });

  describe('PATCH /admin/tiers/:tierId', () => {
    beforeEach(async () => {
      // Ensure tier exists
      await prisma.stakingTier.upsert({
        where: { tierId: 1 },
        create: {
          id: 'test-tier-1',
          ...TestHelpers.createMockStakingTier(1),
        },
        update: {},
      });
    });

    it('should update staking tier as admin', async () => {
      const response = await request(app.getHttpServer())
        .patch('/api/v1/admin/tiers/1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          multiplier: 200,
          isActive: false,
        })
        .expect(200);

      expect(response.body.multiplier).toBe('200');
      expect(response.body.isActive).toBe(false);

      // Verify in database
      const tier = await prisma.stakingTier.findUnique({
        where: { tierId: 1 },
      });

      expect(tier!.multiplier).toBe(BigInt(200));
      expect(tier!.isActive).toBe(false);
    });

    it('should reject update by non-admin', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/admin/tiers/1')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          multiplier: 200,
        })
        .expect(403);
    });

    it('should reject update of non-existent tier', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/admin/tiers/999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          multiplier: 200,
        })
        .expect(404);
    });
  });

  describe('GET /admin/tiers', () => {
    beforeEach(async () => {
      // Only clean up tiers, not users/sessions
      await prisma.stakingTier.deleteMany();

      // Create multiple tiers
      await prisma.stakingTier.createMany({
        data: [
          { id: 'tier-1', ...TestHelpers.createMockStakingTier(1), isActive: true },
          { id: 'tier-2', ...TestHelpers.createMockStakingTier(2), isActive: false },
        ],
      });
    });

    it('should get all tiers', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/tiers')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
    });

    it('should filter tiers by active status', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/tiers?isActive=true')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.length).toBe(1);
      expect(response.body[0].isActive).toBe(true);
    });

    it('should allow non-admin to view tiers', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/tiers')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
    });
  });

  describe('POST /admin/pause', () => {
    beforeEach(async () => {
      // Reset pause state before each test
      await prisma.programState.updateMany({
        data: { isPaused: false },
      });
    });

    it('should pause program as admin', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/admin/pause')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.isPaused).toBe(true);

      // Verify in database
      const programState = await prisma.programState.findFirst();
      expect(programState!.isPaused).toBe(true);
    });

    it('should reject pause by non-admin', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/pause')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('should reject pause when already paused', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/pause')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/admin/pause')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  describe('POST /admin/unpause', () => {
    beforeEach(async () => {
      await prisma.programState.updateMany({
        data: { isPaused: true },
      });
    });

    it('should unpause program as admin', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/admin/unpause')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.isPaused).toBe(false);

      // Verify in database
      const programState = await prisma.programState.findFirst();
      expect(programState!.isPaused).toBe(false);
    });

    it('should reject unpause by non-admin', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/unpause')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('should reject unpause when not paused', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/unpause')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/admin/unpause')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  describe('POST /admin/reward-pool/topup', () => {
    it('should replenish reward pool as admin', async () => {
      const initialState = await prisma.programState.findFirst();
      const initialPool = Number(initialState!.totalRewardPool);

      const response = await request(app.getHttpServer())
        .post('/api/v1/admin/reward-pool/topup')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          amount: 1000000000, // 1 token
        })
        .expect(200);

      expect(response.body.amountAdded).toBe(1000000000);
      expect(Number(response.body.newPoolBalance)).toBe(initialPool + 1000000000);

      // Verify in database
      const updatedState = await prisma.programState.findFirst();
      expect(Number(updatedState!.totalRewardPool)).toBe(initialPool + 1000000000);
    });

    it('should reject pool topup by non-admin', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/reward-pool/topup')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          amount: 1000000000,
        })
        .expect(403);
    });

    it('should reject invalid amount', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/reward-pool/topup')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          amount: 0,
        })
        .expect(400);
    });
  });

  describe('GET /admin/state', () => {
    it('should get program state', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/state')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('programId');
      expect(response.body).toHaveProperty('rewardTokenMint');
      expect(response.body).toHaveProperty('isPaused');
      expect(response.body).toHaveProperty('totalStaked');
      expect(response.body).toHaveProperty('totalRewardPool');
      expect(response.body.initialized).toBe(true);
    });

    it('should allow non-admin to view state', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/state')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
    });
  });
});

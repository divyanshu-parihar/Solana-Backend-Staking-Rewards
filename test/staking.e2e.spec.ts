import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TestHelpers } from './test-helpers';
import { cleanDatabase } from './setup';

describe('Staking Endpoints (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testWallet: ReturnType<typeof TestHelpers.generateTestWallet>;
  let authToken: string;

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

    // Setup test data
    testWallet = TestHelpers.generateTestWallet();
    authToken = await TestHelpers.authenticateWallet(request(app.getHttpServer()), testWallet);

    // Create program state
    await prisma.programState.create({
      data: {
        id: 'test-program-state',
        ...TestHelpers.createMockProgramState(),
      },
    });

    // Create staking tier
    await prisma.stakingTier.create({
      data: {
        id: 'test-tier-1',
        ...TestHelpers.createMockStakingTier(1),
      },
    });
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  describe('POST /staking/stake', () => {
    it('should create a stake position', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/staking/stake')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 1000000000, // 1 token
          durationMonths: 6,
          tierId: 1,
          isLocked: true,
        })
        .expect(201);

      expect(response.body).toHaveProperty('positionId');
      expect(response.body).toHaveProperty('pda');
      expect(response.body).toHaveProperty('positionSeed');
      expect(response.body.amount).toBe(1000000000);
      expect(response.body.durationMonths).toBe(6);
      expect(response.body.powerMultiplier).toBe(150); // 6 months = 1.5x

      // Verify in database
      const position = await prisma.stakePosition.findUnique({
        where: { id: response.body.positionId },
      });

      expect(position).toBeTruthy();
      expect(position!.owner).toBe(testWallet.publicKey);
      expect(position!.isActive).toBe(true);
    });

    it('should reject stake below minimum amount', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/staking/stake')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 100, // Too small
          durationMonths: 6,
          tierId: 1,
          isLocked: true,
        })
        .expect(400);
    });

    it('should reject invalid duration', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/staking/stake')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 1000000000,
          durationMonths: 0, // Invalid
          tierId: 1,
          isLocked: true,
        })
        .expect(400);
    });

    it('should reject non-existent tier', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/staking/stake')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 1000000000,
          durationMonths: 6,
          tierId: 999, // Doesn't exist
          isLocked: true,
        })
        .expect(400);
    });

    it('should reject unauthenticated request', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/staking/stake')
        .send({
          amount: 1000000000,
          durationMonths: 6,
          tierId: 1,
          isLocked: true,
        })
        .expect(401);
    });

    it('should calculate correct power multiplier for different durations', async () => {
      const testCases = [
        { months: 1, expected: 100 }, // 1x
        { months: 6, expected: 150 }, // 1.5x
        { months: 12, expected: 200 }, // 2x
        { months: 18, expected: 250 }, // 2.5x
        { months: 24, expected: 300 }, // 3x
        { months: 36, expected: 400 }, // 4x
      ];

      for (const testCase of testCases) {
        const response = await request(app.getHttpServer())
          .post('/api/v1/staking/stake')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            amount: 1000000000,
            durationMonths: testCase.months,
            tierId: 1,
            isLocked: false,
          })
          .expect(201);

        expect(response.body.powerMultiplier).toBe(testCase.expected);
      }
    });
  });

  describe('POST /staking/unstake', () => {
    let stakePositionSeed: number;

    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/staking/stake')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 1000000000,
          durationMonths: 6,
          tierId: 1,
          isLocked: true,
        })
        .expect(201);

      stakePositionSeed = response.body.positionSeed;
    });

    it('should initiate unstaking with cooldown', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/staking/unstake')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ positionSeed: stakePositionSeed })
        .expect(200);

      expect(response.body).toHaveProperty('cooldownEnd');
      expect(response.body.isEarlyUnstake).toBe(true);

      // Verify cooldown in database
      const position = await prisma.stakePosition.findUnique({
        where: { id: response.body.positionId },
      });

      expect(position!.isActive).toBe(false);
      expect(position!.cooldownEnd).toBeTruthy();
      expect(Number(position!.cooldownEnd)).toBeGreaterThan(Date.now() / 1000);
    });

    it('should reject unstaking non-existent position', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/staking/unstake')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ positionSeed: 999999 })
        .expect(404);
    });

    it('should reject unstaking already unstaked position', async () => {
      // First unstake
      await request(app.getHttpServer())
        .post('/api/v1/staking/unstake')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ positionSeed: stakePositionSeed })
        .expect(200);

      // Try again
      await request(app.getHttpServer())
        .post('/api/v1/staking/unstake')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ positionSeed: stakePositionSeed })
        .expect(400);
    });
  });

  describe('POST /staking/finalize', () => {
    it('should reject finalize before cooldown complete', async () => {
      const stakeResponse = await request(app.getHttpServer())
        .post('/api/v1/staking/stake')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 1000000000,
          durationMonths: 6,
          tierId: 1,
          isLocked: true,
        })
        .expect(201);

      // Unstake
      await request(app.getHttpServer())
        .post('/api/v1/staking/unstake')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ positionSeed: stakeResponse.body.positionSeed })
        .expect(200);

      // Try to finalize immediately
      await request(app.getHttpServer())
        .post('/api/v1/staking/finalize')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ positionSeed: stakeResponse.body.positionSeed })
        .expect(400);
    });

    it('should reject finalize without pending unstake', async () => {
      const stakeResponse = await request(app.getHttpServer())
        .post('/api/v1/staking/stake')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 1000000000,
          durationMonths: 6,
          tierId: 1,
          isLocked: true,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/staking/finalize')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ positionSeed: stakeResponse.body.positionSeed })
        .expect(400);
    });
  });

  describe('GET /staking/positions', () => {
    it('should return user staking positions', async () => {
      // Create a position
      await request(app.getHttpServer())
        .post('/api/v1/staking/stake')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 1000000000,
          durationMonths: 6,
          tierId: 1,
          isLocked: true,
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/api/v1/staking/positions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('pda');
      expect(response.body[0]).toHaveProperty('amount');
      expect(response.body[0].owner).toBe(testWallet.publicKey);
    });

    it('should filter by active status', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/staking/positions?isActive=true')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      response.body.forEach((position: any) => {
        expect(position.isActive).toBe(true);
      });
    });

    it('should reject unauthenticated request', async () => {
      await request(app.getHttpServer()).get('/api/v1/staking/positions').expect(401);
    });
  });

  describe('Idempotency', () => {
    it('should handle duplicate stake requests with same idempotency key', async () => {
      const idempotencyKey = `test-stake-${Date.now()}`;

      const response1 = await request(app.getHttpServer())
        .post('/api/v1/staking/stake')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          amount: 1000000000,
          durationMonths: 6,
          tierId: 1,
          isLocked: true,
        })
        .expect(201);

      // Same request with same key should return cached response
      const response2 = await request(app.getHttpServer())
        .post('/api/v1/staking/stake')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          amount: 1000000000,
          durationMonths: 6,
          tierId: 1,
          isLocked: true,
        })
        .expect(200);

      expect(response1.body.positionId).toBe(response2.body.positionId);
    });

    it('should reject same key with different payload', async () => {
      const idempotencyKey = `test-stake-conflict-${Date.now()}`;

      await request(app.getHttpServer())
        .post('/api/v1/staking/stake')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          amount: 1000000000,
          durationMonths: 6,
          tierId: 1,
          isLocked: true,
        })
        .expect(201);

      // Different payload with same key
      await request(app.getHttpServer())
        .post('/api/v1/staking/stake')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          amount: 2000000000, // Different amount
          durationMonths: 6,
          tierId: 1,
          isLocked: true,
        })
        .expect(409); // Conflict
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TestHelpers } from './test-helpers';
import { cleanDatabase } from './setup';

describe('Rewards Endpoints (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testWallet: ReturnType<typeof TestHelpers.generateTestWallet>;
  let authToken: string;
  let stakePositionSeed: number;

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

    // Create program state with reward pool
    await prisma.programState.create({
      data: {
        id: 'test-program-state',
        ...TestHelpers.createMockProgramState(),
        totalRewardPool: BigInt(1000000000000), // 1000 tokens
        totalStakingPower: BigInt(100000000), // Some staking power
      },
    });

    // Create staking tier
    await prisma.stakingTier.create({
      data: {
        id: 'test-tier-1',
        ...TestHelpers.createMockStakingTier(1),
      },
    });

    // Create a stake position
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

    stakePositionSeed = stakeResponse.body.positionSeed;

    // Update position to simulate 1 week has passed
    const position = await prisma.stakePosition.findFirst({
      where: { positionSeed: BigInt(stakePositionSeed) },
    });

    const weekAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60 + 100); // Add 100 seconds buffer to ensure > 7 days
    await prisma.stakePosition.update({
      where: { id: position!.id },
      data: {
        lastRewardTs: BigInt(weekAgo),
        lastClaimTs: BigInt(weekAgo),
      },
    });
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  describe('POST /rewards/claim', () => {
    it('should claim rewards and create NFT vesting receipt', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/rewards/claim')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          positionSeed: stakePositionSeed,
        })
        .expect(200);

      expect(response.body).toHaveProperty('rewardNftId');
      expect(response.body).toHaveProperty('pda');
      expect(response.body).toHaveProperty('nftSeed');
      expect(response.body).toHaveProperty('rewardAmount');
      expect(response.body).toHaveProperty('vestTimestamp');
      expect(response.body).toHaveProperty('weeksElapsed');
      expect(Number(response.body.rewardAmount)).toBeGreaterThan(0);

      // Verify NFT created in database
      const nft = await prisma.rewardNft.findUnique({
        where: { id: response.body.rewardNftId },
      });

      expect(nft).toBeTruthy();
      expect(nft!.owner).toBe(testWallet.publicKey);
      expect(nft!.isActive).toBe(true);
    });

    it('should reject claim before 7-day cooldown', async () => {
      // Update position to recent claim
      const position = await prisma.stakePosition.findFirst({
        where: { positionSeed: BigInt(stakePositionSeed) },
      });

      const now = Math.floor(Date.now() / 1000);
      await prisma.stakePosition.update({
        where: { id: position!.id },
        data: {
          lastClaimTs: BigInt(now - 60), // 1 minute ago
        },
      });

      await request(app.getHttpServer())
        .post('/api/v1/rewards/claim')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          positionSeed: stakePositionSeed,
        })
        .expect(400);
    });

    it('should reject claim for inactive position', async () => {
      // Create and immediately unstake a position
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
        .post('/api/v1/staking/unstake')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ positionSeed: stakeResponse.body.positionSeed })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/rewards/claim')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          positionSeed: stakeResponse.body.positionSeed,
        })
        .expect(400);
    });

    it('should reject claim for non-existent position', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/rewards/claim')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          positionSeed: 999999,
        })
        .expect(404);
    });

    it('should calculate pro-rata rewards correctly', async () => {
      // Create a position with known parameters
      const stakeResponse = await request(app.getHttpServer())
        .post('/api/v1/staking/stake')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 1000000000,
          durationMonths: 12, // 2x multiplier
          tierId: 1,
          isLocked: true,
        })
        .expect(201);

      // Update to simulate 2 weeks passed
      const position = await prisma.stakePosition.findFirst({
        where: { positionSeed: BigInt(stakeResponse.body.positionSeed) },
      });

      const twoWeeksAgo = Math.floor(Date.now() / 1000) - 14 * 24 * 60 * 60;
      await prisma.stakePosition.update({
        where: { id: position!.id },
        data: {
          lastRewardTs: BigInt(twoWeeksAgo),
          lastClaimTs: BigInt(twoWeeksAgo),
        },
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/rewards/claim')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          positionSeed: stakeResponse.body.positionSeed,
        })
        .expect(200);

      expect(response.body.weeksElapsed).toBe(2);
      expect(Number(response.body.rewardAmount)).toBeGreaterThan(0);
    });
  });

  describe('POST /rewards/vest', () => {
    it('should reject vesting before 1 year period', async () => {
      // Create a fresh position for this test to avoid conflicts
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

      const testPositionSeed = stakeResponse.body.positionSeed;
      const position = await prisma.stakePosition.findFirst({
        where: { positionSeed: BigInt(testPositionSeed) },
      });

      // Set lastClaimTs to more than a week ago
      const weekAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60 + 100);
      await prisma.stakePosition.update({
        where: { id: position!.id },
        data: {
          lastRewardTs: BigInt(weekAgo),
          lastClaimTs: BigInt(weekAgo),
        },
      });

      // Claim rewards first
      const claimResponse = await request(app.getHttpServer())
        .post('/api/v1/rewards/claim')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          positionSeed: testPositionSeed,
        })
        .expect(200);

      // Try to vest immediately
      await request(app.getHttpServer())
        .post('/api/v1/rewards/vest')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          nftSeed: claimResponse.body.nftSeed,
        })
        .expect(400);
    });

    it('should reject vesting non-existent NFT', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/rewards/vest')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          nftSeed: 999999,
        })
        .expect(404);
    });

    it('should vest NFT after 1 year period', async () => {
      // Create a fresh position for this test
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

      const testPositionSeed = stakeResponse.body.positionSeed;
      const position = await prisma.stakePosition.findFirst({
        where: { positionSeed: BigInt(testPositionSeed) },
      });

      // Set lastClaimTs to more than a week ago
      const weekAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60 + 100);
      await prisma.stakePosition.update({
        where: { id: position!.id },
        data: {
          lastRewardTs: BigInt(weekAgo),
          lastClaimTs: BigInt(weekAgo),
        },
      });

      // Claim rewards
      const claimResponse = await request(app.getHttpServer())
        .post('/api/v1/rewards/claim')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          positionSeed: testPositionSeed,
        })
        .expect(200);

      // Update NFT to simulate 1 year has passed
      const nft = await prisma.rewardNft.findUnique({
        where: { id: claimResponse.body.rewardNftId },
      });

      const oneYearAgo = Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60;
      await prisma.rewardNft.update({
        where: { id: nft!.id },
        data: {
          vestTs: BigInt(oneYearAgo),
        },
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/rewards/vest')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          nftSeed: claimResponse.body.nftSeed,
        })
        .expect(200);

      expect(response.body).toHaveProperty('amount');
      expect(response.body.amount).toBe(nft!.rewardAmount.toString());

      // Verify NFT marked as inactive
      const updatedNft = await prisma.rewardNft.findUnique({
        where: { id: nft!.id },
      });

      expect(updatedNft!.isActive).toBe(false);
    });
  });

  describe('GET /rewards/nfts', () => {
    it('should return user reward NFTs', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/rewards/nfts')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach((nft: any) => {
        expect(nft).toHaveProperty('pda');
        expect(nft).toHaveProperty('rewardAmount');
        expect(nft).toHaveProperty('vestTs');
        expect(nft.owner).toBe(testWallet.publicKey);
      });
    });

    it('should filter by active status', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/rewards/nfts?isActive=true')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      response.body.forEach((nft: any) => {
        expect(nft.isActive).toBe(true);
      });
    });

    it('should reject unauthenticated request', async () => {
      await request(app.getHttpServer()).get('/api/v1/rewards/nfts').expect(401);
    });
  });
});

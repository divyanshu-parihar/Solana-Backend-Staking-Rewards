import { Test, TestingModule } from '@nestjs/testing';
import { CashbackService } from './cashback.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

describe('CashbackService', () => {
  let service: CashbackService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashbackService,
        {
          provide: PrismaService,
          useValue: {
            cashbackPool: {
              findMany: jest.fn(),
              findFirst: jest.fn(),
              createMany: jest.fn(),
              update: jest.fn(),
            },
            cashbackTransaction: {
              create: jest.fn(),
              findMany: jest.fn(),
            },
            stakingSnapshot: {
              findMany: jest.fn(),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CashbackService>(CashbackService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initializePools', () => {
    it('should create pools if they do not exist', async () => {
      jest.spyOn(prisma.cashbackPool, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.cashbackPool, 'createMany').mockResolvedValue({ count: 2 });

      const result = await service.initializePools();

      expect(result).toHaveProperty('pools');
    });

    it('should return existing pools if already initialized', async () => {
      jest.spyOn(prisma.cashbackPool, 'findMany').mockResolvedValue([
        {
          id: '1',
          poolType: 'PERPETUAL',
          balance: BigInt(0),
          lastFundedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          poolType: 'BONUS',
          balance: BigInt(0),
          lastFundedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.initializePools();

      expect(result).toHaveProperty('pools');
      expect(result.pools).toHaveLength(2);
    });
  });

  describe('fundPools', () => {
    it('should fund both perpetual and bonus pools', async () => {
      jest.spyOn(prisma.cashbackPool, 'findFirst')
        .mockResolvedValueOnce({
          id: '1',
          poolType: 'PERPETUAL',
          balance: BigInt(0),
          lastFundedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .mockResolvedValueOnce({
          id: '2',
          poolType: 'BONUS',
          balance: BigInt(0),
          lastFundedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

      jest.spyOn(prisma.cashbackPool, 'update').mockResolvedValue({
        id: '1',
        poolType: 'PERPETUAL',
        balance: BigInt(1000),
        lastFundedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.fundPools(1000, 1500);

      expect(result.perpetualFunded).toBe(1000);
      expect(result.bonusFunded).toBe(1500);
    });
  });

  describe('distributeCashback', () => {
    it('should return zero cashback if no staking history', async () => {
      jest.spyOn(prisma.stakingSnapshot, 'findMany').mockResolvedValue([]);

      const result = await service.distributeCashback('wallet1', 10000, 'user1');

      expect(result.cashbackAmount).toBe(0);
    });

    it('should calculate and distribute cashback based on 30-day average', async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      jest.spyOn(prisma.stakingSnapshot, 'findMany').mockResolvedValue([
        {
          id: '1',
          userId: 'user1',
          wallet: 'wallet1',
          totalStaked: BigInt(5000000000),
          snapshotDate: thirtyDaysAgo,
        },
        {
          id: '2',
          userId: 'user1',
          wallet: 'wallet1',
          totalStaked: BigInt(5000000000),
          snapshotDate: new Date(),
        },
      ]);

      jest.spyOn(prisma.cashbackPool, 'findFirst')
        .mockResolvedValueOnce({
          id: '2',
          poolType: 'BONUS',
          balance: BigInt(1000000),
          lastFundedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .mockResolvedValueOnce({
          id: '1',
          poolType: 'PERPETUAL',
          balance: BigInt(1000000),
          lastFundedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

      jest.spyOn(prisma.cashbackPool, 'update').mockResolvedValue({
        id: '1',
        poolType: 'BONUS',
        balance: BigInt(900000),
        lastFundedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      jest.spyOn(prisma.cashbackTransaction, 'create').mockResolvedValue({
        id: '1',
        userId: 'user1',
        wallet: 'wallet1',
        amount: BigInt(100),
        poolType: 'BONUS',
        transactionType: 'DEBIT',
        metadata: {},
        createdAt: new Date(),
      });

      const result = await service.distributeCashback('wallet1', 10000000000, 'user1');

      expect(result.cashbackAmount).toBeGreaterThan(0);
      expect(result).toHaveProperty('averageStaked');
    });
  });
});

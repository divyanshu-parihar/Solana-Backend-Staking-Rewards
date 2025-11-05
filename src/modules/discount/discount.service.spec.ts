import { Test, TestingModule } from '@nestjs/testing';
import { DiscountService } from './discount.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

describe('DiscountService', () => {
  let service: DiscountService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscountService,
        {
          provide: PrismaService,
          useValue: {
            stakingSnapshot: {
              findMany: jest.fn(),
              createMany: jest.fn(),
              deleteMany: jest.fn(),
              count: jest.fn(),
            },
            stakePosition: {
              groupBy: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
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

    service = module.get<DiscountService>(DiscountService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculate30DayAverage', () => {
    it('should return 0 if no snapshots', async () => {
      jest.spyOn(prisma.stakingSnapshot, 'findMany').mockResolvedValue([]);

      const result = await service.calculate30DayAverage('wallet1');

      expect(result).toBe(0);
    });

    it('should calculate correct 30-day average', async () => {
      const mockSnapshots = [
        {
          id: '1',
          userId: 'user1',
          wallet: 'wallet1',
          totalStaked: BigInt(1000000000),
          snapshotDate: new Date(),
        },
        {
          id: '2',
          userId: 'user1',
          wallet: 'wallet1',
          totalStaked: BigInt(2000000000),
          snapshotDate: new Date(),
        },
      ];

      jest.spyOn(prisma.stakingSnapshot, 'findMany').mockResolvedValue(mockSnapshots);

      const result = await service.calculate30DayAverage('wallet1');

      expect(result).toBe(1500000000); // Average of 1B and 2B
    });
  });

  describe('getFeeDiscount', () => {
    it('should return 0% discount for low stake', async () => {
      jest.spyOn(prisma.stakingSnapshot, 'findMany').mockResolvedValue([
        {
          id: '1',
          userId: 'user1',
          wallet: 'wallet1',
          totalStaked: BigInt(500000000),
          snapshotDate: new Date(),
        },
      ]);

      jest.spyOn(prisma.stakingSnapshot, 'count').mockResolvedValue(1);

      const result = await service.getFeeDiscount('wallet1');

      expect(result.feeDiscountPercentage).toBe(0);
    });

    it('should return 5% discount for medium stake', async () => {
      jest.spyOn(prisma.stakingSnapshot, 'findMany').mockResolvedValue([
        {
          id: '1',
          userId: 'user1',
          wallet: 'wallet1',
          totalStaked: BigInt(5000000000),
          snapshotDate: new Date(),
        },
      ]);

      jest.spyOn(prisma.stakingSnapshot, 'count').mockResolvedValue(1);

      const result = await service.getFeeDiscount('wallet1');

      expect(result.feeDiscountPercentage).toBe(5);
    });

    it('should return 20% discount for high stake', async () => {
      jest.spyOn(prisma.stakingSnapshot, 'findMany').mockResolvedValue([
        {
          id: '1',
          userId: 'user1',
          wallet: 'wallet1',
          totalStaked: BigInt(150000000000),
          snapshotDate: new Date(),
        },
      ]);

      jest.spyOn(prisma.stakingSnapshot, 'count').mockResolvedValue(1);

      const result = await service.getFeeDiscount('wallet1');

      expect(result.feeDiscountPercentage).toBe(20);
    });
  });
});

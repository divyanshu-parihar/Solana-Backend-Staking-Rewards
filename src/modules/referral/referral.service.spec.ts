import { Test, TestingModule } from '@nestjs/testing';
import { ReferralService } from './referral.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException } from '@nestjs/common';

describe('ReferralService', () => {
  let service: ReferralService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralService,
        {
          provide: PrismaService,
          useValue: {
            referral: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              findMany: jest.fn(),
              updateMany: jest.fn(),
            },
            deviceFingerprint: {
              create: jest.fn(),
              findMany: jest.fn(),
            },
            referralReward: {
              create: jest.fn(),
              findMany: jest.fn(),
            },
            programState: {
              findFirst: jest.fn(),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'referral.welcomeBonus') return 500000000;
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ReferralService>(ReferralService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createReferral', () => {
    it('should prevent self-referrals', async () => {
      await expect(
        service.createReferral('wallet1', 'wallet1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should prevent duplicate referrals', async () => {
      jest.spyOn(prisma.referral, 'findUnique').mockResolvedValue({
        id: '1',
        referrerWallet: 'wallet1',
        referredWallet: 'wallet2',
        welcomeBonusPaid: false,
        totalRewards: BigInt(0),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        service.createReferral('wallet1', 'wallet2'),
      ).rejects.toThrow(ConflictException);
    });

    it('should create referral successfully', async () => {
      jest.spyOn(prisma.referral, 'findUnique').mockResolvedValue(null);
      jest.spyOn(prisma.referral, 'create').mockResolvedValue({
        id: '1',
        referrerWallet: 'wallet1',
        referredWallet: 'wallet2',
        welcomeBonusPaid: false,
        totalRewards: BigInt(0),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createReferral('wallet1', 'wallet2');

      expect(result).toHaveProperty('referralId');
      expect(result.referrerWallet).toBe('wallet1');
      expect(result.referredWallet).toBe('wallet2');
    });
  });

  describe('payWelcomeBonus', () => {
    it('should throw error if referral not found', async () => {
      jest.spyOn(prisma.referral, 'findUnique').mockResolvedValue(null);

      await expect(
        service.payWelcomeBonus('wallet2'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error if bonus already paid', async () => {
      jest.spyOn(prisma.referral, 'findUnique').mockResolvedValue({
        id: '1',
        referrerWallet: 'wallet1',
        referredWallet: 'wallet2',
        welcomeBonusPaid: true,
        totalRewards: BigInt(0),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        service.payWelcomeBonus('wallet2'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should pay welcome bonus successfully', async () => {
      jest.spyOn(prisma.referral, 'findUnique').mockResolvedValue({
        id: '1',
        referrerWallet: 'wallet1',
        referredWallet: 'wallet2',
        welcomeBonusPaid: false,
        totalRewards: BigInt(0),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      jest.spyOn(prisma.referral, 'update').mockResolvedValue({
        id: '1',
        referrerWallet: 'wallet1',
        referredWallet: 'wallet2',
        welcomeBonusPaid: true,
        totalRewards: BigInt(0),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.payWelcomeBonus('wallet2');

      expect(result.bonusAmount).toBe(500000000);
      expect(result.wallet).toBe('wallet2');
    });
  });
});

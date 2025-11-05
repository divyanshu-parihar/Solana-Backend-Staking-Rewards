import { Test, TestingModule } from '@nestjs/testing';
import { StakingService } from './staking.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ProgramService } from '@modules/program/program.service';
import { ConfigService } from '@nestjs/config';
import * as anchor from '@coral-xyz/anchor';

describe('StakingService - Penalty Logic', () => {
  let service: StakingService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StakingService,
        {
          provide: PrismaService,
          useValue: {
            stakePosition: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            stakingTier: {
              findUnique: jest.fn(),
            },
            penaltyTransaction: {
              create: jest.fn(),
            },
            programState: {
              findFirst: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: ProgramService,
          useValue: {
            convertToPublicKey: jest.fn(),
            findStakePositionPda: jest.fn(() => ['pda', 0]),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'staking.cooldownPeriod') return 604800;
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<StakingService>(StakingService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Early Unstake Penalty', () => {
    it('should apply 5% penalty for tier 1 early unstake', async () => {
      const now = Math.floor(Date.now() / 1000);
      const unlockTs = now + 86400; // Unlock in future (early unstake)

      jest.spyOn(prisma.stakePosition, 'findUnique').mockResolvedValue({
        id: 'pos1',
        owner: 'wallet1',
        pda: 'pda1',
        amount: BigInt(1000000000), // 1B tokens
        durationMonths: 3,
        tierId: 1,
        isLocked: true,
        powerMultiplier: BigInt(100),
        stakingPower: BigInt(1000000000),
        startTs: BigInt(now - 86400),
        unlockTs: BigInt(unlockTs),
        lastRewardTs: BigInt(now),
        lastClaimTs: BigInt(now),
        cooldownEnd: null,
        pendingPrincipal: null,
        isActive: true,
        positionSeed: BigInt(123),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      jest.spyOn(prisma.penaltyTransaction, 'create').mockResolvedValue({
        id: 'penalty1',
        positionId: 'pos1',
        wallet: 'wallet1',
        penaltyAmount: BigInt(50000000), // 5% of 1B
        toRewardPool: BigInt(25000000),
        toProtocol: BigInt(25000000),
        tierMultiplier: 500,
        createdAt: new Date(),
      });

      jest.spyOn(prisma.programState, 'findFirst').mockResolvedValue({
        id: 'state1',
        programId: 'program1',
        rewardTokenMint: 'mint1',
        isPaused: false,
        currentEpoch: BigInt(1),
        currentEpochStartTs: BigInt(now),
        currentWeeklyEmission: null,
        totalStaked: BigInt(0),
        totalRewardPool: BigInt(1000000000),
        totalStakingPower: BigInt(0),
        updatedAt: new Date(),
      });

      jest.spyOn(prisma.programState, 'update').mockResolvedValue({
        id: 'state1',
        programId: 'program1',
        rewardTokenMint: 'mint1',
        isPaused: false,
        currentEpoch: BigInt(1),
        currentEpochStartTs: BigInt(now),
        currentWeeklyEmission: null,
        totalStaked: BigInt(0),
        totalRewardPool: BigInt(1025000000), // Increased by 25M (50% of penalty)
        totalStakingPower: BigInt(0),
        updatedAt: new Date(),
      });

      jest.spyOn(prisma.stakePosition, 'update').mockResolvedValue({
        id: 'pos1',
        owner: 'wallet1',
        pda: 'pda1',
        amount: BigInt(1000000000),
        durationMonths: 3,
        tierId: 1,
        isLocked: true,
        powerMultiplier: BigInt(100),
        stakingPower: BigInt(1000000000),
        startTs: BigInt(now - 86400),
        unlockTs: BigInt(unlockTs),
        lastRewardTs: BigInt(now),
        lastClaimTs: BigInt(now),
        cooldownEnd: BigInt(now + 604800),
        pendingPrincipal: BigInt(950000000), // 1B - 50M penalty
        isActive: false,
        positionSeed: BigInt(123),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.unstakeTokens('wallet1', 123);

      expect(result.isEarlyUnstake).toBe(true);
      expect(prisma.penaltyTransaction.create).toHaveBeenCalled();
    });

    it('should apply 7.5% penalty for tier 2 early unstake', async () => {
      const now = Math.floor(Date.now() / 1000);
      const unlockTs = now + 86400;

      jest.spyOn(prisma.stakePosition, 'findUnique').mockResolvedValue({
        id: 'pos1',
        owner: 'wallet1',
        pda: 'pda1',
        amount: BigInt(1000000000),
        durationMonths: 6,
        tierId: 2, // Tier 2 = 7.5% penalty
        isLocked: true,
        powerMultiplier: BigInt(150),
        stakingPower: BigInt(1500000000),
        startTs: BigInt(now - 86400),
        unlockTs: BigInt(unlockTs),
        lastRewardTs: BigInt(now),
        lastClaimTs: BigInt(now),
        cooldownEnd: null,
        pendingPrincipal: null,
        isActive: true,
        positionSeed: BigInt(123),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const penaltyCreateSpy = jest.spyOn(prisma.penaltyTransaction, 'create');
      penaltyCreateSpy.mockResolvedValue({
        id: 'penalty1',
        positionId: 'pos1',
        wallet: 'wallet1',
        penaltyAmount: BigInt(75000000), // 7.5% of 1B
        toRewardPool: BigInt(37500000),
        toProtocol: BigInt(37500000),
        tierMultiplier: 750,
        createdAt: new Date(),
      } as any);

      jest.spyOn(prisma.programState, 'findFirst').mockResolvedValue({
        id: 'state1',
        programId: 'program1',
        rewardTokenMint: 'mint1',
        isPaused: false,
        currentEpoch: BigInt(1),
        currentEpochStartTs: BigInt(now),
        currentWeeklyEmission: null,
        totalStaked: BigInt(0),
        totalRewardPool: BigInt(1000000000),
        totalStakingPower: BigInt(0),
        updatedAt: new Date(),
      });

      jest.spyOn(prisma.programState, 'update').mockResolvedValue({
        id: 'state1',
        programId: 'program1',
        rewardTokenMint: 'mint1',
        isPaused: false,
        currentEpoch: BigInt(1),
        currentEpochStartTs: BigInt(now),
        currentWeeklyEmission: null,
        totalStaked: BigInt(0),
        totalRewardPool: BigInt(1037500000),
        totalStakingPower: BigInt(0),
        updatedAt: new Date(),
      });

      jest.spyOn(prisma.stakePosition, 'update').mockResolvedValue({
        id: 'pos1',
        owner: 'wallet1',
        pda: 'pda1',
        amount: BigInt(1000000000),
        durationMonths: 6,
        tierId: 2,
        isLocked: true,
        powerMultiplier: BigInt(150),
        stakingPower: BigInt(1500000000),
        startTs: BigInt(now - 86400),
        unlockTs: BigInt(unlockTs),
        lastRewardTs: BigInt(now),
        lastClaimTs: BigInt(now),
        cooldownEnd: BigInt(now + 604800),
        pendingPrincipal: BigInt(925000000), // 1B - 75M penalty
        isActive: false,
        positionSeed: BigInt(123),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.unstakeTokens('wallet1', 123);

      expect(prisma.penaltyTransaction.create).toHaveBeenCalled();
    });

    it('should not apply penalty for mature unstake', async () => {
      const now = Math.floor(Date.now() / 1000);
      const unlockTs = now - 86400; // Already unlocked

      jest.spyOn(prisma.stakePosition, 'findUnique').mockResolvedValue({
        id: 'pos1',
        owner: 'wallet1',
        pda: 'pda1',
        amount: BigInt(1000000000),
        durationMonths: 3,
        tierId: 1,
        isLocked: true,
        powerMultiplier: BigInt(100),
        stakingPower: BigInt(1000000000),
        startTs: BigInt(now - 7776000),
        unlockTs: BigInt(unlockTs),
        lastRewardTs: BigInt(now),
        lastClaimTs: BigInt(now),
        cooldownEnd: null,
        pendingPrincipal: null,
        isActive: true,
        positionSeed: BigInt(123),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      jest.spyOn(prisma.stakePosition, 'update').mockResolvedValue({
        id: 'pos1',
        owner: 'wallet1',
        pda: 'pda1',
        amount: BigInt(1000000000),
        durationMonths: 3,
        tierId: 1,
        isLocked: true,
        powerMultiplier: BigInt(100),
        stakingPower: BigInt(1000000000),
        startTs: BigInt(now - 7776000),
        unlockTs: BigInt(unlockTs),
        lastRewardTs: BigInt(now),
        lastClaimTs: BigInt(now),
        cooldownEnd: BigInt(now + 604800),
        pendingPrincipal: BigInt(1000000000), // Full amount, no penalty
        isActive: false,
        positionSeed: BigInt(123),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.unstakeTokens('wallet1', 123);

      expect(result.isEarlyUnstake).toBe(false);
      expect(prisma.penaltyTransaction.create).not.toHaveBeenCalled();
    });
  });
});

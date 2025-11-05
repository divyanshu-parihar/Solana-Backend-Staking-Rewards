import { Injectable, Logger, BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async createReferral(
    referrerWallet: string,
    referredWallet: string,
    deviceId?: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    try {
      // Prevent self-referrals
      if (referrerWallet === referredWallet) {
        throw new BadRequestException('Cannot refer yourself');
      }

      // Check if user is already referred
      const existing = await this.prisma.referral.findUnique({
        where: { referredWallet },
      });

      if (existing) {
        throw new ConflictException('User already has a referrer');
      }

      // Anti-fraud: Check device fingerprint
      if (deviceId) {
        const fraudCheck = await this.checkDeviceFingerprint(
          referrerWallet,
          referredWallet,
          deviceId,
          ipAddress,
        );
        if (!fraudCheck.isValid) {
          throw new BadRequestException(fraudCheck.reason);
        }
      }

      // Create referral record
      const referral = await this.prisma.referral.create({
        data: {
          id: uuidv4(),
          referrerWallet,
          referredWallet,
          welcomeBonusPaid: false,
          totalRewards: BigInt(0),
          isActive: true,
        },
      });

      // Store device fingerprint
      if (deviceId) {
        await this.prisma.deviceFingerprint.create({
          data: {
            id: uuidv4(),
            wallet: referredWallet,
            deviceId,
            ipAddress: ipAddress || null,
            userAgent: userAgent || null,
          },
        });
      }

      this.logger.log(`Referral created: ${referrerWallet} -> ${referredWallet}`);

      return {
        referralId: referral.id,
        referrerWallet: referral.referrerWallet,
        referredWallet: referral.referredWallet,
        message: 'Referral created successfully',
      };
    } catch (error) {
      this.logger.error(`Create referral error: ${error.message}`, error.stack);
      throw error;
    }
  }

  async payWelcomeBonus(referredWallet: string) {
    try {
      const referral = await this.prisma.referral.findUnique({
        where: { referredWallet },
      });

      if (!referral) {
        throw new BadRequestException('Referral not found');
      }

      if (referral.welcomeBonusPaid) {
        throw new BadRequestException('Welcome bonus already paid');
      }

      const welcomeBonus = this.configService.get<number>('referral.welcomeBonus') || 500000000; // 500 FT default

      // Mark bonus as paid
      await this.prisma.referral.update({
        where: { referredWallet },
        data: { welcomeBonusPaid: true },
      });

      this.logger.log(`Welcome bonus paid: ${welcomeBonus} to ${referredWallet}`);

      return {
        wallet: referredWallet,
        bonusAmount: welcomeBonus,
        message: 'Welcome bonus of 500 FT paid successfully',
      };
    } catch (error) {
      this.logger.error(`Pay welcome bonus error: ${error.message}`, error.stack);
      throw error;
    }
  }

  async distributeReferralRewards(epoch: number) {
    try {
      // Get active referrals
      const referrals = await this.prisma.referral.findMany({
        where: { isActive: true },
      });

      // Get program state for reward pool calculation
      const programState = await this.prisma.programState.findFirst();
      if (!programState) {
        throw new BadRequestException('Program state not initialized');
      }

      const weeklyEmissionRate = 21;
      const emissionPrecision = 10000;
      const totalRewardPool = Number(programState.totalRewardPool);
      const weeklyPoolEmission = Math.floor(
        (totalRewardPool * weeklyEmissionRate) / emissionPrecision,
      );

      // 30% of weekly emission goes to referral pool
      const referralPoolShare = Math.floor((weeklyPoolEmission * 30) / 100);

      // Distribute proportionally to referrers based on number of active referrals
      const referrerCounts = new Map<string, number>();
      referrals.forEach((ref) => {
        const count = referrerCounts.get(ref.referrerWallet) || 0;
        referrerCounts.set(ref.referrerWallet, count + 1);
      });

      const totalReferrals = referrals.length;
      const rewardPerReferral = totalReferrals > 0 ? Math.floor(referralPoolShare / totalReferrals) : 0;

      let distributedCount = 0;
      for (const [referrerWallet, count] of referrerCounts.entries()) {
        const referrerReward = rewardPerReferral * count;

        if (referrerReward > 0) {
          // Create referral reward record
          await this.prisma.referralReward.create({
            data: {
              id: uuidv4(),
              referralId: uuidv4(), // You may want to link to specific referrals
              referrerWallet,
              amount: BigInt(referrerReward),
              epoch: BigInt(epoch),
            },
          });

          // Update total rewards for each referral
          await this.prisma.referral.updateMany({
            where: { referrerWallet },
            data: {
              totalRewards: { increment: BigInt(referrerReward) },
            },
          });

          distributedCount++;
        }
      }

      this.logger.log(
        `Referral rewards distributed for epoch ${epoch}: ${distributedCount} referrers, ${referralPoolShare} tokens`,
      );

      return {
        epoch,
        referralPoolShare,
        referrersRewarded: distributedCount,
        totalReferrals,
        message: 'Referral rewards distributed successfully',
      };
    } catch (error) {
      this.logger.error(`Distribute referral rewards error: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getReferralStats(wallet: string) {
    try {
      // Get referrals where this wallet is the referrer
      const referrals = await this.prisma.referral.findMany({
        where: { referrerWallet: wallet, isActive: true },
      });

      // Get total rewards
      const rewards = await this.prisma.referralReward.findMany({
        where: { referrerWallet: wallet },
      });

      const totalRewards = rewards.reduce((sum, r) => sum + Number(r.amount), 0);

      return {
        wallet,
        totalReferrals: referrals.length,
        activeReferrals: referrals.filter((r) => r.isActive).length,
        totalRewardsEarned: totalRewards.toString(),
        referrals: referrals.map((r) => ({
          referredWallet: r.referredWallet,
          welcomeBonusPaid: r.welcomeBonusPaid,
          totalRewards: r.totalRewards.toString(),
          createdAt: r.createdAt,
        })),
      };
    } catch (error) {
      this.logger.error(`Get referral stats error: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async checkDeviceFingerprint(
    referrerWallet: string,
    referredWallet: string,
    deviceId: string,
    ipAddress?: string,
  ): Promise<{ isValid: boolean; reason?: string }> {
    // Check if same device has been used by referrer
    const referrerDevices = await this.prisma.deviceFingerprint.findMany({
      where: { wallet: referrerWallet },
    });

    // Check if device ID matches
    const deviceMatch = referrerDevices.find((d) => d.deviceId === deviceId);
    if (deviceMatch) {
      return {
        isValid: false,
        reason: 'Referrer and referred user cannot use the same device',
      };
    }

    // Check IP address if provided
    if (ipAddress) {
      const ipMatch = referrerDevices.find((d) => d.ipAddress === ipAddress);
      if (ipMatch) {
        this.logger.warn(
          `Same IP detected for referral: ${referrerWallet} -> ${referredWallet} (${ipAddress})`,
        );
        // We log but don't block, as IP sharing can be legitimate (office, home network)
      }
    }

    return { isValid: true };
  }
}

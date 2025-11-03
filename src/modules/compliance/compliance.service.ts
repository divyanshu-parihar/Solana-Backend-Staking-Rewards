import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';

export enum ComplianceStatus {
  APPROVED = 'APPROVED',
  DENIED = 'DENIED',
  PENDING = 'PENDING',
  UNKNOWN = 'UNKNOWN',
}

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(private prisma: PrismaService) {}

  async getComplianceStatus(wallet: string) {
    try {
      const status = await this.prisma.complianceStatus.findUnique({
        where: { wallet },
      });

      if (!status) {
        return {
          wallet,
          status: ComplianceStatus.UNKNOWN,
          source: null,
          message: 'No compliance record found',
        };
      }

      return {
        wallet: status.wallet,
        status: status.status,
        source: status.source,
        updatedAt: status.updatedAt,
      };
    } catch (error) {
      this.logger.error(`Error checking compliance for ${wallet}: ${error.message}`);
      throw error;
    }
  }

  async addToAllowlist(wallet: string, source?: string) {
    try {
      const existing = await this.prisma.complianceStatus.findUnique({
        where: { wallet },
      });

      if (existing?.status === ComplianceStatus.DENIED) {
        throw new BadRequestException('Wallet is on denylist and cannot be added to allowlist');
      }

      const status = await this.prisma.complianceStatus.upsert({
        where: { wallet },
        create: {
          wallet,
          status: ComplianceStatus.APPROVED,
          source: source || 'manual',
        },
        update: {
          status: ComplianceStatus.APPROVED,
          source: source || 'manual',
        },
      });

      this.logger.log(`Wallet ${wallet} added to allowlist`);

      return {
        wallet: status.wallet,
        status: status.status,
        source: status.source,
        message: 'Wallet added to allowlist successfully',
      };
    } catch (error) {
      this.logger.error(`Error adding ${wallet} to allowlist: ${error.message}`);
      throw error;
    }
  }

  async addToDenylist(wallet: string, source?: string) {
    try {
      const status = await this.prisma.complianceStatus.upsert({
        where: { wallet },
        create: {
          wallet,
          status: ComplianceStatus.DENIED,
          source: source || 'manual',
        },
        update: {
          status: ComplianceStatus.DENIED,
          source: source || 'manual',
        },
      });

      this.logger.warn(`Wallet ${wallet} added to denylist`);

      return {
        wallet: status.wallet,
        status: status.status,
        source: status.source,
        message: 'Wallet added to denylist',
      };
    } catch (error) {
      this.logger.error(`Error adding ${wallet} to denylist: ${error.message}`);
      throw error;
    }
  }

  async removeFromList(wallet: string) {
    try {
      await this.prisma.complianceStatus.delete({
        where: { wallet },
      });

      this.logger.log(`Wallet ${wallet} removed from compliance lists`);

      return {
        wallet,
        message: 'Wallet removed from compliance lists',
      };
    } catch (error) {
      if (error.code === 'P2025') {
        throw new BadRequestException('Wallet not found in compliance lists');
      }
      this.logger.error(`Error removing ${wallet} from lists: ${error.message}`);
      throw error;
    }
  }

  async validateWallet(wallet: string): Promise<boolean> {
    try {
      const status = await this.prisma.complianceStatus.findUnique({
        where: { wallet },
      });

      if (!status) {
        return true;
      }

      if (status.status === ComplianceStatus.DENIED) {
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`Error validating wallet ${wallet}: ${error.message}`);
      return true;
    }
  }

  async syncAllowlist(wallets: string[], source: string) {
    try {
      const results = [];

      for (const wallet of wallets) {
        try {
          await this.prisma.complianceStatus.upsert({
            where: { wallet },
            create: {
              wallet,
              status: ComplianceStatus.APPROVED,
              source,
            },
            update: {
              status: ComplianceStatus.APPROVED,
              source,
            },
          });

          results.push({ wallet, success: true });
        } catch (error) {
          results.push({ wallet, success: false, error: error.message });
        }
      }

      const successCount = results.filter((r) => r.success).length;

      this.logger.log(`Synced allowlist: ${successCount}/${wallets.length} wallets from ${source}`);

      return {
        total: wallets.length,
        successful: successCount,
        failed: wallets.length - successCount,
        results,
      };
    } catch (error) {
      this.logger.error(`Error syncing allowlist: ${error.message}`);
      throw error;
    }
  }

  async getComplianceStats() {
    try {
      const stats = await this.prisma.complianceStatus.groupBy({
        by: ['status'],
        _count: true,
      });

      const total = await this.prisma.complianceStatus.count();

      return {
        total,
        byStatus: stats.map((s) => ({
          status: s.status,
          count: s._count,
        })),
      };
    } catch (error) {
      this.logger.error(`Error getting compliance stats: ${error.message}`);
      throw error;
    }
  }
}

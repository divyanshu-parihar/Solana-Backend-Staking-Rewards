import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProgramService } from '@modules/program/program.service';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private startTime: number;

  constructor(
    private prisma: PrismaService,
    private programService: ProgramService,
  ) {
    this.startTime = Date.now();
  }

  async check() {
    const checks = await Promise.allSettled([this.checkDatabase(), this.checkSolana()]);

    const dbCheck =
      checks[0].status === 'fulfilled'
        ? checks[0].value
        : { status: 'unhealthy', error: (checks[0] as any).reason.message };
    const solanaCheck =
      checks[1].status === 'fulfilled'
        ? checks[1].value
        : { status: 'unhealthy', error: (checks[1] as any).reason.message };

    const isHealthy = dbCheck.status === 'healthy' && solanaCheck.status === 'healthy';

    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks: {
        database: dbCheck,
        solana: solanaCheck,
      },
    };
  }

  async readiness() {
    try {
      await this.checkDatabase();
      await this.checkSolana();

      return {
        status: 'ready',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Readiness check failed', error);
      throw error;
    }
  }

  async liveness() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  private async checkDatabase() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'healthy', responseTime: 0 };
    } catch (error) {
      this.logger.error('Database check failed', error);
      return { status: 'unhealthy', error: error.message };
    }
  }

  private async checkSolana() {
    try {
      const connection = this.programService.getConnection();
      const startTime = Date.now();
      await connection.getLatestBlockhash();
      const responseTime = Date.now() - startTime;

      return { status: 'healthy', responseTime };
    } catch (error) {
      this.logger.error('Solana check failed', error);
      return { status: 'unhealthy', error: error.message };
    }
  }
}

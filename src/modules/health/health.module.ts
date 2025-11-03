import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProgramModule } from '@modules/program/program.module';

@Module({
  imports: [PrismaModule, ProgramModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}

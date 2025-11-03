import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StakingService } from './staking.service';
import { StakingController } from './staking.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProgramModule } from '@modules/program/program.module';
import { AuthModule } from '@modules/auth/auth.module';

@Module({
  imports: [PrismaModule, ProgramModule, ConfigModule, AuthModule],
  controllers: [StakingController],
  providers: [StakingService],
  exports: [StakingService],
})
export class StakingModule {}

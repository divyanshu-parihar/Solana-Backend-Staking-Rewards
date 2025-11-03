import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RewardsService } from './rewards.service';
import { RewardsController } from './rewards.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProgramModule } from '@modules/program/program.module';
import { AuthModule } from '@modules/auth/auth.module';

@Module({
  imports: [PrismaModule, ProgramModule, ConfigModule, AuthModule],
  controllers: [RewardsController],
  providers: [RewardsService],
  exports: [RewardsService],
})
export class RewardsModule {}

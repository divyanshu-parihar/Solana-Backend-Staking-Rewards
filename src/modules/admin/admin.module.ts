import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProgramModule } from '@modules/program/program.module';
import { AuthModule } from '@modules/auth/auth.module';

@Module({
  imports: [PrismaModule, ProgramModule, ConfigModule, AuthModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}

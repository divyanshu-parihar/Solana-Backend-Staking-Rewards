import { Module } from '@nestjs/common';
import { PrismaModule } from '@prisma/prisma.module';
import { ProgramModule } from '@modules/program/program.module';
import { InsightsService } from './insights.service';
import { InsightsController } from './insights.controller';

@Module({
  imports: [PrismaModule, ProgramModule],
  controllers: [InsightsController],
  providers: [InsightsService],
  exports: [InsightsService],
})
export class InsightsModule {}

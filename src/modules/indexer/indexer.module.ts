import { Module } from '@nestjs/common';
import { PrismaModule } from '@prisma/prisma.module';
import { ProgramModule } from '@modules/program/program.module';
import { IndexerService } from './indexer.service';
import { IndexerController } from './indexer.controller';

@Module({
  imports: [PrismaModule, ProgramModule],
  controllers: [IndexerController],
  providers: [IndexerService],
  exports: [IndexerService],
})
export class IndexerModule {}

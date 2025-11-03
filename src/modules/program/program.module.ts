import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProgramService } from './program.service';

@Module({
  imports: [ConfigModule],
  providers: [ProgramService],
  exports: [ProgramService],
})
export class ProgramModule {}

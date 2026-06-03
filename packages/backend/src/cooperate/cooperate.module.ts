import { Module } from '@nestjs/common';
import { CooperateController } from './cooperate.controller';
import { CooperateService } from './cooperate.service';

@Module({
  controllers: [CooperateController],
  providers: [CooperateService],
  exports: [CooperateService],
})
export class CooperateModule {}

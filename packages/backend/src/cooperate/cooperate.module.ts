import { Module } from '@nestjs/common';
import { CooperateController } from './cooperate.controller';
import { CooperateService } from './cooperate.service';
import { RolesModule } from '../roles/roles.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [RolesModule, CommonModule],
  controllers: [CooperateController],
  providers: [CooperateService],
  exports: [CooperateService],
})
export class CooperateModule {}

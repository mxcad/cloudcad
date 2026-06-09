import { Module } from '@nestjs/common';
import { ShareController } from './share.controller';
import { ShareService } from './share.service';
import { RolesModule } from '../roles/roles.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [RolesModule, CommonModule],
  controllers: [ShareController],
  providers: [ShareService],
  exports: [ShareService],
})
export class ShareModule {}

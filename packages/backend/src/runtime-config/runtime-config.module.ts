import { Module } from '@nestjs/common';
import { RuntimeConfigService } from './runtime-config.service';

@Module({
  providers: [RuntimeConfigService],
  exports: [RuntimeConfigService],
})
export class RuntimeConfigModule {}

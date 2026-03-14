import { Module } from '@nestjs/common';
import { RuntimeConfigService } from './runtime-config.service';
import { RuntimeConfigController } from './runtime-config.controller';

@Module({
  controllers: [RuntimeConfigController],
  providers: [RuntimeConfigService],
  exports: [RuntimeConfigService],
})
export class RuntimeConfigModule {}

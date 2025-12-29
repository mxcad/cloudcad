import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [CommonModule],
  controllers: [AdminController],
})
export class AdminModule {}


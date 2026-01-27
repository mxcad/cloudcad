import { Module, forwardRef } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { AuditLogController } from './audit-log.controller';
import { DatabaseModule } from '../database/database.module';
import { CommonModule } from '../common/common.module';

/**
 * 审计日志模块
 *
 * 功能：
 * 1. 提供审计日志服务
 * 2. 提供审计日志 API
 * 3. 集成到应用中
 */
@Module({
  imports: [DatabaseModule, forwardRef(() => CommonModule)],
  controllers: [AuditLogController],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}

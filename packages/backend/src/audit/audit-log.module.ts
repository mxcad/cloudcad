///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { forwardRef, Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { AuditArchiveService } from './audit-archive.service';
import { AuditLogger, registerAuditLoggerInstance } from './audit-logger.service';
import { AuditLogController } from './audit-log.controller';
import { ProjectAuditLogController } from './project-audit-log.controller';
import { DatabaseModule } from '../database/database.module';
import { CommonModule } from '../common/common.module';
import { PermissionModule } from '../permission/permission.module';
import { AlertModule } from '../alert/alert.module';
import { ClsService } from 'nestjs-cls';

/**
 * 审计日志模块
 *
 * 功能：
 * 1. 提供审计日志服务
 * 2. 提供审计日志 API（SYSTEM_ADMIN 管理 + 项目成员只读）
 * 3. 集成到应用中
 */
@Module({
  // forwardRef：与 AlertModule 互为依赖（AlertModule 反向 import 本模块解环），
  // 循环依赖需双方 forwardRef（并行会话在 alert.module 已加，此处同步）
  imports: [
    DatabaseModule,
    CommonModule,
    PermissionModule,
    forwardRef(() => AlertModule),
  ],
  controllers: [AuditLogController, ProjectAuditLogController],
  providers: [
    AuditLogService,
    // #322：超期审计日志按月归档 CSV + SHA-256 清单（fail-closed），供 audit-cleanup 调度器消费
    AuditArchiveService,
    {
      provide: AuditLogger,
      useFactory: (auditLogService: AuditLogService, cls: ClsService) => {
        const logger = new AuditLogger(cls);
        logger.setAuditLogService(auditLogService);
        // 注册模块级单例，供 @Audit 装饰器等非 DI 消费者全局解析
        registerAuditLoggerInstance(logger);
        return logger;
      },
      inject: [AuditLogService, ClsService],
    },
  ],
  exports: [AuditLogService, AuditArchiveService, AuditLogger],
})
export class AuditLogModule {}

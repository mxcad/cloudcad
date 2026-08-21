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

import { ConsoleLogger, Injectable } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { AuditAction, ResourceType } from '../common/enums/audit.enum';
import { ClsService } from 'nestjs-cls';

let auditLoggerInstance: AuditLogger | null = null;

/**
 * 注册全局 AuditLogger 实例（由 AuditLogModule 的 provider factory 调用），
 * 使 @Audit 装饰器等非 DI 消费者可解析获取
 */
export function registerAuditLoggerInstance(logger: AuditLogger | null): void {
  auditLoggerInstance = logger;
}

/**
 * 获取全局 AuditLogger 实例；未注册时返回 null（调用方跳过审计，不抛错）
 */
export function getAuditLoggerInstance(): AuditLogger | null {
  return auditLoggerInstance;
}

@Injectable()
export class AuditLogger extends ConsoleLogger {
  private auditLogService: AuditLogService | null = null;

  constructor(private readonly cls: ClsService) {
    super('Audit');
  }

  setAuditLogService(service: AuditLogService): void {
    this.auditLogService = service;
  }

  log(message: any, context?: string): void {
    // 调用父类 log 方法保证控制台输出
    super.log(message, context);

    // 仅当 context 为 'audit' 且审计日志服务可用时，写入数据库
    if (context === 'audit' && this.auditLogService) {
      this.writeToAudit(message).catch((err) => {
        // 审计日志写入失败仅记录错误，不中断主流程
        super.error(`审计日志写入失败: ${err.message}`, err.stack, 'AuditLogger');
      });
    }
  }

  /**
   * 手动记录审计日志的便捷方法
   * 自动从 CLS 获取 requestId、clientIp、userAgent
   */
  async audit(params: {
    action: AuditAction;
    resourceType: ResourceType;
    resourceId?: string;
    projectId?: string;
    resourceName?: string;
    userId: string;
    success: boolean;
    errorMessage?: string;
    details?: Record<string, any>;
    params?: Record<string, unknown> | null;
  }): Promise<void> {
    if (!this.auditLogService) {
      super.warn('AuditLogService 未初始化，跳过审计日志记录', 'AuditLogger');
      return;
    }

    const { action, resourceType, resourceId, projectId, resourceName, userId, success, errorMessage, details, params: structuredParams } = params;

    // 从 CLS 自动获取上下文信息
    const requestId = this.cls.get<string>('requestId');
    const traceId = this.cls.get<string>('traceId');
    const clientIp = this.cls.get<string>('clientIp');
    const userAgent = this.cls.get<string>('userAgent');

    await this.auditLogService.log(
      action,
      resourceType,
      resourceId,
      userId,
      success,
      errorMessage,
      details ? JSON.stringify(details) : undefined,
      projectId,
      resourceName,
      structuredParams,
      clientIp,
      userAgent,
    );
  }

  private async writeToAudit(message: any): Promise<void> {
    // 按约定，audit 日志消息格式为：
    // { action: 'USER_LOGIN', resourceType: 'USER', resourceId?: string, projectId?: string, resourceName?: string, userId: string, success: boolean, errorMessage?: string, details?: any, params?: object }
    // 此外，ipAddress 和 userAgent 可从请求上下文中获取，但此处暂不处理，需要时可从 message 中提取。
    const { action, resourceType, resourceId, projectId, resourceName, userId, success, errorMessage, details, params } = message;

    if (!action || !resourceType || !userId) {
      super.warn('审计日志缺少必要字段，跳过写入', 'AuditLogger');
      return;
    }

    await this.auditLogService!.log(
      action as AuditAction,
      resourceType as ResourceType,
      resourceId,
      userId,
      success ?? true,
      errorMessage,
      details ? JSON.stringify(details) : undefined,
      projectId,
      resourceName,
      params ?? null,
      undefined, // ipAddress 将在 audit 方法中自动填充
      undefined, // userAgent 将在 audit 方法中自动填充
    );
  }
}
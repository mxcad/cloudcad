import { ConsoleLogger } from '@nestjs/common';
import { AuditLogService } from '../../audit/audit-log.service';
import { AuditAction, ResourceType } from '../enums/audit.enum';

export class AuditLogger extends ConsoleLogger {
  private auditLogService: AuditLogService | null = null;

  constructor() {
    super('Audit');
  }

  setAuditLogService(service: AuditLogService): void {
    this.auditLogService = service;
  }

  log(message: any, context?: string): void {
    // 调用父类 log 方法
    // 始终调用父类 log 以保证控制台输出
    super.log(message, context);

    // 仅当 context 为 'audit' 且审计日志服务可用时，写入数据库
    if (context === 'audit' && this.auditLogService) {
      this.writeToAudit(message).catch((err) => {
        // 审计日志写入失败仅记录错误，不中断主流程
        super.error(`审计日志写入失败: ${err.message}`, err.stack, 'AuditLogger');
      });
    }
  }

  private async writeToAudit(message: any): Promise<void> {
    // 按约定，audit 日志消息格式为：
    // { action: 'USER_LOGIN', resourceType: 'USER', resourceId?: string, userId: string, success: boolean, errorMessage?: string, details?: any }
    // 此外，ipAddress 和 userAgent 可从请求上下文中获取，但此处暂不处理，需要时可从 message 中提取。
    const { action, resourceType, resourceId, userId, success, errorMessage, details } = message;

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
      undefined, // ipAddress 暂缺
      undefined  // userAgent 暂缺
    );
  }
}
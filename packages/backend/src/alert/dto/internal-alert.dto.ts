///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AlertLevel } from '../enums/alert.enum';

/**
 * 内部告警上报请求体（#421 宿主机侧 ClamAV 扫描告警接入）
 *
 * 仅经 X-Internal-Service-Secret 共享密钥鉴权的内部端点可达（InternalSecretGuard），
 * 字段约束与 AlertService.raise 的输入契约一致。
 */
export class RaiseInternalAlertDto {
  /** 告警来源（如 antivirus-scan），用于去重与聚合 */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  source: string;

  /** 告警消息键（如 malware_detected），同 source+messageKey 的 OPEN 告警去重 */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  messageKey: string;

  /** 告警级别：P0 即时 / P1 聚合 / P2 静默 */
  @IsEnum(AlertLevel)
  level: AlertLevel;

  /** 告警消息（人类可读，邮件模板直接展示） */
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  message: string;

  /** 附加详情（任意 JSON 对象，如检出文件清单/隔离路径） */
  @IsOptional()
  @IsObject()
  detail?: Record<string, unknown>;
}

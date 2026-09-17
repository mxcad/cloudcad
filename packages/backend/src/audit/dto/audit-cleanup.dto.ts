import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

/**
 * 审计日志清理请求 DTO（#323 审计受限删除，等保 8.4.3.3）
 *
 * - confirm：二次确认必填且必须为 true（防误触/误用脚本直连删除）
 * - daysToKeep：保留天数参数化（与既有实现/cron 同口径），缺省走服务端
 *   保留期配置（默认 183 天）；服务端强制不得低于保留期下限（仅超保留期记录可删）
 */
export class AuditCleanupDto {
  @ApiPropertyOptional({
    description: '保留天数（删除该天数之前的记录；不得低于系统保留期下限）',
    minimum: 1,
    maximum: 3650,
    default: 183,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  daysToKeep?: number;

  @ApiProperty({
    description: '二次确认，必须显式传 true',
    example: true,
  })
  @IsBoolean()
  @Equals(true)
  confirm: boolean;
}

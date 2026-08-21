import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import { AuditAction } from '../../common/enums/audit.enum';

/**
 * 审计日志导出请求 DTO（#207 阶段 2）
 *
 * 筛选条件与 GET /audit/logs 对齐；format 支持 csv / excel
 * （当前两种格式均输出带 UTF-8 BOM 的 Excel 兼容 CSV）
 */
export class AuditExportDto {
  @ApiPropertyOptional({
    enum: AuditAction,
    description: '操作类型过滤',
  })
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @ApiPropertyOptional({
    description: '项目 ID（项目维度过滤）',
  })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({
    description: '开始日期（ISO 8601）',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: '结束日期（ISO 8601）',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: '是否成功',
  })
  @IsOptional()
  @IsBoolean()
  success?: boolean;

  @ApiPropertyOptional({
    enum: ['csv', 'excel'],
    default: 'csv',
    description: '导出格式（excel 为 Excel 兼容 CSV，带 UTF-8 BOM）',
  })
  @IsOptional()
  @IsIn(['csv', 'excel'])
  format?: 'csv' | 'excel';
}

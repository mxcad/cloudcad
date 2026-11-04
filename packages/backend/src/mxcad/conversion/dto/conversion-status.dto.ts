import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CONVERSION_FAILURE_CATEGORIES,
  type ConversionFailureCategory,
} from '@cloudcad/contracts';

export class ConversionStatusResponseDto {
  @ApiProperty({ description: 'FileSystemNode 当前状态', example: 'PROCESSING' })
  fileStatus: string;

  @ApiProperty({ description: '转换任务 ID', required: false })
  taskId?: string;

  @ApiProperty({ description: '任务执行状态 (PENDING|PROCESSING|COMPLETED|FAILED|UNKNOWN)', required: false })
  taskStatus?: string;

  @ApiProperty({ description: '错误信息', required: false })
  error?: string;

  @ApiPropertyOptional({
    description:
      '失败性质分类（仅 FAILED 有意义）：content-error=内容性永久失败（重试无意义）；其余为环境性可重试（timeout/killed/not-started/output-unparseable/unknown）。前端据此区分「文件内容问题」vs「引擎/服务异常」',
    enum: CONVERSION_FAILURE_CATEGORIES,
  })
  errorCategory?: ConversionFailureCategory;
}

export class TriggerConversionResponseDto {
  @ApiProperty({ description: '转换任务 ID' })
  taskId: string;

  @ApiProperty({ description: '节点 ID' })
  nodeId: string;

  @ApiProperty({ description: '是否异步执行', example: true })
  async: boolean;
}

import { ApiProperty } from '@nestjs/swagger';

export class ConversionStatusResponseDto {
  @ApiProperty({ description: 'FileSystemNode 当前状态', example: 'PROCESSING' })
  fileStatus: string;

  @ApiProperty({ description: '转换任务 ID', required: false })
  taskId?: string;

  @ApiProperty({ description: '任务执行状态 (PENDING|PROCESSING|COMPLETED|FAILED|UNKNOWN)', required: false })
  taskStatus?: string;

  @ApiProperty({ description: '错误信息', required: false })
  error?: string;
}

export class TriggerConversionResponseDto {
  @ApiProperty({ description: '转换任务 ID' })
  taskId: string;

  @ApiProperty({ description: '节点 ID' })
  nodeId: string;

  @ApiProperty({ description: '是否异步执行', example: true })
  async: boolean;
}

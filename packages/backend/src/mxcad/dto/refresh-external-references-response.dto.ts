import { ApiProperty } from '@nestjs/swagger';

/**
 * 外部参照刷新统计 DTO
 */
export class ExternalReferenceStatsDto {
  @ApiProperty({
    description: '新增的外部参照数量',
    type: Number,
    required: false,
  })
  added?: number;

  @ApiProperty({
    description: '更新的外部参照数量',
    type: Number,
    required: false,
  })
  updated?: number;

  @ApiProperty({
    description: '移除的外部参照数量',
    type: Number,
    required: false,
  })
  removed?: number;
}

/**
 * 刷新外部参照响应 DTO
 */
export class RefreshExternalReferencesResponseDto {
  @ApiProperty({
    description: '响应状态码',
    example: 0,
    type: Number,
  })
  code: number;

  @ApiProperty({
    description: '响应消息',
    example: '刷新成功',
    type: String,
  })
  message: string;

  @ApiProperty({
    description: '外部参照统计信息',
    type: ExternalReferenceStatsDto,
    required: false,
  })
  stats?: ExternalReferenceStatsDto;
}

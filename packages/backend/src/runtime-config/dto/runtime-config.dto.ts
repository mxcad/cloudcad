import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 更新运行时配置 DTO
 */
export class UpdateRuntimeConfigDto {
  @ApiProperty({ description: '配置值' })
  value: string | number | boolean;
}

/**
 * 运行时配置项响应 DTO
 */
export class RuntimeConfigResponseDto {
  @ApiProperty({ description: '配置键名' })
  key: string;

  @ApiProperty({ description: '配置值' })
  value: string | number | boolean;

  @ApiProperty({ description: '值类型', enum: ['string', 'number', 'boolean'] })
  type: string;

  @ApiProperty({ description: '分类' })
  category: string;

  @ApiPropertyOptional({ description: '配置说明' })
  description?: string;

  @ApiProperty({ description: '是否公开给前端' })
  isPublic: boolean;

  @ApiPropertyOptional({ description: '最后修改人 ID' })
  updatedBy?: string;

  @ApiProperty({ description: '最后更新时间' })
  updatedAt: Date;
}

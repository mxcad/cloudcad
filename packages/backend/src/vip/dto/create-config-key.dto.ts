import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsInt, IsOptional, IsIn, Min } from 'class-validator';
import { CONFIG_KEY_TYPES } from '../enums/vip.enum';

export class CreateConfigKeyDto {
  @ApiProperty({ description: '配置键名（如 "quota.personal_storage_mb"）' })
  @IsString()
  key: string;

  @ApiProperty({ description: '值类型', enum: CONFIG_KEY_TYPES })
  @IsIn(CONFIG_KEY_TYPES)
  type: string;

  @ApiProperty({ description: '显示名（i18n key 或直接文本）' })
  @IsString()
  label: string;

  @ApiPropertyOptional({ description: '默认值' })
  @IsOptional()
  defaultValue?: unknown;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '排序', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

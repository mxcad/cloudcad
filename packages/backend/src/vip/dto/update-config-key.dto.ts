import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsInt, IsOptional, IsIn, Min } from 'class-validator';
import { CONFIG_KEY_TYPES } from '../enums/vip.enum';

export class UpdateConfigKeyDto {
  @ApiPropertyOptional({ description: '值类型', enum: CONFIG_KEY_TYPES })
  @IsOptional()
  @IsIn(CONFIG_KEY_TYPES)
  type?: string;

  @ApiPropertyOptional({ description: '显示名' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ description: '默认值' })
  @IsOptional()
  defaultValue?: unknown;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '排序' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

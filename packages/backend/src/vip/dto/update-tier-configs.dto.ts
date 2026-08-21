import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class UpdateTierConfigsDto {
  @ApiProperty({ description: '配置项键值对，key 须在 ConfigKeyRegistry 中注册' })
  @IsObject()
  configs: Record<string, unknown>;
}

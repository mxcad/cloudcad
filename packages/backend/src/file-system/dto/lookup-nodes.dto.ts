import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class LookupNodesDto {
  @ApiProperty({
    description: '节点ID列表（≤200）',
    maxItems: 200,
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(200)
  ids: string[];
}

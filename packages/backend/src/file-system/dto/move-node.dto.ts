import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class MoveNodeDto {
  @ApiProperty({ description: '目标父节点ID' })
  @IsString()
  targetParentId: string;
}

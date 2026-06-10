import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class BatchDeleteDto {
  @ApiProperty({ description: '节点ID列表' })
  @IsArray()
  @IsString({ each: true })
  nodeIds: string[];

  @ApiProperty({ description: '是否永久删除', required: false, default: false })
  @IsOptional()
  @IsBoolean()
  permanently?: boolean;
}

export class BatchMoveDto {
  @ApiProperty({ description: '节点ID列表' })
  @IsArray()
  @IsString({ each: true })
  nodeIds: string[];

  @ApiProperty({ description: '目标父节点ID' })
  @IsString()
  targetParentId: string;
}

export class BatchCopyDto {
  @ApiProperty({ description: '节点ID列表' })
  @IsArray()
  @IsString({ each: true })
  nodeIds: string[];

  @ApiProperty({ description: '目标父节点ID' })
  @IsString()
  targetParentId: string;
}

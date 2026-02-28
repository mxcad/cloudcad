import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, Length } from 'class-validator';

/**
 * 创建节点 DTO（统一项目和文件夹创建）
 *
 * 规则：
 * - parentId 为空时，创建项目（isRoot=true）
 * - parentId 有值时，创建文件夹（isRoot=false）
 */
export class CreateNodeDto {
  @ApiProperty({ description: '节点名称', example: '设计图纸' })
  @IsString()
  @Length(1, 100)
  name: string;

  @ApiProperty({ description: '节点描述', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @ApiProperty({
    description: '父节点 ID。为空时创建项目，有值时创建文件夹',
    required: false,
    example: 'clx1234567890',
  })
  @IsOptional()
  @IsString()
  parentId?: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { FileStatus } from '@prisma/client';

export class QueryChildrenDto {
  @ApiProperty({ description: '搜索关键词（匹配名称或描述）', required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    description: '节点类型',
    enum: ['folder', 'file'],
    required: false,
  })
  @IsOptional()
  @IsString()
  nodeType?: 'folder' | 'file';

  @ApiProperty({
    description: '文件扩展名',
    required: false,
    example: '.dwg',
  })
  @IsOptional()
  @IsString()
  extension?: string;

  @ApiProperty({
    description: '文件状态',
    enum: FileStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(FileStatus)
  fileStatus?: FileStatus;

  @ApiProperty({ description: '页码', required: false, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    description: '每页数量',
    required: false,
    minimum: 10,
    maximum: 100,
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(100)
  limit?: number = 50;

  @ApiProperty({
    description: '排序字段',
    required: false,
    default: 'name',
  })
  @IsOptional()
  @IsString()
  sortBy?: string = 'name';

  @ApiProperty({
    description: '排序方向',
    required: false,
    enum: ['asc', 'desc'],
    default: 'asc',
  })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'asc';
}
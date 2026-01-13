import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ProjectStatus } from '@prisma/client';

export class QueryProjectsDto {
  @ApiProperty({ description: '搜索关键词（匹配名称或描述）', required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    description: '项目状态',
    enum: ProjectStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(ProjectStatus)
  projectStatus?: ProjectStatus;

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
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(100)
  limit?: number = 20;

  @ApiProperty({
    description: '排序字段',
    required: false,
    default: 'updatedAt',
  })
  @IsOptional()
  @IsString()
  sortBy?: string = 'updatedAt';

  @ApiProperty({
    description: '排序方向',
    required: false,
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';
}

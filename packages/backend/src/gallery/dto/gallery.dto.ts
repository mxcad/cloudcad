import { IsOptional, IsString, IsNumber, IsInt, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 分类数据 DTO
 */
export class GalleryTypeDto {
  @ApiProperty({ description: '分类 ID', example: 1 })
  id: number;

  @ApiProperty({ description: '父分类 ID', example: 0 })
  pid: number;

  @ApiProperty({ description: '分类名称', example: '建筑' })
  name: string;

  @ApiProperty({ description: '父分类名称', example: '建筑' })
  pname: string;

  @ApiProperty({ description: '状态', example: 1 })
  status: number;
}

/**
 * 分类列表响应 DTO
 */
export class GalleryTypesResponseDto {
  @ApiProperty({ description: '状态码', example: 'success' })
  code: string;

  @ApiProperty({
    description: '分类列表',
    type: 'object',
    properties: {
      allblocks: {
        type: 'array',
        items: { type: 'object' },
      },
    },
  })
  result: {
    allblocks: GalleryTypeDto[];
  };
}

/**
 * 文件列表项 DTO
 */
export class GalleryFileItemDto {
  @ApiProperty({ description: '文件 UUID', example: 'abc123def456' })
  uuid: string;

  @ApiProperty({ description: '文件名', example: '箭头_1.dwg' })
  filename: string;

  @ApiProperty({ description: '一级分类 ID', example: 1 })
  firstType: number;

  @ApiProperty({ description: '二级分类 ID', example: 2 })
  secondType: number;

  @ApiProperty({ description: '文件哈希值', example: 'a1b2c3d4e5f6...' })
  filehash: string;

  @ApiProperty({ description: '分类名称', example: '门' })
  type: string;

  @ApiProperty({ description: '是否已收藏', example: false })
  collect: boolean;
}

/**
 * 分页信息 DTO
 */
export class PaginationDto {
  @ApiProperty({ description: '当前页码', example: 0 })
  index: number;

  @ApiProperty({ description: '每页数量', example: 50 })
  size: number;

  @ApiProperty({ description: '总记录数', example: 150 })
  count: number;

  @ApiProperty({ description: '总页数', example: 3 })
  max: number;

  @ApiProperty({ description: '是否有上一页', example: false })
  up: boolean;

  @ApiProperty({ description: '是否有下一页', example: true })
  down: boolean;
}

/**
 * 文件列表数据 DTO
 */
export class GalleryFileListDataDto {
  @ApiProperty({ description: '文件列表', type: [GalleryFileItemDto] })
  sharedwgs: GalleryFileItemDto[];

  @ApiProperty({ description: '分页信息', type: PaginationDto })
  page: PaginationDto;
}

/**
 * 文件列表响应 DTO
 * 直接返回 { sharedwgs, page } 格式（不包含 data 包装层）
 */
export class GalleryFileListResponseDto {
  @ApiProperty({ description: '文件列表', type: [GalleryFileItemDto] })
  sharedwgs: GalleryFileItemDto[];

  @ApiProperty({ description: '分页信息', type: PaginationDto })
  page: PaginationDto;
}

/**
 * 文件列表查询 DTO
 */
export class GalleryFileListDto {
  @ApiPropertyOptional({ description: '搜索关键字', example: '箭头' })
  @IsOptional()
  @IsString()
  keywords?: string;

  @ApiPropertyOptional({ description: '一级分类 ID（项目 ID）', example: 1 })
  @IsOptional()
  @IsNumber()
  @IsInt()
  firstType?: number;

  @ApiPropertyOptional({ description: '二级分类 ID（标签 ID）', example: 2 })
  @IsOptional()
  @IsNumber()
  @IsInt()
  secondType?: number;

  @ApiPropertyOptional({ description: '三级分类 ID', example: 3 })
  @IsOptional()
  @IsNumber()
  @IsInt()
  thirdType?: number;

  @ApiProperty({ description: '页码', example: 0 })
  @IsNumber()
  @IsInt()
  @Min(-1)
  @Type(() => Number)
  pageIndex: number;

  @ApiProperty({ description: '每页数量', example: 50 })
  @IsNumber()
  @IsInt()
  @Min(1)
  pageSize: number;
}

/**
 * 添加到图库 DTO
 */
export class AddToGalleryDto {
  @ApiProperty({ description: '文件节点 ID', example: 'clxxx...' })
  @IsString()
  nodeId: string;

  @ApiProperty({ description: '一级分类 ID', example: 1 })
  @IsNumber()
  @IsInt()
  @Min(1)
  firstType: number;

  @ApiProperty({ description: '二级分类 ID', example: 2 })
  @IsNumber()
  @IsInt()
  @Min(1)
  secondType: number;

  @ApiPropertyOptional({ description: '三级分类 ID', example: 3 })
  @IsOptional()
  @IsNumber()
  @IsInt()
  @Min(1)
  thirdType?: number;
}

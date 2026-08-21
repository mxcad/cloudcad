import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsIn, IsInt, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class BatchFileItem {
  @ApiProperty({ description: '节点 ID' })
  @IsString()
  nodeId: string;

  @ApiProperty({ description: '文件名' })
  @IsString()
  fileName: string;

  @ApiProperty({ description: '请求的格式列表', type: [String] })
  @IsArray()
  @IsString({ each: true })
  formats: string[];

  @ApiProperty({ description: '相对路径（从项目/库根到父目录）', required: false })
  @IsOptional()
  @IsString()
  relativePath?: string;

  @ApiProperty({ description: '是否为文件夹', required: false })
  @IsOptional()
  isFolder?: boolean;

  @ApiProperty({ description: 'DWG/DXF 图纸版本', required: false })
  @IsOptional()
  @IsInt()
  dwgVersion?: number;

  @ApiProperty({ description: 'PDF 宽度', required: false })
  @IsOptional()
  @IsString()
  width?: string;

  @ApiProperty({ description: 'PDF 高度', required: false })
  @IsOptional()
  @IsString()
  height?: string;

  @ApiProperty({ description: 'PDF 颜色策略 (mono/color)', required: false })
  @IsOptional()
  @IsString()
  colorPolicy?: string;
}

export class CreateBatchDownloadDto {
  @ApiProperty({ description: '文件列表', type: [BatchFileItem] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchFileItem)
  fileList: BatchFileItem[];

  @ApiProperty({ description: '项目 ID', required: false })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiProperty({ description: '下载模式: zip 或 individual', required: false, default: 'zip' })
  @IsOptional()
  @IsIn(['zip', 'individual'])
  mode?: 'zip' | 'individual';

  @ApiProperty({ description: '库类型: 公开资源库批量下载时传入', required: false })
  @IsOptional()
  @IsString()
  @IsIn(['drawing', 'block'])
  libraryType?: 'drawing' | 'block';
}

export class BatchDownloadTaskDto {
  @ApiProperty()
  taskId: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  totalCount: number;

  @ApiProperty()
  completedCount: number;

  @ApiProperty()
  errorCount: number;

  @ApiProperty({ required: false })
  zipPath?: string;

  @ApiProperty({ required: false })
  zipSize?: number;
}

export class BatchDownloadProgressDto {
  @ApiProperty()
  status: string;

  @ApiProperty()
  totalCount: number;

  @ApiProperty()
  completedCount: number;

  @ApiProperty()
  errorCount: number;

  @ApiProperty({ required: false })
  currentFile?: string;

  @ApiProperty({ required: false })
  errors?: Array<{ nodeId: string; fileName: string; error: string }>;

  @ApiProperty({ required: false })
  zipPath?: string;
}

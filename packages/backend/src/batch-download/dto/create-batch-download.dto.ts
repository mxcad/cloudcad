import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  IsIn,
  IsInt,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 批量/单文件格式下载支持的目标格式。
 * mxweb/original 走 orchestrator 的 tryAddOriginal 直通（不转换、不受会员门控），
 * dwg/dxf/pdf 走转换。必须是白名单：orchestrator 对未知格式不回退报错，
 * conversion-runner 的 targetExt 三元会把它当成 PDF 产物（静默产出错误内容）。
 */
export const BATCH_DOWNLOAD_FORMATS = [
  'mxweb',
  'dwg',
  'dxf',
  'pdf',
  'original',
] as const;

export class BatchFileItem {
  @ApiProperty({
    description:
      '节点 ID（与 fileHash 二选一：nodeId 指向已保存节点；fileHash 指向内存导出上传的临时文件）',
    required: false,
  })
  @IsOptional()
  @IsString()
  nodeId?: string;

  @ApiProperty({
    description: '文件 hash（内存导出上传的临时文件，与 nodeId 二选一）',
    required: false,
  })
  @IsOptional()
  @IsString()
  fileHash?: string;

  @ApiProperty({ description: '文件名' })
  @IsString()
  fileName: string;

  @ApiProperty({ description: '请求的格式列表', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsIn(BATCH_DOWNLOAD_FORMATS, { each: true, message: '无效的目标格式' })
  formats: string[];

  @ApiProperty({
    description: '相对路径（从项目/库根到父目录）',
    required: false,
  })
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

  @ApiProperty({
    description: '下载模式: zip 或 individual',
    required: false,
    default: 'zip',
  })
  @IsOptional()
  @IsIn(['zip', 'individual'])
  mode?: 'zip' | 'individual';

  @ApiProperty({
    description: '库类型: 公开资源库批量下载时传入',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(['drawing', 'block'])
  libraryType?: 'drawing' | 'block';
}

/**
 * 单文件格式转换下载：一个文件 + 一个目标格式。
 * 与批量下载（CreateBatchDownloadDto）分离为独立路由——单文件格式下载属
 * 「单个文件下载」，不受 batchDownloadEnabled 门控；后端内核复用批量异步任务表。
 */
export class CreateSingleFormatDownloadDto {
  @ApiProperty({
    description:
      '节点 ID（与 fileHash 二选一：nodeId 指向已保存节点；fileHash 指向内存导出上传的临时文件）',
    required: false,
  })
  @IsOptional()
  @IsString()
  nodeId?: string;

  @ApiProperty({
    description: '文件 hash（内存导出上传的临时文件，与 nodeId 二选一）',
    required: false,
  })
  @IsOptional()
  @IsString()
  fileHash?: string;

  @ApiProperty({ description: '文件名' })
  @IsString()
  fileName: string;

  @ApiProperty({ description: '目标格式: mxweb/dwg/dxf/pdf/original' })
  @IsString()
  @IsIn(BATCH_DOWNLOAD_FORMATS, { message: '无效的目标格式' })
  format: string;

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

  @ApiProperty({ description: '项目 ID', required: false })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiProperty({
    description: '库类型: 公开资源库下载时传入',
    required: false,
  })
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

  /** 下载模式：zip=打包 ZIP；individual=逐个下载（单文件直出） */
  @ApiProperty({ enum: ['zip', 'individual'] })
  mode: 'zip' | 'individual';

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

  /** individual 模式：index → 下载文件名（与提交时 file×format 展开顺序一致） */
  @ApiProperty({ required: false, type: [String] })
  itemNames?: string[];
}

export class BatchDownloadProgressDto {
  @ApiProperty()
  taskId: string;

  @ApiProperty()
  status: string;

  /** 下载模式：zip=打包 ZIP；individual=逐个下载（单文件直出） */
  @ApiProperty({ enum: ['zip', 'individual'] })
  mode: 'zip' | 'individual';

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

  /** individual 模式：index → 下载文件名（与提交时 file×format 展开顺序一致） */
  @ApiProperty({ required: false, type: [String] })
  itemNames?: string[];
}

/** 用户下载任务分页结果（下载 tab 分页加载历史） */
export class BatchDownloadTaskPageDto {
  @ApiProperty({ type: [BatchDownloadTaskDto] })
  tasks: BatchDownloadTaskDto[];

  @ApiProperty()
  hasMore: boolean;
}

/** 合并多个 COMPLETED 任务为单个 ZIP 下载（zip 模式任务内嵌其 zip，individual 任务展开各文件） */
export class MergeBatchDownloadDto {
  @ApiProperty({
    description: '待合并的 COMPLETED 任务 ID 列表（上限 20）',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  taskIds: string[];
}

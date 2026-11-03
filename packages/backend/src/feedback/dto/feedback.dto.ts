///////////////////////////////////////////////////////////////////////////////
// 用户反馈模块 - 请求 DTO
///////////////////////////////////////////////////////////////////////////////

import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FeedbackSource, FeedbackStatus, FeedbackType } from '../feedback.enums';

/** 提交反馈（匿名/登录均可） */
export class CreateFeedbackDto {
  @ApiProperty({ enum: FeedbackType, enumName: 'FeedbackType', description: '反馈类型' })
  @IsEnum(FeedbackType)
  type: FeedbackType;

  @ApiProperty({ description: '标题', maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title: string;

  @ApiProperty({ description: '反馈内容' })
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  content: string;

  @ApiProperty({ enum: FeedbackSource, enumName: 'FeedbackSource', description: '提交来源：PC / 移动端' })
  @IsEnum(FeedbackSource)
  source: FeedbackSource;

  @ApiPropertyOptional({ description: '联系方式（匿名可选填，用于回访与查询校验）', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  contact?: string;

  @ApiPropertyOptional({ description: '匿名设备令牌（前端 localStorage 生成，后端只存 HMAC）', maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  anonToken?: string;

  @ApiPropertyOptional({ description: '来源页面 URL', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pageUrl?: string;

  @ApiPropertyOptional({
    description: '已上传附件 ID 列表（先上传拿 id，再随反馈提交绑定）',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(30)
  attachmentIds?: string[];
}

/**
 * 注册图纸附件。
 *
 * 统一语义：所有图纸（上传副本 / 空间图纸引用 / CAD 编辑器 hash 当前图纸）最终
 * 都转**真实附件副本**（copyToStorage 到附件存储区，带 downloadUrl），因为 fileHash
 * 不稳定、不能只存引用（用户 Q4 拍板）。
 *
 * 源定位二选一：
 * - nodeId：FileSystemNode.id（登录用户空间/项目图纸，秒传后拿到）
 * - fileHash：CAD 编辑器内存导出/未登录当前图纸的 MD5（无 nodeId，源文件按 hash
 *   内容寻址在 uploads/，由 PublicFileService.findMxwebFile 定位）
 */
export class RegisterDrawingAttachmentDto {
  @ApiPropertyOptional({ description: '图纸节点 ID（FileSystemNode.id；fileHash 定位时省略）' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  nodeId?: string;

  @ApiPropertyOptional({ description: '图纸 MD5（未登录 CAD 编辑器当前图纸，无 nodeId 时按 hash 内容寻址定位）' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  fileHash?: string;

  @ApiProperty({
    enum: ['copy', 'reference'],
    description: 'copy=上传新图纸；reference=空间/当前图纸引用（两者都转真实附件副本）',
  })
  @IsIn(['copy', 'reference'])
  kind: 'copy' | 'reference';

  @ApiPropertyOptional({ description: '原文件名', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fileName?: string;

  @ApiPropertyOptional({
    description: '缩略图（base64 dataURL，前端引擎内生成/指定区域后上传；云图节点已有缩略图则省略）',
  })
  @IsOptional()
  @IsString()
  @MaxLength(8_000_000)
  thumbnailData?: string;

  @ApiPropertyOptional({
    description: '图纸框选区域（CAD 世界坐标 "x1,y1,x2,y2"；分享图纸同款）。非空时打开图纸定位到该区域。',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  region?: string;
}

/** 管理端：改状态（驳回/转处理中/关闭） */
export class UpdateFeedbackStatusDto {
  @ApiProperty({ enum: FeedbackStatus, enumName: 'FeedbackStatus', description: '目标状态（REVIEWING/REJECTED/CLOSED；采纳走 adopt 端点）' })
  @IsEnum(FeedbackStatus)
  status: FeedbackStatus;

  @ApiPropertyOptional({ description: '驳回/关闭原因（驳回必填）', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** 管理端：采纳 + 建奖励 */
export class AdoptFeedbackDto {
  @ApiProperty({ description: '奖励会员等级（对应 VipTier.level，1-3）' })
  @IsInt()
  @Min(1)
  @Max(3)
  vipTierLevel: number;

  @ApiProperty({ description: '奖励时长（天），仅允许 7/30/90' })
  @IsInt()
  @Min(1)
  @Max(365)
  durationDays: number;

  @ApiPropertyOptional({ description: '采纳说明（可展示给用户）', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** 客服：发放奖励（绑定账号 + 写 UserMembership） */
export class IssueRewardDto {
  @ApiProperty({ description: '发放目标账号 userId（匿名认领时必填；登录用户可填反馈提交者）' })
  @IsString()
  @MinLength(1)
  userId: string;

  @ApiPropertyOptional({ description: '客服核实备注（必填，审计留痕）', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;

  @ApiPropertyOptional({ description: '覆盖采纳时选定的会员等级（1-3）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  vipTierLevel?: number;

  @ApiPropertyOptional({ description: '覆盖采纳时选定的时长（天），仅允许 7/30/90' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  durationDays?: number;
}

/** 客服：撤销奖励 */
export class RevokeRewardDto {
  @ApiProperty({ description: '撤销原因（必填，审计留痕）', maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason: string;
}

/** 管理端：批量删除附件（上限 200，防误传整表） */
export class BatchDeleteAttachmentsDto {
  @ApiProperty({ description: '附件 ID 列表', type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @ArrayMaxSize(200)
  ids: string[];
}

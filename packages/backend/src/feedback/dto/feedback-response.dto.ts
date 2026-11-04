///////////////////////////////////////////////////////////////////////////////
// 用户反馈模块 - 响应 DTO（出参交给 SDK 生成，Controller 直接 return 对象）
///////////////////////////////////////////////////////////////////////////////

import { ApiProperty } from '@nestjs/swagger';
import {
  FeedbackAttachmentKind,
  FeedbackAttachmentType,
  FeedbackSource,
  FeedbackStatus,
  FeedbackType,
  RewardStatus,
} from '../feedback.enums';

/** 附件（响应投影；downloadUrl 仅在已关联反馈时生成） */
export class FeedbackAttachmentDto {
  @ApiProperty() id: string;
  @ApiProperty({ nullable: true, type: String }) feedbackId: string | null;
  @ApiProperty({ enum: FeedbackAttachmentType, enumName: 'FeedbackAttachmentType' }) type: FeedbackAttachmentType;
  @ApiProperty({ enum: FeedbackAttachmentKind, enumName: 'FeedbackAttachmentKind' }) kind: FeedbackAttachmentKind;
  @ApiProperty({ nullable: true, type: String }) fileName: string | null;
  @ApiProperty({ nullable: true, type: String }) mimeType: string | null;
  @ApiProperty({ nullable: true, type: Number }) size: number | null;
  @ApiProperty({ nullable: true, type: String, description: '图纸引用 nodeId（kind=REFERENCE）' }) nodeId: string | null;
  @ApiProperty({ nullable: true, type: String }) fileHash: string | null;
  @ApiProperty({ nullable: true, type: String, description: '内容寻址 MD5（相同内容跨用户/匿名共享物理文件；前端本地去重用）' }) contentHash: string | null;
  @ApiProperty({ nullable: true, type: Boolean, required: false, description: '本次上传命中已有相同内容（物理文件复用，未重复落盘）；列表投影恒为空' }) deduped?: boolean;
  @ApiProperty({ nullable: true, type: String, description: '图纸框选区域（CAD 世界坐标 "x1,y1,x2,y2"；非空时打开图纸定位到该区域）' }) region: string | null;
  @ApiProperty({ nullable: true, type: String, description: '缩略图访问 URL（仅 FILE 图纸；REFERENCE 无缩略图）' }) thumbnailUrl: string | null;
  @ApiProperty({ nullable: true, type: String, description: '查看 URL（打开附件文件内联；提交者可看图片/文档，图纸引用仅管理员）' }) viewUrl: string | null;
  @ApiProperty({ nullable: true, type: String, description: '下载 URL（仅管理员且有 SYSTEM_FEEDBACK_MANAGE；提交者恒 null）' }) downloadUrl: string | null;
  @ApiProperty({ nullable: true, type: String, description: '上传者用户名（匿名为 null）' }) uploadedByName: string | null;
  @ApiProperty() createdAt: string;
}

/** 上传附件结果（= 附件投影；上传时 feedbackId 为 null，前端本地预览） */
export class UploadAttachmentResultDto extends FeedbackAttachmentDto {}

/** 附件资源管理页列表（分页） */
export class AdminAttachmentListResponseDto {
  @ApiProperty({ type: [FeedbackAttachmentDto] }) items: FeedbackAttachmentDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
}

/** 管理端批量删除附件结果 */
export class BatchDeleteAttachmentsResultDto {
  @ApiProperty({ description: '实际删除的附件数' }) deleted: number;
  @ApiProperty({ type: [String], description: '未找到（可能已被删除）的附件 ID' })
  notFoundIds: string[];
}

/** 管理端批量删除反馈记录结果 */
export class BatchDeleteFeedbackResultDto {
  @ApiProperty({ description: '实际删除的反馈数' }) deleted: number;
  @ApiProperty({ type: [String], description: '未找到（可能已被删除）的反馈 ID' })
  notFoundIds: string[];
}

/** 反馈提交者账号投影（奖励发放默认账号；匿名为 null） */
export class FeedbackSubmitterDto {
  @ApiProperty({ description: '用户 ID' }) id: string;
  @ApiProperty({ description: '用户名' }) username: string;
  @ApiProperty({ nullable: true, type: String, description: '昵称' }) nickname: string | null;
  @ApiProperty({ description: '邮箱' }) email: string;
}

/** 奖励记录（响应投影） */
export class FeedbackRewardResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() feedbackId: string;
  @ApiProperty({ description: '关联反馈查询码（客服认领核对用）' }) feedbackCode: string;
  @ApiProperty({ description: '关联反馈标题' }) feedbackTitle: string;
  @ApiProperty({ enum: FeedbackType, enumName: 'FeedbackType', required: false, description: '关联反馈类型（奖励分类）' }) feedbackType?: FeedbackType;
  @ApiProperty({ description: '反馈提交者账号（奖励发放默认账号；匿名反馈为 null，须客服搜索绑定）', nullable: true, type: FeedbackSubmitterDto })
  submitter: FeedbackSubmitterDto | null;
  @ApiProperty({ nullable: true, type: String }) userId: string | null;
  @ApiProperty({ description: '发放目标账号投影（未绑定为 null）', nullable: true, type: FeedbackSubmitterDto })
  user: FeedbackSubmitterDto | null;
  @ApiProperty({ description: '会员等级（VipTier.level）' }) vipTierLevel: number;
  @ApiProperty({ description: '奖励时长（天）' }) durationDays: number;
  @ApiProperty({ enum: RewardStatus, enumName: 'RewardStatus' }) status: RewardStatus;
  @ApiProperty({ nullable: true, type: String }) issuedById: string | null;
  @ApiProperty({ nullable: true, type: String }) issuedAt: string | null;
  @ApiProperty({ nullable: true, type: String }) remark: string | null;
  @ApiProperty() createdAt: string;
}

/** 反馈（响应投影） */
export class FeedbackResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: FeedbackType, enumName: 'FeedbackType' }) type: FeedbackType;
  @ApiProperty({ enum: FeedbackStatus, enumName: 'FeedbackStatus' }) status: FeedbackStatus;
  @ApiProperty() title: string;
  @ApiProperty() content: string;
  @ApiProperty({ enum: FeedbackSource, enumName: 'FeedbackSource' }) source: FeedbackSource;
  @ApiProperty({ nullable: true, type: String }) submitterId: string | null;
  @ApiProperty({ nullable: true, type: String, description: '提交者昵称/用户名（匿名为 null）' }) submitterName: string | null;
  @ApiProperty({ nullable: true, type: String }) contact: string | null;
  @ApiProperty({ nullable: true, type: String }) pageUrl: string | null;
  @ApiProperty({ nullable: true, type: String, description: '提交者 IP（仅管理端返回；提交者视角恒 null）' }) ip: string | null;
  @ApiProperty({ description: '匿名查询码' }) feedbackCode: string;
  @ApiProperty({ nullable: true, type: String }) reviewedById: string | null;
  @ApiProperty({ nullable: true, type: String }) reviewedAt: string | null;
  @ApiProperty({ nullable: true, type: String }) adoptNote: string | null;
  @ApiProperty({ nullable: true, type: String }) rejectReason: string | null;
  @ApiProperty({ enum: RewardStatus, enumName: 'RewardStatus' }) rewardStatus: RewardStatus;
  @ApiProperty({ description: '匿名被采纳后需联系客服认领' }) claimRequired: boolean;
  @ApiProperty({ nullable: true, type: FeedbackRewardResponseDto }) reward: FeedbackRewardResponseDto | null;
  @ApiProperty({ type: [FeedbackAttachmentDto], description: '附件列表（含下载 URL）' }) attachments: FeedbackAttachmentDto[];
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
}

/** 提交反馈结果 */
export class SubmitFeedbackResultDto {
  @ApiProperty() id: string;
  @ApiProperty({ description: '匿名查询码（登录提交也为用户保留）' }) feedbackCode: string;
  @ApiProperty({ enum: FeedbackStatus, enumName: 'FeedbackStatus' }) status: FeedbackStatus;
  @ApiProperty({ enum: RewardStatus, enumName: 'RewardStatus' }) rewardStatus: RewardStatus;
  @ApiProperty() claimRequired: boolean;
  @ApiProperty() createdAt: string;
}

/** 反馈列表（分页） */
export class FeedbackListResponseDto {
  @ApiProperty({ type: [FeedbackResponseDto] }) items: FeedbackResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
}

/** 匿名凭码查询结果（仅非敏感字段） */
export class FeedbackQueryResultDto {
  @ApiProperty() feedbackCode: string;
  @ApiProperty({ enum: FeedbackType, enumName: 'FeedbackType' }) type: FeedbackType;
  @ApiProperty({ enum: FeedbackStatus, enumName: 'FeedbackStatus' }) status: FeedbackStatus;
  @ApiProperty() title: string;
  @ApiProperty({ description: '反馈正文（查询可读，含换行）' }) content: string;
  @ApiProperty({ enum: RewardStatus, enumName: 'RewardStatus' }) rewardStatus: RewardStatus;
  @ApiProperty() claimRequired: boolean;
  @ApiProperty({ nullable: true, type: String }) adoptNote: string | null;
  @ApiProperty({ nullable: true, type: String }) rejectReason: string | null;
  @ApiProperty({ type: [FeedbackAttachmentDto], description: '附件列表（匿名查询带短期签名下载 URL）' }) attachments: FeedbackAttachmentDto[];
  @ApiProperty() createdAt: string;
}

/** 奖励记录列表 */
export class FeedbackRewardListResponseDto {
  @ApiProperty({ type: [FeedbackRewardResponseDto] }) items: FeedbackRewardResponseDto[];
  @ApiProperty() total: number;
}

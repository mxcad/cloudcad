///////////////////////////////////////////////////////////////////////////////
// 用户反馈模块 - 本地枚举
//
// 与 packages/db/prisma/schema.prisma 的 Prisma 枚举值保持一致（字符串值相同）。
// 使用本地枚举而非 Prisma 枚举：Prisma 枚举不可直接用于 @ApiProperty
// （AGENTS.md 陷阱表），DTO/Swagger 与业务层统一走本地枚举，
// 仅在写入 prisma 的边界处 cast 为对应 Prisma 枚举。
///////////////////////////////////////////////////////////////////////////////

/** 反馈类型 */
export enum FeedbackType {
  BUG = 'BUG',
  SUGGESTION = 'SUGGESTION',
  COMPLAINT = 'COMPLAINT',
  OTHER = 'OTHER',
}

/** 处理状态：提交→处理中→（采纳|驳回），用户可撤回（CLOSED） */
export enum FeedbackStatus {
  PENDING = 'PENDING',
  REVIEWING = 'REVIEWING',
  ADOPTED = 'ADOPTED',
  REJECTED = 'REJECTED',
  CLOSED = 'CLOSED',
}

/** 提交来源：PC / 移动端 */
export enum FeedbackSource {
  PC = 'PC',
  MOBILE = 'MOBILE',
}

/** 奖励状态（独立于反馈状态） */
export enum RewardStatus {
  NONE = 'NONE',
  PENDING = 'PENDING',
  ISSUED = 'ISSUED',
  REVOKED = 'REVOKED',
}

/** 附件类型：图片 / 文档 / 图纸（mxweb/dwg/dxf） */
export enum FeedbackAttachmentType {
  IMAGE = 'IMAGE',
  DOCUMENT = 'DOCUMENT',
  DRAWING = 'DRAWING',
}

/** 附件存在形态（ADR-0085）：FILE=实际文件副本；REFERENCE=图纸引用（仅存 nodeId） */
export enum FeedbackAttachmentKind {
  FILE = 'FILE',
  REFERENCE = 'REFERENCE',
}

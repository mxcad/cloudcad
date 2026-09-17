///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import type { NoticeResponseDto } from '@/api-sdk';

/** 后端返回的公告（SDK 生成类型，本目录不本地重定义） */
export type NoticeDto = NoticeResponseDto;

/**
 * 列表展示状态。后端不返回 status 字段，由时间窗在客户端派生，
 * 判定口径对齐 getEffective：endAt > now 严格大于，到点即视为已过期。
 */
export type NoticeStatus =
  | 'active'
  | 'pending'
  | 'expired'
  | 'draft'
  | 'retracted';

/** 派生公告展示状态（now 可注入，便于单测固定时间） */
export function deriveNoticeStatus(
  notice: NoticeDto,
  now: Date = new Date()
): NoticeStatus {
  if (!notice.publishedAt) {
    return notice.retractedAt ? 'retracted' : 'draft';
  }
  if (notice.startAt && new Date(notice.startAt).getTime() > now.getTime()) {
    return 'pending';
  }
  if (notice.endAt && new Date(notice.endAt).getTime() <= now.getTime()) {
    return 'expired';
  }
  return 'active';
}

/** 发布弹窗的表单值（ISO 字符串；空串表示未填写） */
export interface NoticeFormValues {
  kind: 'system' | 'download';
  level: 'info' | 'warning' | 'danger';
  title: string;
  body: string;
  startAt: string;
  endAt: string;
  autoExpire: boolean;
}

/** 表单校验错误（字段名与校验项一一对应） */
export interface NoticeFormErrors {
  title?: string;
  body?: string;
  endAt?: string;
}

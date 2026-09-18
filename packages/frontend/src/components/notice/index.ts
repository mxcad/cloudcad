///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 通知中心（PC 前端）对外出口。
 *
 * App.tsx 挂 NoticeProvider，Layout.tsx 放 NoticeBanner。
 * 纯函数与类型也从这里导出，便于单测直接引用。
 */

export {
  NoticeProvider,
  useNotice,
  NOTICE_ACK_CHANNEL,
} from './NoticeProvider';
export type { NoticeContextValue } from './NoticeProvider';
export { NoticeBanner } from './NoticeBanner';
export { useNoticeStream } from './useNoticeStream';
export type { NoticeStreamSource } from './useNoticeStream';
export {
  NOTICE_ACK_STORAGE_KEY,
  readAcks,
  writeAcks,
  isAcknowledged,
  markAcknowledged,
  pruneExpiredAcks,
} from './noticeAck';
export type { NoticeAckMap } from './noticeAck';
export { NOTICE_LEVEL_PRIORITY, sortNotices } from './noticeTypes';
export type { Notice } from './noticeTypes';

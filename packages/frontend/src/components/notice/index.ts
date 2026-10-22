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
 * App.tsx 挂 NoticeProvider，Layout.tsx 放 NoticeBellDropdown。
 * 纯函数与类型也从这里导出，便于单测直接引用。
 */

export {
  NoticeProvider,
  useNotice,
  NOTICE_ACK_CHANNEL,
  WARNING_TOAST_DURATION_MS,
  filterUnacknowledged,
} from './NoticeProvider';
export type { NoticeContextValue } from './NoticeProvider';
export { NoticeBellDropdown } from './NoticeBellDropdown';
export { NoticeListView } from './NoticeListView';
export type { NoticeListViewProps } from './NoticeListView';
export { useNoticeStream } from './useNoticeStream';
export type { NoticeStreamSource } from './useNoticeStream';
export {
  NOTICE_ACK_STORAGE_KEY,
  ackStorageKey,
  ackEntryKey,
  readAcks,
  writeAcks,
  isAcknowledged,
  markAcknowledged,
  pruneExpiredAcks,
  NOTICE_VIEWED_STORAGE_KEY,
  viewedStorageKey,
  readViewed,
  writeViewed,
  isViewed,
  markViewed,
  pruneViewed,
} from './noticeAck';
export type { NoticeAckMap } from './noticeAck';
export {
  NOTICE_LEVEL_PRIORITY,
  NOTICE_LEVEL_COLORS,
  sortNotices,
} from './noticeTypes';
export type { Notice } from './noticeTypes';

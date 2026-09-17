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
 * 通知常驻横幅。
 *
 * 刻意没有关闭按钮：弹框关掉后仍需常驻提醒（停机公告关了就错过了）。
 * 靠后端下线（retract）或 endAt 到期才消失，用户侧无法自行隐藏。
 *
 * 优先显示队列里下一条未读的（与弹框顺序一致）；全部已读后退回显示优先级
 * 最高的一条，作为「这条公告还生效中」的持续提示。
 */

import React from 'react';
import { useNotice } from './NoticeProvider';

const LEVEL_CLASSES: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  info: {
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    text: 'text-blue-800 dark:text-blue-200',
    border: 'border-blue-300 dark:border-blue-800',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-800 dark:text-amber-200',
    border: 'border-amber-300 dark:border-amber-800',
  },
  danger: {
    bg: 'bg-red-50 dark:bg-red-950/40',
    text: 'text-red-800 dark:text-red-200',
    border: 'border-red-300 dark:border-red-800',
  },
};

const FALLBACK_CLASSES = LEVEL_CLASSES.info as (typeof LEVEL_CLASSES)[string];

export const NoticeBanner: React.FC = () => {
  const { notices, pending } = useNotice();

  const notice = pending[0] ?? notices[0] ?? null;
  if (!notice) return null;

  const styles = LEVEL_CLASSES[notice.level] ?? FALLBACK_CLASSES;

  return (
    <div
      className={`animate-slide-up px-4 py-2.5 border-b ${styles.bg} ${styles.border}`}
      data-testid="notice-banner"
    >
      <div className="max-w-7xl mx-auto flex items-start gap-2">
        <svg
          aria-hidden
          className={`w-5 h-5 flex-shrink-0 mt-0.5 ${styles.text}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium leading-5 ${styles.text}`}>
            {notice.title}
          </p>
          {notice.body && (
            <p
              className={`text-xs leading-5 line-clamp-2 whitespace-pre-wrap ${styles.text} opacity-80`}
            >
              {notice.body}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

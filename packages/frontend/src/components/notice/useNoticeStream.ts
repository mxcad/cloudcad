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
 * 通知订阅：30s 轮询（仅页面可见时轮询）。
 *
 * 为何不用常驻 SSE：常驻 SSE 长连接在 HTTP/1.1 下会占满浏览器每源 6 条并发连接，
 * 导致普通 API 请求排队（生产实测 /projects 等页请求排队数分钟）。公告是低频事件，
 * 30s 轮询的到达延迟可接受；轮询是短请求、即发即回，不占常驻连接。
 *
 * 页面隐藏时暂停轮询（省无谓请求），变可见时立即补拉一次，覆盖隐藏期间漏掉的公告。
 * refresh 是幂等的整表替换，Provider 按 noticeId 去重，不产生重复弹窗。
 * GET /current 为 @Public，未登录游客轮询只拿到广播公告，故轮询不按登录态门控。
 */

import { useCallback, useEffect, useState } from 'react';
import { noticeCenterControllerGetCurrent } from '@/api-sdk';

import { NOTICE_POLL_INTERVAL_MS } from '@/constants/timeouts';

import { sortNotices, type Notice } from './noticeTypes';

/** 当前生效通知的订阅通道状态 */
export type NoticeStreamSource = 'idle' | 'polling';

export interface UseNoticeStreamResult {
  /** 当前生效中的通知，已按级别与时间排序 */
  notices: Notice[];
  /** 'polling' = 轮询中；'idle' = 未启用 */
  source: NoticeStreamSource;
}

/** 拉取一次当前生效通知并整表替换。失败静默（下一个轮询周期会重试） */
async function fetchCurrent(): Promise<Notice[] | null> {
  const res = await noticeCenterControllerGetCurrent();
  if (res.error) return null;
  return Array.isArray(res.data) ? res.data : [];
}

export function useNoticeStream(enabled: boolean): UseNoticeStreamResult {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [source, setSource] = useState<NoticeStreamSource>(
    enabled ? 'polling' : 'idle'
  );

  /** 整表替换：GET /current 是权威全集，直接覆盖可清掉已失效条目 */
  const replaceNotices = useCallback((incoming: Notice[]) => {
    setNotices(sortNotices(incoming));
  }, []);

  useEffect(() => {
    if (!enabled) {
      setNotices([]);
      setSource('idle');
      return undefined;
    }

    setSource('polling');
    let closed = false;

    const poll = () => {
      if (closed) return;
      // 页面隐藏时不轮询：省无谓请求，变可见时由 visibilitychange 补拉一次
      if (document.visibilityState !== 'visible') return;
      void fetchCurrent().then((current) => {
        if (!closed && current) replaceNotices(current);
      });
    };

    // 挂载即拉一次（页面加载即有公告），随后按周期轮询
    poll();
    const interval = setInterval(poll, NOTICE_POLL_INTERVAL_MS);

    // 页面从隐藏变可见时立即补拉一次，覆盖隐藏期间漏掉的公告
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') poll();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      closed = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, replaceNotices]);

  return { notices, source };
}

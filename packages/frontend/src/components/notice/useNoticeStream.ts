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
 * 通知订阅：SSE 实时推送 + 30s 轮询兜底，两者叠加。
 *
 * 为什么两套都要：SSE 覆盖「正在使用的用户实时收到」，轮询覆盖 SSE 建连失败、
 * 断流窗口、以及未登录游客（拿不到 ticket）。refresh 是幂等的整表替换，
 * 叠加不产生重复弹窗（Provider 按 noticeId 去重）。
 *
 * 断流恢复用指数退避 5s → 60s 封顶，避免后端故障时把限流（60/min）打爆。
 * 每次重连前先跑一次 GET，把断流期间漏掉的公告补齐 —— ticket 是一次性的，
 * 重连必须重新签发，不能复用。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  noticeCenterControllerGetCurrent,
  noticeCenterControllerIssueTicket,
} from '@/api-sdk';
import { getApiBaseUrl } from '@/config/apiConfig';
import { getValidToken } from '@/utils/tokenUtils';
import {
  NOTICE_POLL_INTERVAL_MS,
  NOTICE_RECONNECT_BASE_MS,
  NOTICE_RECONNECT_MAX_MS,
} from '@/constants/timeouts';

import { parseNoticeEvent, sortNotices, type Notice } from './noticeTypes';

/** 当前生效通知的订阅通道状态 */
export type NoticeStreamSource = 'idle' | 'live' | 'polling';

export interface UseNoticeStreamResult {
  /** 当前生效中的通知，已按级别与时间排序 */
  notices: Notice[];
  /** 'live' = SSE 已连上；'polling' = 仅靠轮询兜底 */
  source: NoticeStreamSource;
}

/** 拉取一次当前生效通知并整表替换。失败静默（下一个轮询周期会重试） */
async function fetchCurrent(): Promise<Notice[] | null> {
  const res = await noticeCenterControllerGetCurrent();
  if (res.error) return null;
  return Array.isArray(res.data) ? res.data : [];
}

export function useNoticeStream(
  enabled: boolean,
  isAuthenticated: boolean
): UseNoticeStreamResult {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [source, setSource] = useState<NoticeStreamSource>(
    enabled ? 'idle' : 'idle'
  );

  const reconnectDelayRef = useRef(NOTICE_RECONNECT_BASE_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  /** 整表替换：GET /current 与 SSE snapshot 是权威全集，直接覆盖可清掉已失效条目 */
  const replaceNotices = useCallback((incoming: Notice[]) => {
    setNotices(sortNotices(incoming));
  }, []);

  /** 单条合并：publish/update 是增量，按 id 覆盖或追加 */
  const upsertNotice = useCallback((notice: Notice) => {
    setNotices((prev) => {
      const index = prev.indexOf(notice);
      const merged =
        index === -1
          ? [...prev, notice]
          : prev.map((n) => (n.id === notice.id ? notice : n));
      return sortNotices(merged);
    });
  }, []);

  const removeNotice = useCallback((noticeId: string) => {
    setNotices((prev) => prev.filter((n) => n.id !== noticeId));
  }, []);

  const handleEvent = useCallback(
    (raw: string) => {
      const event = parseNoticeEvent(raw);
      switch (event.type) {
        case 'snapshot':
          replaceNotices(event.notices);
          return;
        case 'publish':
        case 'update':
          upsertNotice(event.notice);
          return;
        case 'retract':
          removeNotice(event.noticeId);
          return;
        default:
          return;
      }
    },
    [replaceNotices, upsertNotice, removeNotice]
  );

  useEffect(() => {
    if (!enabled) {
      setNotices([]);
      setSource('idle');
      return undefined;
    }

    let closed = false;

    const cleanupStream = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (closed) return;
      setSource('polling');
      reconnectTimerRef.current = setTimeout(() => {
        void openStream();
      }, reconnectDelayRef.current);
    };

    const openStream = async () => {
      if (closed) return;

      // 重连先补齐断流期间的缺口，再建新连接
      const current = await fetchCurrent();
      if (closed) return;
      if (current) replaceNotices(current);

      if (!isAuthenticated || typeof EventSource === 'undefined') return;

      const token = getValidToken();
      if (!token) return;

      const ticketRes = await noticeCenterControllerIssueTicket();
      if (closed) return;
      if (ticketRes.error || !ticketRes.data?.ticket) return;

      const url = `${getApiBaseUrl()}/v1/notices/stream?ticket=${encodeURIComponent(ticketRes.data.ticket)}`;
      // eslint-disable-next-line no-restricted-syntax -- 豁免：通知 SSE（SDK 无 SSE 形态，EventSource 无法带 Authorization header 故用一次性 ticket 走 query，ADR-0034 豁免清单，参照 ConversionPanel 转换任务 SSE）
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        if (closed) return;
        reconnectDelayRef.current = NOTICE_RECONNECT_BASE_MS;
        setSource('live');
      };

      es.onmessage = (message) => {
        if (!message.data) return;
        try {
          handleEvent(message.data);
        } catch {
          // 单条坏消息不能打断整条连接：EventSource 的 onmessage 抛错不会自动重连
        }
      };

      es.onerror = () => {
        // ticket 已消费，这条连接不能复用；关掉后走退避重连
        es.close();
        if (eventSourceRef.current === es) eventSourceRef.current = null;
        reconnectDelayRef.current = Math.min(
          reconnectDelayRef.current * 2,
          NOTICE_RECONNECT_MAX_MS
        );
        scheduleReconnect();
      };
    };

    setSource('idle');
    reconnectDelayRef.current = NOTICE_RECONNECT_BASE_MS;
    void openStream();

    // 轮询兜底：SSE 正常时也跑，覆盖断流窗口与事件丢失
    const interval = setInterval(() => {
      void fetchCurrent().then((current) => {
        if (!closed && current) replaceNotices(current);
      });
    }, NOTICE_POLL_INTERVAL_MS);

    return () => {
      closed = true;
      clearInterval(interval);
      cleanupStream();
    };
  }, [enabled, isAuthenticated, replaceNotices, handleEvent]);

  return { notices, source };
}

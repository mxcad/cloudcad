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
 * 通知实时通道：登录态走 SSE，其余场景（未登录 / 无 EventSource）走 30s 轮询。
 *
 * 为什么不用 ?token=：把 JWT 放 URL 会进浏览器历史与反向代理 access log。
 * 改为先 POST 换一张 5 分钟一次性 ticket（连接时服务端立即删除），SSE URL 只带 ticket。
 *
 * 重连语义：
 * - 每次 new EventSource 之前都重新 POST 拿 ticket（旧的已被消费或过期）
 * - onerror 时先 close() 再退避；readyState === CLOSED 说明服务端已关闭
 *   （401 / 实例重启），EventSource 自己不会重连，必须走这条显式路径
 * - 断流期间补一次 GET /notices/current，避免用户在退避期看不到公告
 * - 标签页隐藏时主动断开（省下服务端连接），切回时重连
 */

import { useEffect, useRef, useState } from 'react';
import type { NoticeResponseDto } from '@/api-sdk';
import {
  noticeCenterControllerGetCurrent,
  noticeCenterControllerIssueTicket,
} from '@/api-sdk';
import { getApiBaseUrl } from '@/config/apiConfig';
import {
  NOTICE_POLL_INTERVAL_MS,
  NOTICE_RECONNECT_BASE_MS,
  NOTICE_RECONNECT_MAX_MS,
} from '@/constants/timeouts';

/** 后端 SSE 帧（data: 行 JSON），与 notice-sse.service.ts 的 writeFrame 对应 */
type NoticeFrame =
  | { type: 'snapshot'; notices: NoticeResponseDto[] }
  | { type: 'publish'; notice: NoticeResponseDto }
  | { type: 'update'; notice: NoticeResponseDto }
  | { type: 'retract'; noticeId: string };

export type NoticeStreamMode = 'sse' | 'polling';

export interface NoticeStreamCallbacks {
  /** 全量快照（首屏 / 轮询 / SSE snapshot 帧），调用方按 noticeId 合并 */
  onNotices(notices: NoticeResponseDto[]): void;
  /** 单条推送或更新 */
  onUpsert(notice: NoticeResponseDto): void;
  /** 下线，调用方按 id 移除 */
  onRetract(noticeId: string): void;
}

export interface UseNoticeStreamResult {
  mode: NoticeStreamMode;
}

/** SSE 路径与 SDK client 一致：baseUrl 只取 origin，路由自带 /api/v1 前缀 */
function buildStreamUrl(ticket: string): string {
  let base = '';
  try {
    base = new URL(getApiBaseUrl()).origin;
  } catch {
    base = '';
  }
  return `${base}/api/v1/notices/stream?ticket=${encodeURIComponent(ticket)}`;
}

/**
 * @param enabled 始终为 true 即可：内部按 authed 决定走 SSE 还是轮询
 * @param authed  登录态。未登录拿不到 ticket，只能轮询（/notices/current 是公开接口）
 */
export function useNoticeStream(
  enabled: boolean,
  authed: boolean,
  callbacks: NoticeStreamCallbacks
): UseNoticeStreamResult {
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  const [mode, setMode] = useState<NoticeStreamMode>('sse');

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    let source: EventSource | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = NOTICE_RECONNECT_BASE_MS;

    const useSse = authed && typeof EventSource !== 'undefined';
    setMode(useSse ? 'sse' : 'polling');

    const fetchCurrent = async (): Promise<void> => {
      const result = await noticeCenterControllerGetCurrent();
      if (disposed) return;
      if (result.error) return;
      cbRef.current.onNotices((result.data as NoticeResponseDto[]) ?? []);
    };

    if (!useSse) {
      // 无 SSE 能力：首屏立刻拉一次，之后按 30s 间隔轮询
      void fetchCurrent();
      const poll = () => {
        void fetchCurrent().finally(() => {
          if (!disposed) pollTimer = setTimeout(poll, NOTICE_POLL_INTERVAL_MS);
        });
      };
      pollTimer = setTimeout(poll, NOTICE_POLL_INTERVAL_MS);
      return () => {
        disposed = true;
        if (pollTimer) clearTimeout(pollTimer);
      };
    }

    const scheduleRetry = () => {
      if (disposed || retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void connect();
      }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, NOTICE_RECONNECT_MAX_MS);
    };

    const connect = async (): Promise<void> => {
      if (disposed || document.hidden) return;

      const ticketRes = await noticeCenterControllerIssueTicket();
      if (disposed) return;
      if (ticketRes.error || !ticketRes.data?.ticket) {
        scheduleRetry();
        return;
      }

      source = new EventSource(buildStreamUrl(ticketRes.data.ticket));
      retryDelay = NOTICE_RECONNECT_BASE_MS;

      source.onmessage = (event) => {
        let frame: NoticeFrame;
        try {
          frame = JSON.parse(event.data) as NoticeFrame;
        } catch {
          return;
        }
        if (frame.type === 'snapshot') {
          cbRef.current.onNotices(frame.notices ?? []);
        } else if (frame.type === 'publish' || frame.type === 'update') {
          cbRef.current.onUpsert(frame.notice);
        } else if (frame.type === 'retract') {
          cbRef.current.onRetract(frame.noticeId);
        }
      };

      source.onerror = () => {
        source?.close();
        source = null;
        void fetchCurrent();
        scheduleRetry();
      };
    };

    void connect();

    const onVisibilityChange = () => {
      if (document.hidden) {
        source?.close();
        source = null;
      } else if (!source && !retryTimer) {
        void connect();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (retryTimer) clearTimeout(retryTimer);
      if (pollTimer) clearTimeout(pollTimer);
      source?.close();
    };
  }, [enabled, authed]);

  return { mode };
}

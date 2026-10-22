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
 * 通知订阅：SSE 推送为主、30s 轮询兜底。
 *
 * 后端 /v1/notices/stream 在发布、编辑、下线时即时下发（ticket 认证，见控制器注释），
 * 收到任意一帧就整表重拉一次 GET /current —— 帧只当「有变化」的信号，权威全集
 * 始终来自 GET /current，避免帧与轮询两条路径各自拼状态。
 *
 * 轮询不删：SSE 建连失败、断网、代理截断长连接时，最坏退化为 30s 到达，不至于
 * 完全收不到。页面隐藏时暂停轮询（省无谓请求），变可见立即补拉一次。
 *
 * 未登录时只轮询：GET /current 是 @Public，游客轮询只拿到广播公告；而 ticket 端点
 * 需要 JWT，故轮询不按登录态门控、SSE 才按登录态门控。
 *
 * 移动端刻意只用轮询：WebView 与后台退出的长连接极不稳定，重连风暴会打爆限流
 * （见 frontend_mobile 同名文件头注释）。
 */

import { useCallback, useEffect, useState } from 'react';
import {
  noticeCenterControllerGetCurrent,
  noticeCenterControllerIssueTicket,
} from '@/api-sdk';
import {
  openEventStream,
  type EventStreamHandle,
} from '@/services/eventStream';
import { useAuth } from '@/contexts/AuthContext';

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

/**
 * SSE 断连后的重建间隔。ticket 是一次性凭据（后端 Redis GETDEL 消费），复用同一
 * ticket 重连只会拿到 401 并无限重试，故用 closeOnError 默认关流 + 定时重签；
 * 间隔取得比心跳略长，兼顾「立即」与「不要打爆签发限流」。
 */
const NOTICE_SSE_RETRY_MS = 5000;

/**
 * 拉取一次当前生效通知。返回 null 表示保持现状：整表替换是破坏性的（会清掉失效
 * 条目），所以只在拿到权威全集时才覆盖；下一轮轮询或下一帧会重试。
 *
 * 网络类错误在这里吞掉——否则会冒成 unhandled rejection，而调用方
 * （轮询定时器、SSE 帧回调）都没有机会处理。
 */
async function fetchCurrent(): Promise<Notice[] | null> {
  let res;
  try {
    res = await noticeCenterControllerGetCurrent();
  } catch {
    return null;
  }
  if (res.error) return null;
  return Array.isArray(res.data) ? res.data : [];
}

export function useNoticeStream(enabled: boolean): UseNoticeStreamResult {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [source, setSource] = useState<NoticeStreamSource>(
    enabled ? 'polling' : 'idle'
  );
  // SSE 需要 JWT 才能签 ticket，游客态不订阅
  const { token } = useAuth();

  /** 整表替换：GET /current 是权威全集，直接覆盖可清掉已失效条目 */
  const replaceNotices = useCallback((incoming: Notice[]) => {
    setNotices(sortNotices(incoming));
  }, []);

  /**
   * 拉取一次当前生效通知。页面隐藏时跳过：省无谓请求，变可见时由
   * visibilitychange 补拉一次。SSE 帧与轮询共用这一条路径。
   */
  const refetch = useCallback(() => {
    if (document.visibilityState !== 'visible') return;
    void fetchCurrent().then((current) => {
      if (current) replaceNotices(current);
    });
  }, [replaceNotices]);

  useEffect(() => {
    if (!enabled) {
      setNotices([]);
      setSource('idle');
      return undefined;
    }

    setSource('polling');
    // 挂载即拉一次：登录用户走 SSE 快照帧，但游客态没有 SSE，否则首次到达要等一整轮
    refetch();
    const interval = setInterval(refetch, NOTICE_POLL_INTERVAL_MS);

    // 页面从隐藏变可见时立即补拉一次，覆盖隐藏期间漏掉的公告
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refetch();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, refetch]);

  useEffect(() => {
    if (!enabled || !token) return undefined;

    let disposed = false;
    let handle: EventStreamHandle | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleRetry = () => {
      if (disposed || retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        void openStream();
      }, NOTICE_SSE_RETRY_MS);
    };

    const openStream = async () => {
      // 每次建连前重新签发：ticket 一次性，且签发端点限流 60/min
      const res = await noticeCenterControllerIssueTicket({
        throwOnError: false,
      });
      if (disposed) return;
      const ticket = res.data?.ticket;
      if (!ticket) {
        scheduleRetry();
        return;
      }
      handle = openEventStream({
        // 后端全局前缀 api/v1（@Controller('notices')），漏 /v1 会 404 后无限重签 ticket
        path: '/v1/notices/stream',
        query: { ticket },
        onFrame: () => {
          // 帧只是「有变化」的信号，真实内容仍整表重拉
          if (!disposed) refetch();
        },
        onClose: (reason) => {
          // manual 是本条连接被下一次签发取代，无需重试
          if (reason !== 'manual') scheduleRetry();
        },
      });
    };

    void openStream();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      handle?.close();
    };
  }, [enabled, token, refetch]);

  return { notices, source };
}

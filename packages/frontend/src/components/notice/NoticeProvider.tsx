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
 * 全局通知 Provider —— 持有生效通知列表、已读记录与实时通道。
 *
 * 挂载在 App.tsx 顶层（与 GlobalTourRenderer 同级），刻意在 Routes 与 CAD
 * 编辑器懒加载之外：首屏即挂、编辑器加载前后都能弹、不受路由切换影响。
 *
 * 多标签页去重：ack 写入后经 BroadcastChannel 广播，其他标签页更新本地已读
 * 集合，因此同一公告不会在两个标签页各弹一次。BroadcastChannel 不投递给
 * 发送方自己，天然无广播风暴。
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { NoticeResponseDto } from '@/api-sdk';
import { useAuth } from '@/contexts/AuthContext';
import { NOTICE_ACK_TTL_MS } from '@/constants/timeouts';
import {
  addAck,
  isAcknowledged,
  pruneAcks,
  readAcks,
  writeAcks,
  type NoticeAckMap,
} from './noticeAck';
import { sortNoticeQueue } from './noticeTypes';
import { useNoticeStream, type NoticeStreamMode } from './useNoticeStream';

/** 跨标签页 ack 广播频道名 */
const NOTICE_ACK_CHANNEL = 'cloudcad_notice';

interface AckMessage {
  type: 'ack';
  noticeId: string;
  at: number;
}

export interface NoticeContextType {
  /** 生效中的全部通知（已按级别/时间排序，横幅取首条） */
  notices: NoticeResponseDto[];
  /** 队列头：尚未在 TTL 内 ack 的最高优先级通知 */
  currentNotice: NoticeResponseDto | null;
  /** 待弹数量（横幅角标用） */
  pendingCount: number;
  /** 关闭当前弹框：记 ack + 广播到其他标签页 */
  dismiss: (noticeId: string) => void;
  mode: NoticeStreamMode;
}

const NoticeContext = createContext<NoticeContextType | undefined>(undefined);

export function useNotices(): NoticeContextType {
  const context = useContext(NoticeContext);
  if (context === undefined) {
    throw new Error('useNotices must be used within a NoticeProvider');
  }
  return context;
}

function mergeById(
  existing: NoticeResponseDto[],
  incoming: NoticeResponseDto[]
): NoticeResponseDto[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) byId.set(n.id, n);
  return sortNoticeQueue(Array.from(byId.values()));
}

function upsertOne(
  existing: NoticeResponseDto[],
  notice: NoticeResponseDto
): NoticeResponseDto[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  byId.set(notice.id, notice);
  return sortNoticeQueue(Array.from(byId.values()));
}

export const NoticeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { isAuthenticated } = useAuth();
  const [notices, setNotices] = useState<NoticeResponseDto[]>([]);
  const [acked, setAcks] = useState<NoticeAckMap>(() => readAcks());

  const handleNotices = useCallback((incoming: NoticeResponseDto[]) => {
    setNotices((prev) => mergeById(prev, incoming));
  }, []);

  const handleUpsert = useCallback((notice: NoticeResponseDto) => {
    setNotices((prev) => upsertOne(prev, notice));
  }, []);

  const handleRetract = useCallback((noticeId: string) => {
    setNotices((prev) => prev.filter((n) => n.id !== noticeId));
  }, []);

  const { mode } = useNoticeStream(true, isAuthenticated, {
    onNotices: handleNotices,
    onUpsert: handleUpsert,
    onRetract: handleRetract,
  });

  // 跨标签页同步已读；BroadcastChannel 部分 webview 下不存在，缺失即退化为单标签页
  const channelRef = React.useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(NOTICE_ACK_CHANNEL);
    channel.onmessage = (event: MessageEvent) => {
      const msg = event.data as AckMessage | null;
      if (!msg || msg.type !== 'ack' || typeof msg.at !== 'number') return;
      setAcks((prev) => ({ ...prev, [msg.noticeId]: msg.at }));
    };
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      channel.close();
    };
  }, []);

  const dismiss = useCallback((noticeId: string) => {
    const now = Date.now();
    setAcks((prev) => {
      const next = addAck(prev, noticeId, now);
      writeAcks(pruneAcks(next, now, NOTICE_ACK_TTL_MS));
      return next;
    });
    channelRef.current?.postMessage(
      { type: 'ack', noticeId, at: now } satisfies AckMessage
    );
  }, []);

  // ack TTL 是 24h，渲染周期内的时间漂移不影响判断，故不把 Date.now() 放进依赖
  const pending = useMemo(
    () =>
      notices.filter((n) =>
        !isAcknowledged(acked, n.id, Date.now(), NOTICE_ACK_TTL_MS)
      ),
    [notices, acked]
  );

  const value = useMemo<NoticeContextType>(
    () => ({
      notices,
      currentNotice: pending[0] ?? null,
      pendingCount: pending.length,
      dismiss,
      mode,
    }),
    [notices, pending, dismiss, mode]
  );

  return <NoticeContext.Provider value={value}>{children}</NoticeContext.Provider>;
};

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
 * 通知弹框的全局挂载点。
 *
 * 挂在 <Routes> 与 CAD 编辑器懒加载之外（App.tsx），保证「正在使用 CAD 编辑器
 * 的用户也能实时弹出」——不会因路由切换或编辑器 chunk 未加载而错过。
 *
 * 队列语义：每次只弹最优先的一条，关掉后自动弹下一条；同一设备 TTL 内只提醒
 * 一次，避免管理员重发或客户端重连导致重复弹窗。跨标签页用 BroadcastChannel
 * 同步已读状态，A 标签页关了 B 标签页不重复弹。
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  isAcknowledged,
  markAcknowledged,
  pruneExpiredAcks,
  readAcks,
  writeAcks,
  type NoticeAckMap,
} from './noticeAck';
import { NoticeModal } from './NoticeModal';
import type { Notice } from './noticeTypes';
import { useNoticeStream } from './useNoticeStream';

/** 跨标签页已读同步频道 */
export const NOTICE_ACK_CHANNEL = 'cloudcad_notice_acks';

/** 已读记录的清理周期（远小于 TTL，只为防止 localStorage 无限增长） */
const NOTICE_ACK_PRUNE_INTERVAL_MS = 60 * 60 * 1000;

export interface NoticeContextValue {
  /** 当前生效中的全部通知（横幅用：已读也算常驻提醒） */
  notices: Notice[];
  /** 待弹的最上一条通知；队列空或已读时 null */
  active: Notice | null;
  /** 队列中尚未提醒的通知 */
  pending: Notice[];
  /** 标记已读并推进到下一条 */
  acknowledge: (notice: Notice) => void;
}

const NoticeContext = createContext<NoticeContextValue | null>(null);

/** 过滤出 TTL 内未读的通知（入参已排序，这里只做筛选以保持顺序） */
export function filterUnacknowledged(
  notices: Notice[],
  acks: NoticeAckMap,
  now: number
): Notice[] {
  return notices.filter((notice) => !isAcknowledged(acks, notice.id, now));
}

export const NoticeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { notices } = useNoticeStream(true);
  const [acks, setAcks] = useState<NoticeAckMap>(() => readAcks());
  const ackChannelRef = useRef<BroadcastChannel | null>(null);

  // 其他标签页标记已读后同步过来。onmessage 只负责重读存储，
  // 不持有跨标签页的写入状态，避免写顺序竞态。
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined;
    const channel = new BroadcastChannel(NOTICE_ACK_CHANNEL);
    ackChannelRef.current = channel;
    channel.onmessage = () => {
      setAcks(readAcks());
    };
    return () => {
      channel.close();
      ackChannelRef.current = null;
    };
  }, []);

  // 定期清理过期已读记录，防止 localStorage 随公告数量增长
  useEffect(() => {
    const interval = setInterval(() => {
      setAcks((prev) => pruneExpiredAcks(prev, Date.now()));
    }, NOTICE_ACK_PRUNE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const acknowledge = useCallback((notice: Notice) => {
    const now = Date.now();
    setAcks((prev) => {
      const next = pruneExpiredAcks(
        markAcknowledged(prev, notice.id, now),
        now
      );
      writeAcks(next);
      return next;
    });
    // 写盘后再广播，保证其他标签页读到的一定是已落盘的状态
    ackChannelRef.current?.postMessage({ noticeId: notice.id });
  }, []);

  const pending = useMemo(
    () => filterUnacknowledged(notices, acks, Date.now()),
    [notices, acks]
  );

  const value = useMemo<NoticeContextValue>(
    () => ({ notices, active: pending[0] ?? null, pending, acknowledge }),
    [notices, pending, acknowledge]
  );

  return (
    <NoticeContext.Provider value={value}>
      {children}
      <NoticeModal notice={value.active} onAcknowledge={acknowledge} />
    </NoticeContext.Provider>
  );
};

export const useNotice = (): NoticeContextValue => {
  const context = useContext(NoticeContext);
  if (!context) {
    throw new Error('useNotice must be used within a NoticeProvider');
  }
  return context;
};

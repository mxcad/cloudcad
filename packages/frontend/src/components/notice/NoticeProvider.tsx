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
 * 通知的全局挂载点与分级分流。
 *
 * 挂在 <Routes> 与 CAD 编辑器懒加载之外（App.tsx），保证「正在使用 CAD 编辑器
 * 的用户也能实时收到」——不会因路由切换或编辑器 chunk 未加载而错过。
 *
 * 三级分流（level → 呈现方式，是全端一致的契约，勿按页面特判）：
 *   danger  弹框，阻塞；队列每次只弹最优先的一条，关掉后弹下一条
 *   warning 右上角可点击提示，8s 自动消失；点击展开通知列表
 *   info    不主动呈现，只在通知列表里可见
 *
 * 列表是 info 的唯一承载通道，也是 danger 被确认后的回溯入口，所以列表必须
 * 显示「全部生效中」而不是「仅未读」——公告在 endAt / retract 前始终有效。
 *
 * 两份簿记，职责不重叠（详见 noticeAck.ts 同名段落的说明）：
 *   ack    抑制重复提醒，TTL 24h，过期即重新弹框/提示——停机公告跨天要再
 *          提醒一次，这是刻意设计。键是「id + updatedAt」而不是 id：级别升级、
 *          文案被改、下线后重新发布都会让 updatedAt 变化，从而重新提醒一次
 *          （只按 id 记会把「同一条通知的更新」静默吞掉）
 *   viewed 用户是否点开看过，无 TTL。bell 徽标的「未读」只看 viewed，否则
 *          24h 一到红点集体复亮，而用户明明看过
 *
 * 发布者豁免：publishedById 是自己的公告不主动打断自己（发布者要的是「发给别人
 * 看」，不是提醒我自己）。豁免范围只限主动呈现（弹框 + 提示），不豁免列表
 * 可见性——发布者仍需在列表里自查渲染效果。
 *
 * 跨标签页用 BroadcastChannel 同步两份簿记：A 标签页确认了，B 标签页不重复弹。
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
  ackEntryKey,
  isAcknowledged,
  isViewed as isViewedRecord,
  markAcknowledged,
  markViewed as markViewedRecord,
  pruneExpiredAcks,
  pruneViewed,
  readAcks,
  readViewed,
  writeAcks,
  writeViewed,
  type NoticeAckMap,
} from './noticeAck';
import { NoticeModal } from './NoticeModal';
import { NoticeListModal } from './NoticeListModal';
import type { Notice } from './noticeTypes';
import { useAuth } from '@/contexts/AuthContext';
import { useCADEditorStore } from '@/stores/useCADEditorStore';
import { useNoticeStream } from './useNoticeStream';
import { globalShowToast } from '@/utils/notificationEvents';

/** 跨标签页簿记同步频道 */
export const NOTICE_ACK_CHANNEL = 'cloudcad_notice_acks';

/** 已读记录的清理周期（远小于 TTL，只为防止 localStorage 无限增长） */
const NOTICE_ACK_PRUNE_INTERVAL_MS = 60 * 60 * 1000;

/**
 * warning 提示的展示时长。比普通操作反馈提示（5s）长：公告正文需要阅读时间，
 * 且它同时是「点击看列表」的入口，太短用户来不及点。
 */
export const WARNING_TOAST_DURATION_MS = 8000;

export interface NoticeContextValue {
  /** 当前生效中的全部通知（列表用：已读也算生效中，下线才消失） */
  notices: Notice[];
  /** 生效中且未查看过的（bell 徽标数） */
  unread: Notice[];
  /** 待弹的最上一条 danger 通知；无 danger 或已确认时 null */
  active: Notice | null;
  /** 某条是否已查看过 */
  isViewed: (noticeId: string) => boolean;
  /** 确认弹框：写 ack 并推进到下一条 danger */
  acknowledge: (notice: Notice) => void;
  /** 标记为已查看（清零徽标，不影响 ack 与弹框抑制） */
  viewNotice: (noticeId: string) => void;
  /** 通知列表当前聚焦的条目（null = 列表态） */
  listDetailId: string | null;
  /** bell 下拉的开合（受控；warning 提示点击时由这里展开） */
  bellOpen: boolean;
  setNoticeBellOpen: (open: boolean) => void;
  /** CAD 编辑器的列表弹框开关（那里没有 header，也就没有 bell） */
  listModalOpen: boolean;
  closeNoticeListModal: () => void;
  /**
   * 展开通知列表，可选聚焦到某条。普通页面展开 header 里的 bell 下拉（轻，不遮
   * 内容）；CAD 编辑器里展开弹框（无 header 可挂下拉）。
   */
  openNoticeList: (noticeId?: string) => void;
}

const NoticeContext = createContext<NoticeContextValue | null>(null);

/** 过滤出 TTL 内未读的通知（入参已排序，这里只做筛选以保持顺序） */
export function filterUnacknowledged(
  notices: Notice[],
  acks: NoticeAckMap,
  now: number
): Notice[] {
  return notices.filter(
    (notice) => !isAcknowledged(acks, ackEntryKey(notice.id, notice.updatedAt), now)
  );
}

export const NoticeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { notices } = useNoticeStream(true);
  const { user } = useAuth();
  const ownerId = user?.id ?? null;
  const [acks, setAcks] = useState<NoticeAckMap>(() =>
    readAcks(localStorage, ownerId)
  );
  const [viewed, setViewed] = useState<string[]>(() =>
    readViewed(localStorage, ownerId)
  );
  const [listDetailId, setListDetailId] = useState<string | null>(null);
  // bell 下拉的受控开合：warning 提示点击时要由这里展开，故不放组件本地
  const [bellOpen, setBellOpen] = useState(false);
  // CAD 编辑器里的列表弹框（那里没有 header，也就没有 bell 可挂）
  const [listModalOpen, setListModalOpen] = useState(false);
  const isCadActive = useCADEditorStore((s) => s.isActive);
  // 当前正在展示 warning 提示的那一条；非空时暂停排队下一条
  const [showingWarningId, setShowingWarningId] = useState<string | null>(
    null
  );
  const ackChannelRef = useRef<BroadcastChannel | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 账号切换后重读两份簿记：按账号隔离，不能沿用上一个账号的状态
  useEffect(() => {
    setAcks(readAcks(localStorage, ownerId));
    setViewed(readViewed(localStorage, ownerId));
  }, [ownerId]);

  // 其他标签页标记已读/已查看后同步过来。onmessage 只负责重读存储，
  // 不持有跨标签页的写入状态，避免写顺序竞态。
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined;
    const channel = new BroadcastChannel(NOTICE_ACK_CHANNEL);
    ackChannelRef.current = channel;
    channel.onmessage = () => {
      setAcks(readAcks(localStorage, ownerId));
      setViewed(readViewed(localStorage, ownerId));
    };
    return () => {
      channel.close();
      ackChannelRef.current = null;
    };
  }, [ownerId]);

  // 定期清理过期已读记录，防止 localStorage 随公告数量增长
  useEffect(() => {
    const interval = setInterval(() => {
      setAcks((prev) => pruneExpiredAcks(prev, Date.now()));
    }, NOTICE_ACK_PRUNE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // 进 CAD 编辑器后 header 被编辑器覆盖层挡住，bell 下拉不应继续悬在编辑器上
  useEffect(() => {
    if (isCadActive) setBellOpen(false);
  }, [isCadActive]);

  // 已下线/已过期条目从生效列表里消失后，清理其 viewed 记录（空列表不清理）
  useEffect(() => {
    if (notices.length === 0) return;
    const validIds = new Set(notices.map((n) => n.id));
    setViewed((prev) => {
      const next = pruneViewed(prev, validIds);
      if (next === prev) return prev;
      writeViewed(next, localStorage, ownerId);
      return next;
    });
  }, [notices, ownerId]);

  // 卸载时清掉 warning 提示的排队定时器
  useEffect(
    () => () => {
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    },
    []
  );

  const acknowledge = useCallback(
    (notice: Notice) => {
      const now = Date.now();
      const key = ackEntryKey(notice.id, notice.updatedAt);
      setAcks((prev) => {
        const next = pruneExpiredAcks(markAcknowledged(prev, key, now), now);
        writeAcks(next, localStorage, ownerId);
        return next;
      });
      // 写盘后再广播，保证其他标签页读到的一定是已落盘的状态
      ackChannelRef.current?.postMessage({ noticeId: notice.id });
    },
    [ownerId]
  );

  const viewNotice = useCallback(
    (noticeId: string) => {
      setViewed((prev) => {
        const next = markViewedRecord(prev, noticeId);
        if (next === prev) return prev;
        writeViewed(next, localStorage, ownerId);
        return next;
      });
      ackChannelRef.current?.postMessage({ noticeId, viewed: true });
    },
    [ownerId]
  );

  const openNoticeList = useCallback(
    (noticeId?: string) => {
      setListDetailId(noticeId ?? null);
      if (isCadActive) {
        setListModalOpen(true);
      } else {
        setBellOpen(true);
      }
    },
    [isCadActive]
  );

  const closeNoticeListModal = useCallback(() => {
    setListModalOpen(false);
    setListDetailId(null);
  }, []);

  const isViewed = useCallback(
    (noticeId: string) => isViewedRecord(viewed, noticeId),
    [viewed]
  );

  /** TTL 内未读的通知（弹框与提示的唯一候选集） */
  const unacked = useMemo(
    () => filterUnacknowledged(notices, acks, Date.now()),
    [notices, acks]
  );

  /** 剔除发布者自己的公告：不主动打断自己 */
  const proactive = useMemo(
    () =>
      ownerId
        ? unacked.filter((n) => n.publishedById !== ownerId)
        : unacked,
    [unacked, ownerId]
  );

  /** danger 弹框队列（候选集已按级别降序 + 发布时间降序排好） */
  const activeDangers = useMemo(
    () => proactive.filter((n) => n.level === 'danger'),
    [proactive]
  );

  const warnings = useMemo(
    () => proactive.filter((n) => n.level === 'warning'),
    [proactive]
  );

  // warning 提示队列：一次只展示一条，消失后排下一条。
  // 展示即写 ack（TTL 内不重复提醒）；排队进度用 showingWarningId 跟踪，
  // 不能靠 ack 反推——一展示就 ack 会让候选集立刻前进，下一条马上被推出。
  useEffect(() => {
    if (showingWarningId) return;
    const next = warnings[0];
    if (!next) return;

    acknowledge(next);
    setShowingWarningId(next.id);
    globalShowToast(next.title, 'warning', {
      duration: WARNING_TOAST_DURATION_MS,
      forceOverlay: true,
      onClick: () => openNoticeList(next.id),
    });
    warningTimerRef.current = setTimeout(
      () => setShowingWarningId(null),
      WARNING_TOAST_DURATION_MS
    );
  }, [showingWarningId, warnings, acknowledge, openNoticeList]);

  const unread = useMemo(
    () => notices.filter((n) => !isViewedRecord(viewed, n.id)),
    [notices, viewed]
  );

  const value = useMemo<NoticeContextValue>(
    () => ({
      notices,
      unread,
      active: activeDangers[0] ?? null,
      isViewed,
      acknowledge,
      viewNotice,
      listDetailId,
      bellOpen,
      // useState 的 setter 恒稳定，无需进依赖数组
      setNoticeBellOpen: setBellOpen,
      listModalOpen,
      closeNoticeListModal,
      openNoticeList,
    }),
    [
      notices,
      unread,
      activeDangers,
      isViewed,
      acknowledge,
      viewNotice,
      listDetailId,
      bellOpen,
      listModalOpen,
      closeNoticeListModal,
      openNoticeList,
    ]
  );

  return (
    <NoticeContext.Provider value={value}>
      {children}
      <NoticeModal notice={value.active} onAcknowledge={acknowledge} />
      {listModalOpen && (
        <NoticeListModal
          notices={notices}
          isViewed={isViewed}
          onView={viewNotice}
          initialDetailId={listDetailId}
          onClose={closeNoticeListModal}
        />
      )}
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

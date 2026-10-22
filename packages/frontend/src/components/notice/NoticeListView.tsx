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
 * 通知列表视图：头部（标题 + 通知/时间线切换）+ 两种密度的列表 + 详情态。
 * 同一份 UI 放进两种容器——header 的 bell 下拉，以及 CAD 编辑器里的弹框
 * （那里没有 header，也就没有 bell 可挂）。
 *
 * 两种视图展示同一份数据、不同密度：「通知」是卡片式（级别色条 + 图标 + 标题
 * + 两行摘要），适合读公告；「时间线」是紧凑事件流（级别圆点 + 标题 + 时间），
 * 适合快速扫历史。正文上限 4000 字放不进下拉面板，读全文仍点卡片进详情态。
 *
 * 为什么详情态不与弹框叠加：读一条公告是轻量动作，不该为此再叠一层全屏遮罩
 * （Modal 还会锁住 document.body 滚动）。
 *
 * 列表显示「全部生效中」，已读条目照常显示只是去掉未读标记——公告在 endAt /
 * retract 之前始终有效，已读不该让它从列表里消失。
 *
 * title / body 按后端原文渲染（不走 t()）：管理员按目标语言填写公告，前端不
 * 二次翻译。只有固定 UI 文案走 i18n。
 *
 * 层级色一律取 CSS 变量（--info/--warning/--error、--bg-*、--border-*）：本项目
 * 按 [data-theme] 切换主题，Tailwind 的 dark: 变体不认主题开关。
 */

import React, { useState } from 'react';
import {
  Bell,
  BellOff,
  ChevronLeft,
  History,
  Info,
  OctagonAlert,
  TriangleAlert,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Tabs } from '@/components/ui/Tabs';
import { TabButton } from '@/components/ui/TabButton';
import { getRelativeTime, formatDateTimeWithSeconds } from '@/utils/dateUtils';
import { t } from '@/languages';

import { NOTICE_LEVEL_COLORS } from './noticeTypes';
import type { Notice } from './noticeTypes';

/** 面板内的两种展示密度 */
type NoticeView = 'notice' | 'timeline';

export interface NoticeListViewProps {
  /** 当前生效中的全部通知（已按级别与时间排序） */
  notices: Notice[];
  /** 某条是否已查看过 */
  isViewed: (noticeId: string) => boolean;
  /** 点开某条详情（由调用方决定何时写 viewed 簿记） */
  onView: (noticeId: string) => void;
  /** 初次打开时聚焦的条目 ID */
  initialDetailId?: string | null;
  /** 面板总高（含头部） */
  maxHeight?: number;
  /**
   * 是否渲染内置头部（标题 + 副标题 + 视图切换）。
   * CAD 编辑器里的弹框自带 Modal 标题栏（含关闭按钮），关掉这份内置头部避免重复。
   */
  showHeader?: boolean;
}

const FALLBACK_COLOR = NOTICE_LEVEL_COLORS.info as string;

const LEVEL_ICONS: Record<string, LucideIcon> = {
  info: Info,
  warning: TriangleAlert,
  danger: OctagonAlert,
};

const FALLBACK_ICON: LucideIcon = Bell;

/** 取排序/展示用的发布时间戳，缺失时退回创建时间 */
function noticePublishedAt(notice: Notice): string | null {
  return notice.publishedAt ?? notice.createdAt ?? null;
}

/** 面板头部：可选标题 + 副标题 + 视图切换。视图切换始终渲染 */
function NoticePanelHeader({
  view,
  onViewChange,
  showHeader,
}: {
  view: NoticeView;
  onViewChange: (view: NoticeView) => void;
  showHeader: boolean;
}) {
  return (
    <div
      className="px-4 pt-3.5 pb-2.5 border-b flex-shrink-0"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      {showHeader && (
        <div className="mb-2.5">
          <p
            className="text-sm font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('通知中心')}
          </p>
          <p
            className="text-xs mt-0.5"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {t('公告与系统消息')}
          </p>
        </div>
      )}
      <Tabs className="w-full">
        <TabButton
          size="sm"
          active={view === 'notice'}
          onClick={() => onViewChange('notice')}
          className="flex-1 justify-center gap-1.5"
          aria-pressed={view === 'notice'}
        >
          <Bell size={14} />
          {t('通知')}
        </TabButton>
        <TabButton
          size="sm"
          active={view === 'timeline'}
          onClick={() => onViewChange('timeline')}
          className="flex-1 justify-center gap-1.5"
          aria-pressed={view === 'timeline'}
        >
          <History size={14} />
          {t('时间线')}
        </TabButton>
      </Tabs>
    </div>
  );
}

/**
 * 通知态：卡片式一行。
 *
 * 底色用 --bg-tertiary 而非 --bg-secondary：下拉面板底色是 --bg-elevated，
 * 浅主题下它与 --bg-secondary 同为白色，卡片会与面板融在一起只剩一条浅边框。
 * 因此 hover 用阴影而非底色表达（底色已是 --bg-tertiary，再叠 hover 底色无效）。
 */
function NoticeCard({
  notice,
  unread,
  onClick,
}: {
  notice: Notice;
  unread: boolean;
  onClick: () => void;
}) {
  const color = NOTICE_LEVEL_COLORS[notice.level] ?? FALLBACK_COLOR;
  const Icon = LEVEL_ICONS[notice.level] ?? FALLBACK_ICON;
  const publishedAt = noticePublishedAt(notice);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-lg border p-3 mb-2.5 last:mb-0
                 transition-shadow hover:shadow-md"
      style={{
        borderColor: 'var(--border-default)',
        background: 'var(--bg-tertiary)',
        borderLeft: `3px solid ${color}`,
      }}
    >
      <span className="flex items-start gap-2">
        <Icon size={16} className="flex-shrink-0 mt-0.5" style={{ color }} />
        <span
          className="flex-1 min-w-0 truncate text-sm font-semibold"
          style={{
            color: unread ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          {notice.title}
        </span>
        {unread && (
          <span
            aria-hidden
            className="flex-shrink-0 w-2 h-2 mt-1.5 rounded-full"
            style={{ background: color }}
          />
        )}
      </span>
      {notice.body && (
        <span
          className="block mt-1.5 text-xs leading-5 line-clamp-2 whitespace-pre-wrap"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {notice.body}
        </span>
      )}
      {publishedAt && (
        <span
          className="block mt-1.5 text-xs"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {getRelativeTime(publishedAt)}
        </span>
      )}
    </button>
  );
}

/** 时间线态：紧凑一行 */
function TimelineItem({
  notice,
  unread,
  onClick,
}: {
  notice: Notice;
  unread: boolean;
  onClick: () => void;
}) {
  const color = NOTICE_LEVEL_COLORS[notice.level] ?? FALLBACK_COLOR;
  const publishedAt = noticePublishedAt(notice);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-start gap-2.5 px-4 py-2.5 text-left
                 transition-colors hover:bg-[var(--bg-tertiary)]"
      style={{ color: 'var(--text-primary)' }}
    >
      <span
        aria-hidden
        className="flex-shrink-0 w-2 h-2 mt-1.5 rounded-full"
        style={{ background: color }}
      />
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-sm ${
            unread ? 'font-semibold' : 'font-medium'
          }`}
          style={{
            color: unread ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          {notice.title}
        </span>
        {publishedAt && (
          <span
            className="block mt-0.5 text-xs"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {getRelativeTime(publishedAt)} ·{' '}
            {formatDateTimeWithSeconds(publishedAt)}
          </span>
        )}
      </span>
      {unread && (
        <span
          aria-hidden
          className="self-center flex-shrink-0 w-2 h-2 rounded-full"
          style={{ background: color }}
        />
      )}
    </button>
  );
}

/** 详情态 */
function NoticeDetail({
  notice,
  onBack,
}: {
  notice: Notice;
  onBack: () => void;
}) {
  const color = NOTICE_LEVEL_COLORS[notice.level] ?? FALLBACK_COLOR;
  const publishedAt = noticePublishedAt(notice);

  return (
    <div className="flex flex-col min-h-0 h-full">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--bg-tertiary)]"
        style={{ color: 'var(--text-secondary)' }}
      >
        <ChevronLeft size={16} />
        {t('返回')}
      </button>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
        <p
          className="text-base font-semibold leading-6 break-words"
          style={{ color }}
        >
          {notice.title}
        </p>
        <div
          className="flex items-center gap-2 mt-1.5 mb-3 text-xs"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {publishedAt && <span>{getRelativeTime(publishedAt)}</span>}
          {notice.endAt && (
            <span>
              {t('至')} {getRelativeTime(notice.endAt)}
            </span>
          )}
        </div>
        <p
          className="text-sm leading-6 whitespace-pre-wrap break-words"
          style={{ color: 'var(--text-primary)' }}
        >
          {notice.body}
        </p>
      </div>
    </div>
  );
}

export const NoticeListView: React.FC<NoticeListViewProps> = ({
  notices,
  isViewed,
  onView,
  initialDetailId = null,
  maxHeight = 480,
  showHeader = true,
}) => {
  const [view, setView] = useState<NoticeView>('notice');
  const [detailId, setDetailId] = useState<string | null>(initialDetailId);

  const detail =
    detailId !== null ? (notices.find((n) => n.id === detailId) ?? null) : null;

  const openDetail = (id: string) => {
    setDetailId(id);
    onView(id);
  };

  return (
    <div className="flex flex-col min-h-0" style={{ maxHeight }}>
      {detail ? (
        <NoticeDetail notice={detail} onBack={() => setDetailId(null)} />
      ) : (
        <>
          <NoticePanelHeader
            view={view}
            onViewChange={setView}
            showHeader={showHeader}
          />
          <div className="flex-1 min-h-0 overflow-y-auto">
            {notices.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center gap-2 py-10 text-sm"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <BellOff size={28} />
                {t('暂无通知')}
              </div>
            ) : view === 'notice' ? (
              <div className="px-3 py-2.5">
                {notices.map((notice) => (
                  <NoticeCard
                    key={notice.id}
                    notice={notice}
                    unread={!isViewed(notice.id)}
                    onClick={() => openDetail(notice.id)}
                  />
                ))}
              </div>
            ) : (
              <div
                className="divide-y"
                style={{ borderColor: 'var(--border-default)' }}
              >
                {notices.map((notice) => (
                  <TimelineItem
                    key={notice.id}
                    notice={notice}
                    unread={!isViewed(notice.id)}
                    onClick={() => openDetail(notice.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

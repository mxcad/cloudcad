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
 * header 右侧的通知铃铛 + 下拉列表。取代旧的常驻横幅：入口收敛成 header 里
 * 一个和其他按钮同风格的图标按钮，点开展开列表，不再占用一屏横幅高度。
 *
 * 开合状态放在 NoticeProvider（bellOpen）而不是本地 state：warning 提示点击时
 * 需要由 Provider 展开它。CAD 编辑器没有 header（也没有本组件），走弹框入口。
 *
 * 触发器用 PopoverTrigger asChild + 项目 Button，className 与文件队列/语言/主题
 * 按钮保持同一套（React 19 下函数组件的 ref 经 props 透传到真实 button）。
 */

import React from 'react';
import { Bell } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/Tooltip';
import { t } from '@/languages';

import { useNotice } from './NoticeProvider';
import { NoticeListView } from './NoticeListView';

export const NoticeBellDropdown: React.FC = () => {
  const {
    notices,
    unread,
    isViewed,
    viewNotice,
    listDetailId,
    bellOpen,
    setNoticeBellOpen,
  } = useNotice();

  return (
    <div className="p-0.5">
      <Tooltip content={t('通知')}>
        <Popover open={bellOpen} onOpenChange={setNoticeBellOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="secondary"
              className="relative rounded-xl transition-all duration-300 ease-out
                         hover:scale-110 active:scale-95
                         hover:bg-[var(--bg-tertiary)]
                         group"
              aria-label={t('通知')}
              aria-expanded={bellOpen}
            >
              <Bell
                size={20}
                className="text-[var(--text-tertiary)] group-hover:text-[var(--accent-500)]"
              />
              {unread.length > 0 && (
                <span
                  aria-hidden
                  className="absolute -top-0.5 -right-0.5 flex items-center justify-center
                             min-w-[16px] h-[16px] px-1 rounded-full text-[10px] font-semibold
                             text-[var(--text-inverse)] bg-[var(--primary-500)]"
                >
                  {unread.length > 99 ? '99+' : unread.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>

          <PopoverContent
            align="end"
            sideOffset={8}
            className="w-[520px] max-w-[calc(100vw-2rem)] p-0 rounded-xl"
          >
            <NoticeListView
              notices={notices}
              isViewed={isViewed}
              onView={viewNotice}
              initialDetailId={listDetailId}
              maxHeight={520}
            />
          </PopoverContent>
        </Popover>
      </Tooltip>
    </div>
  );
};

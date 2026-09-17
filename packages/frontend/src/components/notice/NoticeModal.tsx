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
 * 通知弹框。
 *
 * title/body 按后端原文渲染（不走 t()）：管理员按目标语言填写公告，前端不二次翻译。
 * 只有固定 UI 文案（按钮）走 i18n。
 *
 * closeOnOverlayClick={false}：这是系统公告不是随手可关的提示，点遮罩不算确认。
 * Escape 仍可通过 Modal 内置的 keydown 关闭（等同确认），保持键盘可达。
 */

import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Z_LAYERS } from '@/constants/layers';
import { t } from '@/languages';

import type { Notice } from './noticeTypes';

/** 级别 → 顶部色条与标题颜色。未知级别按 info 兜底 */
const LEVEL_STYLES: Record<string, { border: string; title: string }> = {
  info: {
    border: 'border-t-blue-500',
    title: 'text-blue-700 dark:text-blue-300',
  },
  warning: {
    border: 'border-t-amber-500',
    title: 'text-amber-700 dark:text-amber-300',
  },
  danger: {
    border: 'border-t-red-500',
    title: 'text-red-700 dark:text-red-300',
  },
};

const FALLBACK_STYLES = LEVEL_STYLES.info as { border: string; title: string };

export interface NoticeModalProps {
  notice: Notice | null;
  onAcknowledge: (notice: Notice) => void;
}

export const NoticeModal: React.FC<NoticeModalProps> = ({
  notice,
  onAcknowledge,
}) => {
  if (!notice) return null;

  const styles = LEVEL_STYLES[notice.level] ?? FALLBACK_STYLES;

  return (
    <Modal
      isOpen
      onClose={() => onAcknowledge(notice)}
      title={
        <span className={`font-semibold ${styles.title}`}>{notice.title}</span>
      }
      contentClassName={`border-t-4 ${styles.border} p-0`}
      closeOnOverlayClick={false}
      zIndex={Z_LAYERS.MODAL}
      size="md"
      footer={
        <Button variant="primary" onClick={() => onAcknowledge(notice)}>
          {t('知道了')}
        </Button>
      }
    >
      <div className="px-6 py-4">
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-gray-700 dark:text-gray-300">
          {notice.body}
        </p>
      </div>
    </Modal>
  );
};

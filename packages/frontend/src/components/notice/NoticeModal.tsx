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

/**
 * 级别 → 强调色。取主题功能色变量（theme.css 在浅/深主题各定义一份），不写死色值。
 *
 * 勿用 Tailwind 的 `dark:` 变体：本项目按 `[data-theme]` + CSS 变量切换主题，
 * Tailwind v4 的 `dark:` 默认只认系统 `prefers-color-scheme`，与主题开关无关——
 * 深色主题下 `dark:text-gray-300` 永不命中，正文回落成 text-gray-700，在深灰弹窗底上
 * 几乎不可见（只有选中高亮时看得到）。
 */
const LEVEL_STYLES: Record<string, { color: string; border: string }> = {
  info: { color: 'var(--info)', border: 'border-t-[var(--info)]' },
  warning: { color: 'var(--warning)', border: 'border-t-[var(--warning)]' },
  danger: { color: 'var(--error)', border: 'border-t-[var(--error)]' },
};

const FALLBACK_STYLES = LEVEL_STYLES.info as { color: string; border: string };

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
        <span className="font-semibold" style={{ color: styles.color }}>
          {notice.title}
        </span>
      }
      // 色条钉在卡片最上沿（而非内容区顶部）：作为卡片边框才读作「级别色条」，
      // 挂在正文上方会读成一条莫名的分割线
      className={`border-t-4 ${styles.border}`}
      contentClassName="p-0"
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
        <p
          className="text-sm leading-relaxed whitespace-pre-wrap break-words"
          style={{ color: 'var(--text-primary)' }}
        >
          {notice.body}
        </p>
      </div>
    </Modal>
  );
};

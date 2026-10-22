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
 * 通知列表弹框：warning 提示点击后的列表载体。
 *
 * 只在 CAD 编辑器里用。CAD 编辑器的路由元素是空片段、编辑器本身是 fixed inset-0
 * 的覆盖层，页面上不存在 header，因此也没有 bell 下拉可用——这里就是它在 CAD
 * 编辑器里的唯一入口。普通页面走 header 里的 bell 下拉（NoticeBellDropdown），
 * 不为「读一条公告」额外叠一层全屏遮罩。
 */

import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Z_LAYERS } from '@/constants/layers';
import { t } from '@/languages';

import { NoticeListView } from './NoticeListView';
import type { Notice } from './noticeTypes';

export interface NoticeListModalProps {
  notices: Notice[];
  isViewed: (noticeId: string) => boolean;
  onView: (noticeId: string) => void;
  initialDetailId?: string | null;
  onClose: () => void;
}

export const NoticeListModal: React.FC<NoticeListModalProps> = ({
  notices,
  isViewed,
  onView,
  initialDetailId,
  onClose,
}) => (
  <Modal
    isOpen
    onClose={onClose}
    title={t('通知')}
    size="md"
    maxWidth="max-w-lg"
    contentClassName="p-0"
    zIndex={Z_LAYERS.MODAL}
  >
    <NoticeListView
      notices={notices}
      isViewed={isViewed}
      onView={onView}
      initialDetailId={initialDetailId}
      maxHeight={560}
      showHeader={false}
    />
  </Modal>
);

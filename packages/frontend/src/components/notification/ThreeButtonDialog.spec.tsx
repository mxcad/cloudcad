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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThreeButtonDialog } from './ThreeButtonDialog';
import type { ThreeButtonDialogState } from './types';

/** 未保存更改守卫弹框的默认状态（mxcadCollaboration.showUnsavedChangesDialog） */
const state: ThreeButtonDialogState = {
  isOpen: true,
  title: '未保存的更改',
  message: '当前图纸有未保存的更改，是否保存？',
  confirmText: '保存',
  discardText: '不保存',
  cancelText: '取消',
  dialogType: 'warning',
};

/** 遮罩层是 portal 根容器的第一个子 div（卡片之上、绝对定位铺满） */
function getOverlay() {
  return document.querySelector('.modal-enter > div') as HTMLElement;
}

function renderDialog() {
  const onConfirm = vi.fn();
  const onDiscard = vi.fn();
  const onCancel = vi.fn();
  render(
    <ThreeButtonDialog
      state={state}
      onConfirm={onConfirm}
      onDiscard={onDiscard}
      onCancel={onCancel}
    />
  );
  return { onConfirm, onDiscard, onCancel };
}

describe('ThreeButtonDialog（未保存更改守卫）', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  // 回归：点击弹框外的区域（遮罩）不得关闭。此前点 CAD 画布一带就自动关闭，
  // 等于用户没做选择，改动被静默丢弃。
  it('点遮罩不关闭，三个选择都不被触发', () => {
    const { onConfirm, onDiscard, onCancel } = renderDialog();

    fireEvent.pointerDown(getOverlay());
    fireEvent.click(getOverlay());

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByText('未保存的更改')).toBeInTheDocument();
  });

  it('按 Esc 不关闭——CAD 内 Esc 是取消绘图命令，不能顺手关掉弹框', () => {
    const { onConfirm, onDiscard, onCancel } = renderDialog();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByText('未保存的更改')).toBeInTheDocument();
  });

  it('右上角关闭按钮不渲染——三选项语义不同，猜测即风险', () => {
    renderDialog();
    expect(
      document.querySelector('[data-tour="modal-close-btn"]')
    ).toBeNull();
  });

  it('底部三个按钮是唯一的作答入口，语义一一对应', () => {
    const { onConfirm, onDiscard, onCancel } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    fireEvent.click(screen.getByRole('button', { name: '不保存' }));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('isOpen=false 时不渲染', () => {
    render(
      <ThreeButtonDialog
        state={
          {
            ...state,
            isOpen: false,
          } as ThreeButtonDialogState
        }
        onConfirm={vi.fn()}
        onDiscard={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.queryByText('未保存的更改')).toBeNull();
  });
});

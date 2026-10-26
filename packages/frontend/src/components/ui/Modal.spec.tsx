///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Modal } from './Modal';

/** 遮罩层是 portal 根容器的第一个子 div（卡片之上、绝对定位铺满） */
function getOverlay() {
  return document.querySelector('.modal-enter > div') as HTMLElement;
}

describe('Modal', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('renders title and body content into a portal', () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="分享协同" size="sm">
        <input aria-label="协同链接" value="https://example.com/cad-editor" readOnly />
      </Modal>
    );

    expect(screen.getByRole('heading', { name: '分享协同' })).toBeInTheDocument();
    expect(
      screen.getByLabelText('协同链接')
    ).toHaveValue('https://example.com/cad-editor');
  });

  // 回归：mxcad-app 编辑器根组件在 document 上注册了 bubble 阶段的 contextmenu
  // 监听器，只要光标落在编辑器根元素矩形内就 preventDefault。弹窗虽然通过 portal
  // 渲到 document.body，contextmenu 仍会冒泡到 document 被吞掉——分享协同链接等
  // 只读输入框右键选不中浏览器菜单（复制不可用）。弹窗根容器须终止传播。
  it('keeps the native context menu on input inside the modal', () => {
    const cadEngineBlocker = vi.fn((e: MouseEvent) => e.preventDefault());
    document.addEventListener('contextmenu', cadEngineBlocker);

    try {
      render(
        <Modal isOpen onClose={vi.fn()} title="分享协同" size="sm">
          <input aria-label="协同链接" readOnly />
        </Modal>
      );

      const ev = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
      });
      screen.getByLabelText('协同链接').dispatchEvent(ev);

      expect(cadEngineBlocker).not.toHaveBeenCalled();
      expect(ev.defaultPrevented).toBe(false);
    } finally {
      document.removeEventListener('contextmenu', cadEngineBlocker);
    }
  });

  it('默认行为：点遮罩、按 Esc 都能关闭', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="分享协同" size="sm">
        <p>正文</p>
      </Modal>
    );

    fireEvent.pointerDown(getOverlay());
    fireEvent.click(getOverlay());
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(3);
    expect(document.querySelector('[data-tour="modal-close-btn"]')).not.toBeNull();
  });

  it('mustChoose：点遮罩与按 Esc 都不关闭，右上角关闭按钮不渲染', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="未保存的更改" size="sm" mustChoose>
        <p>当前图纸有未保存的更改，是否保存？</p>
      </Modal>
    );

    fireEvent.pointerDown(getOverlay());
    fireEvent.click(getOverlay());
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
    expect(
      document.querySelector('[data-tour="modal-close-btn"]')
    ).toBeNull();
  });

  // 回归：mustChoose 只封「没点按钮」的关闭路径，底部按钮仍是唯一出口。
  it('mustChoose 时底部按钮仍能作答，onClose 不被触发', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <Modal
        isOpen
        onClose={onClose}
        title="删除"
        size="sm"
        mustChoose
        footer={
          <button onClick={onConfirm}>确定</button>
        }
      >
        <p>确认删除？</p>
      </Modal>
    );

    fireEvent.click(screen.getByRole('button', { name: '确定' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});
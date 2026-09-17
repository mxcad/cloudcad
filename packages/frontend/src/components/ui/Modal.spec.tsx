///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Modal } from './Modal';

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
});
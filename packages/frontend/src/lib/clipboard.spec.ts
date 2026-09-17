import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  isClipboardApiAvailable,
  fallbackCopyToHiddenTextarea,
  copyText,
} from './clipboard';

// 模块加载时快照 descriptor。Object.defineProperty 打的桩不会被
// vi.restoreAllMocks() 还原，会泄漏到同进程的其他测试文件
//（症状：单文件跑绿、全量跑随机红）。
const navigatorClipboardDesc = Object.getOwnPropertyDescriptor(
  navigator,
  'clipboard',
);
const documentExecCommandDesc = Object.getOwnPropertyDescriptor(
  document,
  'execCommand',
);

function restoreDescriptor(
  target: object,
  key: string,
  desc: PropertyDescriptor | undefined,
) {
  if (desc) Object.defineProperty(target, key, desc);
  else delete (target as Record<string, unknown>)[key];
}

function stubClipboard(writeText: () => unknown) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
    writable: true,
  });
}

function removeClipboard() {
  // happy-dom 的 navigator.clipboard 是原型上的 accessor，delete 实例属性删不掉；
  // 必须在实例上 defineProperty 一个 undefined 数据属性来遮蔽它。
  Object.defineProperty(navigator, 'clipboard', {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

function stubExecCommand(impl: () => unknown) {
  Object.defineProperty(document, 'execCommand', {
    value: impl,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  restoreDescriptor(navigator, 'clipboard', navigatorClipboardDesc);
  restoreDescriptor(document, 'execCommand', documentExecCommandDesc);
});

describe('isClipboardApiAvailable', () => {
  it('clipboard.writeText 是函数时可用', () => {
    stubClipboard(() => Promise.resolve());
    expect(isClipboardApiAvailable()).toBe(true);
  });

  it('clipboard 存在但 writeText 缺失时不可用', () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {},
      configurable: true,
      writable: true,
    });
    expect(isClipboardApiAvailable()).toBe(false);
  });

  it('非安全上下文（navigator.clipboard 整体缺失）时不可用', () => {
    removeClipboard();
    expect(isClipboardApiAvailable()).toBe(false);
  });

  it('writeText 不是函数时不可用', () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: 'not-a-function' },
      configurable: true,
      writable: true,
    });
    expect(isClipboardApiAvailable()).toBe(false);
  });
});

describe('fallbackCopyToHiddenTextarea', () => {
  it('execCommand 返回 true 时复制成功', () => {
    stubExecCommand(() => true);
    expect(fallbackCopyToHiddenTextarea('hello')).toBe(true);
  });

  it('execCommand 返回 false 时复制失败', () => {
    stubExecCommand(() => false);
    expect(fallbackCopyToHiddenTextarea('hello')).toBe(false);
  });

  it('execCommand 抛错时返回 false 而不向外抛', () => {
    stubExecCommand(() => {
      throw new Error('execCommand 不可用');
    });
    expect(fallbackCopyToHiddenTextarea('hello')).toBe(false);
  });

  it('select() 抛错时返回 false 而不向外抛', () => {
    stubExecCommand(() => true);
    const selectSpy = vi.spyOn(
      HTMLTextAreaElement.prototype,
      'select',
    ).mockImplementation(() => {
      throw new Error('webview 中 select 不可用');
    });
    try {
      expect(fallbackCopyToHiddenTextarea('hello')).toBe(false);
    } finally {
      selectSpy.mockRestore();
    }
  });

  it('无论成败，隐藏 textarea 都被移除（无 DOM 残留）', () => {
    stubExecCommand(() => true);
    fallbackCopyToHiddenTextarea('hello');
    expect(document.querySelectorAll('textarea')).toHaveLength(0);

    stubExecCommand(() => {
      throw new Error('boom');
    });
    fallbackCopyToHiddenTextarea('hello');
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });
});

describe('copyText', () => {
  it('现代 API 可用且成功时走 clipboard 路径，不触达 execCommand', async () => {
    stubClipboard(() => Promise.resolve());
    const execSpy = vi.fn(() => true);
    stubExecCommand(execSpy);

    expect(await copyText('hello')).toBe('clipboard');
    expect(execSpy).not.toHaveBeenCalled();
  });

  it('现代 API 拒绝时降级到 execCommand', async () => {
    stubClipboard(() => Promise.reject(new Error('NotAllowedError')));
    stubExecCommand(() => true);

    expect(await copyText('hello')).toBe('execCommand');
  });

  it('现代 API 缺失时走 execCommand', async () => {
    removeClipboard();
    stubExecCommand(() => true);

    expect(await copyText('hello')).toBe('execCommand');
  });

  it('两级都失败时返回 failed', async () => {
    removeClipboard();
    stubExecCommand(() => false);

    expect(await copyText('hello')).toBe('failed');
  });

  it('现代 API 缺失且 execCommand 抛错时返回 failed', async () => {
    removeClipboard();
    stubExecCommand(() => {
      throw new Error('boom');
    });

    expect(await copyText('hello')).toBe('failed');
  });
});

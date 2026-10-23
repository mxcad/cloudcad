import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { focusFirstInvalid } from './formErrors';

const FIELD_ORDER = ['username', 'email', 'password', 'confirmPassword'];

// happy-dom 未必给 scrollIntoView 打实现，直接在原型上替换为 mock
// （vi.restoreAllMocks 会还原原始 descriptor，不会泄漏到别的测试文件）
const scrollIntoViewMock = vi.fn();
const focusMock = vi.fn();

function mountFields(ids: string[]) {
  document.body.innerHTML = '';
  ids.forEach((id) => {
    const el = document.createElement('input');
    el.id = id;
    document.body.appendChild(el);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    value: scrollIntoViewMock,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(HTMLElement.prototype, 'focus', {
    value: focusMock,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

/** 被聚焦的元素是 focus 的调用者（this），不是参数 */
function focusedId(): string | undefined {
  return (focusMock.mock.contexts[0] as HTMLElement | undefined)?.id;
}

describe('focusFirstInvalid', () => {
  it('聚焦字段顺序里第一个出错的字段', () => {
    mountFields(FIELD_ORDER);

    focusFirstInvalid({ password: '太短了' }, FIELD_ORDER);

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    });
    // preventScroll：滚动由 scrollIntoView 负责，focus 不能再次跳动
    expect(focusMock).toHaveBeenCalledTimes(1);
    expect(focusMock).toHaveBeenCalledWith({ preventScroll: true });
    expect(focusedId()).toBe('password');
  });

  it('顺序在前但没出错的字段被跳过', () => {
    mountFields(FIELD_ORDER);

    focusFirstInvalid({ password: 'x', confirmPassword: 'y' }, FIELD_ORDER);

    expect(focusedId()).toBe('password');
  });

  it('没有错误时不动 DOM', () => {
    mountFields(FIELD_ORDER);

    focusFirstInvalid({}, FIELD_ORDER);

    expect(focusMock).not.toHaveBeenCalled();
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it('出错字段没有对应 DOM 节点时静默跳过，不抛错', () => {
    mountFields(['username']);

    expect(() =>
      focusFirstInvalid({ confirmPassword: '两次不一致' }, FIELD_ORDER)
    ).not.toThrow();
    expect(focusMock).not.toHaveBeenCalled();
  });

  it('跳过当前未渲染的步骤，聚焦可见范围内第一个出错项', () => {
    mountFields(['email', 'password']);

    focusFirstInvalid({ username: '已被使用', password: '太短了' }, FIELD_ORDER);

    expect(focusMock).toHaveBeenCalledTimes(1);
    expect(focusedId()).toBe('password');
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseWechatHash } from './parseWechatHash';

/**
 * 回归测试：#282 第 5 项 —— Profile 绑定/注销（bind/deactivate）回调 hash
 * 不能被全局 login 实例消费。此前 parseWechatHash 解析成功即 replaceState
 * 清除 hash，而 Profile 为懒加载（晚于 AuthContext 挂载），bind 实例挂载时
 * hash 已不存在 → 绑定/注销静默失效。
 */
describe('parseWechatHash (purpose 分流)', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  function rawOf(result: unknown): string {
    return JSON.stringify(result);
  }

  it('bind purpose 回调不消费：hash 保留、回调不触发', () => {
    const bindHash = `#wechat_result=${encodeURIComponent(
      rawOf({ code: 'bind-code', state: 'bind-state', purpose: 'bind' })
    )}`;
    window.history.replaceState(null, '', bindHash);
    const onResult = vi.fn();
    const onPopup = vi.fn();

    const consumed = parseWechatHash({
      hash: window.location.hash,
      onPopup,
      onResult,
    });

    expect(consumed).toBe(false);
    expect(onResult).not.toHaveBeenCalled();
    expect(onPopup).not.toHaveBeenCalled();
    // hash 保留，后续 bind 实例仍可解析
    expect(window.location.hash).toContain('wechat_result');
    expect(window.location.hash).toContain('bind-code');
  });

  it('deactivate purpose 回调不消费：hash 保留、回调不触发', () => {
    const deactivateHash = `#wechat_result=${encodeURIComponent(
      rawOf({ code: 'deact-code', state: 'deact-state', purpose: 'deactivate' })
    )}`;
    window.history.replaceState(null, '', deactivateHash);
    const onResult = vi.fn();
    const onPopup = vi.fn();

    const consumed = parseWechatHash({
      hash: window.location.hash,
      onPopup,
      onResult,
    });

    expect(consumed).toBe(false);
    expect(onResult).not.toHaveBeenCalled();
    expect(window.location.hash).toContain('deact-code');
  });

  it('login purpose 回调正常消费：hash 清除、onResult 触发', () => {
    const loginHash = `#wechat_result=${encodeURIComponent(
      rawOf({ at: 'at-login', rt: 'rt-login', purpose: 'login' })
    )}`;
    window.history.replaceState(null, '', loginHash);
    const onResult = vi.fn();
    const onPopup = vi.fn();

    const consumed = parseWechatHash({
      hash: window.location.hash,
      onPopup,
      onResult,
    });

    expect(consumed).toBe(true);
    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({ at: 'at-login' })
    );
    expect(onPopup).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
  });

  it('无 purpose 字段的历史回调保持消费（兼容旧行为）', () => {
    const legacyHash = `#wechat_result=${encodeURIComponent(
      rawOf({ at: 'at-legacy' })
    )}`;
    window.history.replaceState(null, '', legacyHash);
    const onResult = vi.fn();
    const onPopup = vi.fn();

    const consumed = parseWechatHash({
      hash: window.location.hash,
      onPopup,
      onResult,
    });

    expect(consumed).toBe(true);
    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({ at: 'at-legacy' })
    );
  });

  it('isPopup=true 的弹窗回调正常走 onPopup', () => {
    const popupHash = `#wechat_result=${encodeURIComponent(
      rawOf({ at: 'at-popup', isPopup: true, purpose: 'login' })
    )}`;
    window.history.replaceState(null, '', popupHash);
    const onResult = vi.fn();
    const onPopup = vi.fn();

    const consumed = parseWechatHash({
      hash: window.location.hash,
      onPopup,
      onResult,
    });

    expect(consumed).toBe(true);
    expect(onPopup).toHaveBeenCalledWith(
      expect.objectContaining({ at: 'at-popup' })
    );
    expect(onResult).not.toHaveBeenCalled();
  });

  it('无 wechat_result 的 hash 返回 false 且无副作用', () => {
    window.history.replaceState(null, '', '#some-other-hash');
    const onResult = vi.fn();
    const onPopup = vi.fn();

    const consumed = parseWechatHash({
      hash: window.location.hash,
      onPopup,
      onResult,
    });

    expect(consumed).toBe(false);
    expect(onResult).not.toHaveBeenCalled();
    expect(onPopup).not.toHaveBeenCalled();
  });
});

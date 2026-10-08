import { describe, it, expect, beforeEach } from 'vitest';
import { loadAuthState, saveAuthState, clearAuthState } from './authState';
import type { UserDto } from '@/api-sdk';

const user = (id: string): UserDto => ({ id, username: `u-${id}` } as UserDto);

/** 可控 fake storage：按 setItem 调用次序在第 failOnCall 次抛错（模拟配额满）。 */
function installFakeStorage(failOnCall?: number) {
  const store = new Map<string, string>();
  let call = 0;
  const fake = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      call += 1;
      if (failOnCall != null && call === failOnCall) throw new Error('QuotaExceededError');
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  const orig = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: fake });
  return {
    store,
    restore: () =>
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: orig }),
  };
}

describe('authState', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('saveAuthState 成功写三键，loadAuthState 取回同值', () => {
    expect(saveAuthState({ accessToken: 'a', refreshToken: 'r', user: user('1') })).toBe(true);
    expect(loadAuthState()).toEqual({ accessToken: 'a', refreshToken: 'r', user: user('1') });
  });

  it('写 user 键失败（配额满）时回滚已写键到旧值 —— 要么全成要么全无', () => {
    const { store, restore } = installFakeStorage(3);
    // 预置旧值（直接操作 store，不经过 setItem 计数）
    store.set('accessToken', 'old-a');
    store.set('refreshToken', 'old-r');
    store.set('user', JSON.stringify(user('old')));
    try {
      const ok = saveAuthState({
        accessToken: 'new-a',
        refreshToken: 'new-r',
        user: user('new'),
      });
      expect(ok).toBe(false);
      // 回滚：accessToken/refreshToken 从 new 恢复 old；user 写失败但回滚成功保持 old
      expect(store.get('accessToken')).toBe('old-a');
      expect(store.get('refreshToken')).toBe('old-r');
      expect(store.get('user')).toBe(JSON.stringify(user('old')));
    } finally {
      restore();
    }
  });

  it('clearAuthState 清除三键', () => {
    saveAuthState({ accessToken: 'a', refreshToken: 'r', user: user('1') });
    clearAuthState();
    expect(loadAuthState()).toEqual({ accessToken: null, refreshToken: null, user: null });
  });

  it('部分更新：只 patch accessToken 时保留 refreshToken / user', () => {
    saveAuthState({ accessToken: 'a1', refreshToken: 'r1', user: user('1') });
    expect(saveAuthState({ accessToken: 'a2' })).toBe(true);
    expect(loadAuthState()).toEqual({ accessToken: 'a2', refreshToken: 'r1', user: user('1') });
  });

  it('patch 传 null 清除单键（保留其余键）', () => {
    saveAuthState({ accessToken: 'a', refreshToken: 'r', user: user('1') });
    expect(saveAuthState({ user: null })).toBe(true);
    expect(loadAuthState()).toEqual({ accessToken: 'a', refreshToken: 'r', user: null });
  });

  it('存储不可用（undefined）时 saveAuthState 返回 false 且不抛错', () => {
    const orig = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: undefined });
    try {
      expect(() => saveAuthState({ accessToken: 'a' })).not.toThrow();
      expect(saveAuthState({ accessToken: 'a' })).toBe(false);
      expect(loadAuthState().accessToken).toBeNull();
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: orig });
    }
  });

  it('空存储 loadAuthState 三键全 null', () => {
    expect(loadAuthState()).toEqual({ accessToken: null, refreshToken: null, user: null });
  });
});

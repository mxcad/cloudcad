import { describe, it, expect, beforeEach } from 'vitest';
import {
  read,
  write,
  erase,
  readJson,
  writeJson,
  isStorageAvailable,
} from './browserStorage';

describe('browserStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('write 后 read 取回同值', () => {
    expect(write('k', 'v')).toBe(true);
    expect(read('k')).toBe('v');
  });

  it('read 不存在的键返回 null', () => {
    expect(read('missing')).toBeNull();
  });

  it('erase 删除后 read 返回 null', () => {
    write('k', 'v');
    erase('k');
    expect(read('k')).toBeNull();
  });

  it('writeJson 后 readJson 取回同对象', () => {
    expect(writeJson('o', { a: 1 })).toBe(true);
    expect(readJson('o')).toEqual({ a: 1 });
  });

  it('readJson 对非 JSON 值返回 null（不抛）', () => {
    write('raw', 'not-json');
    expect(readJson('raw')).toBeNull();
  });

  it('session 与 local 相互隔离', () => {
    write('k', 'local-v');
    write('k', 'session-v', 'session');
    expect(read('k')).toBe('local-v');
    expect(read('k', 'session')).toBe('session-v');
  });

  it('存储不可用（undefined）时安全降级，绝不抛错', () => {
    const orig = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: undefined,
    });
    try {
      expect(isStorageAvailable()).toBe(false);
      expect(read('k')).toBeNull();
      expect(write('k', 'v')).toBe(false);
      expect(readJson('k')).toBeNull();
      expect(writeJson('k', { a: 1 })).toBe(false);
      expect(() => erase('k')).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: orig,
      });
    }
  });

  it('访问存储属性本身抛错（旧版 Safari 隐私模式）时安全降级', () => {
    const orig = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('denied');
      },
    });
    try {
      expect(isStorageAvailable()).toBe(false);
      expect(read('k')).toBeNull();
      expect(write('k', 'v')).toBe(false);
      expect(() => erase('k')).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: orig,
      });
    }
  });
});

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

import { beforeEach, describe, expect, it } from 'vitest';

import {
  NOTICE_ACK_STORAGE_KEY,
  isAcknowledged,
  markAcknowledged,
  pruneExpiredAcks,
  readAcks,
  writeAcks,
} from './noticeAck';

const NOW = 1_800_000_000_000;
const TTL = 60_000;

class MemoryStorage implements Storage {
  private map = new Map<string, string>();

  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number) {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
}

class ThrowingStorage implements Storage {
  private map = new Map<string, string>();

  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    throw new Error('SecurityError: localStorage 不可用');
  }
  key(index: number) {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    throw new Error('QuotaExceededError');
  }
}

describe('noticeAck', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  describe('readAcks / writeAcks', () => {
    it('往返读写一致', () => {
      writeAcks({ n_1: NOW, n_2: NOW - 1000 }, storage);
      expect(readAcks(storage)).toEqual({ n_1: NOW, n_2: NOW - 1000 });
    });

    it('空存储返回空表', () => {
      expect(readAcks(storage)).toEqual({});
    });

    it('存储内容为非法 JSON 时返回空表（不抛错）', () => {
      storage.setItem(NOTICE_ACK_STORAGE_KEY, '{ 不是 JSON');
      expect(readAcks(storage)).toEqual({});
    });

    it('存储内容为数组或字符串时返回空表', () => {
      storage.setItem(NOTICE_ACK_STORAGE_KEY, '["n_1"]');
      expect(readAcks(storage)).toEqual({});
      storage.setItem(NOTICE_ACK_STORAGE_KEY, '"n_1"');
      expect(readAcks(storage)).toEqual({});
    });

    it('非数字的时间戳被丢弃', () => {
      storage.setItem(
        NOTICE_ACK_STORAGE_KEY,
        JSON.stringify({ n_1: 'bad', n_2: 123, n_3: null })
      );
      expect(readAcks(storage)).toEqual({ n_2: 123 });
    });

    it('读取时 localStorage 抛错返回空表（隐私模式不崩）', () => {
      expect(readAcks(new ThrowingStorage())).toEqual({});
    });

    it('写入时配额满静默失败（不抛错）', () => {
      expect(() => writeAcks({ n_1: NOW }, new ThrowingStorage())).not.toThrow();
    });
  });

  describe('isAcknowledged', () => {
    it('TTL 内已读', () => {
      expect(isAcknowledged({ n_1: NOW - 1000 }, 'n_1', NOW, TTL)).toBe(true);
    });

    it('恰好 TTL 边界视为过期', () => {
      expect(isAcknowledged({ n_1: NOW - TTL }, 'n_1', NOW, TTL)).toBe(false);
    });

    it('时钟轻微前移（小于 TTL）仍视为已读，避免标签页间时钟抖动导致重复弹窗', () => {
      expect(isAcknowledged({ n_1: NOW + 1000 }, 'n_1', NOW, TTL)).toBe(true);
    });

    it('未记录视为未读', () => {
      expect(isAcknowledged({}, 'n_1', NOW, TTL)).toBe(false);
    });
  });

  describe('markAcknowledged', () => {
    it('写入新记录', () => {
      expect(markAcknowledged({}, 'n_1', NOW)).toEqual({ n_1: NOW });
    });

    it('不修改原对象', () => {
      const acks = { n_1: NOW };
      markAcknowledged(acks, 'n_2', NOW);
      expect(acks).toEqual({ n_1: NOW });
    });

    it('重复标记覆盖旧时间戳', () => {
      const acks = { n_1: NOW - 5000 };
      expect(markAcknowledged(acks, 'n_1', NOW)).toEqual({ n_1: NOW });
    });
  });

  describe('pruneExpiredAcks', () => {
    it('剔除过期记录保留有效记录', () => {
      const acks = {
        fresh: NOW,
        expired: NOW - TTL - 1,
        future: NOW + 1000,
      };
      // 未来时间戳（时钟轻微前移）按「未到 TTL」保留，与 isAcknowledged 的判定一致
      expect(pruneExpiredAcks(acks, NOW, TTL)).toEqual({ fresh: NOW, future: NOW + 1000 });
    });

    it('全过期返回空表', () => {
      expect(pruneExpiredAcks({ n_1: NOW - TTL }, NOW, TTL)).toEqual({});
    });

    it('不修改原对象', () => {
      const acks = { n_1: NOW, n_2: 1 };
      pruneExpiredAcks(acks, NOW, TTL);
      expect(acks).toEqual({ n_1: NOW, n_2: 1 });
    });
  });
});

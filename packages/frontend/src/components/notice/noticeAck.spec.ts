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
  NOTICE_VIEWED_STORAGE_KEY,
  ackEntryKey,
  ackStorageKey,
  isAcknowledged,
  isViewed,
  markAcknowledged,
  markViewed,
  pruneExpiredAcks,
  pruneViewed,
  readAcks,
  readViewed,
  viewedStorageKey,
  writeAcks,
  writeViewed,
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
      storage.setItem(ackStorageKey('u_1'), '{ 不是 JSON');
      expect(readAcks(storage, 'u_1')).toEqual({});
    });

    it('存储内容为数组或字符串时返回空表', () => {
      storage.setItem(ackStorageKey('u_1'), '["n_1"]');
      expect(readAcks(storage, 'u_1')).toEqual({});
      storage.setItem(ackStorageKey('u_1'), '"n_1"');
      expect(readAcks(storage, 'u_1')).toEqual({});
    });

    it('非数字的时间戳被丢弃', () => {
      storage.setItem(
        ackStorageKey('u_1'),
        JSON.stringify({ n_1: 'bad', n_2: 123, n_3: null })
      );
      expect(readAcks(storage, 'u_1')).toEqual({ n_2: 123 });
    });

    it('读取时 localStorage 抛错返回空表（隐私模式不崩）', () => {
      expect(readAcks(new ThrowingStorage())).toEqual({});
    });

    it('写入时配额满静默失败（不抛错）', () => {
      expect(() => writeAcks({ n_1: NOW }, new ThrowingStorage())).not.toThrow();
    });

    it('键带账号后缀，不同账号各存各的簿记', () => {
      expect(ackStorageKey('u_1')).toBe(`${NOTICE_ACK_STORAGE_KEY}:u_1`);
      expect(ackStorageKey()).toBe(`${NOTICE_ACK_STORAGE_KEY}:anonymous`);

      writeAcks({ n_1: NOW }, storage, 'u_1');
      writeAcks({ n_2: NOW }, storage, 'u_2');

      expect(readAcks(storage, 'u_1')).toEqual({ n_1: NOW });
      expect(readAcks(storage, 'u_2')).toEqual({ n_2: NOW });
      expect(readAcks(storage)).toEqual({});
    });

    it('未登录账号与已登录账号的簿记互不串用', () => {
      writeAcks({ n_1: NOW }, storage, null);
      writeAcks({ n_2: NOW }, storage, 'u_1');

      expect(readAcks(storage, undefined)).toEqual({ n_1: NOW });
      expect(readAcks(storage, null)).toEqual({ n_1: NOW });
      expect(readAcks(storage, 'u_1')).toEqual({ n_2: NOW });
    });

    it('旧键（无账号后缀）不被读取，靠 TTL 自然失效', () => {
      storage.setItem(NOTICE_ACK_STORAGE_KEY, JSON.stringify({ n_1: NOW }));
      expect(readAcks(storage, 'u_1')).toEqual({});
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

  describe('ackEntryKey', () => {
    it('键为 id + 内容版本', () => {
      expect(ackEntryKey('n_1', '2026-09-17T00:00:00.000Z')).toBe(
        'n_1:2026-09-17T00:00:00.000Z'
      );
    });

    it('updatedAt 变化产生新键：改级别/改文案/下线重发后旧 ack 失配，会重弹', () => {
      expect(ackEntryKey('n_1', 'v1')).not.toBe(ackEntryKey('n_1', 'v2'));
      expect(ackEntryKey('n_1', 'v1')).not.toBe(ackEntryKey('n_2', 'v1'));
    });

    it('Date 实例按 ISO 串参与组键', () => {
      const date = new Date('2026-09-17T00:00:00.000Z');
      expect(ackEntryKey('n_1', date)).toBe('n_1:2026-09-17T00:00:00.000Z');
    });

    it('updatedAt 缺失仍保持复合形态，不退回按 id 判重', () => {
      expect(ackEntryKey('n_1')).toBe('n_1:');
      expect(ackEntryKey('n_1', null)).toBe('n_1:');
      expect(ackEntryKey('n_1')).not.toBe('n_1');
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

  describe('readViewed / writeViewed', () => {
    it('往返读写一致', () => {
      writeViewed(['n_1', 'n_2'], storage);
      expect(readViewed(storage)).toEqual(['n_1', 'n_2']);
    });

    it('空存储返回空数组', () => {
      expect(readViewed(storage)).toEqual([]);
    });

    it('非法 JSON / 非数组 / 空串与非字符串元素都被丢弃', () => {
      storage.setItem(viewedStorageKey('u_1'), '{ 不是 JSON');
      expect(readViewed(storage, 'u_1')).toEqual([]);
      storage.setItem(viewedStorageKey('u_1'), '"n_1"');
      expect(readViewed(storage, 'u_1')).toEqual([]);
      storage.setItem(
        viewedStorageKey('u_1'),
        JSON.stringify(['n_1', '', 7, null, 'n_1'])
      );
      expect(readViewed(storage, 'u_1')).toEqual(['n_1']);
    });

    it('读取或写入时 localStorage 抛错都不崩（隐私模式 / 配额满）', () => {
      expect(readViewed(new ThrowingStorage())).toEqual([]);
      expect(() => writeViewed(['n_1'], new ThrowingStorage())).not.toThrow();
    });

    it('键带账号后缀，未登录归入 anonymous', () => {
      expect(viewedStorageKey('u_1')).toBe(`${NOTICE_VIEWED_STORAGE_KEY}:u_1`);
      expect(viewedStorageKey()).toBe(`${NOTICE_VIEWED_STORAGE_KEY}:anonymous`);

      writeViewed(['n_1'], storage, 'u_1');
      writeViewed(['n_2'], storage, null);

      expect(readViewed(storage, 'u_1')).toEqual(['n_1']);
      expect(readViewed(storage, undefined)).toEqual(['n_2']);
      expect(readViewed(storage)).toEqual(['n_2']);
    });

    it('与 ack 簿记使用不同的存储键（互不串用）', () => {
      expect(viewedStorageKey('u_1')).not.toBe(ackStorageKey('u_1'));
      writeViewed(['n_1'], storage, 'u_1');
      expect(readAcks(storage, 'u_1')).toEqual({});
    });
  });

  describe('isViewed / markViewed', () => {
    it('记录过即为已查看', () => {
      expect(isViewed(['n_1'], 'n_1')).toBe(true);
      expect(isViewed(['n_1'], 'n_2')).toBe(false);
    });

    it('标记写入新记录且不修改原数组', () => {
      const viewed = ['n_1'];
      expect(markViewed(viewed, 'n_2')).toEqual(['n_1', 'n_2']);
      expect(viewed).toEqual(['n_1']);
    });

    it('重复标记幂等（不产生重复条目）', () => {
      const viewed = ['n_1'];
      expect(markViewed(viewed, 'n_1')).toEqual(['n_1']);
      expect(markViewed(viewed, 'n_1')).toBe(viewed);
    });
  });

  describe('pruneViewed', () => {
    it('剔除不再生效的条目', () => {
      expect(pruneViewed(['n_1', 'n_2', 'n_3'], new Set(['n_1']))).toEqual([
        'n_1',
      ]);
    });

    it('空集合不清理：首屏尚未拉回数据时不能抹掉全部已读记录', () => {
      const viewed = ['n_1', 'n_2'];
      const pruned = pruneViewed(viewed, new Set());
      expect(pruned).toEqual(['n_1', 'n_2']);
      expect(pruned).toBe(viewed);
    });

    it('不修改原数组', () => {
      const viewed = ['n_1', 'n_2'];
      pruneViewed(viewed, new Set(['n_1']));
      expect(viewed).toEqual(['n_1', 'n_2']);
    });
  });
});

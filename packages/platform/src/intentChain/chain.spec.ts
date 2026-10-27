import { describe, expect, it } from 'vitest';

import {
  PENDING_INTENT_KEY,
  clearPendingIntent,
  firstBlockedPrecondition,
  hasPendingIntent,
  isPreconditionSatisfied,
  readPendingIntent,
  startPendingIntent,
  type IntentDef,
  type IntentFacts,
  type IntentStorage,
} from './chain';

type MemoryStorage = IntentStorage & { entries(): [string, string][] };

function memoryStorage(): MemoryStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    entries: () => [...map.entries()],
  };
}

function intentDef(overrides: Partial<IntentDef> = {}): IntentDef {
  return {
    id: 'share-current-drawing',
    action: { type: 'Mx_Share' },
    preconditions: ['auth', 'cloud-existence'],
    resumeAfter: 'document-loaded',
    ...overrides,
  };
}

function facts(overrides: Partial<IntentFacts> = {}): IntentFacts {
  return { authenticated: false, hasCloudNode: false, isVip: false, ...overrides };
}

describe('@cloudcad/platform · intentChain/chain', () => {
  describe('isPreconditionSatisfied', () => {
    it('auth：已登录即满足', () => {
      expect(isPreconditionSatisfied('auth', facts({ authenticated: true }))).toBe(true);
    });

    it('auth：未登录不满足', () => {
      expect(isPreconditionSatisfied('auth', facts())).toBe(false);
    });

    it('cloud-existence：已登录且有云端节点才满足', () => {
      expect(isPreconditionSatisfied('cloud-existence', facts({ authenticated: true, hasCloudNode: true }))).toBe(true);
      expect(isPreconditionSatisfied('cloud-existence', facts({ authenticated: true }))).toBe(false);
    });

    it('cloud-existence：蕴含 auth——未登录即使命中节点也不满足', () => {
      expect(isPreconditionSatisfied('cloud-existence', facts({ hasCloudNode: true }))).toBe(false);
    });

    it('vip：已登录且过会员闸门才满足', () => {
      expect(isPreconditionSatisfied('vip', facts({ authenticated: true, isVip: true }))).toBe(true);
      expect(isPreconditionSatisfied('vip', facts({ authenticated: true }))).toBe(false);
    });

    it('vip：蕴含 auth——未登录即使闸门放行也不满足', () => {
      expect(isPreconditionSatisfied('vip', facts({ isVip: true }))).toBe(false);
    });
  });

  describe('firstBlockedPrecondition', () => {
    it('全部满足 → null', () => {
      expect(firstBlockedPrecondition(intentDef(), facts({ authenticated: true, hasCloudNode: true }))).toBeNull();
    });

    it('未登录 → 先报 auth', () => {
      expect(firstBlockedPrecondition(intentDef(), facts({ hasCloudNode: true }))).toBe('auth');
    });

    it('已登录但无云端节点 → 报 cloud-existence', () => {
      expect(firstBlockedPrecondition(intentDef(), facts({ authenticated: true }))).toBe(
        'cloud-existence'
      );
    });

    it('顺序即优先级：把 cloud-existence 放在 auth 前，未登录时先报它', () => {
      expect(
        firstBlockedPrecondition(
          intentDef({ preconditions: ['cloud-existence', 'auth'] }),
          facts()
        )
      ).toBe('cloud-existence');
    });

    it('vip 链（auth → vip）：未登录先报 auth', () => {
      expect(
        firstBlockedPrecondition(
          intentDef({ preconditions: ['auth', 'vip'] }),
          facts({ isVip: true })
        )
      ).toBe('auth');
    });

    it('vip 链：已登录但闸门未过 → 报 vip', () => {
      expect(
        firstBlockedPrecondition(
          intentDef({ preconditions: ['auth', 'vip'] }),
          facts({ authenticated: true })
        )
      ).toBe('vip');
    });

    it('vip 链：已登录且闸门放行 → null', () => {
      expect(
        firstBlockedPrecondition(
          intentDef({ preconditions: ['auth', 'vip'] }),
          facts({ authenticated: true, isVip: true })
        )
      ).toBeNull();
    });
  });

  describe('startPendingIntent / readPendingIntent', () => {
    it('挂起后可原样读回', () => {
      const storage = memoryStorage();
      const def = intentDef();
      startPendingIntent(storage, def);
      expect(readPendingIntent(storage)).toEqual(def);
    });

    it('单键覆盖：新意图覆盖旧链', () => {
      const storage = memoryStorage();
      startPendingIntent(storage, intentDef({ id: 'first' }));
      startPendingIntent(storage, intentDef({ id: 'second' }));
      expect(readPendingIntent(storage)?.id).toBe('second');
    });

    it('覆盖是幂等的：同一条意图重复挂起不累积', () => {
      const storage = memoryStorage();
      const def = intentDef();
      startPendingIntent(storage, def);
      startPendingIntent(storage, def);
      expect(readPendingIntent(storage)).toEqual(def);
      expect(storage.entries()).toHaveLength(1);
    });

    it('vip 前置的意图可原样挂起并读回', () => {
      const storage = memoryStorage();
      const def = intentDef({
        id: 'export-dwg',
        action: { type: 'Mx_ExportDWG' },
        preconditions: ['auth', 'vip'],
      });
      startPendingIntent(storage, def);
      expect(readPendingIntent(storage)).toEqual(def);
    });

    it('storage key 固定为 PENDING_INTENT_KEY', () => {
      const storage = memoryStorage();
      startPendingIntent(storage, intentDef());
      expect(storage.entries()).toEqual([
        [PENDING_INTENT_KEY, JSON.stringify(intentDef())],
      ]);
    });
  });

  describe('clearPendingIntent / hasPendingIntent', () => {
    it('清除后读回 null，hasPendingIntent 转 false', () => {
      const storage = memoryStorage();
      startPendingIntent(storage, intentDef());
      expect(hasPendingIntent(storage)).toBe(true);
      clearPendingIntent(storage);
      expect(readPendingIntent(storage)).toBeNull();
      expect(hasPendingIntent(storage)).toBe(false);
    });

    it('空存储：hasPendingIntent false', () => {
      expect(hasPendingIntent(memoryStorage())).toBe(false);
    });

    it('清除不存在的意图不报错', () => {
      expect(() => clearPendingIntent(memoryStorage())).not.toThrow();
    });
  });

  describe('readPendingIntent 容错：非法内容一律 null，不抛错', () => {
    const malformed: Array<[string, unknown]> = [
      ['不是 JSON', '{not json'],
      ['JSON 字面量 null', null],
      ['JSON 数组', []],
      ['JSON 数字', 42],
      ['JSON 字符串', 'Mx_Share'],
      ['缺 id', { action: { type: 'Mx_Share' } }],
      ['id 为空串', { ...intentDef(), id: '' }],
      ['id 非字符串', { ...intentDef(), id: 7 }],
      [
        '缺 action',
        { id: 'x', preconditions: ['auth'], resumeAfter: 'document-loaded' },
      ],
      ['action 无 type', { ...intentDef(), action: { source: 'menu' } }],
      ['action.type 非字符串', { ...intentDef(), action: { type: 0 } }],
      ['preconditions 为空', { ...intentDef(), preconditions: [] }],
      ['preconditions 非数组', { ...intentDef(), preconditions: 'auth' }],
      ['preconditions 含未知值', { ...intentDef(), preconditions: ['unknown'] }],
      ['resumeAfter 未知锚点', { ...intentDef(), resumeAfter: 'login' }],
      [
        'resumeAfter 缺失',
        { id: 'x', action: { type: 'Mx_Share' }, preconditions: ['auth'] },
      ],
    ];

    for (const [label, value] of malformed) {
      it(`返回 null → ${label}`, () => {
        const storage = memoryStorage();
        storage.setItem(PENDING_INTENT_KEY, JSON.stringify(value));
        expect(readPendingIntent(storage)).toBeNull();
      });
    }

    it('setItem 抛错时 startPendingIntent 如实抛出（端口故障不吞）', () => {
      const storage: IntentStorage = {
        getItem: () => null,
        setItem: () => {
          throw new Error('quota exceeded');
        },
        removeItem: () => undefined,
      };
      expect(() => startPendingIntent(storage, intentDef())).toThrow(
        'quota exceeded'
      );
    });
  });
});

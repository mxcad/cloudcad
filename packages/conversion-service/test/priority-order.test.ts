import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import TaskStore from '../services/task-store';
import WorkerPool from '../services/worker-pool';
import { PRIORITY_CONFIG, PRIORITY_LEVELS, DEFAULT_PRIORITY, coercePriority } from '../lib/constants';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('优先级重排（#431 门禁5）', () => {
  it('配置语义：打开/预览=level 1（命脉）、导出=level 2、后台=level 3', () => {
    assert.equal(PRIORITY_CONFIG['1'].label, 'open');
    assert.equal(PRIORITY_CONFIG['2'].label, 'export');
    assert.equal(PRIORITY_CONFIG['3'].label, 'background');
    // 打开/预览有独立并发预算（不被后台挤占）
    assert.ok(PRIORITY_CONFIG['1'].maxConcurrent >= 1);
  });

  it('后台（level 3）积压不挤占打开/预览（level 1）的独立槽位', async () => {
    const store = new TaskStore('local');
    // 短延迟 runner：任务保持 PROCESSING 足够久以观察槽位分配，但会完成（不留悬挂计时器）
    const runner = { execute: () => sleep(800) };
    const pool = new WorkerPool(store, runner, null, { autoScale: false });
    pool.start();

    // 1 个后台任务（level 3，池 max=1）→ 占满后台独立池
    pool.enqueue({ id: 'bg0', priority: 3, params: {}, createdAt: new Date().toISOString() });
    await sleep(150);

    // 2 个打开任务（level 1，池 max=2）→ 应立即获得独立槽位，不受后台池占用影响
    pool.enqueue({ id: 'open0', priority: 1, params: {}, createdAt: new Date().toISOString() });
    pool.enqueue({ id: 'open1', priority: 1, params: {}, createdAt: new Date().toISOString() });
    await sleep(150);

    assert.equal(store.get('bg0')!.status, 'PROCESSING', '后台任务占其独立池');
    assert.equal(store.get('open0')!.status, 'PROCESSING', '打开任务获得 level 1 独立槽位');
    assert.equal(store.get('open1')!.status, 'PROCESSING', '打开任务获得 level 1 独立槽位');

    // 等待全部完成（短延迟 runner），避免悬挂计时器
    await sleep(900);
    assert.equal(store.get('open0')!.status, 'COMPLETED');
    assert.equal(store.get('bg0')!.status, 'COMPLETED');
    pool.stop();
  });

  it('PRIORITY_LEVELS 由 PRIORITY_CONFIG 的键派生且升序（档位的单一事实源）', () => {
    assert.deepEqual(PRIORITY_LEVELS, [1, 2, 3]);
    assert.deepEqual(
      PRIORITY_LEVELS,
      Object.keys(PRIORITY_CONFIG)
        .map(Number)
        .sort((a, b) => a - b),
      '档位枚举必须与 PRIORITY_CONFIG 的键一致，不得手写第二份清单',
    );
  });

  it('coercePriority：合法值原样通过，越界值回落默认档', () => {
    for (const ok of [1, 2, 3]) assert.equal(coercePriority(ok), ok, `priority=${ok}`);
    assert.equal(coercePriority('1'), 1, '字符串数字应被接受');
    assert.equal(coercePriority(0), DEFAULT_PRIORITY, '0 是 falsy，旧 `|| 2` 之外仍是越界');
    assert.equal(coercePriority(-1), DEFAULT_PRIORITY);
    assert.equal(coercePriority(2.5), DEFAULT_PRIORITY);
    assert.equal(coercePriority(5), DEFAULT_PRIORITY);
    assert.equal(coercePriority(undefined), DEFAULT_PRIORITY);
    assert.equal(coercePriority(null), DEFAULT_PRIORITY);
    assert.equal(coercePriority('abc'), DEFAULT_PRIORITY);
  });

  it('越界优先级不被永久饿死：回落默认档后正常调度完成', async () => {
    const store = new TaskStore('local');
    const pool = new WorkerPool(store, { execute: () => sleep(50) }, null, { autoScale: false });
    pool.start();
    // 故意传非 number 的脏值模拟上游字段错误
    const badPriorities = [0, -1, 5, 2.5, '1'] as unknown as number[];
    for (const bad of badPriorities) {
      pool.enqueue({ id: `bad-${bad}`, priority: bad, params: {}, createdAt: new Date().toISOString() });
    }
    await sleep(300);
    for (const bad of badPriorities) {
      assert.equal(
        store.get(`bad-${bad}`)!.status,
        'COMPLETED',
        `priority=${bad} 任务必须被调度完成（此前会永久停留 PENDING 且无任何日志）`,
      );
    }
    pool.stop();
  });
});

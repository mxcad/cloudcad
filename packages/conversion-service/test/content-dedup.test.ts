import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'stream';
import { CONTENT_KEY_FIELDS, ENGINE_INPUT_FIELDS } from '@cloudcad/contracts';
import TaskStore from '../services/task-store';
import WorkerPool from '../services/worker-pool';
import { deriveContentKey } from '../lib/utils';
import { create } from '../routes/conversions';

function makeReq(body: any): any {
  const req: any = new Readable({ read() {} });
  if (body !== undefined) req.push(JSON.stringify(body));
  req.push(null);
  req.headers = {};
  req.method = 'POST';
  req.url = '/v1/conversions/async/convertFile';
  return req;
}

function makeRes(): any {
  const res: any = {
    status: null,
    body: null,
    writeHead(status: number) {
      this.status = status;
    },
    end(body: string) {
      this.body = body;
    },
  };
  return res;
}

describe('内容身份去重（#431 门禁3）', () => {
  it('deriveContentKey：同参数同 key，不同参数不同 key，无识别字段返回 null', () => {
    const a = deriveContentKey({ srcPath: '/in/1.dwg', fileHash: 'abc', cmd: 'to_mxweb' });
    const b = deriveContentKey({ srcPath: '/in/1.dwg', fileHash: 'abc', cmd: 'to_mxweb' });
    const c = deriveContentKey({ srcPath: '/in/2.dwg', fileHash: 'def', cmd: 'to_mxweb' });
    const d = deriveContentKey({ srcPath: '/in/1.dwg', fileHash: 'abc', cmd: 'to_png' });
    const none = deriveContentKey({ priority: 2 });
    assert.equal(a, b, '同参数应同 key');
    assert.notEqual(a, c, '不同源/哈希应不同 key');
    assert.notEqual(a, d, '不同目标格式应不同 key');
    assert.equal(none, null, '无识别字段应返回 null（不去重）');
    assert.match(a!, /^ck_/);
  });

  it('CONTENT_KEY_FIELDS 是 ENGINE_INPUT_FIELDS 的子集（内容身份字段来自契约表派生，非另一份手写清单）', () => {
    for (const field of CONTENT_KEY_FIELDS) {
      assert.ok(
        ENGINE_INPUT_FIELDS.includes(field),
        `内容身份字段 ${field} 必须是引擎输入字段`
      );
    }
  });

  it('CONTENT_KEY_FIELDS 每个字段单独变化时 key 必须变（防止字段漏抄进内容身份表）', () => {
    const base = { srcPath: '/in/1.dwg', fileHash: 'abc', cmd: 'to_mxweb' };
    for (const field of CONTENT_KEY_FIELDS) {
      assert.notEqual(
        deriveContentKey({ ...base, [field]: 'dedup-probe-value' }),
        deriveContentKey(base),
        `${field} 变化应产生不同 contentKey`
      );
    }
  });

  it('被排除的字段（ENGINE_INPUT_FIELDS − CONTENT_KEY_FIELDS）单独变化时 key 不变', () => {
    const excluded = ENGINE_INPUT_FIELDS.filter((field) => !CONTENT_KEY_FIELDS.includes(field));
    assert.ok(excluded.length > 0, '应至少有一个非内容字段被排除');
    const base = { srcPath: '/in/1.dwg', fileHash: 'abc', cmd: 'to_mxweb' };
    for (const field of excluded) {
      assert.equal(
        deriveContentKey({ ...base, [field]: 'dedup-probe-value' }),
        deriveContentKey(base),
        `${field} 属产物落点等非内容字段，变化不应改变 contentKey`
      );
    }
  });

  it('回归：仅裁剪框不同的两张 cut_dwg 必须产生不同 key', () => {
    // 裁剪框字段曾不在内容身份表：同 key 合并后两张图互拿产物（368ca55）。
    // 现字段表由契约派生，本用例锁定「区域差异必产生新 key」。
    const base = {
      srcPath: '/in/a.dwg',
      fileHash: 'h1',
      cmd: 'cut_dwg',
      bd_pt1_x: '1',
      bd_pt1_y: '2',
      bd_pt2_x: '101',
      bd_pt2_y: '102',
    };
    assert.notEqual(
      deriveContentKey(base),
      deriveContentKey({ ...base, bd_pt1_x: '5' }),
      '仅裁剪框起点不同的两张图必须不同 key'
    );
  });

  it('同内容身份并发提交合并：第二个提交者挂到第一个在途任务', async () => {
    const store = new TaskStore('local');
    // 慢 runner：任务保持 PENDING/PROCESSING 不立即完成，保证在途可被合并
    const runner = { execute: () => new Promise(() => {}) };
    const pool = new WorkerPool(store, runner, null, { autoScale: false });
    const routes = create(pool, store, { notify: async () => {} });
    pool.start();

    const params = { srcPath: '/in/1.dwg', fileHash: 'abc', cmd: 'to_mxweb' };

    const res1 = makeRes();
    await routes.handle(makeReq({ params }), res1, '/v1/conversions/async/convertFile', 'POST');
    const p1 = JSON.parse(res1.body);
    assert.equal(p1.status, 'PENDING');
    assert.equal(p1.merged, false, '首次提交不合并');
    // #441：响应回传内容身份（contentKey），供前端队列面板按内容派生身份展示/去重感知
    assert.match(p1.contentKey, /^ck_/);
    assert.equal(p1.contentKey, deriveContentKey(params), '回传 contentKey 应与派生一致');

    const res2 = makeRes();
    await routes.handle(makeReq({ params }), res2, '/v1/conversions/async/convertFile', 'POST');
    const p2 = JSON.parse(res2.body);
    assert.equal(p2.merged, true, '同内容身份应合并到在途任务');
    assert.equal(p2.taskId, p1.taskId, '合并后返回同一 taskId');
    assert.equal(p2.contentKey, p1.contentKey, '同内容身份 contentKey 一致');

    // 只有 1 个任务在跑（未重复起 mxcadassembly）
    const stats = store.getStats();
    assert.equal(stats.total, 1, '同 key 不应重复建任务');

    pool.stop();
  });

  it('无识别字段时 contentKey 为 null（不去重、不回传身份）', async () => {
    const store = new TaskStore('local');
    const runner = { execute: () => new Promise(() => {}) };
    const pool = new WorkerPool(store, runner, null, { autoScale: false });
    const routes = create(pool, store, { notify: async () => {} });
    pool.start();

    const res = makeRes();
    await routes.handle(makeReq({ params: { outname: 'x.mxweb' } }), res, '/v1/conversions/async/convertFile', 'POST');
    const p = JSON.parse(res.body);
    assert.equal(p.contentKey, null, '无 srcPath/fileHash 时 contentKey 应为 null');
    assert.equal(p.merged, false);

    pool.stop();
  });

  it('不同内容身份不合并：各自独立建任务', async () => {
    const store = new TaskStore('local');
    const runner = { execute: () => new Promise(() => {}) };
    const pool = new WorkerPool(store, runner, null, { autoScale: false });
    const routes = create(pool, store, { notify: async () => {} });
    pool.start();

    const res1 = makeRes();
    await routes.handle(makeReq({ params: { srcPath: '/in/1.dwg', fileHash: 'a' } }), res1, '/v1/conversions/async/convertFile', 'POST');
    const res2 = makeRes();
    await routes.handle(makeReq({ params: { srcPath: '/in/2.dwg', fileHash: 'b' } }), res2, '/v1/conversions/async/convertFile', 'POST');

    const p1 = JSON.parse(res1.body);
    const p2 = JSON.parse(res2.body);
    assert.equal(p2.merged, false, '不同内容身份不合并');
    assert.notEqual(p1.taskId, p2.taskId);
    assert.equal(store.getStats().total, 2);

    pool.stop();
  });
});

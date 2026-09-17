import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import type { AddressInfo } from 'net';
import TaskStore from '../services/task-store';
import CallbackEngine from '../services/callback';

function startReceiver(onBody: (data: { path: string | undefined; body: any }) => void): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c: string) => (body += c));
      req.on('end', () => {
        onBody({ path: req.url, body: JSON.parse(body) });
        res.writeHead(200);
        res.end('ok');
      });
    });
    server.listen(0, () => resolve(server));
  });
}

describe('CallbackEngine', () => {
  let store: TaskStore;
  let engine: CallbackEngine;

  beforeEach(() => {
    store = new TaskStore('local');
    engine = new CallbackEngine(store);
  });

  it('should POST a payload to the task callbackUrl', async () => {
    let received: { path: string | undefined; body: any } | undefined;
    const server = await startReceiver((data) => (received = data));
    const { port } = server.address() as AddressInfo;

    store.create({
      id: 't1',
      priority: 1,
      params: {},
      callbackUrl: `http://127.0.0.1:${port}/cb`,
    });
    await engine.notify('t1', {
      status: 'COMPLETED',
      result: { newpath: '/out/a.mxweb' },
      error: null,
    });

    await new Promise((r) => setTimeout(r, 50));
    assert.ok(received, 'callback was never delivered');
    assert.equal(received!.path, '/cb');
    assert.equal(received!.body.taskId, 't1');
    assert.equal(received!.body.status, 'COMPLETED');
    assert.equal(received!.body.result.newpath, '/out/a.mxweb');
    await new Promise((resolve) => server.close(resolve));
  });

  it('should do nothing when the task has no callbackUrl', async () => {
    store.create({ id: 't2', priority: 1, params: {} });

    await engine.notify('t2', { status: 'COMPLETED', result: null, error: null });

    assert.equal(store.get('t2')!.status, 'PENDING');
  });

  it('should swallow callback failures', async () => {
    store.create({
      id: 't3',
      priority: 1,
      params: {},
      callbackUrl: 'http://127.0.0.1:1/down',
    });

    await engine.notify('t3', { status: 'FAILED', result: null, error: 'x' });
  });
});

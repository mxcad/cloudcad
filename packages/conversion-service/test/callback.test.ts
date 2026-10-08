import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import type { AddressInfo } from 'net';
import CallbackEngine from '../services/callback';

function startReceiver(
  onBody: (data: { path: string | undefined; body: any }) => void,
  statusCode = 200,
): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c: string) => (body += c));
      req.on('end', () => {
        onBody({ path: req.url, body: JSON.parse(body) });
        res.writeHead(statusCode);
        res.end('ok');
      });
    });
    server.listen(0, () => resolve(server));
  });
}

describe('CallbackEngine', () => {
  it('should POST a payload to the callbackUrl and resolve on 2xx', async () => {
    let received: { path: string | undefined; body: any } | undefined;
    const server = await startReceiver((data) => (received = data));
    const { port } = server.address() as AddressInfo;
    const engine = new CallbackEngine();

    await engine.notify('t1', `http://127.0.0.1:${port}/cb`, {
      status: 'COMPLETED',
      result: { newpath: '/out/a.mxweb' },
      error: null,
    });

    assert.ok(received, 'callback was never delivered');
    assert.equal(received!.path, '/cb');
    assert.equal(received!.body.taskId, 't1');
    assert.equal(received!.body.status, 'COMPLETED');
    assert.equal(received!.body.result.newpath, '/out/a.mxweb');
    await new Promise((resolve) => server.close(resolve));
  });

  it('should reject when the receiver returns a 4xx/5xx status', async () => {
    const server = await startReceiver(() => {}, 500);
    const { port } = server.address() as AddressInfo;
    const engine = new CallbackEngine();

    await assert.rejects(
      engine.notify('t2', `http://127.0.0.1:${port}/cb`, {
        status: 'FAILED',
        result: null,
        error: 'boom',
      }),
      /Callback HTTP 500/,
    );
    await new Promise((resolve) => server.close(resolve));
  });

  it('should reject on network error so the caller can log the failure', async () => {
    const engine = new CallbackEngine();

    // 127.0.0.1:1 无监听 → connect ECONNREFUSED
    await assert.rejects(
      engine.notify('t3', 'http://127.0.0.1:1/down', {
        status: 'FAILED',
        result: null,
        error: 'x',
      }),
    );
  });
});

///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { EventEmitter } from 'events';
import * as https from 'https';
import type { IncomingMessage } from 'http';
import { buildFaasInvokeBody, faasHttpsJsonRequest } from './faas-http';
import type { ConversionTask } from '../function-executor.interface';

jest.mock('https', () => ({ request: jest.fn() }));
const requestMock = https.request as unknown as jest.Mock;

interface FakeSocket {
  options: any;
  req: EventEmitter & { destroy: jest.Mock; write: jest.Mock; end: jest.Mock };
  res: EventEmitter & { statusCode: number };
}

/** 装一个 https.request 假实现：捕获 options，回调 res 后由测试手动 emit 响应/错误 */
function fakeRequest(): FakeSocket {
  const captured: any = {};
  requestMock.mockImplementation((_options: any, cb: (res: any) => void) => {
    captured.options = _options;
    const req = new EventEmitter() as any;
    req.destroy = jest.fn();
    req.write = jest.fn();
    req.end = jest.fn();
    const res = new EventEmitter() as any;
    res.statusCode = 200;
    captured.req = req;
    captured.res = res;
    cb(res); // transport 在此 attach res.on('data'/'end')
    return req;
  });
  return captured;
}

function makeTask(): ConversionTask {
  return {
    id: 't1',
    type: 'convertFile',
    params: { srcPath: '/in/a.dwg', fileHash: 'h' },
    priority: 1,
    createdAt: new Date(),
  } as ConversionTask;
}

describe('faasHttpsJsonRequest 共享传输骨架', () => {
  it('成功时解析 JSON 响应体', async () => {
    const c = fakeRequest();
    const p = faasHttpsJsonRequest({ hostname: 'x', port: 443 } as any);
    c.res.emit('data', JSON.stringify({ code: 0, newpath: '/out' }));
    c.res.emit('end');
    await expect(p).resolves.toEqual({ code: 0, newpath: '/out' });
  });

  it('解析失败时缺省回 {code:-1,message}（华为/阿里云语义）', async () => {
    const c = fakeRequest();
    const p = faasHttpsJsonRequest({ hostname: 'x', port: 443 } as any);
    c.res.emit('data', 'not-json');
    c.res.emit('end');
    await expect(p).resolves.toMatchObject({
      code: -1,
      message: expect.stringContaining('not-json'),
    });
  });

  it('解析失败时经 onParseError 回自定义兜底（AWS 语义）', async () => {
    const c = fakeRequest();
    const p = faasHttpsJsonRequest(
      { hostname: 'x', port: 443 } as any,
      undefined,
      (data, res) => ({ statusCode: (res as IncomingMessage).statusCode, Payload: data }),
    );
    // mock 在上面的调用中已 populate c.res；此刻再设 statusCode，onParseError 读取时生效
    (c.res as any).statusCode = 500;
    c.res.emit('data', 'not-json');
    c.res.emit('end');
    await expect(p).resolves.toEqual({ statusCode: 500, Payload: 'not-json' });
  });

  it('连接错误时 reject', async () => {
    const c = fakeRequest();
    const p = faasHttpsJsonRequest({ hostname: 'x', port: 443 } as any);
    c.req.emit('error', new Error('ECONNREFUSED'));
    await expect(p).rejects.toThrow('ECONNREFUSED');
  });

  it('超时时 destroy 连接并 reject', async () => {
    const c = fakeRequest();
    const p = faasHttpsJsonRequest({ hostname: 'x', port: 443 } as any);
    c.req.emit('timeout');
    await expect(p).rejects.toThrow('Request timeout');
    expect(c.req.destroy).toHaveBeenCalled();
  });

  it('有 body 时写入请求体', async () => {
    const c = fakeRequest();
    const p = faasHttpsJsonRequest({ hostname: 'x', port: 443 } as any, 'BODY');
    c.res.emit('data', '{}');
    c.res.emit('end');
    await p;
    expect(c.req.write).toHaveBeenCalledWith('BODY');
  });
});

describe('buildFaasInvokeBody 公共请求体', () => {
  it('按 taskId/type/params/priority 序列化', () => {
    const body = buildFaasInvokeBody(makeTask());
    expect(JSON.parse(body)).toEqual({
      taskId: 't1',
      type: 'convertFile',
      params: { srcPath: '/in/a.dwg', fileHash: 'h' },
      priority: 1,
    });
  });
});

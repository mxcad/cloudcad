///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { EventEmitter } from 'events';
import * as https from 'https';
import * as crypto from 'crypto';
import { HuaweiExecutor } from './huawei.executor';
import type { ConversionTask } from '../../function-executor.interface';

jest.mock('https', () => ({ request: jest.fn() }));
const requestMock = https.request as unknown as jest.Mock;

function makeConfig(overrides: Record<string, string> = {}) {
  return { get: jest.fn((k: string) => overrides[k] ?? undefined) } as any;
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

const CONFIG = {
  HUAWEI_FUNCTIONGRAPH_ENDPOINT: 'https://fg.example.com',
  HUAWEI_AK: 'AK',
  HUAWEI_SK: 'SK',
};

/** 捕获 options 并回一个 code=newCode 的响应 */
function mockResponse(payload: Record<string, unknown>) {
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
    cb(res);
    setImmediate(() => {
      res.emit('data', JSON.stringify(payload));
      res.emit('end');
    });
    return req;
  });
  return captured;
}

describe('HuaweiExecutor 签名与结果解析', () => {
  it('invoke 用 HMAC-SHA256 对 X-Sdk-Date 签名并组装 Authorization，code=0 映射 COMPLETED', async () => {
    const c = mockResponse({ code: 0, newpath: '/out/r.mxweb' });
    const provider = new HuaweiExecutor(makeConfig(CONFIG));

    const result = await provider.invoke(makeTask());

    const timestamp = c.options.headers['X-Sdk-Date'];
    const expectedSig = crypto.createHmac('sha256', 'SK').update(timestamp).digest('hex');
    expect(c.options.headers['Authorization']).toBe(
      `HMAC-SHA256 Access=AK, SignedHeaders=host;x-sdk-date, Signature=${expectedSig}`,
    );
    expect(c.options.hostname).toBe('fg.example.com');
    expect(result).toMatchObject({ status: 'COMPLETED', outputPath: '/out/r.mxweb' });
  });

  it('code 非 0 映射 FAILED 并透传 message', async () => {
    mockResponse({ code: 1, message: 'engine error' });
    const provider = new HuaweiExecutor(makeConfig(CONFIG));

    const result = await provider.invoke(makeTask());

    expect(result).toMatchObject({ status: 'FAILED', error: 'engine error' });
  });
});

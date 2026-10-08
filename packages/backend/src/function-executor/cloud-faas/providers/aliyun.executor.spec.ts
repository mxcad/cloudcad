///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { EventEmitter } from 'events';
import * as https from 'https';
import * as crypto from 'crypto';
import { AliyunExecutor } from './aliyun.executor';
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
  ALIYUN_FC_ENDPOINT: 'https://fc.example.com',
  ALIYUN_AK: 'AK',
  ALIYUN_SK: 'SK',
};

const INVOKE_PATH = '/2016-08-15/services/cloudcad/functions/convert/invocations';

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

describe('AliyunExecutor 签名与结果解析', () => {
  it('invoke 用 HMAC-SHA1 对 method/contentMD5/contentType/date/path 签名，code=0 映射 COMPLETED', async () => {
    const c = mockResponse({ code: 0, newpath: '/out/r.mxweb' });
    const provider = new AliyunExecutor(makeConfig(CONFIG));

    const result = await provider.invoke(makeTask());

    const date = c.options.headers['Date'];
    const contentMD5 = c.options.headers['Content-MD5'];
    const signString = `POST\n${contentMD5}\napplication/json\n${date}\n${INVOKE_PATH}`;
    const expectedSig = crypto.createHmac('sha1', 'SK').update(signString).digest('base64');
    expect(c.options.headers['Authorization']).toBe(`FC AK:${expectedSig}`);
    expect(c.options.hostname).toBe('fc.example.com');
    expect(result).toMatchObject({ status: 'COMPLETED', outputPath: '/out/r.mxweb' });
  });

  it('code 非 0 映射 FAILED 并透传 message', async () => {
    mockResponse({ code: 1, message: 'fc error' });
    const provider = new AliyunExecutor(makeConfig(CONFIG));

    const result = await provider.invoke(makeTask());

    expect(result).toMatchObject({ status: 'FAILED', error: 'fc error' });
  });
});

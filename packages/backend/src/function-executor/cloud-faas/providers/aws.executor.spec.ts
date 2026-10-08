///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { EventEmitter } from 'events';
import * as https from 'https';
import { LambdaExecutor } from './aws.executor';
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
  AWS_LAMBDA_ENDPOINT: 'https://lambda.example.com',
  AWS_AK: 'AK',
  AWS_SK: 'SK',
  AWS_REGION: 'us-east-1',
};

/** 捕获 options 并回一个 Lambda 风格响应（statusCode + Payload 字符串） */
function mockLambdaResponse(statusCode: number, payload?: string, functionError?: string) {
  const captured: any = {};
  const body = JSON.stringify({ statusCode, ...(payload ? { Payload: payload } : {}), ...(functionError ? { FunctionError: functionError } : {}) });
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
      res.emit('data', body);
      res.emit('end');
    });
    return req;
  });
  return captured;
}

describe('LambdaExecutor 签名与结果解析', () => {
  it('invoke 组装 SigV4 Authorization（credential scope 含 region、SignedHeaders、64 位 hex 签名），statusCode=200 且 payload.code=0 映射 COMPLETED', async () => {
    const c = mockLambdaResponse(200, JSON.stringify({ code: 0, newpath: '/out/r.mxweb' }));
    const provider = new LambdaExecutor(makeConfig(CONFIG));

    const result = await provider.invoke(makeTask());

    const amzDate = c.options.headers['X-Amz-Date'];
    const datestamp = amzDate.substring(0, 8);
    // SigV4 要求 X-Amz-Date 为 YYYYMMDD'T'HHMMSS'Z' 单 Z（防 toISOString 已含 Z 又 + 'Z' 成双 Z 的回归）
    expect(amzDate).toMatch(/^\d{8}T\d{6}Z$/);
    expect(c.options.headers['X-Amz-Invocation-Type']).toBe('RequestResponse');
    expect(c.options.hostname).toBe('lambda.example.com');
    expect(c.options.headers['Authorization']).toMatch(
      new RegExp(
        `^AWS4-HMAC-SHA256 Credential=AK/${datestamp}/us-east-1/lambda/aws4_request, ` +
          `SignedHeaders=host;x-amz-date, Signature=[0-9a-f]{64}$`,
      ),
    );
    expect(result).toMatchObject({ status: 'COMPLETED', outputPath: '/out/r.mxweb' });
  });

  it('statusCode 非 200 映射 FAILED 并带 FunctionError', async () => {
    mockLambdaResponse(500, undefined, 'internal error');
    const provider = new LambdaExecutor(makeConfig(CONFIG));

    const result = await provider.invoke(makeTask());

    expect(result).toMatchObject({ status: 'FAILED', error: 'Lambda returned 500: internal error' });
  });
});

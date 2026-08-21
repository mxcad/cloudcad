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

import type { NextFunction, Request, Response } from 'express';
import { EventEmitter } from 'events';
import { ClsServiceManager } from 'nestjs-cls';
import {
  buildAccessLogEntry,
  isAccessLogExcluded,
  maskSensitiveQuery,
  MASKED_VALUE,
} from './access-log';
import { AccessLogMiddleware } from './access-log.middleware';

jest.mock('nestjs-cls', () => ({
  ClsServiceManager: {
    getClsService: jest.fn(),
  },
}));

describe('access-log core helpers', () => {
  describe('maskSensitiveQuery', () => {
    it('masks known sensitive query keys', () => {
      const url = '/api/auth/login?password=secret123&token=abc&username=dev';
      const masked = maskSensitiveQuery(url);
      expect(masked).toContain(`password=${MASKED_VALUE}`);
      expect(masked).toContain(`token=${MASKED_VALUE}`);
      // 非敏感键保留原值
      expect(masked).toContain('username=dev');
      expect(masked).not.toContain('secret123');
      expect(masked).not.toContain('abc');
    });

    it('is case-insensitive on keys', () => {
      const url = '/api/x?Token=t1&PASSWORD=p1&code=c1';
      const masked = maskSensitiveQuery(url);
      expect(masked).toContain(`Token=${MASKED_VALUE}`);
      expect(masked).toContain(`PASSWORD=${MASKED_VALUE}`);
      expect(masked).toContain(`code=${MASKED_VALUE}`);
    });

    it('returns raw url when no query present', () => {
      expect(maskSensitiveQuery('/api/health/live')).toBe('/api/health/live');
      expect(maskSensitiveQuery('')).toBe('');
      expect(maskSensitiveQuery('/api/x?')).toBe('/api/x?');
    });
  });

  describe('isAccessLogExcluded', () => {
    it('excludes health and metrics endpoints', () => {
      expect(isAccessLogExcluded('/api/health/live')).toBe(true);
      expect(isAccessLogExcluded('/api/health')).toBe(true);
      expect(isAccessLogExcluded('/api/metrics')).toBe(true);
    });

    it('excludes thumbnail static resources', () => {
      expect(isAccessLogExcluded('/api/file-system/nodes/n1/thumbnail')).toBe(
        true
      );
      expect(isAccessLogExcluded('/favicon.ico')).toBe(true);
    });

    it('includes normal API requests', () => {
      expect(isAccessLogExcluded('/api/auth/login')).toBe(false);
      expect(isAccessLogExcluded('/api/files/list')).toBe(false);
    });
  });

  describe('buildAccessLogEntry', () => {
    it('produces all expected fields and masks query', () => {
      const entry = buildAccessLogEntry({
        reqUrl: '/api/auth/login?password=secret',
        method: 'POST',
        status: 200,
        durationMs: 12.5,
        requestId: 'req-1',
        traceId: 'trace-1',
        clientIp: '1.2.3.4',
        userAgent: 'agent',
        now: '2026-01-01T00:00:00.000Z',
      });
      expect(entry).toEqual({
        time: '2026-01-01T00:00:00.000Z',
        ip: '1.2.3.4',
        method: 'POST',
        path: `/api/auth/login?password=${MASKED_VALUE}`,
        status: 200,
        duration: 12.5,
        requestId: 'req-1',
        traceId: 'trace-1',
        userAgent: 'agent',
      });
    });
  });
});

describe('AccessLogMiddleware', () => {
  const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  let middleware: AccessLogMiddleware;

  function createReq(overrides: Partial<Request> = {}): Request {
    const req = {
      method: 'GET',
      originalUrl: '/api/files/list',
      url: '/api/files/list',
      headers: { 'user-agent': 'test-agent' },
      ip: '127.0.0.1',
      ...overrides,
    } as unknown as Request;
    return req;
  }

  function createRes() {
    const res = new EventEmitter() as Response;
    res.setHeader = jest.fn();
    res.statusCode = 200;
    return res;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (ClsServiceManager.getClsService as jest.Mock).mockReturnValue({
      get: (key: string) => (key === 'requestId' ? 'req-1' : 'trace-1'),
    });
    middleware = new AccessLogMiddleware(
      mockLogger as unknown as import('pino').Logger
    );
  });

  it('sets X-Request-Id / X-Trace-Id / X-Node-Id response headers', () => {
    const req = createReq();
    const res = createRes();
    const next = jest.fn() as NextFunction;

    middleware.use(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'req-1');
    expect(res.setHeader).toHaveBeenCalledWith('X-Trace-Id', 'trace-1');
    expect(res.setHeader).toHaveBeenCalledWith('X-Node-Id', expect.any(String));
    expect(next).toHaveBeenCalled();
  });

  it('writes a single access log entry on response finish', () => {
    const req = createReq();
    const res = createRes();
    const next = jest.fn() as NextFunction;

    middleware.use(req, res, next);
    res.emit('finish');

    expect(mockLogger.info).toHaveBeenCalledTimes(1);
    const [entry, msg] = (mockLogger.info as jest.Mock).mock.calls[0];
    expect(msg).toBe('access');
    expect(entry).toMatchObject({
      ip: '127.0.0.1',
      method: 'GET',
      path: '/api/files/list',
      status: 200,
      requestId: 'req-1',
      traceId: 'trace-1',
      userAgent: 'test-agent',
    });
    expect(typeof entry.duration).toBe('number');
    expect(typeof entry.time).toBe('string');
  });

  it('does not write access log for excluded health path', () => {
    const req = createReq({ originalUrl: '/api/health/live' });
    const res = createRes();
    const next = jest.fn() as NextFunction;

    middleware.use(req, res, next);
    res.emit('finish');

    expect(mockLogger.info).not.toHaveBeenCalled();
  });

  it('masks sensitive query in logged path', () => {
    const req = createReq({
      originalUrl: '/api/auth/login?password=secret&username=dev',
    });
    const res = createRes();
    const next = jest.fn() as NextFunction;

    middleware.use(req, res, next);
    res.emit('finish');

    const [entry] = (mockLogger.info as jest.Mock).mock.calls[0];
    expect(entry.path).toContain(`password=${MASKED_VALUE}`);
    expect(entry.path).toContain('username=dev');
    expect(entry.path).not.toContain('secret');
  });

  it('does not block the request when CLS is unavailable', () => {
    (ClsServiceManager.getClsService as jest.Mock).mockReturnValue(null);
    const req = createReq();
    const res = createRes();
    const next = jest.fn() as NextFunction;

    middleware.use(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'X-Request-Id',
      expect.any(String)
    );
    expect(next).toHaveBeenCalled();
  });
});

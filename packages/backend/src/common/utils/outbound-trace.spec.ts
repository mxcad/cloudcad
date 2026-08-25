///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { buildOutboundTraceHeaders } from './outbound-trace';

describe('buildOutboundTraceHeaders', () => {
  it('有请求上下文时复用 CLS 的 requestId/traceId', () => {
    const headers = buildOutboundTraceHeaders(
      { requestId: 'req-1', traceId: 'trace-1' },
      'unit-test',
    );

    expect(headers).toEqual({
      'X-Request-Id': 'req-1',
      'X-Trace-Id': 'trace-1',
    });
  });

  it('无上下文时生成新 requestId（定时任务/后台任务场景）', () => {
    const headers = buildOutboundTraceHeaders({}, 'cron-job');

    expect(headers['X-Request-Id']).toMatch(/^[0-9a-f-]{36}$/);
    // 无独立 traceId 时回退为 requestId，保证两头一致
    expect(headers['X-Trace-Id']).toBe(headers['X-Request-Id']);
  });

  it('完全缺省入参时同样生成新 id', () => {
    const headers = buildOutboundTraceHeaders();

    expect(headers['X-Request-Id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(headers['X-Trace-Id']).toBe(headers['X-Request-Id']);
  });

  it('非法 requestId（含换行注入）被拒绝并重新生成', () => {
    const headers = buildOutboundTraceHeaders({
      requestId: 'bad id\ninjected: true',
      traceId: 'trace-1',
    });

    expect(headers['X-Request-Id']).not.toContain('\n');
    expect(headers['X-Request-Id']).toMatch(/^[A-Za-z0-9._-]{1,128}$/);
    // traceId 合法则保留
    expect(headers['X-Trace-Id']).toBe('trace-1');
  });

  it('非法 traceId 回退为 requestId', () => {
    const headers = buildOutboundTraceHeaders({
      requestId: 'req-2',
      traceId: '',
    });

    expect(headers['X-Request-Id']).toBe('req-2');
    expect(headers['X-Trace-Id']).toBe('req-2');
  });

  it('生成的 id 符合三个服务包 logger 的合法字符集（跨服务可关联）', () => {
    for (let i = 0; i < 20; i++) {
      const headers = buildOutboundTraceHeaders();
      expect(headers['X-Request-Id']).toMatch(/^[A-Za-z0-9._-]{1,128}$/);
    }
  });
});

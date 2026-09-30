import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * conversionStream —— 本地 .dwg/.dxf 打开链路上唯一的「转换已就绪」信号。
 *
 * 上传请求立即返回、转换在后台进行；access 端点按 hash 查 mxweb，未就位返回 404，
 * 引擎只会把它报成「打开图纸失败」。waitPublicConversion 必须只在下一次真正的
 * COMPLETED 事件后才放行，超时/EventSource 不可用按失败处理。
 */

const { getApiBaseUrl } = vi.hoisted(() => ({
  getApiBaseUrl: () => '/api',
}));

vi.mock('@/utils/apiConfig', () => ({
  getApiBaseUrl,
}));

import {
  waitPublicConversion,
  CONVERSION_WAIT_TIMEOUT_MS,
} from './conversionStream';

type Listener = ((event: MessageEvent) => void) | null;

let originalEventSource: unknown;
let instances: MockEventSource[];

class MockEventSource {
  readonly url: string;
  closed = false;
  onmessage: Listener = null;

  constructor(url: string) {
    this.url = url;
    instances.push(this);
  }

  close(): void {
    this.closed = true;
  }

  push(data: string): void {
    this.onmessage?.(new MessageEvent('message', { data }));
  }
}

function latest(): MockEventSource {
  const es = instances[instances.length - 1];
  if (!es) throw new Error('没有 EventSource 实例');
  return es;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-30T09:00:00Z'));
  originalEventSource = globalThis.EventSource;
  instances = [];
  vi.stubGlobal(
    'EventSource',
    class extends MockEventSource {
      constructor(url: string) {
        super(url);
      }
    }
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('waitPublicConversion', () => {
  it('订阅公开的 per-file 转换 SSE，hash 走查询参数', async () => {
    void waitPublicConversion('a'.repeat(32));

    expect(latest().url).toBe(
      '/api/v1/mxcad/conversion/file-stream?hash=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    );
  });

  it('收到 COMPLETED 即放行并关闭连接、不再等超时', async () => {
    const promise = waitPublicConversion('b'.repeat(32));
    const es = latest();
    let settled = false;
    const result = promise.then((status) => {
      settled = true;
      return status;
    });

    expect(settled).toBe(false);
    es.push(JSON.stringify({ hash: 'x', status: 'COMPLETED' }));

    expect(await result).toBe('COMPLETED');
    expect(es.closed).toBe(true);
    expect(settled).toBe(true);
    // 超时回调已取消：推进到超时点也不会触发第二次 settle
    expect(await result).toBe('COMPLETED');
  });

  it('收到 FAILED 即失败并关闭连接', async () => {
    const promise = waitPublicConversion('c'.repeat(32));
    const es = latest();
    es.push(JSON.stringify({ hash: 'x', status: 'FAILED' }));

    expect(await promise).toBe('FAILED');
    expect(es.closed).toBe(true);
  });

  it('建连推的 PROCESSING 只是当前状态，不 settle，继续等终态', async () => {
    const promise = waitPublicConversion('d'.repeat(32));
    const es = latest();
    let settled = false;
    promise.then(() => {
      settled = true;
    });

    es.push(JSON.stringify({ hash: 'x', status: 'PROCESSING' }));
    expect(settled).toBe(false);
    expect(es.closed).toBe(false);

    es.push(JSON.stringify({ hash: 'x', status: 'COMPLETED' }));
    expect(await promise).toBe('COMPLETED');
    expect(es.closed).toBe(true);
  });

  it('终态之前先到超时，按失败处理（服务端转换任务丢失）', async () => {
    const promise = waitPublicConversion('e'.repeat(32));
    const es = latest();
    expect(es.closed).toBe(false);

    vi.advanceTimersByTime(CONVERSION_WAIT_TIMEOUT_MS + 1);
    expect(await promise).toBe('FAILED');
    expect(es.closed).toBe(true);
  });

  it('EventSource 不可用时按失败处理，不静默继续打开', async () => {
    vi.unstubAllGlobals();
    expect(typeof globalThis.EventSource).toBe('undefined');

    expect(await waitPublicConversion('f'.repeat(32))).toBe('FAILED');
    expect(instances).toHaveLength(0);
  });

  it('畸形帧被忽略，不吞掉后面的有效终态', async () => {
    const promise = waitPublicConversion('g'.repeat(32));
    const es = latest();
    es.push('not-json');
    es.push('{}');

    expect(es.closed).toBe(false);
    es.push(JSON.stringify({ hash: 'x', status: 'COMPLETED' }));
    expect(await promise).toBe('COMPLETED');
  });

  it('同一 hash 的第二个终态事件不覆盖已解析的结果', async () => {
    const promise = waitPublicConversion('h'.repeat(32));
    const es = latest();
    es.push(JSON.stringify({ hash: 'x', status: 'COMPLETED' }));
    es.push(JSON.stringify({ hash: 'x', status: 'FAILED' }));

    expect(await promise).toBe('COMPLETED');
  });

  it('特殊字符的 hash 走 encodeURIComponent', async () => {
    vi.useRealTimers();
    void waitPublicConversion('h%ash');

    expect(latest().url).toBe(
      '/api/v1/mxcad/conversion/file-stream?hash=h%25ash'
    );
  });
});

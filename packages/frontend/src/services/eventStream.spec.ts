import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  openEventStream,
  type EventStreamHandle,
} from './eventStream';

vi.mock('@/config/apiConfig', () => ({
  getApiBaseUrl: () => 'http://api.test',
}));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  close(): void {
    this.closed = true;
  }
}

describe('openEventStream（SSE 唯一接线出口）', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal(
      'EventSource',
      FakeEventSource as unknown as typeof EventSource
    );
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('EventSource 不可用时返回 null，由调用方走降级路径', () => {
    vi.unstubAllGlobals();
    expect(openEventStream({ path: '/x', onFrame: () => {} })).toBeNull();
  });

  it('URL = API base + path + 编码后的 query（undefined 项跳过）', () => {
    openEventStream({
      path: '/v1/stream',
      query: { token: 'a b/c', hash: 'h1', empty: undefined },
      onFrame: () => {},
    });
    expect(FakeEventSource.instances[0].url).toBe(
      'http://api.test/v1/stream?token=a%20b%2Fc&hash=h1'
    );
  });

  it('合法帧 JSON 解析后回调，畸形帧静默忽略', () => {
    const frames: unknown[] = [];
    openEventStream({ path: '/x', onFrame: (d) => frames.push(d) });
    const es = FakeEventSource.instances[0];
    es.onmessage?.({ data: '{"status":"COMPLETED"}' });
    es.onmessage?.({ data: 'not-json' });
    expect(frames).toEqual([{ status: 'COMPLETED' }]);
    expect(es.closed).toBe(false);
  });

  it('超时关流并以 timeout 回调 onClose', () => {
    const onClose = vi.fn();
    openEventStream({
      path: '/x',
      timeoutMs: 5000,
      onFrame: () => {},
      onClose,
    });
    const es = FakeEventSource.instances[0];
    vi.advanceTimersByTime(4999);
    expect(es.closed).toBe(false);
    vi.advanceTimersByTime(1);
    expect(es.closed).toBe(true);
    expect(onClose).toHaveBeenCalledWith('timeout');
  });

  it('默认出错即关流（轮询等兜底接管）', () => {
    const onClose = vi.fn();
    openEventStream({ path: '/x', onFrame: () => {}, onClose });
    const es = FakeEventSource.instances[0];
    es.onerror?.();
    expect(es.closed).toBe(true);
    expect(onClose).toHaveBeenCalledWith('error');
  });

  it('closeOnError=false 时出错不关流，交给 EventSource 自动重连', () => {
    const onClose = vi.fn();
    openEventStream({
      path: '/x',
      closeOnError: false,
      onFrame: () => {},
      onClose,
    });
    const es = FakeEventSource.instances[0];
    es.onerror?.();
    expect(es.closed).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('手动关流幂等，onClose 只回调一次', () => {
    const onClose = vi.fn();
    const handle: EventStreamHandle | null = openEventStream({
      path: '/x',
      onFrame: () => {},
      onClose,
    });
    handle?.close();
    handle?.close();
    expect(FakeEventSource.instances[0].closed).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith('manual');
  });
});

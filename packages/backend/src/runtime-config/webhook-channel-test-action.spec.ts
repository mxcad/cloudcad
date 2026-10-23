///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must be licensed by Chengdu Dream Kaide Technology Co., Ltd.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { WebhookChannelTestAction } from './webhook-channel-test-action';
import type { ChannelTestContext } from './runtime-config.types';

describe('WebhookChannelTestAction（ADR-0082 #506）', () => {
  const action = new WebhookChannelTestAction();
  const originalFetch = global.fetch;

  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const makeCtx = (
    overrides: Record<string, unknown> = {}
  ): ChannelTestContext => {
    const values: Record<string, unknown> = {
      alertWebhookUrl: 'https://example.com/hook',
      alertWebhookTemplate:
        '{"msgtype":"text","text":{"content":"[{{level}}] {{source}} {{timestamp}}\\n{{message}}\\n{{detail}}"}}',
      ...overrides,
    };
    return {
      getValue: <T>(key: string) => Promise.resolve(values[key] as T),
    };
  };

  const mockFetchStatus = (status: number, ok: boolean) => {
    fetchMock.mockResolvedValue({
      ok,
      status,
      statusText: ok ? 'OK' : 'Error',
    });
  };

  it('channel 标记为 webhook', () => {
    expect(action.channel).toBe('webhook');
  });

  it('URL 缺失 → 失败并报缺失键，不发请求', async () => {
    const result = await action.test(makeCtx({ alertWebhookUrl: '' }));

    expect(result.ok).toBe(false);
    expect(result.message).toContain('alertWebhookUrl');
    expect(result.problemKeys).toEqual(['alertWebhookUrl']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('HTTP 2xx → 通过，且 body 是模板渲染后的测试 payload', async () => {
    mockFetchStatus(200, true);

    const result = await action.test(makeCtx());

    expect(result.ok).toBe(true);
    expect(result.message).toContain('HTTP 2xx');
    // 真实收到 2xx 响应 → 端到端结论强度
    expect(result.verdict).toBe('end-to-end');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.com/hook');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    // 默认模板渲染：测试文案 + P2 + channel-test 占位符全部替换
    expect(init.body).toContain('CloudCAD 告警通道测试');
    expect(init.body).toContain('[P2] channel-test');
    expect(init.body).not.toContain('{{');
  });

  it('HTTP 4xx（机器人 token 失效等）→ 失败并报状态码，归因 URL 配置键', async () => {
    mockFetchStatus(401, false);

    const result = await action.test(makeCtx());

    expect(result.ok).toBe(false);
    expect(result.message).toContain('401');
    expect(result.problemKeys).toEqual(['alertWebhookUrl']);
  });

  it('HTTP 5xx → 失败并报状态码，归因 URL 配置键', async () => {
    mockFetchStatus(500, false);

    const result = await action.test(makeCtx());

    expect(result.ok).toBe(false);
    expect(result.message).toContain('500');
    expect(result.problemKeys).toEqual(['alertWebhookUrl']);
  });

  it('网络异常/超时 → 失败并报原因，归因 URL 配置键', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const result = await action.test(makeCtx());

    expect(result.ok).toBe(false);
    expect(result.message).toContain('fetch failed');
    expect(result.problemKeys).toEqual(['alertWebhookUrl']);
  });

  it('自定义模板按占位符渲染（飞书 msg_type 形态）', async () => {
    mockFetchStatus(200, true);

    await action.test(
      makeCtx({ alertWebhookTemplate: '{"msg_type":"text","content":"{{message}}"}' })
    );

    const init = fetchMock.mock.calls[0][1];
    expect(init.body).toBe(
      '{"msg_type":"text","content":"CloudCAD 告警通道测试"}'
    );
  });
});

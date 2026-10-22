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

import { WechatChannelTestAction } from './wechat-channel-test-action';
import type { ChannelTestContext } from './runtime-config.types';

describe('WechatChannelTestAction（ADR-0082 #503）', () => {
  const action = new WechatChannelTestAction();
  const originalFetch = global.fetch;

  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const makeCtx = (overrides: Record<string, unknown> = {}): ChannelTestContext => {
    const values: Record<string, unknown> = {
      wechatAppId: 'wx_test',
      wechatAppSecret: 'secret',
      ...overrides,
    };
    return {
      getValue: <T>(key: string) => Promise.resolve(values[key] as T),
    };
  };

  const mockFetchJson = (body: unknown) => {
    fetchMock.mockResolvedValue({ json: async () => body });
  };

  it('channel 标记为 wechat', () => {
    expect(action.channel).toBe('wechat');
  });

  it('AppID/AppSecret 缺失 → 失败并报缺失键清单，不调微信 API', async () => {
    const result = await action.test(
      makeCtx({ wechatAppId: '', wechatAppSecret: '' })
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain('wechatAppId');
    expect(result.message).toContain('wechatAppSecret');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gettoken 无 errcode → 凭据有效，通过', async () => {
    mockFetchJson({
      access_token: 'at1',
      expires_in: 7200,
    });

    const result = await action.test(makeCtx());

    expect(result.ok).toBe(true);
    expect(result.message).toContain('探测通过');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('grant_type=client_credential');
    expect(url).toContain('appid=wx_test');
    expect(url).toContain('secret=secret');
  });

  it('errcode 40163/48001（凭据有效但接口未授权）→ 通过并注明', async () => {
    for (const [errcode, errmsg] of [
      [40163, 'IP access not permitted'],
      [48001, 'api unauthorized'],
    ]) {
      mockFetchJson({ errcode, errmsg });

      const result = await action.test(makeCtx());

      expect(result.ok).toBe(true);
      expect(result.message).toContain(String(errcode));
    }
  });

  it('errcode 40013/40125/40001（凭据无效）→ 失败', async () => {
    for (const [errcode, errmsg] of [
      [40013, 'invalid appid'],
      [40125, 'invalid appsecret'],
      [40001, 'invalid grant_type'],
    ]) {
      mockFetchJson({ errcode, errmsg });

      const result = await action.test(makeCtx());

      expect(result.ok).toBe(false);
      expect(result.message).toContain(String(errcode));
    }
  });

  it('未知 errcode → 失败并带 errmsg', async () => {
    mockFetchJson({ errcode: 50012, errmsg: 'daily api limit reached' });

    const result = await action.test(makeCtx());

    expect(result.ok).toBe(false);
    expect(result.message).toContain('50012');
    expect(result.message).toContain('daily api limit reached');
  });

  it('网络异常 → 失败', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const result = await action.test(makeCtx());

    expect(result.ok).toBe(false);
    expect(result.message).toContain('fetch failed');
  });
});

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

import { PaymentChannelTestAction } from './payment-channel-test-action';
import type { ChannelTestContext } from './runtime-config.types';

describe('PaymentChannelTestAction（ADR-0082 #505）', () => {
  const action = new PaymentChannelTestAction();
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
      paymentProvider: 'wechat_pay',
      wechatPayAppId: 'wx_test_appid',
      wechatPayMchId: '1234567890',
      wechatPayKey: 'test_mch_key_0123456789abcdef',
      wechatPayNotifyUrl: 'https://example.com/billing/webhook/wechat',
      ...overrides,
    };
    return {
      getValue: <T>(key: string) => Promise.resolve(values[key] as T),
    };
  };

  /** 微信 API 响应 XML（无 CDATA，parseXML 直接得字符串值） */
  const xmlResponse = (fields: Record<string, string>): string =>
    `<xml>${Object.entries(fields)
      .map(([k, v]) => `<${k}>${v}</${k}>`)
      .join('')}</xml>`;

  const mockFetchXml = (body: string, ok = true, status = 200) => {
    fetchMock.mockResolvedValue({
      ok,
      status,
      statusText: 'OK',
      text: async () => body,
    });
  };

  it('channel 标记为 payment', () => {
    expect(action.channel).toBe('payment');
  });

  it('provider=mock → 直接通过，不调微信 API', async () => {
    const result = await action.test(makeCtx({ paymentProvider: 'mock' }));

    expect(result.ok).toBe(true);
    expect(result.message).toContain('Mock');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('未知 provider → 失败', async () => {
    const result = await action.test(makeCtx({ paymentProvider: 'alipay' }));

    expect(result.ok).toBe(false);
    expect(result.message).toContain('alipay');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('凭据缺失 → 失败并报缺失键清单，不调微信 API', async () => {
    const result = await action.test(
      makeCtx({ wechatPayMchId: '', wechatPayKey: '' })
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain('wechatPayMchId');
    expect(result.message).toContain('wechatPayKey');
    expect(result.message).not.toContain('wechatPayAppId');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('return_code=SUCCESS（随机订单查无 = 预期业务错误）→ 签名通过，凭据有效', async () => {
    mockFetchXml(
      xmlResponse({
        return_code: 'SUCCESS',
        result_code: 'FAIL',
        err_code: 'ORDERNOTEXIST',
        err_code_des: '订单不存在',
      })
    );

    const result = await action.test(makeCtx());

    expect(result.ok).toBe(true);
    expect(result.message).toContain('探测通过');
    // 请求体是签名后的 XML（appid/mch_id 参与签名）
    const body = fetchMock.mock.calls[0][1].body as string;
    expect(body).toContain('<appid>wx_test_appid</appid>');
    expect(body).toContain('<mch_id>1234567890</mch_id>');
    expect(body).toContain('<sign>');
  });

  it('return_code=FAIL（签名失败）→ 凭据无效，失败并带 return_msg', async () => {
    mockFetchXml(
      xmlResponse({
        return_code: 'FAIL',
        return_msg: '签名失败',
      })
    );

    const result = await action.test(makeCtx());

    expect(result.ok).toBe(false);
    expect(result.message).toContain('签名失败');
  });

  it('主域名 5xx → 切备用域名重试', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable' })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () =>
          xmlResponse({ return_code: 'SUCCESS', result_code: 'FAIL' }),
      });

    const result = await action.test(makeCtx());

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.mch.weixin.qq.com/pay/orderquery'
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://api2.mch.weixin.qq.com/pay/orderquery'
    );
  });

  it('主备域名均网络异常 → 失败并报不可达', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const result = await action.test(makeCtx());

    expect(result.ok).toBe(false);
    expect(result.message).toContain('不可达');
    expect(result.message).toContain('fetch failed');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

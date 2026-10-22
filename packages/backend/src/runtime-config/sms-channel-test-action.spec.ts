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

import Dysmsapi20170525 from '@alicloud/dysmsapi20170525';
import * as OpenApi from '@alicloud/openapi-client';
import * as tencentcloud from 'tencentcloud-sdk-nodejs';
import { SmsChannelTestAction } from './sms-channel-test-action';
import type { ChannelTestContext } from './runtime-config.types';

// 请求模型类用普通函数 mock（标准 JS 构造器语义：返回对象即实例）；
// jest.fn 被 new 调用时返回 mock 实例而非实现返回值，断言不到真实参数
jest.mock('@alicloud/dysmsapi20170525', () => ({
  __esModule: true,
  default: jest.fn(),
  SendSmsRequest: function (props: unknown) {
    return props;
  },
  QuerySmsSignListRequest: function (props: unknown) {
    return props;
  },
}));
jest.mock('@alicloud/openapi-client', () => ({
  Config: jest.fn((props: unknown) => props),
}));
jest.mock('tencentcloud-sdk-nodejs', () => ({
  sms: { v20210111: { Client: jest.fn() } },
}));

const AliyunClientMock = jest.mocked(
  Dysmsapi20170525
) as unknown as jest.Mock;
const TencentClientMock = jest.mocked(
  tencentcloud.sms.v20210111.Client
) as unknown as jest.Mock;

describe('SmsChannelTestAction（ADR-0082 #502）', () => {
  const action = new SmsChannelTestAction();

  const querySmsSignListMock = jest.fn();
  const aliyunSendSmsMock = jest.fn();
  const describeSmsSignListMock = jest.fn();
  const tencentSendSmsMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    querySmsSignListMock.mockResolvedValue({});
    aliyunSendSmsMock.mockResolvedValue({ body: { code: 'OK' } });
    describeSmsSignListMock.mockResolvedValue({});
    tencentSendSmsMock.mockResolvedValue({
      SendStatusSet: [{ Code: 'Ok' }],
    });
    AliyunClientMock.mockImplementation(
      () =>
        ({
          querySmsSignList: querySmsSignListMock,
          sendSms: aliyunSendSmsMock,
        }) as never
    );
    TencentClientMock.mockImplementation(
      () =>
        ({
          DescribeSmsSignList: describeSmsSignListMock,
          SendSms: tencentSendSmsMock,
        }) as never
    );
  });

  const makeCtx = (
    overrides: Record<string, unknown> = {},
    recipient?: string
  ): ChannelTestContext => {
    const values: Record<string, unknown> = {
      smsProvider: 'aliyun',
      aliyunSmsAccessKeyId: 'LTAI-ak',
      aliyunSmsAccessKeySecret: 'aliyun-sk',
      aliyunSmsSignName: 'CloudCAD',
      aliyunSmsTemplateCode: 'SMS_123',
      aliyunSmsRegionId: 'cn-hangzhou',
      tencentSmsSecretId: 'AKID-tid',
      tencentSmsSecretKey: 'tencent-sk',
      tencentSmsAppId: '1400000000',
      tencentSmsSignName: 'CloudCAD',
      tencentSmsTemplateCode: '100000',
      tencentSmsRegion: 'ap-guangzhou',
      ...overrides,
    };
    return {
      getValue: <T>(key: string) => Promise.resolve(values[key] as T),
      recipient,
    };
  };

  it('channel 标记为 sms', () => {
    expect(action.channel).toBe('sms');
  });

  it('mock 服务商：直接通过，不构造任何 SDK 客户端', async () => {
    const result = await action.test(makeCtx({ smsProvider: 'mock' }));

    expect(result.ok).toBe(true);
    expect(result.message).toContain('Mock');
    expect(AliyunClientMock).not.toHaveBeenCalled();
    expect(TencentClientMock).not.toHaveBeenCalled();
  });

  it('未知服务商 → 失败', async () => {
    const result = await action.test(
      makeCtx({ smsProvider: 'huawei' as never })
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain('huawei');
  });

  describe('阿里云', () => {
    it('AK/SK 缺失 → 失败并报缺失键清单，不构造客户端', async () => {
      const result = await action.test(
        makeCtx({ aliyunSmsAccessKeyId: '', aliyunSmsAccessKeySecret: '' })
      );

      expect(result.ok).toBe(false);
      expect(result.message).toContain('aliyunSmsAccessKeyId');
      expect(result.message).toContain('aliyunSmsAccessKeySecret');
      expect(AliyunClientMock).not.toHaveBeenCalled();
    });

    it('凭据探测失败（QuerySmsSignList 抛错）→ 失败', async () => {
      querySmsSignListMock.mockRejectedValue(
        new Error('InvalidAccessKeyId.NotFound : The AccessKey ID provided does not exist')
      );

      const result = await action.test(makeCtx());

      expect(result.ok).toBe(false);
      expect(result.message).toContain('InvalidAccessKeyId');
    });

    it('探测通过且未填收件人 → 通过，不发送短信', async () => {
      const result = await action.test(makeCtx());

      expect(result.ok).toBe(true);
      expect(result.message).toContain('未发送短信');
      expect(querySmsSignListMock).toHaveBeenCalledWith({});
      expect(aliyunSendSmsMock).not.toHaveBeenCalled();
    });

    it('填了收件人但签名/模板缺失 → 失败并报缺失键', async () => {
      const result = await action.test(
        makeCtx({ aliyunSmsSignName: '', aliyunSmsTemplateCode: '' }, '13800000000')
      );

      expect(result.ok).toBe(false);
      expect(result.message).toContain('aliyunSmsSignName');
      expect(result.message).toContain('aliyunSmsTemplateCode');
      expect(aliyunSendSmsMock).not.toHaveBeenCalled();
    });

    it('填了收件人且配置完整 → 真实发送（去 +86 前缀、固定测试码）', async () => {
      const result = await action.test(makeCtx({}, '+8613800000000'));

      expect(result.ok).toBe(true);
      expect(result.message).toContain('13800000000');
      expect(aliyunSendSmsMock).toHaveBeenCalledWith({
        phoneNumbers: '13800000000',
        signName: 'CloudCAD',
        templateCode: 'SMS_123',
        templateParam: JSON.stringify({ code: '000000' }),
      });
    });

    it('真实发送被服务商拒绝（code !== OK）→ 失败并带服务商错误信息', async () => {
      aliyunSendSmsMock.mockResolvedValue({
        body: { code: 'isv.SIGNNAME_ILLEGAL', message: '签名不合法' },
      });

      const result = await action.test(makeCtx({}, '13800000000'));

      expect(result.ok).toBe(false);
      expect(result.message).toContain('签名不合法');
    });
  });

  describe('腾讯云', () => {
    it('SecretId/SecretKey 缺失 → 失败并报缺失键清单，不构造客户端', async () => {
      const result = await action.test(
        makeCtx({
          smsProvider: 'tencent',
          tencentSmsSecretId: '',
          tencentSmsSecretKey: '',
        })
      );

      expect(result.ok).toBe(false);
      expect(result.message).toContain('tencentSmsSecretId');
      expect(result.message).toContain('tencentSmsSecretKey');
      expect(TencentClientMock).not.toHaveBeenCalled();
    });

    it('凭据探测失败（DescribeSmsSignList 抛错）→ 失败', async () => {
      describeSmsSignListMock.mockRejectedValue(
        new Error('UnauthorizedOperation: credential invalid')
      );

      const result = await action.test(makeCtx({ smsProvider: 'tencent' }));

      expect(result.ok).toBe(false);
      expect(result.message).toContain('credential invalid');
    });

    it('探测通过且未填收件人 → 通过，不发送短信', async () => {
      const result = await action.test(makeCtx({ smsProvider: 'tencent' }));

      expect(result.ok).toBe(true);
      expect(result.message).toContain('未发送短信');
      expect(describeSmsSignListMock).toHaveBeenCalledWith({ International: 0 });
      expect(tencentSendSmsMock).not.toHaveBeenCalled();
    });

    it('填了收件人但 AppID/签名/模板缺失 → 失败并报缺失键', async () => {
      const result = await action.test(
        makeCtx(
          {
            smsProvider: 'tencent',
            tencentSmsAppId: '',
            tencentSmsSignName: '',
            tencentSmsTemplateCode: '',
          },
          '13800000000'
        )
      );

      expect(result.ok).toBe(false);
      expect(result.message).toContain('tencentSmsAppId');
      expect(result.message).toContain('tencentSmsSignName');
      expect(result.message).toContain('tencentSmsTemplateCode');
      expect(tencentSendSmsMock).not.toHaveBeenCalled();
    });

    it('填了收件人且配置完整 → 真实发送（补 +86 前缀、位置参数数组）', async () => {
      const result = await action.test(makeCtx({ smsProvider: 'tencent' }, '13800000000'));

      expect(result.ok).toBe(true);
      expect(tencentSendSmsMock).toHaveBeenCalledWith({
        SmsSdkAppId: '1400000000',
        SignName: 'CloudCAD',
        TemplateId: '100000',
        PhoneNumberSet: ['+8613800000000'],
        TemplateParamSet: ['000000'],
      });
    });

    it('真实发送被服务商拒绝（Code !== Ok）→ 失败并带服务商错误信息', async () => {
      tencentSendSmsMock.mockResolvedValue({
        SendStatusSet: [{ Code: 'Fail', Message: '签名未审核通过' }],
      });

      const result = await action.test(makeCtx({ smsProvider: 'tencent' }, '13800000000'));

      expect(result.ok).toBe(false);
      expect(result.message).toContain('签名未审核通过');
    });
  });
});

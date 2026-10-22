import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRedisConnectionToken } from '@nestjs-modules/ioredis';
import { ClsService } from 'nestjs-cls';
import { RuntimeConfigService } from '../../../runtime-config/runtime-config.service';
import { WechatPayGateway } from './wechat-pay.gateway';
import { buildXML, sign } from './wechat-pay.util';

const MCH_KEY = 'test_mch_key_0123456789abcdef';

/** 运行时配置键与 ConfigService env 键同值（三层解析的 env 层由 ConfigService mock 承担） */
function createRuntimeConfig() {
  const values: Record<string, string> = {
    wechatPayAppId: 'wx_test_appid',
    wechatPayMchId: '1234567890',
    wechatPayKey: MCH_KEY,
    wechatPayNotifyUrl: 'https://example.com/billing/webhook/wechat',
  };
  return { values, getValue: jest.fn(async (key: string) => values[key] ?? '') };
}

function createConfig(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    'wechatPay.appId': 'wx_test_appid',
    'wechatPay.mchId': '1234567890',
    'wechatPay.key': MCH_KEY,
    'wechatPay.notifyUrl': 'https://example.com/billing/webhook/wechat',
    'wechatPay.signType': 'MD5',
    ...overrides,
  };
  return { get: jest.fn((key: string, def?: string) => values[key] ?? def) };
}

/** 用 util 的 sign() 构造合法签名的回调 XML（sign() 本身已被 util.spec 独立验证） */
function buildWebhookXml(
  fields: Record<string, string>,
  signType: 'MD5' | 'HMAC-SHA256' = 'MD5',
  key = MCH_KEY
): string {
  const body: Record<string, string> = { ...fields };
  body.sign = sign(body, key, signType);
  return buildXML('xml', body);
}

describe('WechatPayGateway', () => {
  let gateway: WechatPayGateway;
  let runtimeConfig: ReturnType<typeof createRuntimeConfig>;

  const successFields: Record<string, string> = {
    appid: 'wx_test_appid',
    mch_id: '1234567890',
    out_trade_no: 'PAYtest123',
    transaction_id: '4200001234',
    total_fee: '8550',
    result_code: 'SUCCESS',
    return_code: 'SUCCESS',
    time_end: '20260623142059',
    nonce_str: 'abc123',
  };

  beforeEach(async () => {
    runtimeConfig = createRuntimeConfig();
    const module = await Test.createTestingModule({
      providers: [
        WechatPayGateway,
        { provide: ConfigService, useValue: createConfig() },
        { provide: RuntimeConfigService, useValue: runtimeConfig },
        {
          provide: getRedisConnectionToken(),
          useValue: { set: jest.fn(), del: jest.fn() },
        },
        { provide: ClsService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    gateway = module.get<WechatPayGateway>(WechatPayGateway);
  });

  describe('verifyWebhook', () => {
    it('should accept a valid MD5-signed webhook and parse fields', async () => {
      const xml = buildWebhookXml(successFields);
      const result = await gateway.verifyWebhook(xml, {});

      expect(result.isValid).toBe(true);
      expect(result.orderNo).toBe('PAYtest123');
      expect(result.gatewayOrderId).toBe('4200001234');
      expect(result.amount).toBe(8550);
      expect(result.paidAt.getFullYear()).toBe(2026);
      expect(result.paidAt.getMonth()).toBe(5);
      expect(result.paidAt.getDate()).toBe(23);
      expect(result.paidAt.getHours()).toBe(14);
      expect(result.paidAt.getMinutes()).toBe(20);
      expect(result.paidAt.getSeconds()).toBe(59);
    });

    it('should accept a valid HMAC-SHA256-signed webhook', async () => {
      const xml = buildWebhookXml(
        { ...successFields, sign_type: 'HMAC-SHA256' },
        'HMAC-SHA256'
      );
      const result = await gateway.verifyWebhook(xml, {});

      expect(result.isValid).toBe(true);
      expect(result.amount).toBe(8550);
    });

    it('should auto-detect HMAC-SHA256 sign_type from callback', async () => {
      // 声明 HMAC-SHA256 但用 MD5 签名 → 验签失败，证明 sign_type 参与签名类型选择
      const xml = buildWebhookXml(
        { ...successFields, sign_type: 'HMAC-SHA256' },
        'MD5'
      );
      const result = await gateway.verifyWebhook(xml, {});

      expect(result.isValid).toBe(false);
    });

    it('should reject when total_fee is tampered after signing', async () => {
      const xml = buildWebhookXml(successFields);
      // 支付回调后攻击者改金额：签名仍是原金额的，必须验签失败
      const tampered = xml.replace(
        '<total_fee>8550</total_fee>',
        '<total_fee>8551</total_fee>'
      );
      expect(tampered).not.toBe(xml);

      const result = await gateway.verifyWebhook(tampered, {});

      expect(result.isValid).toBe(false);
    });

    it('should reject when sign is computed with a different key', async () => {
      const xml = buildWebhookXml(successFields, 'MD5', 'wrong_key');
      const result = await gateway.verifyWebhook(xml, {});

      expect(result.isValid).toBe(false);
    });

    it('should reject non-numeric total_fee even when sign is valid', async () => {
      const xml = buildWebhookXml({ ...successFields, total_fee: '85.50' });
      const result = await gateway.verifyWebhook(xml, {});

      expect(result.isValid).toBe(false);
      expect(result.amount).toBe(0);
    });

    it('should return isValid false for return_code=FAIL', async () => {
      const xml = buildWebhookXml({
        ...successFields,
        return_code: 'FAIL',
        return_msg: '签名失败',
      });
      const result = await gateway.verifyWebhook(xml, {});

      expect(result.isValid).toBe(false);
      // 字段仍被解析，供上层记录
      expect(result.orderNo).toBe('PAYtest123');
    });

    it('should reject unparseable XML', async () => {
      const result = await gateway.verifyWebhook('not-xml-at-all', {});

      expect(result.isValid).toBe(false);
      expect(result.orderNo).toBe('');
    });

    it('should parse CDATA-wrapped fields (real WeChat callback format)', async () => {
      const fields = {
        return_code: 'SUCCESS',
        result_code: 'SUCCESS',
        out_trade_no: 'PAYcd123',
        transaction_id: '4200009999',
        total_fee: '4275',
        time_end: '20260701010101',
        nonce_str: 'abc',
      };
      const signed = sign(fields, MCH_KEY, 'MD5');
      const xml = `<xml>
        <return_code><![CDATA[SUCCESS]]></return_code>
        <result_code><![CDATA[SUCCESS]]></result_code>
        <out_trade_no><![CDATA[PAYcd123]]></out_trade_no>
        <transaction_id><![CDATA[4200009999]]></transaction_id>
        <total_fee><![CDATA[4275]]></total_fee>
        <time_end><![CDATA[20260701010101]]></time_end>
        <nonce_str><![CDATA[abc]]></nonce_str>
        <sign><![CDATA[${signed}]]></sign>
      </xml>`;

      const result = await gateway.verifyWebhook(xml, {});

      expect(result.isValid).toBe(true);
      expect(result.orderNo).toBe('PAYcd123');
      expect(result.amount).toBe(4275);
    });
  });

  describe('凭据指纹热重建（ADR-0082 #505）', () => {
    it('指纹不变：每次调用仍热解析配置，但快照不重建', async () => {
      const rebuildSpy = jest
        .spyOn(gateway as any, 'buildHttpsAgent')
        .mockImplementation(() => undefined);

      const xml = buildWebhookXml(successFields);
      await gateway.verifyWebhook(xml, {});
      await gateway.verifyWebhook(xml, {});

      // 每次调用前都重解析（4 键 × 2 次调用）——热读不依赖启动期快照
      expect(runtimeConfig.getValue).toHaveBeenCalledTimes(8);
      // 指纹未变 → 仅首次建立快照
      expect(rebuildSpy).toHaveBeenCalledTimes(1);
    });

    it('凭据改写：指纹变化触发重建，新 key 生效、旧 key 失效', async () => {
      const rebuildSpy = jest
        .spyOn(gateway as any, 'buildHttpsAgent')
        .mockImplementation(() => undefined);
      const newKey = 'new_mch_key_9876543210fedcba';

      const oldSigned = buildWebhookXml(successFields, 'MD5', MCH_KEY);
      const newSigned = buildWebhookXml(successFields, 'MD5', newKey);

      // 首次调用建立快照（MCH_KEY）
      expect((await gateway.verifyWebhook(oldSigned, {})).isValid).toBe(true);

      // 运维在配置页改写商户密钥
      runtimeConfig.values.wechatPayKey = newKey;

      // 指纹变化 → 重建快照：新 key 验签通过、旧 key 验签失败
      expect((await gateway.verifyWebhook(newSigned, {})).isValid).toBe(true);
      expect((await gateway.verifyWebhook(oldSigned, {})).isValid).toBe(false);
      expect(rebuildSpy).toHaveBeenCalledTimes(2);
    });
  });
});

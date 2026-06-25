import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import * as https from 'node:https';
import * as fs from 'node:fs';
import axios from 'axios';
import { buildXML, parseXML, generateNonceStr, sign, parseTimeEnd } from './wechat-pay.util';
import type { PaymentGateway, CreatePaymentParams, CreatePaymentResult, WebhookVerifyResult, QueryOrderResult } from '../payment-gateway.interface';

const NONCE_TTL = 300;
const REFUND_PREFIX = 'wx:refund:';
const NONCE_PREFIX = 'wx:nonce:';

@Injectable()
export class WechatPayGateway implements PaymentGateway {
  readonly name = 'wechat_pay';
  private readonly logger = new Logger(WechatPayGateway.name);

  private readonly apiBase = 'https://api.mch.weixin.qq.com';
  private readonly backupApiBase = 'https://api2.mch.weixin.qq.com';
  private readonly appId: string;
  private readonly mchId: string;
  private readonly key: string;
  private readonly notifyUrl: string;
  private readonly signType: 'MD5' | 'HMAC-SHA256';
  private readonly httpsAgent?: https.Agent;

  constructor(
    private configService: ConfigService,
    @InjectRedis() private readonly redis: Redis,
  ) {
    this.appId = this.configService.get<string>('wechatPay.appId', '');
    this.mchId = this.configService.get<string>('wechatPay.mchId', '');
    this.key = this.configService.get<string>('wechatPay.key', '');
    this.notifyUrl = this.configService.get<string>('wechatPay.notifyUrl', '');
    this.signType = this.configService.get<'MD5' | 'HMAC-SHA256'>('wechatPay.signType', 'MD5');

    const certPath = this.configService.get<string>('wechatPay.certPath');
    const keyPath = this.configService.get<string>('wechatPay.keyPath');
    if (certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      this.httpsAgent = new https.Agent({
        pfx: fs.readFileSync(certPath),
        passphrase: this.mchId,
      });
    } else if (certPath && fs.existsSync(certPath)) {
      this.httpsAgent = new https.Agent({
        pfx: fs.readFileSync(certPath),
        passphrase: this.mchId,
      });
    } else {
      this.logger.warn(`wechat pay cert not configured — refund API (/secapi/pay/refund) will fail in production`);
    }
  }

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const data: Record<string, any> = {
      appid: this.appId,
      mch_id: this.mchId,
      nonce_str: generateNonceStr(),
      body: params.description,
      out_trade_no: params.orderNo,
      total_fee: params.amount,
      fee_type: 'CNY',
      spbill_create_ip: params.ip,
      notify_url: this.notifyUrl,
      trade_type: params.tradeType,
    };

    if (this.signType === 'HMAC-SHA256') {
      data.sign_type = 'HMAC-SHA256';
    }

    if (params.tradeType === 'JSAPI') {
      if (!params.openid) {
        throw new Error('trade_type JSAPI requires openid');
      }
      data.openid = params.openid;
    }

    if (params.tradeType === 'MWEB' && params.redirectUrl) {
      data.redirect_url = params.redirectUrl;
    }

    data.sign = sign(data, this.key, this.signType);

    const result = await this.requestWechatApi('/pay/unifiedorder', data);

    const timeStamp = String(Math.floor(Date.now() / 1000));
    const nonceStr = generateNonceStr();
    const signParams = {
      appId: this.appId,
      timeStamp,
      nonceStr,
      package: `prepay_id=${result.prepay_id}`,
      signType: this.signType,
    };

    return {
      gatewayOrderId: result.prepay_id as string,
      codeUrl: result.code_url as string | undefined,
      payParams: {
        ...signParams,
        paySign: sign(signParams, this.key, this.signType),
      },
    };
  }

  async verifyWebhook(
    payload: any,
    _headers: Record<string, string>,
  ): Promise<WebhookVerifyResult> {
    const xml = typeof payload === 'string' ? payload : payload;
    const parsed = parseXML(xml);
    const data = parsed?.xml ?? parsed;

    if (!data || typeof data !== 'object') {
      this.logger.warn(`invalid wechat webhook XML: cannot parse`);
      return {
        isValid: false,
        orderNo: '',
        gatewayOrderId: '',
        amount: 0,
        paidAt: new Date(),
      };
    }

    // 自动识别签名类型：根据回调中的 sign_type 字段
    const signType: 'MD5' | 'HMAC-SHA256' = data.sign_type === 'HMAC-SHA256' ? 'HMAC-SHA256' : 'MD5';

    // 使用排除法构建签名数据：取所有字段除 sign 外参与签名
    const receivedSign = data.sign as string;
    const signData: Record<string, any> = {};
    for (const key of Object.keys(data)) {
      if (key !== 'sign' && data[key] != null && data[key] !== '') {
        signData[key] = data[key];
      }
    }
    const calculatedSign = sign(signData, this.key, signType);

    if (calculatedSign !== receivedSign) {
      return {
        isValid: false,
        orderNo: '',
        gatewayOrderId: '',
        amount: 0,
        paidAt: new Date(),
      };
    }

    // 重放攻击防护 (Redis 共享缓存)
    const nonce = data.nonce_str as string;
    if (nonce) {
      const used = await this.redis.exists(`${NONCE_PREFIX}${nonce}`);
      if (used) {
        this.logger.warn(`replay attack detected: nonce=${nonce}`);
        return {
          isValid: false,
          orderNo: '',
          gatewayOrderId: '',
          amount: 0,
          paidAt: new Date(),
        };
      }
      await this.redis.setex(`${NONCE_PREFIX}${nonce}`, NONCE_TTL, '1');
    }

    const isValid = data.return_code === 'SUCCESS' && data.result_code === 'SUCCESS';

    return {
      isValid,
      orderNo: data.out_trade_no as string,
      gatewayOrderId: data.transaction_id as string,
      amount: parseInt(data.total_fee as string, 10),
      paidAt: parseTimeEnd(data.time_end as string | undefined),
    };
  }

  async queryOrder(orderNo: string): Promise<QueryOrderResult> {
    const data: Record<string, any> = {
      appid: this.appId,
      mch_id: this.mchId,
      out_trade_no: orderNo,
      nonce_str: generateNonceStr(),
    };
    if (this.signType === 'HMAC-SHA256') {
      data.sign_type = 'HMAC-SHA256';
    }
    data.sign = sign(data, this.key, this.signType);

    const result = await this.requestWechatApi('/pay/orderquery', data);

    switch (result.trade_state) {
      case 'SUCCESS':
        return {
          status: 'SUCCESS',
          gatewayOrderId: result.transaction_id as string,
          amount: parseInt(result.total_fee as string, 10),
          paidAt: result.time_end ? parseTimeEnd(result.time_end as string) : undefined,
        };
      case 'NOTPAY':
        return { status: 'NOTPAY' };
      case 'CLOSED':
        return { status: 'CLOSED' };
      case 'REFUND':
        return { status: 'REFUND' };
      default:
        return { status: 'NOTPAY' };
    }
  }

  async refund(orderNo: string, amount: number): Promise<void> {
    const refundKey = `${REFUND_PREFIX}${orderNo}`;
    const alreadyRefunding = await this.redis.setnx(refundKey, '1');
    if (!alreadyRefunding) {
      this.logger.warn(`duplicate refund blocked: ${orderNo}`);
      return;
    }
    await this.redis.expire(refundKey, 3600);

    try {
      const data: Record<string, any> = {
        appid: this.appId,
        mch_id: this.mchId,
        nonce_str: generateNonceStr(),
        out_trade_no: orderNo,
        out_refund_no: `RF${orderNo.slice(0, 26)}`,
        total_fee: amount,
        refund_fee: amount,
      };
      if (this.signType === 'HMAC-SHA256') {
        data.sign_type = 'HMAC-SHA256';
      }
      data.sign = sign(data, this.key, this.signType);

      await this.requestWechatApi('/secapi/pay/refund', data, true);
      await this.redis.del(refundKey);
    } catch (err) {
      await this.redis.del(refundKey);
      throw err;
    }
  }

  private async requestWechatApi(
    path: string,
    data: Record<string, any>,
    useCert = false,
  ): Promise<any> {
    const xml = buildXML('xml', data);
    const domains = [this.apiBase, this.backupApiBase];

    for (let i = 0; i < domains.length; i++) {
      try {
        const url = `${domains[i]}${path}`;
        const config: Record<string, any> = {
          headers: { 'Content-Type': 'application/xml' },
          timeout: 10000,
        };
        if (useCert && this.httpsAgent) {
          config.httpsAgent = this.httpsAgent;
        }
        const res = await axios.post(url, xml, config);
        const parsed = parseXML(res.data);
        if (parsed?.xml?.return_code === 'SUCCESS') {
          if (parsed.xml.result_code === 'FAIL') {
            this.logger.warn(`wechat api business error: path=${path} err_code=${parsed.xml.err_code} err_code_des=${parsed.xml.err_code_des}`);
            throw new Error(`wechat api business error: ${parsed.xml.err_code_des}`);
          }
          this.logger.log(`wechat api success: path=${path} return_code=SUCCESS`);
          return parsed.xml;
        }
        this.logger.warn(`wechat api error: path=${path} return_msg=${parsed?.xml?.return_msg}`);
        throw new Error(`wechat api error: ${parsed?.xml?.return_msg}`);
      } catch (err: any) {
        const isNetworkError = err?.code === 'ECONNREFUSED'
          || err?.code === 'ETIMEDOUT'
          || err?.code === 'ECONNRESET'
          || err?.response?.status === 503;
        if (isNetworkError && i < domains.length - 1) {
          this.logger.warn(`wechat api domain failed, switching to backup: ${domains[i]}`);
          continue;
        }
        throw err;
      }
    }
    throw new Error('all wechat pay domains are unavailable');
  }
}

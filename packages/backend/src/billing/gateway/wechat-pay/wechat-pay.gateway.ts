import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'node:https';
import * as fs from 'node:fs';
import axios from 'axios';
import { buildXML, parseXML, generateNonceStr, md5Sign } from './wechat-pay.util';
import type { PaymentGateway, CreatePaymentParams, CreatePaymentResult, WebhookVerifyResult, QueryOrderResult } from '../payment-gateway.interface';

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
  private readonly httpsAgent?: https.Agent;

  constructor(private configService: ConfigService) {
    this.appId = this.configService.get<string>('wechatPay.appId', '');
    this.mchId = this.configService.get<string>('wechatPay.mchId', '');
    this.key = this.configService.get<string>('wechatPay.key', '');
    this.notifyUrl = this.configService.get<string>('wechatPay.notifyUrl', '');

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
      spbill_create_ip: params.ip,
      notify_url: this.notifyUrl,
      trade_type: params.tradeType,
    };

    if (params.tradeType === 'JSAPI' && params.openid) {
      data.openid = params.openid;
    }

    data.sign = md5Sign(data, this.key);

    const result = await this.requestWechatApi('/pay/unifiedorder', data);

    return {
      gatewayOrderId: result.prepay_id as string,
      codeUrl: result.code_url as string | undefined,
      payParams: {
        appId: this.appId,
        timeStamp: String(Math.floor(Date.now() / 1000)),
        nonceStr: generateNonceStr(),
        package: `prepay_id=${result.prepay_id}`,
        signType: 'MD5',
        paySign: md5Sign({
          appId: this.appId,
          timeStamp: String(Math.floor(Date.now() / 1000)),
          nonceStr: generateNonceStr(),
          package: `prepay_id=${result.prepay_id}`,
          signType: 'MD5',
        }, this.key),
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

    const receivedSign = data.sign as string;
    const signData = { ...data };
    delete signData.sign;
    const calculatedSign = md5Sign(signData, this.key);

    if (calculatedSign !== receivedSign) {
      return {
        isValid: false,
        orderNo: '',
        gatewayOrderId: '',
        amount: 0,
        paidAt: new Date(),
      };
    }

    return {
      isValid: data.return_code === 'SUCCESS',
      orderNo: data.out_trade_no as string,
      gatewayOrderId: data.transaction_id as string,
      amount: parseInt(data.total_fee as string, 10),
      paidAt: new Date(data.time_end as string),
    };
  }

  async queryOrder(orderNo: string): Promise<QueryOrderResult> {
    const data: Record<string, any> = {
      appid: this.appId,
      mch_id: this.mchId,
      out_trade_no: orderNo,
      nonce_str: generateNonceStr(),
    };
    data.sign = md5Sign(data, this.key);

    const result = await this.requestWechatApi('/pay/orderquery', data);

    switch (result.trade_state) {
      case 'SUCCESS':
        return {
          status: 'SUCCESS',
          gatewayOrderId: result.transaction_id as string,
          amount: parseInt(result.total_fee as string, 10),
          paidAt: result.time_end ? new Date(result.time_end as string) : undefined,
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
    const data: Record<string, any> = {
      appid: this.appId,
      mch_id: this.mchId,
      nonce_str: generateNonceStr(),
      out_trade_no: orderNo,
      out_refund_no: `RF${orderNo.slice(2)}`,
      total_fee: amount,
      refund_fee: amount,
    };
    data.sign = md5Sign(data, this.key);

    await this.requestWechatApi('/secapi/pay/refund', data, true);
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
            throw new Error(`wechat api business error: ${parsed.xml.err_code_des}`);
          }
          return parsed.xml;
        }
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

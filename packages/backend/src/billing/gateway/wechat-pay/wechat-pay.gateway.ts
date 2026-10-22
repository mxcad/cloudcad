import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { ClsService } from 'nestjs-cls';
import * as https from 'https';
import * as tls from 'tls';
import * as fs from 'fs';
import { RuntimeConfigService } from '../../../runtime-config/runtime-config.service';
import { buildXML, parseXML, generateNonceStr, sign, parseTimeEnd } from './wechat-pay.util';
import { buildOutboundTraceHeaders } from '../../../common/utils/outbound-trace';
import type { PaymentGateway, CreatePaymentParams, CreatePaymentResult, WebhookVerifyResult, QueryOrderResult } from '../payment-gateway.interface';

const REFUND_PREFIX = 'wx:refund:';

/** 安全提取 fast-xml-parser 的文本值（处理 CDATA 对象） */
function xmlText(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && '__cdata' in (val as Record<string, unknown>)) {
    return String((val as Record<string, unknown>).__cdata ?? '');
  }
  return JSON.stringify(val);
}

@Injectable()
export class WechatPayGateway implements PaymentGateway {
  readonly name = 'wechat_pay';
  private readonly logger = new Logger(WechatPayGateway.name);

  private readonly apiBase = 'https://api.mch.weixin.qq.com';
  private readonly backupApiBase = 'https://api2.mch.weixin.qq.com';

  /**
   * 凭据快照（指纹热重建，ADR-0082 三期 #505）：
   * appId/mchId/key/notifyUrl 走运行时配置三层解析（runtime > env(WECHATPAY_*) > 默认），
   * signType/证书路径按 ADR-0082 D7 留 env。每次 API 调用前经 syncCredentials()
   * 重解析拼指纹，变化才更新快照并重建 mTLS agent——与 EmailService/SmsProvider 同型。
   */
  private appId = '';
  private mchId = '';
  private key = '';
  private notifyUrl = '';
  private signType: 'MD5' | 'HMAC-SHA256' = 'MD5';
  private httpsAgent?: https.Agent;
  private credsFingerprint: string | null = null;

  constructor(
    private configService: ConfigService,
    private runtimeConfigService: RuntimeConfigService,
    @InjectRedis() private readonly redis: Redis,
    private readonly cls: ClsService,
  ) {
    // 证书路径是 env（D7），启动期先打一条检查日志便于部署排障；
    // agent 本体在首次 API 调用时由 syncCredentials() 建立（PFX 口令依赖运行时 mchId）。
    const certPath = this.configService.get<string>('wechatPay.certPath');
    const keyPath = this.configService.get<string>('wechatPay.keyPath');
    this.logger.warn(`wechat pay cert check: certPath=${certPath} keyPath=${keyPath}（agent 首次调用时加载）`);
  }

  /**
   * 热重建凭据快照：每次调用前重解析（与生产配置同源），指纹不变则直接复用。
   * 证书路径变化或 mchId（PFX 口令）变化都会改变指纹 → 重建 agent。
   */
  private async syncCredentials(): Promise<void> {
    const [appId, mchId, key, notifyUrl] = await Promise.all([
      this.runtimeConfigService.getValue<string>('wechatPayAppId'),
      this.runtimeConfigService.getValue<string>('wechatPayMchId'),
      this.runtimeConfigService.getValue<string>('wechatPayKey'),
      this.runtimeConfigService.getValue<string>('wechatPayNotifyUrl'),
    ]);
    const signType = this.configService.get<'MD5' | 'HMAC-SHA256'>('wechatPay.signType', 'MD5');
    const certPath = this.configService.get<string>('wechatPay.certPath');
    const keyPath = this.configService.get<string>('wechatPay.keyPath');

    const fingerprint = JSON.stringify([appId, mchId, key, notifyUrl, signType, certPath, keyPath]);
    if (fingerprint === this.credsFingerprint) return;

    this.appId = appId;
    this.mchId = mchId;
    this.key = key;
    this.notifyUrl = notifyUrl;
    this.signType = signType;
    this.httpsAgent = this.buildHttpsAgent(certPath, keyPath);
    this.credsFingerprint = fingerprint;
  }

  /**
   * 建立 mTLS agent（仅退款等 useCert 接口需要）。支持两种证书格式：
   * 1. PEM 格式：certPath = apiclient_cert.pem, keyPath = apiclient_key.pem
   * 2. PFX 格式：certPath = apiclient_cert.p12, keyPath 可选（口令 = mchId）
   */
  private buildHttpsAgent(certPath: string | undefined, keyPath: string | undefined): https.Agent | undefined {
    if (!certPath || !fs.existsSync(certPath)) {
      this.logger.warn(`wechat pay cert not found at: ${certPath} — refund API will fail`);
      return undefined;
    }
    if (keyPath && fs.existsSync(keyPath) && certPath.endsWith('.pem')) {
      // PEM 格式：cert + key 分开
      try {
        const cert = fs.readFileSync(certPath);
        const key = fs.readFileSync(keyPath);
        // 验证证书有效性
        const secureContext = tls.createSecureContext({ cert, key });
        this.logger.warn(`wechat pay cert loaded (PEM) cert=${certPath} key=${keyPath}`);
        return new https.Agent({ secureContext });
      } catch (err) {
        this.logger.error(`wechat pay cert load failed (PEM) cert=${certPath} key=${keyPath}`, err);
        return undefined;
      }
    }
    if (certPath.endsWith('.p12') || certPath.endsWith('.pfx')) {
      // PFX/P12 格式：证书 + 私钥打包在一个文件里
      try {
        const pfx = fs.readFileSync(certPath);
        // 验证证书有效性（密码 + 格式）
        const secureContext = tls.createSecureContext({
          pfx,
          passphrase: this.mchId,
        });
        this.logger.warn(`wechat pay cert loaded (PFX) from ${certPath}`);
        return new https.Agent({ secureContext });
      } catch (err) {
        this.logger.error(`wechat pay cert load failed (PFX) from ${certPath}`, err);
        return undefined;
      }
    }
    this.logger.warn(`unsupported cert format: ${certPath}`);
    return undefined;
  }

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    await this.syncCredentials();
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
      // MWEB 模式微信返回 mweb_url；NATIVE/JSAPI 无该字段时回退到调用方传入的 redirectUrl
      redirectUrl: (result.mweb_url ?? params.redirectUrl) as string | undefined,
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
    await this.syncCredentials();
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

    const isValid = data.return_code === 'SUCCESS' && data.result_code === 'SUCCESS';

    // total_fee 严格校验：非法值直接判失败，幂等由 DB 层保障
    if (typeof data.total_fee !== 'string' || !/^\d+$/.test(data.total_fee)) {
      return {
        isValid: false,
        orderNo: '',
        gatewayOrderId: '',
        amount: 0,
        paidAt: new Date(),
      };
    }

    return {
      isValid,
      orderNo: data.out_trade_no as string,
      gatewayOrderId: data.transaction_id as string,
      amount: parseInt(data.total_fee, 10),
      paidAt: parseTimeEnd(data.time_end as string | undefined),
    };
  }

  async queryOrder(orderNo: string): Promise<QueryOrderResult> {
    await this.syncCredentials();
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
    await this.syncCredentials();
    const refundKey = `${REFUND_PREFIX}${orderNo}`;
    // 原子 SET NX 加锁，避免 setnx + expire 两步间崩溃遗留锁
    const alreadyRefunding = await this.redis.set(refundKey, '1', 'EX', 3600, 'NX');
    if (!alreadyRefunding) {
      this.logger.warn(`duplicate refund blocked: ${orderNo}`);
      return;
    }

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
        const body = await this.httpPost(url, xml, useCert);
        const parsed = parseXML(body);
        if (parsed?.xml?.return_code === 'SUCCESS') {
          if (parsed.xml.result_code === 'FAIL') {
            this.logger.warn(`wechat api business error: path=${path} err_code=${xmlText(parsed.xml.err_code)} err_code_des=${xmlText(parsed.xml.err_code_des)}`);
            // 挂载 err_code（如 ORDERPAID="该订单已支付"）供上层识别可恢复错误并转对账
            const err = new Error(
              `wechat api business error: ${xmlText(parsed.xml.err_code_des)}`
            ) as Error & { errCode?: string };
            err.errCode = xmlText(parsed.xml.err_code);
            throw err;
          }
          this.logger.log(`wechat api success: path=${path} return_code=SUCCESS`);
          return parsed.xml;
        }
        this.logger.warn(`wechat api error: path=${path} return_msg=${xmlText(parsed?.xml?.return_msg)}`);
        throw new Error(`wechat api error: ${xmlText(parsed?.xml?.return_msg)}`);
      } catch (err: any) {
        const isNetworkError = err?.code === 'ECONNREFUSED'
          || err?.code === 'ETIMEDOUT'
          || err?.code === 'ECONNRESET'
          || err?.statusCode === 503;
        if (isNetworkError && i < domains.length - 1) {
          this.logger.warn(`wechat api domain failed, switching to backup: ${domains[i]}`);
          continue;
        }
        throw err;
      }
    }
    throw new Error('all wechat pay domains are unavailable');
  }

  private httpPost(url: string, body: string, useCert = false): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const u = new URL(url);
      const agent = useCert && this.httpsAgent ? this.httpsAgent : undefined;
      if (useCert) {
        this.logger.warn(`httpPost useCert=true, agent=${agent ? 'present' : 'MISSING'}, this.httpsAgent=${this.httpsAgent ? 'present' : 'null'}`);
      }
      const options: https.RequestOptions = {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
          'Content-Length': Buffer.byteLength(body),
          // X-Request-Id/X-Trace-Id 透传（#309）：微信支付侧网关日志可关联
          ...buildOutboundTraceHeaders(
            {
              requestId: this.cls?.get<string>('requestId'),
              traceId: this.cls?.get<string>('traceId'),
            },
            'wechat-pay',
          ),
        },
        timeout: 10000,
        agent,
      };

      const req = https.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            this.logger.warn(`wechat http error: status=${res.statusCode} body=${raw}`);
            const err: Error & { statusCode?: number } = new Error(
              `HTTP ${res.statusCode}`
            );
            err.statusCode = res.statusCode;
            reject(err);
            return;
          }
          resolve(raw);
        });
      });

      req.on('error', (err) => {
        reject(err);
      });
      req.on('timeout', () => {
        req.destroy();
        const err: Error & { code?: string } = new Error('request timeout');
        err.code = 'ETIMEDOUT';
        reject(err);
      });

      req.write(body);
      req.end();
    });
  }
}

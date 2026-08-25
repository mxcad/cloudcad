import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import * as crypto from 'crypto';
import { I18nContext } from 'nestjs-i18n';
import { ClsService } from 'nestjs-cls';
import { buildOutboundTraceHeaders } from '../../../common/utils/outbound-trace';

export interface WechatUserInfo {
  openid: string;
  nickname: string;
  sex: number;
  province: string;
  city: string;
  country: string;
  headimgurl: string;
  privilege: string[];
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

interface WechatTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  openid: string;
  scope: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

@Injectable()
export class WechatService {
  private readonly logger = new Logger(WechatService.name);
  private _appId: string | undefined;
  private _appSecret: string | undefined;
  private _callbackUrl: string | undefined;

  /** access_token 幂等缓存 TTL（秒），大于微信 code 有效期（5 分钟） */
  private readonly cacheTtl = 600;
  /** 幂等锁 TTL（秒），需大于一次微信 API 调用耗时 */
  private readonly lockTtl = 15;

  constructor(
    private readonly configService: ConfigService,
    @InjectRedis() private readonly redis: Redis,
    private readonly cls: ClsService
  ) {}

  private get appId(): string {
    if (this._appId === undefined) {
      this._appId = this.configService.get<string>('WECHAT_APP_ID') || '';
    }
    return this._appId;
  }

  private get packagesecret(): string {
    if (this._appSecret === undefined) {
      this._appSecret =
        this.configService.get<string>('WECHAT_APP_SECRET') || '';
    }
    return this._appSecret;
  }

  private get callbackUrl(): string {
    if (this._callbackUrl === undefined) {
      this._callbackUrl =
        this.configService.get<string>('WECHAT_CALLBACK_URL') || '';
    }
    return this._callbackUrl;
  }

  get callbackUrlValue(): string {
    return this.callbackUrl;
  }

  getAuthUrl(state: string, customRedirectUri?: string): string {
    if (!this.appId) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.auth.wechat_appid_missing') ??
          '微信 AppID 未配置，请在 .env 文件中设置 WECHAT_APP_ID'
      );
    }
    if (!this.callbackUrl) {
      throw new BadRequestException(
        '微信回调地址未配置，请在 .env 文件中设置 WECHAT_CALLBACK_URL'
      );
    }

    const redirectUri = encodeURIComponent(
      customRedirectUri || this.callbackUrl
    );
    return (
      `https://open.weixin.qq.com/connect/qrconnect?` +
      `appid=${this.appId}` +
      `&redirect_uri=${redirectUri}` +
      `&response_type=code` +
      `&scope=snsapi_login` +
      `&state=${encodeURIComponent(state)}` +
      `#wechat_redirect`
    );
  }

  getMobileAuthUrl(state: string, customRedirectUri?: string): string {
    if (!this.appId) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.auth.wechat_appid_missing') ??
          '微信 AppID 未配置，请在 .env 文件中设置 WECHAT_APP_ID'
      );
    }
    if (!this.callbackUrl) {
      throw new BadRequestException(
        '微信回调地址未配置，请在 .env 文件中设置 WECHAT_CALLBACK_URL'
      );
    }

    const redirectUri = encodeURIComponent(
      customRedirectUri || this.callbackUrl
    );
    return (
      `https://open.weixin.qq.com/connect/oauth2/authorize?` +
      `appid=${this.appId}` +
      `&redirect_uri=${redirectUri}` +
      `&response_type=code` +
      `&scope=snsapi_userinfo` +
      `&state=${encodeURIComponent(state)}` +
      `#wechat_redirect`
    );
  }

  async getAccessToken(code: string): Promise<WechatTokenResponse> {
    // 幂等缓存：微信 code 一次性有效，CDN 回源重试/客户端重放同一 code 时
    // 直接命中首次结果，避免微信拒绝（40029 code been used）
    const cacheKey = `wechat:access_token:${this.appId}:${code}`;
    const lockKey = `${cacheKey}:lock`;

    const cached = await this.readAccessTokenCache(cacheKey);
    if (cached) return cached;

    // 抢锁：并发重放（CDN 同时回源两个请求）时仅持锁者调用微信 API，
    // 其余请求等待后重读缓存（double-check）
    let lockAcquired = false;
    try {
      lockAcquired =
        (await this.redis.set(lockKey, '1', 'EX', this.lockTtl, 'NX')) === 'OK';
    } catch (error) {
      this.logger.warn(
        `获取微信 access_token 锁失败，降级直调微信 API: ${error}`
      );
    }

    if (!lockAcquired) {
      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        const retry = await this.readAccessTokenCache(cacheKey);
        if (retry) return retry;
      }
      this.logger.warn(
        `微信 access_token 锁等待超时，降级直调微信 API: code=${this.maskCode(code)}`
      );
    }

    try {
      const data = await this.requestAccessToken(code);
      await this.writeAccessTokenCache(cacheKey, data);
      return data;
    } finally {
      if (lockAcquired) {
        try {
          await this.redis.del(lockKey);
        } catch {
          // 锁释放失败由 TTL 兜底
        }
      }
    }
  }

  private async readAccessTokenCache(
    cacheKey: string
  ): Promise<WechatTokenResponse | null> {
    try {
      const cached = await this.redis.get(cacheKey);
      if (!cached) return null;
      const parsed = JSON.parse(cached) as WechatTokenResponse;
      if (parsed && !parsed.errcode) return parsed;
      return null;
    } catch (error) {
      this.logger.warn(
        `读取微信 access_token 幂等缓存失败，降级直调微信 API: ${error}`
      );
      return null;
    }
  }

  private async writeAccessTokenCache(
    cacheKey: string,
    data: WechatTokenResponse
  ): Promise<void> {
    try {
      await this.redis.setex(cacheKey, this.cacheTtl, JSON.stringify(data));
    } catch (error) {
      this.logger.warn(`写入微信 access_token 幂等缓存失败（忽略）: ${error}`);
    }
  }

  /** 出站微信 API 请求头：注入 X-Request-Id/X-Trace-Id（#309，便于与网关日志关联） */
  private outboundHeaders(): Record<string, string> {
    return buildOutboundTraceHeaders(
      {
        requestId: this.cls?.get<string>('requestId'),
        traceId: this.cls?.get<string>('traceId'),
      },
      'wechat-api',
    );
  }

  private async requestAccessToken(code: string): Promise<WechatTokenResponse> {
    const url =
      `https://api.weixin.qq.com/sns/oauth2/access_token?` +
      `appid=${this.appId}` +
      `&secret=${this.packagesecret}` +
      `&code=${code}` +
      `&grant_type=authorization_code`;

    let data: WechatTokenResponse;
    try {
      const response = await fetch(url, { headers: this.outboundHeaders() });
      data = await response.json();
    } catch (error) {
      this.logger.error('获取微信 access_token 异常', error.stack);
      throw new InternalServerErrorException(
        I18nContext.current()?.t('error.auth.wechat_auth_service_error') ??
          '微信授权服务异常'
      );
    }

    if (data.errcode) {
      this.logger.error(`获取微信 access_token 失败: ${data.errmsg}`);
      throw new InternalServerErrorException(
        I18nContext.current()?.t('error.auth.wechat_auth_failed') ??
          `微信授权失败: ${data.errmsg}`
      );
    }

    return data;
  }

  private maskCode(code: string): string {
    if (code.length <= 8) return '***';
    return `${code.slice(0, 4)}...${code.slice(-4)}`;
  }

  async getUserInfo(
    accessToken: string,
    openid: string
  ): Promise<WechatUserInfo> {
    const url =
      `https://api.weixin.qq.com/sns/userinfo?` +
      `access_token=${accessToken}` +
      `&openid=${openid}` +
      `&lang=zh_CN`;

    let data: WechatUserInfo;
    try {
      const response = await fetch(url, { headers: this.outboundHeaders() });
      data = await response.json();
    } catch (error) {
      this.logger.error('获取微信用户信息异常', error.stack);
      throw new InternalServerErrorException(
        I18nContext.current()?.t('error.auth.wechat_user_info_error') ??
          '微信用户信息服务异常'
      );
    }

    if (data.errcode) {
      this.logger.error(`获取微信用户信息失败: ${data.errmsg}`);
      throw new InternalServerErrorException(
        I18nContext.current()?.t('error.auth.wechat_user_info_failed') ??
          `获取用户信息失败: ${data.errmsg}`
      );
    }

    return data;
  }

  async refreshAccessToken(refreshToken: string): Promise<WechatTokenResponse> {
    const url =
      `https://api.weixin.qq.com/sns/oauth2/refresh_token?` +
      `appid=${this.appId}` +
      `&grant_type=refresh_token` +
      `&refresh_token=${refreshToken}`;

    let data: WechatTokenResponse;
    try {
      const response = await fetch(url, { headers: this.outboundHeaders() });
      data = await response.json();
    } catch (error) {
      this.logger.error('刷新微信 access_token 异常', error.stack);
      throw new InternalServerErrorException(
        I18nContext.current()?.t('error.auth.wechat_auth_service_error') ??
          '微信授权服务异常'
      );
    }

    if (data.errcode) {
      this.logger.error(`刷新微信 access_token 失败: ${data.errmsg}`);
      throw new InternalServerErrorException(
        I18nContext.current()?.t('error.auth.wechat_refresh_failed') ??
          `刷新授权失败: ${data.errmsg}`
      );
    }

    return data;
  }

  generateState(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  validateState(state: string): boolean {
    if (typeof state !== 'string') return false;

    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      if (stateData.csrf) {
        return (
          typeof stateData.csrf === 'string' && stateData.csrf.length === 64
        );
      }
    } catch {
      // state 解析失败视为无效，回退到下方长度格式校验
    }

    return state.length === 64;
  }
}

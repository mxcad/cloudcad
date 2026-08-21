import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response as ExpressResponse, Request as ExpressRequest } from 'express';
import { Inject } from '@nestjs/common';
import { WechatService } from './wechat.service';
import { WechatTransactionService } from './wechat-transaction.service';
import { IAUTH_FACADE } from '@cloudcad/contracts';
import type { IAuthFacade, IWechatCallbackService, WechatAuthUrlResponseDto, WechatPollTransactionResponseDto } from '@cloudcad/contracts';

@Injectable()
export class WechatCallbackService implements IWechatCallbackService {
  private readonly logger = new Logger(WechatCallbackService.name);

  constructor(
    private wechatService: WechatService,
    private wechatTransactionService: WechatTransactionService,
    @Inject(IAUTH_FACADE) private readonly authService: IAuthFacade,
    private configService: ConfigService,
  ) {}

  async getAuthUrl(
    origin: string,
    isPopup: string,
    purpose: string,
    client: string,
    txn: string,
  ): Promise<WechatAuthUrlResponseDto> {
    const fallbackOrigin = this.getFallbackOrigin();
    const stateData = {
      csrf: this.wechatService.generateState(),
      origin: origin || fallbackOrigin,
      isPopup: isPopup === 'true',
      purpose: purpose || 'login',
      client: client || 'web',
    };
    const state = Buffer.from(JSON.stringify(stateData)).toString('base64');

    const isMobile = client === 'mobile';

    const isLogin = purpose !== 'bind' && purpose !== 'deactivate';
    let transactionId = '';
    if (isPopup !== 'true' && isLogin) {
      transactionId =
        txn || (await this.wechatTransactionService.createTransaction());
    }

    const callbackBase = this.wechatService.callbackUrlValue;
    const callbackWithTxn = transactionId
      ? `${callbackBase}${callbackBase.includes('?') ? '&' : '?'}txn=${transactionId}`
      : callbackBase;

    const authUrl = isMobile
      ? this.wechatService.getMobileAuthUrl(state, callbackWithTxn)
      : this.wechatService.getAuthUrl(state, callbackWithTxn);

    return { authUrl, state, transactionId };
  }

  private getFallbackOrigin(): string {
    return (
      this.configService.get<string>('FRONTEND_URL') ||
      'http://localhost:3000'
    );
  }

  async handleCallback(
    req: ExpressRequest & {
      query: { code: string; state: string; txn?: string };
    },
    res: ExpressResponse,
  ): Promise<void> {
    const { code, state, txn } = req.query;

    let origin = this.getFallbackOrigin();
    let isPopup = false;
    let purpose = 'login';
    try {
      const stateData = JSON.parse(
        Buffer.from(state, 'base64').toString(),
      );
      origin = stateData.origin || origin;
      isPopup = stateData.isPopup || false;
      purpose = stateData.purpose || 'login';
      this.logger.log(
        `[wechat callback] parsed state: origin=${origin}, isPopup=${isPopup}, purpose=${purpose}, txn=${txn}`,
      );
    } catch (e) {
      this.logger.log(`[wechat callback] failed to parse state: ${e}`);
    }

    const redirectToFrontend = (
      path: string,
      hashData?: Record<string, unknown>,
    ) => {
      let url = `${origin}${path}`;
      if (hashData) {
        const hash = encodeURIComponent(
          JSON.stringify({ ...hashData, isPopup, purpose }),
        );
        url += `#wechat_result=${hash}`;
      }
      this.logger.log(`[wechat callback] redirecting to: ${url}`);
      res.redirect(url);
    };

    if (purpose === 'bind') {
      this.logger.log(`[wechat callback] bind flow, code: ${!!code}`);
      if (!code) {
        redirectToFrontend('/profile', {
          error: '授权失败',
          purpose: 'bind',
        });
        return;
      }
      redirectToFrontend('/profile', { code, state, purpose: 'bind' });
      return;
    }

    if (purpose === 'deactivate') {
      this.logger.log(
        `[wechat callback] deactivate flow, code: ${!!code}`,
      );
      if (!code) {
        redirectToFrontend('/profile', {
          error: '授权失败',
          purpose: 'deactivate',
        });
        return;
      }
      redirectToFrontend('/profile', {
        code,
        state,
        purpose: 'deactivate',
      });
      return;
    }

    if (!code) {
      if (txn) {
        await this.wechatTransactionService.failTransaction(
          txn,
          '授权失败：缺少 code',
        );
        const separator = origin.includes('?') ? '&' : '?';
        res.redirect(
          `${origin}/login${separator}wechat_txn=${txn}&wechat_error=${encodeURIComponent('授权失败：缺少 code')}`,
        );
        return;
      }
      redirectToFrontend('/login', {
        error: '授权失败：缺少 code',
        action: 'error',
      });
      return;
    }

    try {
      const result = await this.authService.loginWithWechat(code, state);

      const action = result.accessToken
        ? 'login'
        : result.needRegister
          ? 'need_register'
          : result.requireEmailBinding
            ? 'bind_email'
            : result.requirePhoneBinding
              ? 'bind_phone'
              : 'need_register';

      if (result.accessToken) {
        const cookieSecure =
          this.configService.get<boolean | null>('session.cookieSecure');
        const maxAge = 60 * 60 * 1000;
        res.cookie('auth_token', result.accessToken, {
          httpOnly: true,
          // secure 属性：显式配置优先，否则按请求协议自适应（http 不带 Secure）
          secure: cookieSecure ?? req.secure,
          sameSite: 'lax',
          maxAge,
          path: '/',
        });
        if (result.refreshToken) {
          const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
          res.cookie('refresh_token', result.refreshToken, {
            httpOnly: true,
            secure: cookieSecure ?? req.secure,
            sameSite: 'lax',
            maxAge: REFRESH_MAX_AGE,
            path: '/api/v1/auth/refresh',
          });
        }
      }

      if (txn) {
        await this.wechatTransactionService.completeTransaction(txn, {
          action:
            action as
              | 'login'
              | 'need_register'
              | 'bind_email'
              | 'bind_phone',
          accessToken: result.accessToken || '',
          refreshToken: result.refreshToken || '',
          user: result.user as unknown as Record<string, unknown>,
          tempToken: result.tempToken,
          purpose,
          // 注销冷静期自动恢复标记透传（前端据此提示「账户已自动恢复」）
          restored: result.restored,
        });
        const separator = origin.includes('?') ? '&' : '?';
        res.redirect(`${origin}/login${separator}wechat_txn=${txn}`);
        return;
      }

      // 仅传必要字段，避免把整个 user 对象（含 role/permissions）塞进 URL 导致 Location 超长
      const payload: Record<string, unknown> = { action };
      if (result.accessToken) payload.accessToken = result.accessToken;
      if (result.refreshToken) payload.refreshToken = result.refreshToken;
      if (result.tempToken) payload.tempToken = result.tempToken;
      if (result.needRegister) payload.needRegister = true;
      if (result.requireEmailBinding) payload.requireEmailBinding = true;
      if (result.requirePhoneBinding) payload.requirePhoneBinding = true;
      redirectToFrontend('/login', payload);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : '未知错误';
      if (txn) {
        // 透传业务错误码（如 ACCOUNT_DEACTIVATED）及附带参数，供前端据码分流弹客服框
        const errResponse = (
          error as {
            response?: {
              code?: string;
              graceDays?: number;
              cleanupDays?: number;
            };
          }
        )?.response;
        await this.wechatTransactionService.failTransaction(txn, errorMsg, {
          errorCode: errResponse?.code,
          graceDays: errResponse?.graceDays,
          cleanupDays: errResponse?.cleanupDays,
        });
        const separator = origin.includes('?') ? '&' : '?';
        res.redirect(
          `${origin}/login${separator}wechat_txn=${txn}&wechat_error=${encodeURIComponent(errorMsg)}`,
        );
        return;
      }
      redirectToFrontend('/login', { error: errorMsg, action: 'error' });
    }
  }

  async pollTransaction(
    txn: string,
    req: ExpressRequest,
  ): Promise<WechatPollTransactionResponseDto> {
    if (!txn) {
      return { status: 'error', error: '缺少事务 ID' };
    }

    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (req.headers['x-real-ip'] as string) ||
      'unknown';
    const rateLimitKey = `wechat:poll:ratelimit:${clientIp}`;
    const currentCount =
      await this.wechatTransactionService.rateLimitCheck(rateLimitKey);
    if (currentCount > 3) {
      return { status: 'rate_limited' };
    }

    const data = await this.wechatTransactionService.getTransaction(txn);
    if (!data) {
      return { status: 'expired' };
    }

    if (data.status === 'completed') {
      await this.wechatTransactionService.deleteTransaction(txn);
      return {
        status: 'completed',
        action: data.action,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
        error: data.error,
        tempToken: data.tempToken,
        restored: data.restored,
        errorCode: data.errorCode,
        graceDays: data.graceDays,
        cleanupDays: data.cleanupDays,
      };
    }

    return { status: 'pending' };
  }
}

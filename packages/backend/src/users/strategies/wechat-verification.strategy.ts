///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Inject, BadRequestException, Logger } from '@nestjs/common';
import {
  IAccountVerificationStrategy,
  VerificationParams,
  UserVerificationData,
} from '../interfaces/account-verification-strategy.interface';
import {
  WECHAT_VERIFICATION_SERVICE,
  IWechatService,
} from '../../common/interfaces/verification.interface';
import { I18nContext } from 'nestjs-i18n';

@Injectable()
export class WechatVerificationStrategy implements IAccountVerificationStrategy {
  readonly type = 'wechatCode';
  private readonly logger = new Logger(WechatVerificationStrategy.name);

  constructor(
    @Inject(WECHAT_VERIFICATION_SERVICE)
    private readonly wechatService: IWechatService
  ) {}

  canHandle(params: VerificationParams): boolean {
    return !!params.wechatCode;
  }

  validateUser(user: UserVerificationData): boolean {
    return !!user.wechatId;
  }

  /**
   * 真实微信授权验证：用授权 code 换取 openid，
   * 与账户绑定的 wechatId 一致才算验证通过（防止盗用他人授权码/伪造确认）。
   */
  async verify(
    user: UserVerificationData,
    params: VerificationParams
  ): Promise<{ valid: boolean; message?: string }> {
    try {
      const tokenData = await this.wechatService.getAccessToken(
        params.wechatCode!
      );
      if (!tokenData.openid) {
        this.logger.warn(
          `微信注销验证失败：授权响应缺少 openid（errcode=${tokenData.errcode}）`
        );
        return {
          valid: false,
          message:
            I18nContext.current()?.t('error.auth.wechat_verification_failed') ??
            '微信验证失败',
        };
      }
      if (tokenData.openid !== user.wechatId) {
        this.logger.warn(`微信注销验证失败：授权 openid 与账户绑定不一致`);
        return {
          valid: false,
          message:
            I18nContext.current()?.t('error.auth.wechat_not_match_account') ??
            '该微信与当前账户不匹配',
        };
      }
      return { valid: true };
    } catch (error) {
      this.logger.error(`微信注销验证异常：${(error as Error).message}`);
      // 业务校验失败用 400：401 会被前端 fetch wrapper 当作凭证失效触发 token 刷新/登出
      throw new BadRequestException(
        I18nContext.current()?.t('error.auth.wechat_verification_failed') ??
          '微信验证失败'
      );
    }
  }
}

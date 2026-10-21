///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Inject } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import {
  EMAIL_VERIFICATION_SERVICE,
  IEmailVerificationService,
} from '../../common/interfaces/verification.interface';
import {
  IAccountVerificationStrategy,
  VerificationParams,
  UserVerificationData,
} from '../interfaces/account-verification-strategy.interface';

@Injectable()
export class EmailCodeVerificationStrategy implements IAccountVerificationStrategy {
  readonly type = 'emailCode';

  constructor(
    @Inject(EMAIL_VERIFICATION_SERVICE)
    private readonly emailVerificationService: IEmailVerificationService
  ) {}

  canHandle(params: VerificationParams): boolean {
    return !!params.emailCode;
  }

  validateUser(user: UserVerificationData): boolean {
    return !!user.email;
  }

  async verify(user: UserVerificationData, params: VerificationParams): Promise<{ valid: boolean; message?: string }> {
    const result = await this.emailVerificationService.verifyEmail(
      user.email!,
      params.emailCode!
    );
    const fallback =
      I18nContext.current()?.t('error.user.email_code_incorrect_or_expired') ??
      '邮箱验证码不正确或已过期';
    return {
      valid: result.valid,
      message: result.valid ? undefined : result.message || fallback,
    };
  }
}

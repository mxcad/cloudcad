///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Inject } from '@nestjs/common';
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
    return { valid: result.valid, message: result.valid ? undefined : result.message || '邮箱验证码不正确或已过期' };
  }
}

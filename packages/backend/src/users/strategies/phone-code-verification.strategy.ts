///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Inject } from '@nestjs/common';
import {
  SMS_VERIFICATION_SERVICE,
  ISmsVerificationService,
} from '../../common/interfaces/verification.interface';
import {
  IAccountVerificationStrategy,
  VerificationParams,
  UserVerificationData,
} from '../interfaces/account-verification-strategy.interface';

@Injectable()
export class PhoneCodeVerificationStrategy implements IAccountVerificationStrategy {
  readonly type = 'phoneCode';

  constructor(
    @Inject(SMS_VERIFICATION_SERVICE)
    private readonly smsVerificationService: ISmsVerificationService
  ) {}

  canHandle(params: VerificationParams): boolean {
    return !!params.phoneCode;
  }

  validateUser(user: UserVerificationData): boolean {
    return !!(user.phone && user.phoneVerified);
  }

  async verify(user: UserVerificationData, params: VerificationParams): Promise<{ valid: boolean; message?: string }> {
    const result = await this.smsVerificationService.verifyCode(
      user.phone!,
      params.phoneCode!
    );
    return { valid: result.valid, message: result.valid ? undefined : result.message };
  }
}

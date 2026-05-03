///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable } from '@nestjs/common';
import {
  IAccountVerificationStrategy,
  VerificationParams,
  UserVerificationData,
} from '../interfaces/account-verification-strategy.interface';

@Injectable()
export class WechatVerificationStrategy implements IAccountVerificationStrategy {
  readonly type = 'wechatConfirm';

  canHandle(params: VerificationParams): boolean {
    return !!params.wechatConfirm;
  }

  validateUser(user: UserVerificationData): boolean {
    return !!user.wechatId;
  }

  async verify(_user: UserVerificationData, params: VerificationParams): Promise<{ valid: boolean; message?: string }> {
    const confirmed = params.wechatConfirm === 'confirmed';
    return { valid: confirmed, message: confirmed ? undefined : '微信验证失败' };
  }
}

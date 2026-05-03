///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable } from '@nestjs/common';
import { IPasswordHasher, PASSWORD_HASHER } from '../interfaces/password-hasher.interface';
import {
  IAccountVerificationStrategy,
  VerificationParams,
  UserVerificationData,
} from '../interfaces/account-verification-strategy.interface';
import { Inject } from '@nestjs/common';

@Injectable()
export class PasswordVerificationStrategy implements IAccountVerificationStrategy {
  readonly type = 'password';

  constructor(
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: IPasswordHasher
  ) {}

  canHandle(params: VerificationParams): boolean {
    return !!params.password;
  }

  validateUser(user: UserVerificationData): boolean {
    return !!user.password;
  }

  async verify(user: UserVerificationData, params: VerificationParams): Promise<{ valid: boolean; message?: string }> {
    const match = await this.passwordHasher.compare(params.password!, user.password!);
    return { valid: match, message: match ? undefined : '密码不正确' };
  }
}

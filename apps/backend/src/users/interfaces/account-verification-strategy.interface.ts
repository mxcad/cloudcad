///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/** 策略列表注入令牌 */
export const VERIFICATION_STRATEGIES = 'VERIFICATION_STRATEGIES';

/**
 * 账户注销时的验证参数
 */
export interface VerificationParams {
  password?: string;
  phoneCode?: string;
  emailCode?: string;
  wechatConfirm?: string;
}

/** 用户验证所需的最小用户信息子集 */
export interface UserVerificationData {
  password?: string | null;
  phone?: string | null;
  phoneVerified?: boolean;
  email?: string | null;
  wechatId?: string | null;
}

/**
 * 账户注销验证策略接口
 *
 * 每种策略负责一种验证方式（密码、手机验证码、邮箱验证码、微信确认）
 */
export interface IAccountVerificationStrategy {
  /** 策略类型标识 */
  readonly type: string;

  /** 判断该策略是否能处理本次请求（检查 params 中是否有对应字段） */
  canHandle(params: VerificationParams): boolean;

  /** 检查用户是否满足该验证方式的前提条件（如绑定了手机、设置了密码等） */
  validateUser(user: UserVerificationData): boolean;

  /** 执行验证，返回是否通过及可选的错误信息 */
  verify(user: UserVerificationData, params: VerificationParams): Promise<{ valid: boolean; message?: string }>;
}

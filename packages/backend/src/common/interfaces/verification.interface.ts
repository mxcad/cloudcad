///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/** 短信验证服务接口令牌 */
export const SMS_VERIFICATION_SERVICE = 'SMS_VERIFICATION_SERVICE';

/** 邮箱验证服务接口令牌 */
export const EMAIL_VERIFICATION_SERVICE = 'EMAIL_VERIFICATION_SERVICE';

/** 微信服务接口令牌 */
export const WECHAT_VERIFICATION_SERVICE = 'WECHAT_VERIFICATION_SERVICE';

/** 验证结果 */
export interface IVerifyResult {
  valid: boolean;
  message?: string;
}

/** 短信验证服务接口 */
export interface ISmsVerificationService {
  verifyCode(phone: string, code: string): Promise<IVerifyResult>;
}

/** 邮箱验证服务接口 */
export interface IEmailVerificationService {
  verifyEmail(email: string, code: string): Promise<IVerifyResult>;
}

/** 微信授权换取用户信息的结果 */
export interface IWechatTokenData {
  openid?: string;
  errcode?: number;
  errmsg?: string;
}

/** 微信服务接口 */
export interface IWechatService {
  /** 用授权 code 换取 access_token 与 openid（带幂等缓存，code 可安全重放） */
  getAccessToken(code: string): Promise<IWechatTokenData>;
}

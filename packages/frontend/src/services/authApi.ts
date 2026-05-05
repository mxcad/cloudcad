// @deprecated Use @/api-sdk instead. This file will be removed.
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { getApiClient } from './apiClient';
import type {
  LoginDto,
  RegisterDto,
  RefreshTokenDto,
  ResetPasswordDto,
  ForgotPasswordDto,
} from '../types/api-client';

/**
 * 短信验证码登录请求
 */
export interface LoginByPhoneDto {
  phone: string;
  code: string;
}

/**
 * 手机号注册请求
 */
export interface RegisterByPhoneDto {
  phone: string;
  code: string;
  username: string;
  password: string;
  nickname?: string;
}

export const authApi = {
  login: (data: LoginDto) => getApiClient().AuthController_login(null, data),

  register: (data: RegisterDto) =>
    getApiClient().AuthController_register(null, data),

  refreshToken: (refreshToken: string) =>
    getApiClient().AuthController_refreshToken(null, {
      refreshToken,
    } as RefreshTokenDto),

  logout: () => getApiClient().AuthController_logout(),

  getProfile: () => getApiClient().AuthController_getProfile(),

  resendVerification: (email: string) =>
    getApiClient().AuthController_resendVerification(null, { email }),

  forgotPassword: (data: ForgotPasswordDto) =>
    getApiClient().AuthController_forgotPassword(null, data),

  resetPassword: (data: ResetPasswordDto) =>
    getApiClient().AuthController_resetPassword(null, data),

  // 绑定邮箱
  sendBindEmailCode: (email: string, isRebind: boolean = false) =>
    getApiClient().AuthController_sendBindEmailCode(null, { email, isRebind }),

  verifyBindEmail: (email: string, code: string) =>
    getApiClient().AuthController_verifyBindEmail(null, { email, code }),

  /**
   * 发送换绑验证码（验证原邮箱）
   */
  sendUnbindEmailCode: () =>
    getApiClient().AuthController_sendUnbindEmailCode(),

  /**
   * 验证换绑验证码
   */
  verifyUnbindEmailCode: (code: string) =>
    getApiClient().AuthController_verifyUnbindEmailCode(null, { code }),

  /**
   * 换绑新邮箱
   */
  rebindEmail: (email: string, code: string, token: string) =>
    getApiClient().AuthController_rebindEmail(null, { email, code, token }),

  // ==================== 短信验证码相关 ====================

  /**
   * 发送短信验证码
   */
  sendSmsCode: (phone: string) =>
    getApiClient().AuthController_sendSmsCode(null, { phone }),

  /**
   * 验证短信验证码
   */
  verifySmsCode: (phone: string, code: string) =>
    getApiClient().AuthController_verifySmsCode(null, { phone, code }),

  /**
   * 手机号验证码登录
   */
  loginByPhone: (data: LoginByPhoneDto) =>
    getApiClient().AuthController_loginByPhone(null, data),

  /**
   * 手机号注册
   */
  registerByPhone: (data: RegisterByPhoneDto) =>
    getApiClient().AuthController_registerByPhone(null, data),

  /**
   * 验证手机号（用于已注册但手机号未验证的用户）
   */
  verifyPhone: (phone: string, code: string) =>
    getApiClient().AuthController_verifyPhone(null, { phone, code }),

  /**
   * 绑定邮箱并登录（用于已注册但没有邮箱的用户）
   */
  bindEmailAndLogin: (tempToken: string, email: string, code: string) =>
    getApiClient().AuthController_bindEmailAndLogin(null, { tempToken, email, code }),

  /**
   * 绑定手机号并登录（用于已注册但没有手机号的用户）
   */
  bindPhoneAndLogin: (tempToken: string, phone: string, code: string) =>
    getApiClient().AuthController_bindPhoneAndLogin(null, { tempToken, phone, code }),

  /**
   * 绑定手机号
   */
  bindPhone: (phone: string, code: string) =>
    getApiClient().AuthController_bindPhone(null, { phone, code }),

  /**
   * 发送换绑验证码（验证原手机号）
   */
  sendUnbindPhoneCode: () =>
    getApiClient().AuthController_sendUnbindPhoneCode(),

  /**
   * 验证换绑验证码
   */
  verifyUnbindPhoneCode: (code: string) =>
    getApiClient().AuthController_verifyUnbindPhoneCode(null, { code }),

  /**
   * 换绑新手机号
   */
  rebindPhone: (phone: string, code: string, token: string) =>
    getApiClient().AuthController_rebindPhone(null, { phone, code, token }),

  /**
   * 检查字段唯一性（用户名、邮箱、手机号）
   */
  checkField: (data: { username?: string; email?: string; phone?: string }) =>
    getApiClient().AuthController_checkFieldUniqueness(null, data),

  /**
   * 验证邮箱并完成手机号注册
   */
  verifyEmailAndRegisterPhone: (email: string, code: string, registerData: {
    phone: string;
    code: string;
    username: string;
    password: string;
    nickname?: string;
  }) =>
    getApiClient().AuthController_verifyEmailAndRegisterPhone(null, {
      email,
      code,
      phone: registerData.phone,
      phoneCode: registerData.code,
      username: registerData.username,
      password: registerData.password,
      nickname: registerData.nickname,
    }),

  // ==================== 微信登录相关 ====================

  /**
   * 获取微信授权 URL
   */
  getWechatAuthUrl: (params: {
    origin: string;
    isPopup: string;
    purpose: string;
  }) => getApiClient().AuthController_getWechatAuthUrl(params),

  /**
   * 微信登录回调
   */
  wechatCallback: (code: string, state: string) =>
    getApiClient().AuthController_wechatCallback({ code, state }),

  /**
   * 绑定微信
   */
  bindWechat: (code: string, state: string) =>
    getApiClient().AuthController_bindWechat(null, { code, state }),

  /**
   * 解绑微信
   */
  unbindWechat: () => getApiClient().AuthController_unbindWechat(),
};

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

import type {
  LoginDto,
  RegisterDto,
  RefreshTokenDto,
  ResetPasswordDto,
  ForgotPasswordDto,
} from '../types/api-client';
import {
  authControllerLogin,
  authControllerRegister,
  authControllerRefreshToken,
  authControllerLogout,
  authControllerGetProfile,
  authControllerResendVerification,
  authControllerForgotPassword,
  authControllerResetPassword,
  authControllerSendBindEmailCode,
  authControllerVerifyBindEmail,
  authControllerSendUnbindEmailCode,
  authControllerVerifyUnbindEmailCode,
  authControllerRebindEmail,
  authControllerSendSmsCode,
  authControllerVerifySmsCode,
  authControllerLoginByPhone,
  authControllerRegisterByPhone,
  authControllerVerifyPhone,
  authControllerBindEmailAndLogin,
  authControllerBindPhoneAndLogin,
  authControllerBindPhone,
  authControllerSendUnbindPhoneCode,
  authControllerVerifyUnbindPhoneCode,
  authControllerRebindPhone,
  authControllerCheckFieldUniqueness,
  authControllerVerifyEmailAndRegisterPhone,
  authControllerGetWechatAuthUrl,
  authControllerWechatCallback,
  authControllerBindWechat,
  authControllerUnbindWechat,
} from '@/api-sdk';

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
  login: (data: LoginDto) =>
    authControllerLogin({ body: data }).then((r) => r.data),

  register: (data: RegisterDto) =>
    authControllerRegister({ body: data }).then((r) => r.data),

  refreshToken: (refreshToken: string) =>
    authControllerRefreshToken({
      body: { refreshToken } as RefreshTokenDto,
    }).then((r) => r.data),

  logout: () => authControllerLogout().then((r) => r.data),

  getProfile: () => authControllerGetProfile().then((r) => r.data),

  resendVerification: (email: string) =>
    authControllerResendVerification({ body: { email } as any }).then((r) => r.data),

  forgotPassword: (data: ForgotPasswordDto) =>
    authControllerForgotPassword({ body: data }).then((r) => r.data),

  resetPassword: (data: ResetPasswordDto) =>
    authControllerResetPassword({ body: data }).then((r) => r.data),

  sendBindEmailCode: (email: string, isRebind: boolean = false) =>
    authControllerSendBindEmailCode({ body: { email, isRebind } as any }).then(
      (r) => r.data
    ),

  verifyBindEmail: (email: string, code: string) =>
    authControllerVerifyBindEmail({ body: { email, code } }).then(
      (r) => r.data
    ),

  sendUnbindEmailCode: () =>
    authControllerSendUnbindEmailCode().then((r) => r.data),

  verifyUnbindEmailCode: (code: string) =>
    authControllerVerifyUnbindEmailCode({ body: { code } as any }).then(
      (r) => r.data
    ),

  rebindEmail: (email: string, code: string, token: string) =>
    authControllerRebindEmail({ body: { email, code, token } as any }).then(
      (r) => r.data
    ),

  sendSmsCode: (phone: string) =>
    authControllerSendSmsCode({ body: { phone } as any }).then((r) => r.data),

  verifySmsCode: (phone: string, code: string) =>
    authControllerVerifySmsCode({ body: { phone, code } as any }).then(
      (r) => r.data
    ),

  loginByPhone: (data: LoginByPhoneDto) =>
    authControllerLoginByPhone({ body: data as any }).then((r) => r.data),

  registerByPhone: (data: RegisterByPhoneDto) =>
    authControllerRegisterByPhone({ body: data as any }).then((r) => r.data),

  verifyPhone: (phone: string, code: string) =>
    authControllerVerifyPhone({ body: { phone, code } as any }).then(
      (r) => r.data
    ),

  bindEmailAndLogin: (
    tempToken: string,
    email: string,
    code: string
  ) =>
    authControllerBindEmailAndLogin({
      body: { tempToken, email, code } as any,
    }).then((r) => r.data),

  bindPhoneAndLogin: (
    tempToken: string,
    phone: string,
    code: string
  ) =>
    authControllerBindPhoneAndLogin({
      body: { tempToken, phone, code } as any,
    }).then((r) => r.data),

  bindPhone: (phone: string, code: string) =>
    authControllerBindPhone({ body: { phone, code } as any }).then((r) => r.data),

  sendUnbindPhoneCode: () =>
    authControllerSendUnbindPhoneCode().then((r) => r.data),

  verifyUnbindPhoneCode: (code: string) =>
    authControllerVerifyUnbindPhoneCode({ body: { code } as any }).then(
      (r) => r.data
    ),

  rebindPhone: (phone: string, code: string, token: string) =>
    authControllerRebindPhone({ body: { phone, code, token } as any }).then(
      (r) => r.data
    ),

  checkField: (data: { username?: string; email?: string; phone?: string }) =>
    authControllerCheckFieldUniqueness({ body: data as any }).then((r) => r.data),

  verifyEmailAndRegisterPhone: (
    email: string,
    code: string,
    registerData: {
      phone: string;
      code: string;
      username: string;
      password: string;
      nickname?: string;
    }
  ) =>
    authControllerVerifyEmailAndRegisterPhone({
      body: {
        email,
        code,
        phone: registerData.phone,
        phoneCode: registerData.code,
        username: registerData.username,
        password: registerData.password,
        nickname: registerData.nickname,
      } as any,
    }).then((r) => r.data),

  getWechatAuthUrl: (params: {
    origin: string;
    isPopup: string;
    purpose: string;
  }) => authControllerGetWechatAuthUrl({ query: params }).then((r) => r.data),

  // wechatCallback now has no query/body params — code & state must be sent via query string on the redirect URL itself
  wechatCallback: () =>
    authControllerWechatCallback().then(
      (r) => r.data
    ),

  // bindWechat SDK type has body?: never; body cast retained as API still accepts it at runtime
  bindWechat: (code: string, state: string) =>
    authControllerBindWechat({ body: { code, state } } as any).then((r) => r.data),

  unbindWechat: () => authControllerUnbindWechat().then((r) => r.data),
};

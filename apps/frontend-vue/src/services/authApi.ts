///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { getApiClient } from './apiClient';

const API = '/api/auth';

/** 发送请求的统一入口 */
function post<T>(path: string, data?: unknown) {
  return getApiClient().post<T>(`${API}${path}`, data);
}

function get<T>(path: string, params?: Record<string, unknown>) {
  return getApiClient().get<T>(`${API}${path}`, { params });
}

/** AuthResponse 统一解包类型 */
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email?: string | null;
    username: string;
    nickname?: string;
    avatar?: string;
    phone?: string;
    phoneVerified?: boolean;
    hasPassword?: boolean;
    wechatId?: string;
    role?: { id: string; name: string; permissions?: { permission: string }[] };
  };
}

/** 来源：apps/frontend/src/services/authApi.ts — 照搬全部接口 */
export const authApi = {
  // ==================== 基础认证 ====================

  /** 用户名/邮箱 + 密码登录 */
  login: (account: string, password: string) =>
    post<AuthResponse>('/login', { account, password }),

  /** 手机验证码登录 */
  loginByPhone: (phone: string, code: string) =>
    post<AuthResponse>('/login/phone', { phone, code }),

  /** 注册 */
  register: (data: { email?: string; password: string; username: string; nickname?: string; wechatTempToken?: string }) =>
    post<{ message?: string; email?: string } | AuthResponse>('/register', data),

  /** 验证邮箱并登录 */
  verifyEmailAndLogin: (email: string, code: string) =>
    post<AuthResponse>('/verify-email', { email, code }),

  /** 验证手机并登录 */
  verifyPhoneAndLogin: (phone: string, code: string) =>
    post<AuthResponse>('/verify-phone', { phone, code }),

  /** 登出 */
  logout: () => post<void>('/logout'),

  /** 获取当前用户 profile */
  getProfile: () => get<AuthResponse['user']>('/profile'),

  /** 刷新 token */
  refreshToken: (refreshToken: string) =>
    post<{ accessToken: string; refreshToken: string }>('/refresh', { refreshToken }),

  // ==================== 邮箱验证 ====================

  /** 重新发送验证邮件 — 来源：authApi.resendVerification 行56-57 */
  resendVerification: (email: string) =>
    post<void>('/resend-verification', { email }),

  // ==================== 密码重置 ====================

  /** 忘记密码 — 来源：authApi.forgotPassword 行59-60 */
  forgotPassword: (data: { email?: string; phone?: string; validateContact: string }) =>
    post<{ mailEnabled?: boolean; smsEnabled?: boolean; supportEmail?: string; supportPhone?: string }>('/forgot-password', data),

  /** 重置密码 — 来源：authApi.resetPassword 行62-63 */
  resetPassword: (data: { email?: string; phone?: string; code: string; newPassword: string; confirmPassword: string; validateContact: string }) =>
    post<void>('/reset-password', data),

  // ==================== 邮箱绑定 ====================

  /** 发送绑定邮箱验证码 — 来源：authApi.sendBindEmailCode 行66-67 */
  sendBindEmailCode: (email: string, isRebind: boolean = false) =>
    post<void>('/send-bind-email-code', { email, isRebind }),

  /** 验证绑定邮箱 — 来源：authApi.verifyBindEmail 行69-70 */
  verifyBindEmail: (email: string, code: string) =>
    post<{ success: boolean; message?: string }>('/verify-bind-email', { email, code }),

  /** 发送换绑验证码（验证原邮箱） — 来源：authApi.sendUnbindEmailCode 行75-76 */
  sendUnbindEmailCode: () =>
    post<{ success: boolean; message?: string }>('/send-unbind-email-code'),

  /** 验证换绑验证码 — 来源：authApi.verifyUnbindEmailCode 行82-83 */
  verifyUnbindEmailCode: (code: string) =>
    post<{ success: boolean; token: string; message?: string }>('/verify-unbind-email-code', { code }),

  /** 换绑新邮箱 — 来源：authApi.rebindEmail 行88 */
  rebindEmail: (email: string, code: string, token: string) =>
    post<{ success: boolean; message?: string }>('/rebind-email', { email, code, token }),

  // ==================== 短信验证码 ====================

  /** 发送短信验证码 — 来源：authApi.sendSmsCode 行95-96 */
  sendSmsCode: (phone: string) =>
    post<{ success: boolean; message?: string }>('/send-sms-code', { phone }),

  /** 验证短信验证码 — 来源：authApi.verifySmsCode 行101-102 */
  verifySmsCode: (phone: string, code: string) =>
    post<void>('/verify-sms-code', { phone, code }),

  // ==================== 手机号注册 ====================

  /** 手机号注册 — 来源：authApi.registerByPhone 行113-114 */
  registerByPhone: (data: { phone: string; code: string; username: string; password: string; nickname?: string }) =>
    post<AuthResponse>('/register/phone', data),

  // ==================== 绑定手机号 ====================

  /** 绑定邮箱并登录 — 来源：authApi.bindEmailAndLogin 行126 */
  bindEmailAndLogin: (tempToken: string, email: string, code: string) =>
    post<AuthResponse>('/bind-email-and-login', { tempToken, email, code }),

  /** 绑定手机号并登录 — 来源：authApi.bindPhoneAndLogin 行132 */
  bindPhoneAndLogin: (tempToken: string, phone: string, code: string) =>
    post<AuthResponse>('/bind-phone-and-login', { tempToken, phone, code }),

  /** 绑定手机号 — 来源：authApi.bindPhone 行138 */
  bindPhone: (phone: string, code: string) =>
    post<{ success: boolean; message?: string }>('/bind-phone', { phone, code }),

  /** 发送换绑验证码（验证原手机号） — 来源：authApi.sendUnbindPhoneCode 行143-144 */
  sendUnbindPhoneCode: () =>
    post<{ success: boolean; message?: string }>('/send-unbind-phone-code'),

  /** 验证换绑验证码 — 来源：authApi.verifyUnbindPhoneCode 行150-151 */
  verifyUnbindPhoneCode: (code: string) =>
    post<{ success: boolean; token: string; message?: string }>('/verify-unbind-phone-code', { code }),

  /** 换绑新手机号 — 来源：authApi.rebindPhone 行156 */
  rebindPhone: (phone: string, code: string, token: string) =>
    post<{ success: boolean; message?: string }>('/rebind-phone', { phone, code, token }),

  // ==================== 字段唯一性检查 ====================

  /** 检查字段唯一性 — 来源：authApi.checkField 行161-162 */
  checkField: (data: { username?: string; email?: string; phone?: string }) =>
    post<{ usernameExists: boolean; emailExists: boolean; phoneExists: boolean }>('/check-field', data),

  // ==================== 邮箱验证+手机注册 ====================

  /** 验证邮箱并完成手机号注册 — 来源：authApi.verifyEmailAndRegisterPhone 行167 */
  verifyEmailAndRegisterPhone: (email: string, code: string, registerData: {
    phone: string; code: string; username: string; password: string; nickname?: string;
  }) =>
    post<AuthResponse>('/verify-email-and-register-phone', {
      email,
      code,
      phone: registerData.phone,
      phoneCode: registerData.code,
      username: registerData.username,
      password: registerData.password,
      nickname: registerData.nickname,
    }),

  // ==================== 微信登录 ====================

  /** 获取微信授权 URL */
  getWechatAuthUrl: (params: { origin: string; isPopup: string; purpose: string }) =>
    get<{ authUrl: string }>('/wechat/auth-url', params),

  /** 绑定微信 — 来源：authApi.bindWechat 行204 */
  bindWechat: (code: string, state: string) =>
    post<{ success: boolean; message?: string }>('/bind-wechat', { code, state }),

  /** 解绑微信 — 来源：authApi.unbindWechat 行210 */
  unbindWechat: () =>
    post<{ success: boolean; message?: string }>('/unbind-wechat'),
};

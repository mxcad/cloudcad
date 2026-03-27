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
} from '../types/api-client';

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

  forgotPassword: (email: string) =>
    getApiClient().AuthController_forgotPassword(null, { email }),

  resetPassword: (data: ResetPasswordDto) =>
    getApiClient().AuthController_resetPassword(null, data),

  // 绑定邮箱
  sendBindEmailCode: (email: string) =>
    getApiClient().AuthController_sendBindEmailCode(null, { email }),

  verifyBindEmail: (email: string, code: string) =>
    getApiClient().AuthController_verifyBindEmail(null, { email, code }),
};

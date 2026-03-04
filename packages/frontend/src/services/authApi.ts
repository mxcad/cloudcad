import { getApiClient } from './apiClient';
import type { LoginDto, RegisterDto, RefreshTokenDto, ResetPasswordDto } from '../types/api-client';

export const authApi = {
  login: (data: LoginDto) =>
    getApiClient().AuthController_login(null, data),

  register: (data: RegisterDto) =>
    getApiClient().AuthController_register(null, data),

  refreshToken: (refreshToken: string) =>
    getApiClient().AuthController_refreshToken(null, { refreshToken } as RefreshTokenDto),

  logout: () =>
    getApiClient().AuthController_logout(),

  getProfile: () =>
    getApiClient().AuthController_getProfile(),

  resendVerification: (email: string) =>
    getApiClient().AuthController_resendVerification(null, { email }),

  forgotPassword: (email: string) =>
    getApiClient().AuthController_forgotPassword(null, { email }),

  resetPassword: (data: ResetPasswordDto) =>
    getApiClient().AuthController_resetPassword(null, data),
};
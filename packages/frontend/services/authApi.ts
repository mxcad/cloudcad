import { getApiClient } from './apiClient';
import type { LoginDto, RegisterDto, RefreshTokenDto } from '../types/api-client';

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
};
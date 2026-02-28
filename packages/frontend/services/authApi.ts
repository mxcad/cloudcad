import { apiClient } from './apiClient';

export const authApi = {
  login: (data: { account: string; password: string }) =>
    apiClient.post('/auth/login', data),

  register: (data: {
    email: string;
    password: string;
    username: string;
    nickname?: string;
  }) => apiClient.post('/auth/register', data),

  refreshToken: (refreshToken: string) =>
    apiClient.post('/auth/refresh', { refreshToken }),

  logout: () => apiClient.post('/auth/logout'),

  getProfile: () => apiClient.get('/auth/profile'),

  sendVerification: (email: string) =>
    apiClient.post('/auth/send-verification', { email }),

  verifyEmail: (data: { email: string; code: string }) =>
    apiClient.post('/auth/verify-email', data),

  resendVerification: (email: string) =>
    apiClient.post('/auth/resend-verification', { email }),

  forgotPassword: (email: string) =>
    apiClient.post('/auth/forgot-password', { email }),

  resetPassword: (data: { email: string; code: string; newPassword: string }) =>
    apiClient.post('/auth/reset-password', data),
};

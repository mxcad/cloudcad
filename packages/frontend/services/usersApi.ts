import { apiClient } from './apiClient';

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  nickname?: string;
  avatar?: string;
  role?: {
    id: string;
    name: string;
    permissions: string[];
  };
}

export const usersApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    roleId?: string;
  }) => apiClient.get('/users', { params }),

  search: (params?: { page?: number; limit?: number; search?: string }) =>
    apiClient.get('/users/search', { params }),

  searchByEmail: (email: string) =>
    apiClient.get('/users/search/by-email', { params: { email } }),

  create: (data: {
    email: string;
    password: string;
    username: string;
    nickname?: string;
    roleId?: string;
  }) => apiClient.post('/users', data),

  update: (
    id: string,
    data: {
      email?: string;
      username?: string;
      nickname?: string;
      roleId?: string;
      status?: string;
      password?: string;
    }
  ) => apiClient.patch(`/users/${id}`, data),

  delete: (id: string) => apiClient.delete(`/users/${id}`),

  getProfile: () => apiClient.get('/users/profile/me'),

  updateProfile: (data: { nickname?: string; avatar?: string }) =>
    apiClient.patch('/users/profile/me', data),

  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    apiClient.post('/users/change-password', data),
};

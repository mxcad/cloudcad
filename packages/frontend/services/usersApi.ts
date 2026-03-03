import { getApiClient } from './apiClient';
import type {
  CreateUserDto,
  UpdateUserDto,
  ChangePasswordDto,
  OperationMethods,
} from '../types/api-client';

export const usersApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    roleId?: string;
  }) =>
    getApiClient().UsersController_findAll(params || undefined),

  search: (params?: { page?: number; limit?: number; search?: string }) =>
    getApiClient().UsersController_searchUsers(params || undefined),

  searchByEmail: (email: string) =>
    getApiClient().UsersController_searchByEmail({ email }),

  create: (data: CreateUserDto) =>
    getApiClient().UsersController_create(null, data),

  update: (id: string, data: UpdateUserDto) =>
    getApiClient().UsersController_update({ id }, data),

  delete: (id: string) =>
    getApiClient().UsersController_remove({ id }),

  getProfile: () =>
    getApiClient().UsersController_getProfile(),

  updateProfile: (data: UpdateUserDto) =>
    getApiClient().UsersController_updateProfile(null, data),

  changePassword: (data: ChangePasswordDto) =>
    getApiClient().UsersController_changePassword(null, data),
};

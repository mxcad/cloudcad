import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

// API 基础配置
const API_BASE_URL =
  (globalThis as any).__VITE_API_BASE_URL__ || 'http://localhost:3001/api';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // 请求拦截器 - 添加认证 token
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('accessToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // 响应拦截器 - 处理 token 刷新
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // 如果是 401 错误且不是刷新 token 的请求
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const refreshToken = localStorage.getItem('refreshToken');
            if (refreshToken) {
              const response = await axios.post(
                `${API_BASE_URL}/auth/refresh`,
                {
                  refreshToken,
                }
              );

              const { accessToken } = response.data;
              localStorage.setItem('accessToken', accessToken);

              // 重新发送原始请求
              originalRequest.headers.Authorization = `Bearer ${accessToken}`;
              return this.client(originalRequest);
            }
          } catch (refreshError) {
            // 刷新失败，清除 token 并跳转到登录页
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');
            window.location.href = '/login';
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  // GET 请求
  async get<T = any>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.client.get(url, config);
  }

  // POST 请求
  async post<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.client.post(url, data, config);
  }

  // PUT 请求
  async put<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.client.put(url, data, config);
  }

  // PATCH 请求
  async patch<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.client.patch(url, data, config);
  }

  // DELETE 请求
  async delete<T = any>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.client.delete(url, config);
  }

  // 文件上传
  async upload<T = any>(
    url: string,
    file: File,
    additionalData?: Record<string, any>
  ): Promise<AxiosResponse<T>> {
    const formData = new FormData();
    formData.append('file', file);

    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    return this.client.post(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  }
}

// 创建 API 服务实例
export const apiService = new ApiService();

// 认证相关的 API 方法
export const authApi = {
  login: (data: { account: string; password: string }) =>
    apiService.post('/auth/login', data),

  register: (data: {
    email: string;
    password: string;
    username: string;
    nickname?: string;
  }) => apiService.post('/auth/register', data),

  refreshToken: (refreshToken: string) =>
    apiService.post('/auth/refresh', { refreshToken }),

  logout: () => apiService.post('/auth/logout'),

  getProfile: () => apiService.get('/auth/profile'),
};

// 用户相关的 API 方法
export const usersApi = {
  list: (params?: { page?: number; limit?: number; search?: string }) =>
    apiService.get('/users', { params }),

  create: (data: {
    email: string;
    password: string;
    username: string;
    nickname?: string;
    role?: string;
  }) => apiService.post('/users', data),

  update: (
    id: string,
    data: {
      email?: string;
      username?: string;
      nickname?: string;
      role?: string;
      status?: string;
    }
  ) => apiService.patch(`/users/${id}`, data),

  delete: (id: string) => apiService.delete(`/users/${id}`),
};

// 项目相关的 API 方法
export const projectsApi = {
  list: () => apiService.get('/projects'),

  create: (data: { name: string; description?: string }) =>
    apiService.post('/projects', data),

  update: (
    id: string,
    data: { name?: string; description?: string; status?: string }
  ) => apiService.patch(`/projects/${id}`, data),

  delete: (id: string) => apiService.delete(`/projects/${id}`),
};

// 文件相关的 API 方法
export const filesApi = {
  list: () => apiService.get('/files'),

  upload: (file: File, projectId: string) =>
    apiService.upload('/files/upload', file, { projectId }),

  get: (id: string) => apiService.get(`/files/${id}`),

  download: (id: string) =>
    apiService.get(`/files/${id}/download`, { responseType: 'blob' }),

  update: (id: string, data: any) => apiService.patch(`/files/${id}`, data),

  delete: (id: string) => apiService.delete(`/files/${id}`),

  share: (id: string, data: { userId: string; role: string }) =>
    apiService.post(`/files/${id}/share`, data),

  getAccess: (id: string) => apiService.get(`/files/${id}/access`),

  updateAccess: (id: string, userId: string, role: string) =>
    apiService.patch(`/files/${id}/access/${userId}`, { role }),

  removeAccess: (id: string, userId: string) =>
    apiService.delete(`/files/${id}/access/${userId}`),
};

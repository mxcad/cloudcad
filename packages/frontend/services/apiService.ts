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

    // 响应拦截器 - 自动解包后端响应格式和处理 token 刷新
    this.client.interceptors.response.use(
      (response) => {
        console.log('[ApiService] API响应:', {
          url: response.config.url,
          status: response.status,
          data: response.data,
        });

        // 检查是否为 MxCAD 接口，如果是则跳过自动解包
        const isMxCadEndpoint = response.config.url?.includes('/mxcad/');
        
        if (!isMxCadEndpoint &&
          response.data &&
          typeof response.data === 'object' &&
          'data' in response.data
        ) {
          const originalData = response.data;
          response.data = originalData.data;
          console.log('[ApiService] 自动解包:', {
            originalData,
            extractedData: response.data,
          });
        } else if (isMxCadEndpoint) {
          console.log('[ApiService] MxCAD接口跳过自动解包，保持原始格式');
        }

        return response;
      },
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

              // 注意：这里不会经过拦截器自动解包，需要手动处理
              const responseData = response.data.data || response.data;
              const { accessToken } = responseData;
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

  // 文件上传（已改为JSON格式）
  async upload<T = any>(url: string, data: any): Promise<AxiosResponse<T>> {
    return this.client.post(url, data);
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

  // 邮箱验证相关
  sendVerification: (email: string) =>
    apiService.post('/auth/send-verification', { email }),

  verifyEmail: (data: { email: string; code: string }) =>
    apiService.post('/auth/verify-email', data),

  resendVerification: (email: string) =>
    apiService.post('/auth/resend-verification', { email }),
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

// 项目相关的 API 方法（基于 FileSystemNode 统一模型）
export const projectsApi = {
  // 项目管理
  list: () => apiService.get('/file-system/projects'),

  create: (data: { name: string; description?: string }) =>
    apiService.post('/file-system/projects', data),

  get: (projectId: string) =>
    apiService.get(`/file-system/projects/${projectId}`),

  update: (
    projectId: string,
    data: { name?: string; description?: string; status?: string }
  ) => apiService.patch(`/file-system/projects/${projectId}`, data),

  delete: (projectId: string) =>
    apiService.delete(`/file-system/projects/${projectId}`),

  // 文件夹管理
  createFolder: (parentId: string, data: { name: string }) =>
    apiService.post(`/file-system/nodes/${parentId}/folders`, data),

  // 节点管理
  getNode: (nodeId: string) => apiService.get(`/file-system/nodes/${nodeId}`),

  getChildren: (nodeId: string) =>
    apiService.get(`/file-system/nodes/${nodeId}/children`),

  updateNode: (nodeId: string, data: { name?: string; description?: string }) =>
    apiService.patch(`/file-system/nodes/${nodeId}`, data),

  deleteNode: (nodeId: string) =>
    apiService.delete(`/file-system/nodes/${nodeId}`),

  moveNode: (nodeId: string, targetParentId: string) =>
    apiService.post(`/file-system/nodes/${nodeId}/move`, { targetParentId }),

  // 存储空间信息
  getStorageInfo: () => apiService.get('/file-system/storage'),

  // 项目成员管理（保留旧的 API 路径，如果后端有实现的话）
  getMembers: (projectId: string) =>
    apiService.get(`/projects/${projectId}/members`),

  addMember: (projectId: string, data: { userId: string; role: string }) =>
    apiService.post(`/projects/${projectId}/members`, data),

  removeMember: (projectId: string, userId: string) =>
    apiService.delete(`/projects/${projectId}/members/${userId}`),

  updateMember: (projectId: string, userId: string, data: { role: string }) =>
    apiService.patch(`/projects/${projectId}/members/${userId}`, data),
};

// 文件相关的 API 方法
export const filesApi = {
  list: () => apiService.get('/files'),

  upload: async (file: File, projectId: string) => {
    // 将文件转换为 base64 编码
    const fileContent = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1]; // 移除 data:*/*;base64, 前缀
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    return apiService.post('/file-system/files/upload', {
      fileName: file.name,
      fileContent,
      projectId,
    });
  },

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

// 管理员相关的 API 方法
export const adminApi = {
  getStats: () => apiService.get('/admin/stats'),

  getCacheStats: () => apiService.get('/admin/permissions/cache'),

  cleanupCache: () => apiService.post('/admin/permissions/cache/cleanup'),

  clearUserCache: (userId: string) =>
    apiService.delete(`/admin/permissions/cache/user/${userId}`),

  clearProjectCache: (projectId: string) =>
    apiService.delete(`/admin/permissions/cache/project/${projectId}`),

  clearFileCache: (fileId: string) =>
    apiService.delete(`/admin/permissions/cache/file/${fileId}`),

  getUserPermissions: (userId: string) =>
    apiService.get(`/admin/permissions/user/${userId}`),
};

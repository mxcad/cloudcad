import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { Logger } from '../utils/mxcadUtils';

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

    // 请求拦截器 - 添加认证 token 和 MxCAD 项目上下文
    this.client.interceptors.request.use(
      (config) => {
        // Authorization 由 mxcadManager.ts 在 XHR/fetch 底层统一处理

        // 为所有 MxCAD 接口添加节点上下文
        if (config.url?.includes('/mxcad/')) {
          // 从多个来源获取节点上下文
          const nodeId = this.getNodeIdFromMultipleSources(config);
          
          if (nodeId) {
            // 验证 nodeId 格式
            if (!this.isValidNodeId(nodeId)) {
              Logger.warn('[apiService] 无效的 nodeId 格式:', nodeId);
              return config; // 不添加无效参数
            }
            
            // 根据请求类型补充 nodeId 参数
            this.supplementNodeIdToRequest(config, nodeId);
          } else {
            // 对于关键的上传接口，如果缺少 nodeId 则记录警告
            if (config.url?.includes('/mxcad/files/uploadFiles') || 
                config.url?.includes('/mxcad/files/fileisExist')) {
              Logger.warn('[apiService] MxCAD 接口缺少 nodeId 参数，可能影响文件系统集成');
            }
          }
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
        // 静默：API响应

        // 检查是否为 MxCAD 接口，如果是则跳过自动解包
        const isMxCadEndpoint = response.config.url?.includes('/mxcad/');
        
        if (!isMxCadEndpoint &&
          response.data &&
          typeof response.data === 'object' &&
          'data' in response.data
        ) {
          const originalData = response.data;
          response.data = originalData.data;
// 静默：自动解包
        } else if (isMxCadEndpoint) {
          // 静默：MxCAD接口跳过自动解包，保持原始格式
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

  renameNode: (nodeId: string, data: { name: string }) =>
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

// 回收站相关的 API 方法
export const trashApi = {
  // 获取回收站列表
  getList: () => apiService.get('/file-system/trash'),

  // 恢复项目
  restoreProject: (projectId: string) =>
    apiService.post(`/file-system/projects/${projectId}/restore`),

  // 恢复节点
  restoreNode: (nodeId: string) =>
    apiService.post(`/file-system/nodes/${nodeId}/restore`),

  // 彻底删除项目
  permanentlyDeleteProject: (projectId: string) =>
    apiService.delete(`/file-system/projects/${projectId}/permanent`),

  // 彻底删除节点
  permanentlyDeleteNode: (nodeId: string) =>
    apiService.delete(`/file-system/nodes/${nodeId}/permanent`),

  // 清空回收站
  clear: () => apiService.delete('/file-system/trash'),
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

// 在类定义后添加辅助方法
ApiService.prototype.getNodeIdFromMultipleSources = function(config: any): string | null {
  // 1. 从请求数据中获取
  if (config.data?.nodeId) return config.data.nodeId;
  
  // 2. 从 URL 查询参数获取
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    const urlNodeId = urlParams.get('nodeId') || urlParams.get('parent');
    if (urlNodeId) return urlNodeId;
  }
  
  // 3. 从全局状态获取（如果有）
  if (typeof window !== 'undefined' && (window as any).__CURRENT_NODE_ID__) {
    return (window as any).__CURRENT_NODE_ID__;
  }
  
  // 4. 从 localStorage 获取（如果有）
  if (typeof window !== 'undefined') {
    const storedNodeId = localStorage.getItem('currentNodeId');
    if (storedNodeId) return storedNodeId;
  }
  
  return null;
};

ApiService.prototype.isValidNodeId = function(nodeId: string): boolean {
  // CUID2 格式验证：以 'c' 开头，包含字母和数字，长度约 24-32 字符
  if (!nodeId || typeof nodeId !== 'string') return false;
  
  // 基本格式检查
  const cuid2Pattern = /^c[a-z0-9]{23,31}$/;
  return cuid2Pattern.test(nodeId);
};

ApiService.prototype.supplementNodeIdToRequest = function(config: any, nodeId: string): void {
  if (!config || !nodeId) return;
  
  // 如果是 POST/PUT 请求且有 data
  const method = config.method?.toLowerCase();
  if ((method === 'post' || method === 'put') && config.data) {
    // 检查是否是 FormData（文件上传）
    const isFormData = config.data instanceof FormData;
    
    if (isFormData) {
      // 对于 FormData，检查是否已有 nodeId，如果没有才添加
      if (!config.data.has('nodeId')) {
        config.data.append('nodeId', nodeId);
        Logger.info('[apiService] 为 FormData 请求补充 nodeId:', nodeId);
      }
    } else {
      // 对于普通 JSON 对象，优先使用请求中已传递的 nodeId
      const existingNodeId = config.data.nodeId;
      
      // 只有当请求体中没有 nodeId 时，才添加
      if (!existingNodeId) {
        config.data = {
          ...config.data,
          nodeId: nodeId,
        };
        Logger.info('[apiService] 为 JSON 请求补充 nodeId:', nodeId);
      }
    }
  } else if (config.params) {
    // 如果参数在 params 中
    const existingNodeId = config.params.nodeId;
    
    if (!existingNodeId) {
      config.params = {
        ...config.params,
        nodeId: nodeId,
      };
      Logger.info('[apiService] 为 params 补充 nodeId:', nodeId);
    }
  }
};

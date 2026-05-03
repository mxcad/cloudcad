import axios from 'axios';
import type { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/auth.store';

/**
 * 创建配置好的 Axios 实例
 */
function createApiClient() {
  const client = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL?.replace(/\/api$/, '') || '',
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // ===== 请求拦截器：注入 Token =====
  client.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      if (config.data instanceof FormData) {
        delete config.headers['Content-Type'];
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  // ===== 响应拦截器：统一解包 + 错误处理 + Token 刷新 =====
  client.interceptors.response.use(
    (response) => {
      // 统一解包响应：{ code, message, data, timestamp } -> data
      if (
        response.data &&
        typeof response.data === 'object' &&
        'data' in response.data &&
        'code' in response.data
      ) {
        response.data = response.data.data;
      }
      return response;
    },
    async (error: unknown) => {
      // 检测请求是否被取消
      const axiosError = error as AxiosError;
      const isError = error instanceof Error;

      if (axios.isCancel(error) ||
          (isError && (
            error.name === 'AbortError' ||
            error.name === 'CanceledError' ||
            error.message === 'canceled'
          ))) {
        if (isError) {
          (error as Error & { isAborted?: boolean }).isAborted = true;
        }
        return Promise.reject(error);
      }

      const originalRequest = axiosError.config as AxiosRequestConfig & {
        _retry?: boolean;
      };
      const isLoginEndpoint = originalRequest?.url?.includes('/auth/login');
      const isProfileEndpoint = originalRequest?.url?.includes('/auth/profile');

      // Token 刷新逻辑
      if (
        axiosError.response?.status === 401 &&
        !originalRequest._retry &&
        !isLoginEndpoint &&
        !isProfileEndpoint
      ) {
        originalRequest._retry = true;
        const refreshToken = localStorage.getItem('refreshToken');

        if (!refreshToken) {
          clearAuthAndRedirect();
          return Promise.reject(error);
        }

        try {
          const baseURL = import.meta.env.VITE_API_BASE_URL?.replace(/\/api$/, '') || '';
          const response = await axios.post(`${baseURL}/api/auth/refresh`, {
            refreshToken,
          });
          const { accessToken, refreshToken: newRefreshToken } =
            response.data.data || response.data;
          localStorage.setItem('accessToken', accessToken);
          if (newRefreshToken) {
            localStorage.setItem('refreshToken', newRefreshToken);
          }
          // 同步更新 Store
          const auth = useAuthStore();
          auth.token = accessToken;
          // 重试原请求
          originalRequest.headers = {
            ...originalRequest.headers,
            Authorization: `Bearer ${accessToken}`,
          };
          return client(originalRequest);
        } catch {
          clearAuthAndRedirect();
          return Promise.reject(error);
        }
      }

      // 对于 getProfile 请求的 401 错误，只清除认证信息，不自动跳转
      if (isProfileEndpoint && axiosError.response?.status === 401) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
      }

      if (axiosError.response?.status === 403) {
        const message =
          (axiosError.response?.data as { message?: string })?.message || '权限不足';
        console.error('[apiClient] 权限错误:', message);
        (
          axiosError as Error & { isPermissionError?: boolean; statusCode?: number }
        ).isPermissionError = true;
        (
          axiosError as Error & { isPermissionError?: boolean; statusCode?: number }
        ).statusCode = 403;
      }

      const responseData = axiosError.response?.data as
        | { message?: string; error?: string; msg?: string }
        | undefined;
      if (axiosError instanceof Error) {
        axiosError.message =
          responseData?.message ||
          responseData?.error ||
          responseData?.msg ||
          (typeof responseData === 'string' ? responseData : '网络错误');
      }
      return Promise.reject(error);
    }
  );

  return client;
}

/**
 * 清除认证信息并跳转登录页
 */
function clearAuthAndRedirect() {
  console.log('[apiClient] 清除认证信息，跳转到登录页');
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  window.location.href = '/login';
}

/**
 * 全局 API 客户端实例（懒初始化）
 */
let _client: ReturnType<typeof createApiClient> | null = null;

export function getApiClient(): ReturnType<typeof createApiClient> {
  if (!_client) {
    _client = createApiClient();
  }
  return _client;
}

export interface SvnLogEntryDto {
  revision: number;
  author?: string;
  userName?: string;
  date: string | Date;
  message: string;
}

export default getApiClient;

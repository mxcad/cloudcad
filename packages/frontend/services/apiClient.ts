import OpenAPIClientAxios from 'openapi-client-axios';
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { logger as Logger } from '../utils/mxcadUtils';
import { API_BASE_URL, API_TIMEOUT } from '../config/apiConfig';
import type { Client } from '../types/api-client';
// 直接导入本地 swagger json，避免 HTTP 请求
import swaggerDefinition from '../../../swagger_json.json';

// 全局单例
let api: OpenAPIClientAxios | null = null;
let client: Client | null = null;
let initPromise: Promise<Client> | null = null;

/**
 * 初始化 API 客户端（应用启动时调用）
 */
export async function initApiClient(): Promise<Client> {
  if (client) return client;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // 先创建 axios 实例
    // 注意：swagger 定义中的路径已经包含 /api 前缀，所以 baseURL 要去掉 /api
    const baseURL = API_BASE_URL.replace(/\/api$/, '');
    const axiosInstance = axios.create({
      baseURL,
      timeout: API_TIMEOUT,
      headers: { 'Content-Type': 'application/json' },
    });

    api = new OpenAPIClientAxios({
      definition: swaggerDefinition as never,
      axiosInstance,
    });

    client = await api.init<Client>();
    setupInterceptors(client);
    return client;
  })();

  return initPromise;
}

/**
 * 获取类型安全的 API 客户端
 * 必须在 initApiClient() 完成后调用
 */
export function getApiClient(): Client {
  if (!client) {
    throw new Error('API client not initialized. Call initApiClient() first.');
  }
  return client;
}

/**
 * 获取底层 Axios 实例（用于兼容旧代码）
 */
export function getAxiosInstance(): AxiosInstance {
  return getApiClient();
}

function setupInterceptors(instance: AxiosInstance) {
  // 请求拦截器
  instance.interceptors.request.use(
    (config) => {
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

  // 响应拦截器
  instance.interceptors.response.use(
    (response) => {
      const isGalleryEndpoint = response.config.url?.includes('/gallery/');
      if (
        !isGalleryEndpoint &&
        response.data &&
        typeof response.data === 'object' &&
        'data' in response.data &&
        'code' in response.data
      ) {
        response.data = response.data.data;
      }
      return response;
    },
    async (error: AxiosError) => {
      const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };
      const isLoginEndpoint = originalRequest?.url?.includes('/auth/login');

      if (error.response?.status === 401 && !originalRequest._retry && !isLoginEndpoint) {
        originalRequest._retry = true;
        const refreshToken = localStorage.getItem('refreshToken');

        if (!refreshToken) {
          clearAuthAndRedirect();
          return Promise.reject(error);
        }

        try {
          const baseURL = API_BASE_URL.replace(/\/api$/, '');
          const response = await axios.post(`${baseURL}/api/auth/refresh`, { refreshToken });
          const { accessToken, refreshToken: newRefreshToken } = response.data.data || response.data;
          localStorage.setItem('accessToken', accessToken);
          if (newRefreshToken) localStorage.setItem('refreshToken', newRefreshToken);
          originalRequest.headers = { ...originalRequest.headers, Authorization: `Bearer ${accessToken}` };
          return instance(originalRequest);
        } catch {
          clearAuthAndRedirect();
          return Promise.reject(error);
        }
      }

      if (error.response?.status === 403) {
        const message = (error.response?.data as { message?: string })?.message || '权限不足';
        Logger.error('[apiClient] 权限错误:', message);
        (error as Error & { isPermissionError?: boolean; statusCode?: number }).isPermissionError = true;
        (error as Error & { isPermissionError?: boolean; statusCode?: number }).statusCode = 403;
      }

      const responseData = error.response?.data as { message?: string; error?: string; msg?: string } | undefined;
      error.message = responseData?.message || responseData?.error || responseData?.msg || (typeof responseData === 'string' ? responseData : '网络错误');
      return Promise.reject(error);
    }
  );
}

function clearAuthAndRedirect() {
  console.log('[apiClient] 清除认证信息，跳转到登录页');
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  window.location.href = '/login';
}




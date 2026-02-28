import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { logger as Logger } from '../utils/mxcadUtils';
import { API_BASE_URL, API_TIMEOUT } from '../config/apiConfig';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: API_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // 请求拦截器 - 添加认证 token
    this.client.interceptors.request.use(
      (config) => {
        // 从 localStorage 获取 token
        const token = localStorage.getItem('accessToken');

        // 如果 token 存在，添加到 Authorization 头
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // 如果是 FormData，移除默认的 Content-Type，让浏览器自动设置
        if (config.data instanceof FormData) {
          delete config.headers['Content-Type'];
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
        const isGalleryEndpoint = response.config.url?.includes('/gallery/');
        const shouldSkipUnwrap = isGalleryEndpoint;

        // 对所有端点（除了 gallery）解包标准响应格式 { code, message, data }
        if (
          !shouldSkipUnwrap &&
          response.data &&
          typeof response.data === 'object' &&
          'data' in response.data &&
          'code' in response.data
        ) {
          response.data = response.data.data;
        }

        return response;
      },
      async (error) => {
        const originalRequest = error.config;

        // 排除登录接口本身的 401 错误（密码错误等）
        const isLoginEndpoint = originalRequest.url?.includes('/auth/login');

        if (
          error.response?.status === 401 &&
          !originalRequest._retry &&
          !isLoginEndpoint
        ) {
          originalRequest._retry = true;

          const refreshToken = localStorage.getItem('refreshToken');

          // 如果没有 refreshToken，直接跳转到登录页
          if (!refreshToken) {
            console.log('[apiClient] 没有 refreshToken，跳转到登录页');
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');
            window.location.href = '/login';
            return Promise.reject(error);
          }

          // 尝试用 refreshToken 刷新 token
          try {
            const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
              refreshToken,
            });

            const responseData = response.data.data || response.data;
            const { accessToken, refreshToken: newRefreshToken } = responseData;
            localStorage.setItem('accessToken', accessToken);
            // 保存新的 refreshToken（后端采用 Token 轮换机制）
            if (newRefreshToken) {
              localStorage.setItem('refreshToken', newRefreshToken);
            }

            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            return this.client(originalRequest);
          } catch (refreshError) {
            console.log('[apiClient] Token 刷新失败，跳转到登录页');
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');
            window.location.href = '/login';
            return Promise.reject(refreshError);
          }
        }

        // 处理 403 权限错误
        if (error.response?.status === 403) {
          const errorMessage =
            error.response?.data?.message || '权限不足，您没有执行此操作的权限';
          Logger.error('[apiClient] 权限错误:', errorMessage);

          // 直接修改错误对象的属性
          error.message = errorMessage;
          (
            error as Error & { isPermissionError: boolean; statusCode: number }
          ).isPermissionError = true;
          (
            error as Error & { isPermissionError: boolean; statusCode: number }
          ).statusCode = 403;

          return Promise.reject(error);
        }

        // 统一处理其他 HTTP 错误，提取后端返回的错误消息
        const responseData = error.response?.data;
        const backendMessage = responseData?.message;

        console.log('[apiClient] HTTP 错误处理:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: responseData,
          backendMessage,
          errorType: typeof responseData,
          headers: error.response?.headers,
        });

        if (backendMessage) {
          // 直接修改错误对象的 message 属性
          error.message = backendMessage;
          console.log('[apiClient] 已设置 error.message =', error.message);
          return Promise.reject(error);
        }

        // 如果后端返回了数据但没有 message 字段，尝试使用其他字段
        if (responseData) {
          if (typeof responseData === 'string') {
            error.message = responseData;
          } else if (responseData.error) {
            error.message = responseData.error;
          } else if (responseData.msg) {
            error.message = responseData.msg;
          }
        }

        // 网络错误或其他错误，确保有 message
        if (!error.message) {
          error.message = '网络错误，请检查网络连接';
        }

        return Promise.reject(error);
      }
    );
  }

  get<T = unknown>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.client.get(url, config);
  }

  post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.client.post(url, data, config);
  }

  put<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.client.put(url, data, config);
  }

  patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.client.patch(url, data, config);
  }

  delete<T = unknown>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.client.delete(url, config);
  }

  upload<T = unknown>(url: string, data: unknown): Promise<AxiosResponse<T>> {
    return this.client.post(url, data);
  }
}

export const apiClient = new ApiClient();

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { Logger } from '../utils/mxcadUtils';
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
        // 检查 MxCAD 格式的错误响应
        if (
          response.data &&
          typeof response.data === 'object' &&
          response.data.ret === 'errorparam' &&
          response.data.message === '用户未认证'
        ) {
          console.log('[apiClient] 检测到 MxCAD 格式的未认证响应，跳转到登录页');
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
          window.location.href = '/login';
          return Promise.reject({
            ...response,
            isUnauthorized: true,
            message: '用户未认证',
          });
        }

        const isMxCadEndpoint = response.config.url?.includes('/mxcad/');
        const isGalleryEndpoint = response.config.url?.includes('/gallery/');
        const shouldSkipUnwrap = isMxCadEndpoint || isGalleryEndpoint;

        if (
          !shouldSkipUnwrap &&
          response.data &&
          typeof response.data === 'object' &&
          'data' in response.data
        ) {
          response.data = response.data.data;
        }

        return response;
      },
      async (error) => {
        const originalRequest = error.config;

        // 检查错误响应中的 MxCAD 格式
        if (
          error.response?.data &&
          error.response.data.ret === 'errorparam' &&
          error.response.data.message === '用户未认证'
        ) {
          console.log('[apiClient] 检测到 MxCAD 格式的未认证错误，跳转到登录页');
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
          window.location.href = '/login';
          return Promise.reject({
            ...error,
            isUnauthorized: true,
            message: '用户未认证',
          });
        }

        if (error.response?.status === 401 && !originalRequest._retry) {
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
            const response = await axios.post(
              `${API_BASE_URL}/auth/refresh`,
              { refreshToken }
            );

            const responseData = response.data.data || response.data;
            const { accessToken } = responseData;
            localStorage.setItem('accessToken', accessToken);

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

          // 创建增强的错误对象，包含更详细的错误信息
          const enhancedError = {
            ...error,
            message: errorMessage,
            isPermissionError: true,
            statusCode: 403,
          };

          return Promise.reject(enhancedError);
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

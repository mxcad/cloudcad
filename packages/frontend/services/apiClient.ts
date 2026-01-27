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
    // 请求拦截器 - 添加认证 token 和 MxCAD 项目上下文
    this.client.interceptors.request.use(
      (config) => {
        // Authorization 由 mxcadManager.ts 在 XHR/fetch 底层统一处理

        // 如果是 FormData，移除默认的 Content-Type，让浏览器自动设置
        if (config.data instanceof FormData) {
          delete config.headers['Content-Type'];
        }

        // 为所有 MxCAD 接口添加节点上下文
        if (config.url?.includes('/mxcad/')) {
          const nodeId = this.getNodeIdFromMultipleSources(config);

          if (nodeId && this.isValidNodeId(nodeId)) {
            this.supplementNodeIdToRequest(config, nodeId);
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

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const refreshToken = localStorage.getItem('refreshToken');
            if (refreshToken) {
              const response = await axios.post(
                `${API_BASE_URL}/auth/refresh`,
                { refreshToken }
              );

              const responseData = response.data.data || response.data;
              const { accessToken } = responseData;
              localStorage.setItem('accessToken', accessToken);

              originalRequest.headers.Authorization = `Bearer ${accessToken}`;
              return this.client(originalRequest);
            }
          } catch (refreshError) {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');
            window.location.href = '/login';
            return Promise.reject(refreshError);
          }
        }

        // 处理 403 权限错误
        if (error.response?.status === 403) {
          const errorMessage = error.response?.data?.message || '权限不足，您没有执行此操作的权限';
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

  private getNodeIdFromMultipleSources(
    config: AxiosRequestConfig
  ): string | null {
    if (config.data?.nodeId) return config.data.nodeId;

    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlNodeId = urlParams.get('nodeId') || urlParams.get('parent');
      if (urlNodeId) return urlNodeId;
    }

    if (typeof window !== 'undefined' && (window as any).__CURRENT_NODE_ID__) {
      return (window as any).__CURRENT_NODE_ID__;
    }

    if (typeof window !== 'undefined') {
      const storedNodeId = localStorage.getItem('currentNodeId');
      if (storedNodeId) return storedNodeId;
    }

    return null;
  }

  private isValidNodeId(nodeId: string): boolean {
    if (!nodeId || typeof nodeId !== 'string') return false;
    const cuid2Pattern = /^c[a-z0-9]{23,31}$/;
    return cuid2Pattern.test(nodeId);
  }

  private supplementNodeIdToRequest(
    config: AxiosRequestConfig,
    nodeId: string
  ): void {
    if (!config || !nodeId) return;

    const method = config.method?.toLowerCase();
    if ((method === 'post' || method === 'put') && config.data) {
      const isFormData = config.data instanceof FormData;

      if (isFormData) {
        if (!config.data.has('nodeId')) {
          config.data.append('nodeId', nodeId);
          Logger.info('[apiClient] 为 FormData 请求补充 nodeId:', nodeId);
        }
      } else {
        if (config.data.nodeId) {
          Logger.info(
            '[apiClient] 请求中已包含 nodeId，使用已有值:',
            config.data.nodeId
          );
          return;
        }

        Object.assign(config.data, { nodeId });
        Logger.info('[apiClient] 为 JSON 请求补充 nodeId:', nodeId);
      }
    } else if (config.params) {
      if (config.params.nodeId) {
        Logger.info(
          '[apiClient] params 中已包含 nodeId，使用已有值:',
          config.params.nodeId
        );
        return;
      }

      Object.assign(config.params, { nodeId });
      Logger.info('[apiClient] 为 params 补充 nodeId:', nodeId);
    }
  }
}

export const apiClient = new ApiClient();

///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import OpenAPIClientAxios from 'openapi-client-axios';
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import { API_BASE_URL, API_TIMEOUT } from '../config/apiConfig';
import type { Client } from '../types/api-client';
// 直接导入本地 swagger json，避免 HTTP 请求
import swaggerDefinition from '../../../../swagger_json.json';

// 全局单例
let api: OpenAPIClientAxios | null = null;
let client: Client | null = null;
let initPromise: Promise<Client> | null = null;

/**
 * 初始化 API 客户端（应用启动时调用）
 */
export async function initApiClient(): Promise<Client> {
  console.log('[apiClient] 开始初始化 API 客户端');
  if (client) {
    console.log('[apiClient] 客户端已存在，直接返回');
    return client;
  }
  if (initPromise) {
    console.log('[apiClient] 初始化进行中，返回已有 Promise');
    return initPromise;
  }

  initPromise = (async () => {
    console.log('[apiClient] 创建新的初始化 Promise');
    // 先创建 axios 实例
    // 注意：swagger 定义中的路径已经包含 /api 前缀，所以 baseURL 要去掉 /api
    const baseURL = API_BASE_URL.replace(/\/api$/, '');
    console.log('[apiClient] API Base URL:', baseURL);
    const axiosInstance = axios.create({
      baseURL,
      timeout: API_TIMEOUT,
      headers: { 'Content-Type': 'application/json' },
      withCredentials: true, // 允许跨域请求携带 Cookie，用于 Session 认证
    });

    console.log('[apiClient] swaggerDefinition:', !!swaggerDefinition, 'keys:', Object.keys(swaggerDefinition || {}).length);
    api = new OpenAPIClientAxios({
      definition: swaggerDefinition as never,
      axiosInstance,
    });

    console.log('[apiClient] 开始调用 api.init()');
    client = await api.init<Client>();
    console.log('[apiClient] api.init() 完成，client:', !!client);
    setupInterceptors(client);
    console.log('[apiClient] 初始化完成');
    return client;
  })();

  return initPromise;
}

/**
 * 初始化 API 客户端（后台调用，不阻塞渲染）
 * 首次调用会启动初始化，后续调用返回同一个 Promise
 */
export function ensureApiClientInit(): Promise<Client> {
  return initApiClient();
}

/**
 * 获取类型安全的 API 客户端
 * 如果尚未初始化，会自动等待初始化完成
 */
export async function getApiClientAsync(): Promise<Client> {
  if (client) return client;
  return initApiClient();
}

/**
 * 获取类型安全的 API 客户端（同步版本）
 * 注意：仅在确认已初始化时使用，否则使用 getApiClientAsync()
 */
export function getApiClient(): Client {
  if (!client) {
    // 启动初始化（不阻塞）
    initApiClient();
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
      // 检测请求是否被取消（AbortController 或 axios CancelToken）
      // 这是用户切换页面/项目时的正常行为，不应显示为"网络错误"
      const axiosError = error as AxiosError;
      const isError = error instanceof Error;

      // 检测所有可能的取消错误类型：
      // - axios.isCancel: Axios CancelToken 取消
      // - AbortError: AbortController 取消
      // - CanceledError: Axios 内部取消
      // - message === 'canceled': Axios 某些版本的取消消息
      if (axios.isCancel(error) ||
          (isError && (
            error.name === 'AbortError' ||
            error.name === 'CanceledError' ||
            error.message === 'canceled'
          ))) {
        // 保持原始错误类型，让调用方可以正确识别并静默处理
        if (isError) {
          (error as Error & { isAborted?: boolean }).isAborted = true;
        }
        return Promise.reject(error);
      }

      const originalRequest = axiosError.config as AxiosRequestConfig & {
        _retry?: boolean;
      };
      const isLoginEndpoint = originalRequest?.url?.includes('/auth/login');
      // 对于 getProfile 请求，不自动刷新 token 或跳转，由 AuthContext 自己处理
      const isProfileEndpoint = originalRequest?.url?.includes('/auth/profile');

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
          const baseURL = API_BASE_URL.replace(/\/api$/, '');
          const response = await axios.post(`${baseURL}/api/auth/refresh`, {
            refreshToken,
          });
          const { accessToken, refreshToken: newRefreshToken } =
            response.data.data || response.data;
          localStorage.setItem('accessToken', accessToken);
          if (newRefreshToken)
            localStorage.setItem('refreshToken', newRefreshToken);
          originalRequest.headers = {
            ...originalRequest.headers,
            Authorization: `Bearer ${accessToken}`,
          };
          return instance(originalRequest);
        } catch {
          clearAuthAndRedirect();
          return Promise.reject(error);
        }
      }

      // 对于 getProfile 请求的 401 错误，只清除认证信息，不自动跳转
      // 由 AuthContext 和路由组件决定如何处理
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
}

function clearAuthAndRedirect() {
  console.log('[apiClient] 清除认证信息，跳转到登录页');
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  window.location.href = '/login';
}

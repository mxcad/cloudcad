import { client } from '../api-sdk/client.gen';

export function getApiBaseUrl(): string {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  return '/api';
}

export function setupApiClient(): void {
  const apiBaseUrl = getApiBaseUrl();
  let baseUrl: string;
  try {
    baseUrl = new URL(apiBaseUrl).origin;
  } catch {
    baseUrl = '';
  }

  client.setConfig({
    baseUrl,
    credentials: 'include',
    responseTransformer: async (data: unknown) => {
      if (data && typeof data === 'object' && 'code' in data) {
        const typedData = data as Record<string, unknown>;
        const code = typedData.code;
        if (typeof code === 'number' && code !== 0) {
          const message = String(typedData.message || '业务处理失败');
          const error: Error & { code?: number; data?: unknown } = Object.assign(
            new Error(message),
            { code, data: typedData },
          );
          throw error;
        }
        if ('data' in typedData) {
          return typedData.data;
        }
      }
      return data;
    },
  });

  client.interceptors.error.use(async (error, _response, _request, _options) => {
    if (error && typeof error === 'object') {
      const e = error as Record<string, unknown>;
      if (e.status === 403) {
        (error as Record<string, unknown>).isPermissionError = true;
        (error as Record<string, unknown>).statusCode = 403;
      }
    }
    return error;
  });
}

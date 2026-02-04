/**
 * 全局认证管理器
 * 项目启动时设置，所有 HTTP 请求自动添加 JWT token
 */

let originalXHROpen: typeof XMLHttpRequest.prototype.open | null = null;
let originalXHRSend: typeof XMLHttpRequest.prototype.send | null = null;
let originalFetch: typeof window.fetch | null = null;
let isConfigured = false;

// 公开接口路径（不需要认证）
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify-email',
];

// 检查是否需要认证
const needsAuth = (url: string): boolean => {
  // 公开接口不需要认证
  for (const path of PUBLIC_PATHS) {
    if (url.includes(path)) return false;
  }

  return true;
};

// 设置 XHR 拦截
const setupXHR = (): void => {
  originalXHROpen = XMLHttpRequest.prototype.open;
  originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    ...args: any[]
  ) {
    (this as any)._url = url.toString();
    (this as any)._method = method.toUpperCase();
    return originalXHROpen!.call(this, method, url, ...args);
  };

  XMLHttpRequest.prototype.send = function (body?: any) {
    const url = (this as any)._url;
    if (needsAuth(url)) {
      const token = localStorage.getItem('accessToken');

      console.log('[globalAuth] XHR 请求:', url);
      console.log('[globalAuth] Token:', token ? `${token.substring(0, 20)}...` : 'missing');

      // 检查是否已存在 Authorization header，避免重复
      const existingAuth = this.getRequestHeader?.('Authorization');
      if (!existingAuth && token) {
        this.setRequestHeader('Authorization', `Bearer ${token}`);
        console.log('[globalAuth] 已添加 Authorization header');
      }
    }
    return originalXHRSend!.call(this, body);
  };
};

// 设置 fetch 拦截
const setupFetch = (): void => {
  originalFetch = window.fetch;

  window.fetch = function (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const urlString = typeof input === 'string' ? input : input.toString();
    if (needsAuth(urlString)) {
      const token = localStorage.getItem('accessToken');
      if (token) {
        const headers = new Headers(init?.headers || {});
        // 检查是否已存在 Authorization header，避免重复
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        const newInit: RequestInit = { ...init, headers };
        return originalFetch!.call(window, input, newInit);
      }
    }

    return originalFetch!.call(window, input, init);
  };
};

// 项目启动时调用
export const setupGlobalAuth = (): void => {
  if (isConfigured) return;

  setupXHR();
  setupFetch();
  isConfigured = true;
};

// 清理（如果需要）
export const cleanupAuth = (): void => {
  if (originalXHROpen) {
    XMLHttpRequest.prototype.open = originalXHROpen;
    originalXHROpen = null;
  }
  if (originalXHRSend) {
    XMLHttpRequest.prototype.send = originalXHRSend;
    originalXHRSend = null;
  }
  if (originalFetch) {
    window.fetch = originalFetch;
    originalFetch = null;
  }
  isConfigured = false;
};

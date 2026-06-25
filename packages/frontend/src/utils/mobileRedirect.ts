import { getConfig } from '../config/getConfig';

interface MobileRedirectConfig {
  isAutomaticJumpToMobilePage?: boolean;
  mobilePageUrl?: string;
}

const CONFIG_URL = `${window.location.origin}/ini/myServerConfig.json`;

let configPromise: Promise<MobileRedirectConfig | undefined> | null = null;

export function getMobileRedirectConfig(): Promise<
  MobileRedirectConfig | undefined
> {
  if (!configPromise) {
    configPromise = getConfig<MobileRedirectConfig>(CONFIG_URL);
  }
  return configPromise;
}

export function getMobileRedirectUrl(
  config: MobileRedirectConfig | undefined
): string | null {
  if (!config?.isAutomaticJumpToMobilePage) return null;

  const baseUrl = import.meta.env.DEV
    ? 'http://localhost:7001/'
    : config.mobilePageUrl || '/mxcad_mobile/';

  // 将 URL path 中的 fileId（/cad-editor/{fileId}）作为 query param 传递，
  // 否则移动端只收到 ?nodeId=...&back=...，丢失了真正的 fileId
  const searchParams = new URLSearchParams(window.location.search);
  const match = window.location.pathname.match(/^\/cad-editor\/([^/]+)$/);
  if (match?.[1]) {
    searchParams.set('fileId', match[1]);
  }

  // 携带 token 和用户信息，避免移动端（不同端口 localStorage 隔离）无认证导致 401
  const accessToken = localStorage.getItem('accessToken');
  if (accessToken) {
    searchParams.set('accessToken', accessToken);
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      searchParams.set('refreshToken', refreshToken);
    }
    const user = localStorage.getItem('user');
    if (user) {
      searchParams.set('user', user);
    }
  }

  const queryString = searchParams.toString();
  return `${baseUrl}?${queryString}`;
}

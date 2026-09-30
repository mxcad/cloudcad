/**
 * PC → 移动端跳转的**唯一出口**。
 *
 * 收敛前的三个问题：
 * 1. 只认 CAD 路由——`/projects`、`/personal-space`、`/library`、`/shares`、
 *    `/member-center`、`/profile` 在手机上打开都落空，直接渲染出 PC 桌面版外壳。
 *    现在走 @cloudcad/platform 的共享映射表，两端共用一份。
 * 2. 判定只用 UA 正则——iPad 桌面模式、浏览器设备模拟、含 Mobi 片段的 WebView
 *    全部误命中，且开关在 myServerConfig.json 里默认开启、PC 端无法用 env 关。
 *    现在用 `shouldUseMobilePresentation`，宽屏设备（≥1024px）豁免。
 * 3. `index.tsx` 的渲染前预检与 `App.tsx` 的 `MobileRouteGuard` 两处独立触发，
 *    首次加载会重复 fetch 配置并重复 replace。现在统一走
 *    `performMobileRedirectIfNeeded`，MobileRouteGuard 跳过首次渲染。
 *
 * 移动端约定：业务参数在 **hash 之前**（`/mxcad_mobile/?fileId=x#/shell`），
 * 因为移动端的 `useFileLoader` 读的是 `window.location.search`。所以这里拼的
 * URL 形态固定为 `base?query#path`，改动前请先确认移动端读取位置未变。
 */

import {
  buildAuthTransferQuery,
  currentUA,
  isMappableRoute,
  resolveMobileRoute,
  shouldUseMobilePresentation,
} from '@cloudcad/platform';

import { getConfig } from '../config/getConfig';

interface MobileRedirectConfig {
  isAutomaticJumpToMobilePage?: boolean;
  mobilePageUrl?: string;
  mobileAccessPath?: string;
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

/** 移动端站点 base（结尾带 `/`）。开发环境固定指向移动端 dev server。 */
export function getMobileBaseUrl(
  config: MobileRedirectConfig | undefined
): string {
  if (import.meta.env.DEV) return 'http://localhost:7001/';
  return config?.mobilePageUrl || `/${config?.mobileAccessPath || 'mxcad_mobile'}/`;
}

export interface MobileRedirectInput {
  config: MobileRedirectConfig | undefined;
  /** 当前 PC 端 pathname */
  pathname: string;
  /** 当前 PC 端 search（可带前导 `?`） */
  search: string;
  /** 待搬运的登录态；不传则不搬运（游客跳转） */
  credentials?: {
    accessToken: string | null;
    refreshToken: string | null;
    user: string | null;
  };
  /** 是否标记为「桌面 → 移动端自动跳转」 */
  markRedirect?: boolean;
}

/**
 * 纯函数：PC URL + 配置 → 移动端 URL。
 *
 * 不可映射（不在映射表 / 命中桌面管理端前缀）返回 null。调用方应把 null 当作
 * 正常业务分支，而不是错误。
 */
export function buildMobileRedirectUrl(
  input: MobileRedirectInput
): string | null {
  if (!input.config?.isAutomaticJumpToMobilePage) return null;

  const resolved = resolveMobileRoute({
    pcPathname: input.pathname,
    pcSearch: input.search,
  });
  if (!resolved) return null;

  const { credentials } = input;
  const credentialsQuery = credentials?.accessToken
    ? buildAuthTransferQuery(
        {
          accessToken: credentials.accessToken,
          refreshToken: credentials.refreshToken ?? undefined,
          user: credentials.user ?? undefined,
        },
        { markRedirect: input.markRedirect }
      )
    : input.markRedirect
      ? { _redirect: '1' }
      : {};

  const query = { ...resolved.query, ...credentialsQuery };

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    params.append(key, value);
  }
  const queryPart = params.toString();

  return (
    getMobileBaseUrl(input.config) +
    (queryPart ? `?${queryPart}` : '') +
    `#${resolved.path}`
  );
}

/**
 * 是否应该跳移动端（纯判定）。
 *
 * 三个条件全部满足：配置开关开启、路径可映射、当前姿态确为移动端。
 */
export function shouldRedirectToMobile(input: {
  config: MobileRedirectConfig | undefined;
  pathname: string;
  ua: string;
  width: number;
}): boolean {
  if (!input.config?.isAutomaticJumpToMobilePage) return false;
  if (!isMappableRoute(input.pathname)) return false;
  return shouldUseMobilePresentation({ ua: input.ua, width: input.width });
}

/**
 * 唯一执行出口：判定 + 生成 URL + `location.replace`。
 *
 * 返回是否已发起跳转。两处调用者（`index.tsx` 渲染前预检、`App.tsx` 的
 * `MobileRouteGuard`）都调它；首次加载由预检处理，`MobileRouteGuard` 用 ref
 * 跳过首次渲染，避免重复 fetch 配置与重复 replace。
 *
 * 跳转后不 resolve 到有意义值——`location.replace` 已改变导航，调用方应直接
 * return，避免 React 继续渲染一个即将被替换的页面。
 */
export async function performMobileRedirectIfNeeded(): Promise<boolean> {
  const config = await getMobileRedirectConfig();
  const pathname = window.location.pathname;
  const ua = currentUA();

  if (
    !shouldRedirectToMobile({
      config,
      pathname,
      ua,
      width: window.innerWidth,
    })
  ) {
    return false;
  }

  const url = buildMobileRedirectUrl({
    config,
    pathname,
    search: window.location.search,
    credentials: {
      accessToken: localStorage.getItem('accessToken'),
      refreshToken: localStorage.getItem('refreshToken'),
      user: localStorage.getItem('user'),
    },
    markRedirect: true,
  });

  if (!url) return false;

  window.location.replace(url);
  return true;
}

///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 浏览器 chrome（favicon / apple-touch-icon）随品牌配置生效的唯一出口。
 *
 * `index.html` 里的 `<link rel="icon">` 是首屏静态兜底值，JS 加载后若不覆写，
 * 管理端改 `brandLogo` 对浏览器标签图标永远无效。
 */

/**
 * 匹配 `rel="icon"` 与 `rel="apple-touch-icon"`。
 * 不能用 `link[rel~="icon"]`——`~=` 按空白分词，`apple-touch-icon` 是单个
 * 整词，匹配不到，会让 iOS 主屏图标一直停在打包值。
 */
export const ICON_LINK_SELECTOR = 'link[rel*="icon"]';

const ICON_TYPE_BY_EXTENSION: Record<string, string> = {
  ico: 'image/x-icon',
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

/** 从地址推断图标 MIME；无扩展名（如后端 `/runtime-config/brand-logo`）返回 undefined */
function iconTypeOf(href: string): string | undefined {
  const path = href.split(/[?#]/, 1)[0] ?? '';
  const dotIndex = path.lastIndexOf('.');
  if (dotIndex < 0 || dotIndex === path.length - 1) return undefined;
  return ICON_TYPE_BY_EXTENSION[path.slice(dotIndex + 1).toLowerCase()];
}

/**
 * 把品牌 Logo 写入所有图标 link。`type` 只在能从扩展名推断时更新——
 * 扩展名推断不出（后端同源 Logo URL）就保持原值，交给浏览器按响应
 * Content-Type 嗅探，比猜一个错的更稳。
 */
export function applyBrandFavicon(logo: string): void {
  const url = logo.trim();
  if (!url) return;

  const iconType = iconTypeOf(url);
  for (const link of Array.from(
    document.head.querySelectorAll<HTMLLinkElement>(ICON_LINK_SELECTOR)
  )) {
    link.href = url;
    if (iconType) link.type = iconType;
  }
}

/**
 * 首帧品牌缓存键。`index.html` 的内联脚本在 bundle 加载前读取它，
 * 让回访用户第一次绘制时就已经是运行时配置的值——否则管理端改过
 * `brandTitle` / `brandLogo` 后，每次打开页面都会先闪一下打包兜底值。
 * 改这个值要同时改 `index.html`（`brandChrome.spec.ts` 有一条断言钉住）。
 */
export const BRAND_CHROME_CACHE_KEY = 'mx-brand-chrome';

/** localStorage 里存的首帧品牌值：只存 index.html 静态兜底的那两项 */
interface BrandChromeCache {
  appName: string;
  logo: string;
}

/** 只放行同源相对路径：挡住 `javascript:`、`data:`、协议相对等可执行或外泄地址 */
function isSafeChromeUrl(value: string): boolean {
  const url = value.trim();
  return (
    url.startsWith('/') &&
    !url.startsWith('//') &&
    !url.includes(':') &&
    !/\s/.test(url)
  );
}

/**
 * 把当前生效的品牌标题与 Logo 写进 localStorage，供下次打开页面时
 * `index.html` 内联脚本在 JS 加载前直接应用。
 *
 * 写失败（隐私模式、存储配额满）静默忽略——缓存只是省一次首帧闪烁，
 * 失败时首帧仍显示 index.html 的静态兜底值，之后 JS 会照常覆写。
 */
export function saveBrandChromeCache(appName: string, logo: string): void {
  try {
    const cache: BrandChromeCache = {
      appName: appName.trim().slice(0, 200),
      // 非同源相对路径不落盘，首帧保留 index.html 的静态 Logo
      logo: isSafeChromeUrl(logo) ? logo.trim().slice(0, 300) : '',
    };
    localStorage.setItem(BRAND_CHROME_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // 见函数注释
  }
}

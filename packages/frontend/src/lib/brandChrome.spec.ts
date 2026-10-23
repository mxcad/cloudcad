import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyBrandFavicon,
  BRAND_CHROME_CACHE_KEY,
  ICON_LINK_SELECTOR,
  saveBrandChromeCache,
} from './brandChrome';

/** 读原始属性值——`.href` 会被 happy-dom 解析成绝对 URL */
const hrefOf = (link: HTMLLinkElement): string | null =>
  link.getAttribute('href');

/** 在 <head> 里建一组 index.html 形态的图标 link */
function seedIconLinks(): HTMLLinkElement[] {
  document.head.innerHTML = '';
  return [
    { rel: 'icon', type: 'image/png', href: '/logo.png' },
    { rel: 'apple-touch-icon', href: '/logo.png' },
  ].map((attrs) => {
    const link = document.createElement('link');
    Object.entries(attrs).forEach(([name, value]) =>
      link.setAttribute(name, value)
    );
    document.head.appendChild(link);
    return link;
  });
}

describe('applyBrandFavicon', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  it('同时覆写 favicon 与 apple-touch-icon（`~=` 会漏掉后者）', () => {
    const links = seedIconLinks();
    expect(links).toHaveLength(2);

    applyBrandFavicon('/brand/logo.png');

    expect(hrefOf(links[0]!)).toBe('/brand/logo.png');
    expect(hrefOf(links[1]!)).toBe('/brand/logo.png');
  });

  it('按扩展名修正 type', () => {
    const links = seedIconLinks();
    applyBrandFavicon('/brand/logo.ico');
    expect(links[0]?.type).toBe('image/x-icon');
    expect(links[1]?.type).toBe('image/x-icon');
  });

  it('扩展名推断不出时保留原 type（后端同源 Logo URL 无扩展名）', () => {
    const links = seedIconLinks();
    applyBrandFavicon('/api/v1/runtime-config/brand-logo?v=3');

    expect(hrefOf(links[0]!)).toBe('/api/v1/runtime-config/brand-logo?v=3');
    expect(links[0]?.type).toBe('image/png');
    // 无 type 属性的 link 不被补出错误值
    expect(links[1]?.getAttribute('type')).toBeNull();
  });

  it('URL 上的 query / hash 不参与扩展名判断', () => {
    const link = seedIconLinks()[0];
    applyBrandFavicon('/brand/logo.png?v=1#x');
    expect(link?.type).toBe('image/png');
  });

  it('空值不做任何修改', () => {
    const links = seedIconLinks();
    applyBrandFavicon('   ');
    expect(hrefOf(links[0]!)).toBe('/logo.png');
    expect(hrefOf(links[1]!)).toBe('/logo.png');
  });

  it('不碰非图标 link', () => {
    const styles = document.createElement('link');
    styles.rel = 'stylesheet';
    styles.setAttribute('href', '/assets/index.css');
    document.head.appendChild(styles);

    applyBrandFavicon('/brand/logo.png');

    expect(hrefOf(styles)).toBe('/assets/index.css');
  });

  it('选择器本身能同时命中两种图标声明（`~=` 命中不到 apple-touch-icon）', () => {
    seedIconLinks();
    expect(document.head.querySelectorAll(ICON_LINK_SELECTOR)).toHaveLength(2);
    expect(document.head.querySelectorAll('link[rel~="icon"]').length).toBe(1);
  });
});

describe('saveBrandChromeCache（首帧品牌缓存）', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('写入生效的品牌标题与 Logo，供 index.html 内联脚本在 bundle 前应用', () => {
    saveBrandChromeCache('梦想网页CAD实时协同平台', '/brand/logo.png');

    const cache = JSON.parse(localStorage.getItem(BRAND_CHROME_CACHE_KEY) ?? 'null');
    expect(cache).toEqual({
      appName: '梦想网页CAD实时协同平台',
      logo: '/brand/logo.png',
    });
  });

  it('只放行同源相对路径：可执行/协议相对地址不落盘，首帧保留静态兜底 Logo', () => {
    for (const unsafe of [
      'javascript:alert(1)',
      'data:image/png;base64,AAA',
      '//evil.example/logo.png',
      'https://evil.example/logo.png',
      '/brand/logo png.png',
    ]) {
      localStorage.clear();
      saveBrandChromeCache('品牌名', unsafe);
      const cache = JSON.parse(localStorage.getItem(BRAND_CHROME_CACHE_KEY) ?? 'null');
      expect(cache, unsafe).toEqual({ appName: '品牌名', logo: '' });
    }
  });

  it('后端同源 Logo URL（无扩展名、带 query）正常落盘', () => {
    saveBrandChromeCache('品牌名', '/api/v1/runtime-config/brand-logo?v=3');
    const cache = JSON.parse(localStorage.getItem(BRAND_CHROME_CACHE_KEY) ?? 'null');
    expect(cache.logo).toBe('/api/v1/runtime-config/brand-logo?v=3');
  });

  it('超长标题截断，避免撑爆标签栏', () => {
    saveBrandChromeCache('A'.repeat(500), '/logo.png');
    const cache = JSON.parse(localStorage.getItem(BRAND_CHROME_CACHE_KEY) ?? 'null');
    expect(cache.appName).toHaveLength(200);
  });

  it('隐私模式等写入失败时静默忽略，不影响品牌生效', () => {
    // 直接换掉 setItem 并在 finally 里换回：vi.spyOn 在这里还原不彻底，
    // 会把抛错的替身漏给后续 describe（QuotaExceededError 串场）
    const originalSetItem = localStorage.setItem;
    Object.defineProperty(localStorage, 'setItem', {
      value: () => {
        throw new Error('QuotaExceededError');
      },
      configurable: true,
      writable: true,
    });
    try {
      expect(() => saveBrandChromeCache('品牌名', '/logo.png')).not.toThrow();
    } finally {
      Object.defineProperty(localStorage, 'setItem', {
        value: originalSetItem,
        configurable: true,
        writable: true,
      });
    }
  });

  it('index.html 的内联脚本必须读取同一个键名——漂移会让缓存静默失效', async () => {
    const html = await readFile(
      resolve(import.meta.dirname, '../../index.html'),
      'utf8'
    );
    expect(html).toContain(BRAND_CHROME_CACHE_KEY);
    // 内联脚本必须在 bundle 之前执行，否则起不到「首帧已生效」的作用
    expect(html.indexOf(BRAND_CHROME_CACHE_KEY)).toBeLessThan(
      html.indexOf('src/index.tsx')
    );
  });
});

describe('index.html 内联脚本（首帧应用缓存）', () => {
  afterEach(() => {
    localStorage.clear();
  });

  async function readInlineScript(): Promise<string> {
    const html = await readFile(
      resolve(import.meta.dirname, '../../index.html'),
      'utf8'
    );
    const script = html.match(/<script>([\s\S]*?)<\/script>/);
    expect(script?.[1], 'index.html 缺少内联首帧脚本').toBeTruthy();
    return script![1];
  }

  function seedCachedCache(): HTMLLinkElement[] {
    // 先清 head 再设标题：happy-dom 的 document.title 落在 <title> 元素上，
    // 后清 head 会把刚设的标题一并抹掉
    document.head.innerHTML = '';
    document.title = '梦想网页CAD实时协同平台';
    localStorage.setItem(
      BRAND_CHROME_CACHE_KEY,
      JSON.stringify({ appName: '缓存的品牌名', logo: '/cached/logo.png' })
    );
    return [
      { rel: 'icon', href: '/logo.png' },
      { rel: 'apple-touch-icon', href: '/logo.png' },
    ].map((attrs) => {
      const link = document.createElement('link');
      Object.entries(attrs).forEach(([name, value]) =>
        link.setAttribute(name, value)
      );
      document.head.appendChild(link);
      return link;
    });
  }

  it('有缓存时首帧就是运行时配置的值，不再闪打包兜底值', async () => {
    const links = seedCachedCache();

    // eslint-disable-next-line no-new-func -- 执行 index.html 里的内联脚本本体
    new Function(await readInlineScript())();

    expect(document.title).toBe('缓存的品牌名');
    expect(links[0]!.getAttribute('href')).toBe('/cached/logo.png');
    expect(links[1]!.getAttribute('href')).toBe('/cached/logo.png');
  });

  it('没有缓存（首次访问）时保持静态兜底值', async () => {
    const links = seedCachedCache();
    localStorage.clear();

    new Function(await readInlineScript())();

    expect(document.title).toBe('梦想网页CAD实时协同平台');
    expect(links[0]!.getAttribute('href')).toBe('/logo.png');
  });

  it('缓存被篡改成可执行地址时不应用 Logo，也不影响标题', async () => {
    const links = seedCachedCache();
    localStorage.setItem(
      BRAND_CHROME_CACHE_KEY,
      JSON.stringify({ appName: '缓存的品牌名', logo: 'javascript:alert(1)' })
    );

    new Function(await readInlineScript())();

    expect(document.title).toBe('缓存的品牌名');
    expect(links[0]!.getAttribute('href')).toBe('/logo.png');
  });

  it('缓存是坏 JSON / 存储不可用时不抛错、不动任何值', async () => {
    const script = await readInlineScript();
    const links = seedCachedCache();
    localStorage.setItem(BRAND_CHROME_CACHE_KEY, '{oops');

    expect(() => new Function(script)()).not.toThrow();

    expect(document.title).toBe('梦想网页CAD实时协同平台');
    expect(links[0]!.getAttribute('href')).toBe('/logo.png');
  });
});

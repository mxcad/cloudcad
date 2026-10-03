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

/**
 * 应用配置常量
 *
 * 品牌信息的唯一出口：运行时配置 + `/brand/config.json`（部署期配置）+ 环境变量 + 内置默认值。
 * 优先级（运行时项经 `mergeBrandOverrides` 叠在 config.json 之上）：
 *   1. 运行时 `brandProfile`（管理端可改，最高优先级）
 *   2. config.json `apps[appId]`
 *   3. config.json 全局字段
 *   4. `VITE_APP_{ID}_TITLE` / `VITE_APP_{ID}_TAGLINE`
 *   5. `VITE_APP_NAME` / `VITE_APP_LOGO`
 *   6. 内置默认值（'CloudCAD' / '/logo.png'）
 */
import { isCollaborationAllowed as isCollaborationDomainAllowed } from '@cloudcad/platform';

const BRAND_CONFIG_URL = '/brand/config.json';

export const DEFAULT_APP_NAME = import.meta.env.VITE_APP_NAME || 'CloudCAD';
export const DEFAULT_APP_LOGO = import.meta.env.VITE_APP_LOGO || '/logo.png';

const DEFAULT_LEGAL_LANGUAGE = 'zh-CN';

const DEFAULT_COPYRIGHT_LINE = '© {year} {appName}. All rights reserved.';

/** 客服联系方式（客服弹框与法务正文共用同一组值） */
export interface BrandSupport {
  email: string;
  phone: string;
  hours: string;
}

/** 某个语言下的法务主体信息 */
export interface BrandLegalIdentity {
  entityName?: string;
}

/** 法务侧品牌字段 */
export interface BrandLegal {
  /** 产品全称（可选单值，配置后覆盖全部语言） */
  productName?: string;
  /** 产品短名，如 CloudCAD */
  productShortName: string;
  /** 签约主体：按语言配置（法务侧唯一必须本地化的字段） */
  identities: Record<string, BrandLegalIdentity>;
}

/** 合并内置默认值与 config.json 后的品牌档案（字段均为非空） */
export interface BrandProfile {
  copyrightYear: string;
  copyrightHolder: string;
  copyrightLine: string;
  support: BrandSupport;
  docsUrl: string;
  /** 侧边栏品牌副标题 */
  subtitle: string;
  legal: BrandLegal;
}

/** 法务正文解析用的品牌名 */
export interface BrandLegalNames {
  productName: string;
  entityName: string;
}

export interface AppBrandConfig {
  title: string;
  tagline: string;
  logo: string;
}

/** `/brand/config.json` 的结构（所有字段可选，缺省走内置默认值） */
export interface BrandConfig {
  title: string;
  logo: string;
  tagline?: string;
  apps?: Record<string, Partial<AppBrandConfig>>;
  copyrightYear?: string;
  copyrightHolder?: string;
  copyrightLine?: string;
  support?: Partial<BrandSupport>;
  docsUrl?: string;
  subtitle?: string;
  legal?: Partial<BrandLegal>;
}

let cachedBrandConfig: BrandConfig | null = null;
let cachedEnvAppConfigs: Record<string, Partial<AppBrandConfig>> | null = null;
// 运行时品牌覆盖（管理端改 brandProfile 后由 BrandProvider 注入），
// 与 cachedBrandConfig 同为模块级缓存：注入前计算的 getAppBrandConfig 仍是静态值，
// 因此品牌变更的生效时机是「下次加载」（后端 brandProfile 的 impact 已如此说明）。
let runtimeBrandOverride: RuntimeBrandConfig | null = null;

/** 注入运行时品牌配置（BrandProvider 在运行时配置就绪后调用） */
export function setRuntimeBrandConfig(config: RuntimeBrandConfig | null): void {
  runtimeBrandOverride = config;
}

const DEFAULT_BRAND_PROFILE: BrandProfile = {
  copyrightYear: '2026',
  copyrightHolder: 'Chengdu Dreamkaide Technology Co., Ltd.',
  copyrightLine: DEFAULT_COPYRIGHT_LINE,
  support: {
    email: '710714273@qq.com',
    phone: '17381962637',
    hours: '周一至周五 9:00-18:00',
  },
  docsUrl: 'https://help.mxdraw.com/',
  subtitle: 'CAD 协同平台',
  legal: {
    productShortName: 'CloudCAD',
    identities: {
      'zh-CN': { entityName: '成都梦想凯德科技有限公司' },
      'zh-TW': { entityName: '成都夢想凱德科技有限公司' },
      'en-US': { entityName: 'Chengdu Dreamkaide Technology Co., Ltd.' },
      'ko-KR': { entityName: '청두 드림카이드 테크놀로지 유한공사' },
    },
  },
};

/** 产品全称内置按语言值：`legal.productName` 单值缺省时使用 */
const DEFAULT_LEGAL_PRODUCT_NAMES: Record<string, string> = {
  'zh-CN': '梦想网页CAD实时协同平台',
  'zh-TW': '夢想網頁CAD即時協同平台',
  'en-US': 'Dream Web CAD Real-time Collaboration Platform',
  'ko-KR': '드림 웹 CAD 실시간 협업 플랫폼',
};

/**
 * 从环境变量构建应用品牌配置映射
 * 环境变量格式: VITE_APP_{ID}_TITLE, VITE_APP_{ID}_TAGLINE
 */
function getEnvAppConfigs(): Record<string, Partial<AppBrandConfig>> {
  if (cachedEnvAppConfigs) return cachedEnvAppConfigs;

  const configs: Record<string, Partial<AppBrandConfig>> = {};
  const env = import.meta.env;

  Object.keys(env).forEach((key) => {
    const match = key.match(/^VITE_APP_([A-Z0-9_]+)_TITLE$/);
    if (!match || !match[1]) return;
    const title = env[key];
    const tagline = env[`VITE_APP_${match[1]}_TAGLINE`];
    if (title) {
      configs[match[1].toLowerCase()] = { title, tagline: tagline || '' };
    }
  });

  cachedEnvAppConfigs = configs;
  return configs;
}

/** config.json + 运行时覆盖后的有效品牌配置（不带客服联系方式注入） */
function resolveBrandConfig(): BrandConfig {
  return mergeBrandOverrides(cachedBrandConfig, runtimeBrandOverride);
}

/**
 * 取应用品牌配置（永不返回 null）。
 * 不带 appId 时返回全局默认品牌；带 appId 时按 apps[appId] > 环境变量 > 全局 覆盖。
 */
export function getAppBrandConfig(appId?: string): AppBrandConfig {
  const config = resolveBrandConfig();
  const id = appId?.toLowerCase();
  const remote = id ? config?.apps?.[id] : undefined;
  const envApp = id ? getEnvAppConfigs()[id] : undefined;

  return {
    title: remote?.title || envApp?.title || config?.title || DEFAULT_APP_NAME,
    tagline: remote?.tagline ?? envApp?.tagline ?? config?.tagline ?? '',
    logo: remote?.logo || config?.logo || DEFAULT_APP_LOGO,
  };
}

export function getDefaultAppBrandConfig(): AppBrandConfig {
  return getAppBrandConfig();
}

/**
 * 逐语言逐字段合并签约主体：远程只覆盖它声明了的字段，
 * 不会让整个语言条目盖掉内置默认值。
 */
function mergeLegalIdentities(
  def: BrandLegal['identities'],
  remote?: Record<string, BrandLegalIdentity>
): BrandLegal['identities'] {
  const languages = new Set([
    ...Object.keys(def),
    ...(remote ? Object.keys(remote) : []),
  ]);
  const merged: BrandLegal['identities'] = {};
  languages.forEach((language) => {
    merged[language] = { ...def[language], ...remote?.[language] };
  });
  return merged;
}

/** 运行时品牌覆盖：形状同 config.json，全部字段可选（DB 里的 `brandProfile` JSON） */
export type RuntimeBrandConfig = Partial<BrandConfig>;

/** 运行时客服联系方式（`supportEmail` / `supportPhone` 运行时配置项） */
export interface RuntimeBrandContact {
  email?: string;
  phone?: string;
}

/**
 * 三层品牌配置合并：内置默认值（`getBrandProfile` 兜底）+ `/brand/config.json`
 * + 运行时 `brandProfile`（管理端可改，最高优先级）。
 *
 * 逐字段浅合并而非整块替换：只覆盖运行时声明了的字段，其余字段继续走
 * config.json 或内置默认值——否则运维只配了 copyrightHolder 就会把标语、Logo 一起清掉。
 * 客服邮箱/电话例外：以 `supportEmail` / `supportPhone` 运行时项为准，
 * `brandProfile.support` 只用于补充 hours，避免客服邮箱出现双事实源。
 */
export function mergeBrandOverrides(
  base: BrandConfig | null,
  runtime?: RuntimeBrandConfig | null,
  contact?: RuntimeBrandContact
): BrandConfig {
  const b: BrandConfig = base ?? {
    title: DEFAULT_APP_NAME,
    logo: DEFAULT_APP_LOGO,
  };

  if (!runtime || Object.keys(runtime).length === 0) return b;

  const support: Partial<BrandSupport> = { ...b.support, ...runtime.support };
  if (contact?.email) support.email = contact.email;
  if (contact?.phone) support.phone = contact.phone;

  return {
    title: runtime.title || b.title,
    logo: runtime.logo || b.logo,
    tagline: runtime.tagline ?? b.tagline,
    apps: { ...b.apps, ...runtime.apps },
    copyrightYear: runtime.copyrightYear || b.copyrightYear,
    copyrightHolder: runtime.copyrightHolder || b.copyrightHolder,
    copyrightLine: runtime.copyrightLine || b.copyrightLine,
    support,
    docsUrl: runtime.docsUrl || b.docsUrl,
    subtitle: runtime.subtitle || b.subtitle,
    legal: {
      productShortName:
        runtime.legal?.productShortName || b.legal?.productShortName,
      productName: runtime.legal?.productName || b.legal?.productName,
      identities: { ...b.legal?.identities, ...runtime.legal?.identities },
    },
  };
}

/**
 * 品牌档案唯一出口：内置默认值 + config.json 覆盖。
 * 传 `override` 可在 react-query 数据就绪时直接求值，不依赖模块级缓存时机。
 */
export function getBrandProfile(
  override: BrandConfig | null = cachedBrandConfig
): BrandProfile {
  const def = DEFAULT_BRAND_PROFILE;
  return {
    copyrightYear: override?.copyrightYear || def.copyrightYear,
    copyrightHolder: override?.copyrightHolder || def.copyrightHolder,
    copyrightLine: override?.copyrightLine || def.copyrightLine,
    support: {
      email: override?.support?.email || def.support.email,
      phone: override?.support?.phone || def.support.phone,
      hours: override?.support?.hours || def.support.hours,
    },
    docsUrl: override?.docsUrl || def.docsUrl,
    subtitle: override?.subtitle || def.subtitle,
    legal: {
      productShortName:
        override?.legal?.productShortName || def.legal.productShortName,
      productName: override?.legal?.productName,
      identities: mergeLegalIdentities(
        def.legal.identities,
        override?.legal?.identities
      ),
    },
  };
}

/**
 * 客服联系方式唯一出口，三层优先级：
 *   1. 后端运行时配置（`/api/runtime-config/public`，管理端可改）
 *   2. `/brand/config.json` 的 `support`
 *   3. 内置默认值
 */
export function resolveSupportContact(
  runtime: { supportEmail?: string; supportPhone?: string } = {}
): BrandSupport {
  const profile = getBrandProfile();
  return {
    email: runtime.supportEmail || profile.support.email,
    phone: runtime.supportPhone || profile.support.phone,
    hours: profile.support.hours,
  };
}

/**
 * 法务正文品牌名。
 * 语言兜底只作用于整个语言条目（不逐字段），顺序：
 * 当前语言 → default → zh-CN → 空串。
 */
export function getBrandLegalNames(
  language: string = DEFAULT_LEGAL_LANGUAGE
): BrandLegalNames {
  const profile = getBrandProfile();
  const identities = profile.legal.identities;

  const entityName =
    identities[language]?.entityName ||
    identities['default']?.entityName ||
    identities[DEFAULT_LEGAL_LANGUAGE]?.entityName ||
    '';

  return {
    productName:
      profile.legal.productName ||
      DEFAULT_LEGAL_PRODUCT_NAMES[language] ||
      DEFAULT_LEGAL_PRODUCT_NAMES[DEFAULT_LEGAL_LANGUAGE] ||
      '',
    entityName,
  };
}

/** 版权行：`{year}` / `{appName}` 占位符按品牌档案与传入应用名解析 */
export function getCopyrightLine(appName: string = getAppName()): string {
  const profile = getBrandProfile();
  return profile.copyrightLine
    .replace(/\{year\}/g, profile.copyrightYear)
    .replace(/\{appName\}/g, appName);
}

export async function fetchBrandConfig(): Promise<BrandConfig> {
  if (cachedBrandConfig) return cachedBrandConfig;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    // eslint-disable-next-line no-restricted-globals -- 豁免：静态品牌配置 /brand/config.json（非后端 API，AbortController 超时，ADR-0034 豁免清单）
    const res = await fetch(BRAND_CONFIG_URL, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const config = (await res.json()) as BrandConfig;
      cachedBrandConfig = config;
      return config;
    }
  } catch (e) {
    console.warn('Failed to fetch brand config, using defaults', e);
  }

  const defaultConfig: BrandConfig = {
    title: DEFAULT_APP_NAME,
    logo: DEFAULT_APP_LOGO,
  };
  cachedBrandConfig = defaultConfig;
  return defaultConfig;
}

export function getAppName(): string {
  return getAppBrandConfig().title;
}

/** API 基础路径 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

/**
 * 协同服务 URL
 * 通过后端 /api/cooperate 代理到协同服务，无需直接访问 3091 端口
 */
export const APP_COOPERATE_URL =
  import.meta.env.VITE_APP_COOPERATE_URL || '/api/cooperate';

/** 会员/支付功能开关 */
export const MEMBERSHIP_ENABLED =
  import.meta.env.VITE_MEMBERSHIP_ENABLED === 'true';

/**
 * 协同功能域名白名单检查
 * 仅允许白名单中的域名使用协同功能。
 *
 * 判定逻辑在 @cloudcad/platform 里与移动端共用一份（那里多处理了「全空白 / 只剩逗号」
 * 的脏值），这里只补上读取当前域名的薄适配，保持既有调用点的单参数签名不变。
 */
export const isCollaborationAllowed = (domains: string): boolean =>
  isCollaborationDomainAllowed(domains, window.location.hostname);

/**
 * 分页配置
 */
export const PAGINATION_CONFIG = {
  /** 默认分页大小 */
  DEFAULT_PAGE_SIZE: 20,
  /** 每页数量选项 */
  PAGE_SIZE_OPTIONS: [10, 20, 50, 100],
  /** 默认分页信息 */
  DEFAULT_PAGINATION: {
    index: 0,
    size: 20,
    count: 0,
    max: 0,
    up: false,
    down: false,
  },
} as const;

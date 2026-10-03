import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  APP_COOPERATE_URL,
  DEFAULT_APP_LOGO,
  DEFAULT_APP_NAME,
  getAppBrandConfig,
  getAppName,
  getDefaultAppBrandConfig,
  getBrandLegalNames,
  getBrandProfile,
  getCopyrightLine,
  mergeBrandOverrides,
  resolveSupportContact,
  setRuntimeBrandConfig,
  type BrandConfig,
} from './appConfig';

const SUPPORT_DEFAULTS = {
  email: '710714273@qq.com',
  phone: '17381962637',
  hours: '周一至周五 9:00-18:00',
};

describe('APP_COOPERATE_URL（协同服务 URL）', () => {
  it('必须是同源相对路径：http/https 部署形态下浏览器均按页面 origin+协议解析，公网 TLS（#408）无需改前端', () => {
    expect(APP_COOPERATE_URL).not.toMatch(/^wss?:\/\//);
    expect(APP_COOPERATE_URL.startsWith('/')).toBe(true);
  });

  it('默认指向后端代理路径 /api/cooperate（由后端 HTTP 代理转发至协同服务 3091）', () => {
    expect(APP_COOPERATE_URL).toBe('/api/cooperate');
  });
});

describe('getBrandProfile', () => {
  it('无配置时返回内置品牌档案默认值', () => {
    const profile = getBrandProfile(null);
    expect(profile.copyrightYear).toBe('2026');
    expect(profile.copyrightHolder).toBe(
      'Chengdu Dreamkaide Technology Co., Ltd.'
    );
    expect(profile.copyrightLine).toBe(
      '© {year} {appName}. All rights reserved.'
    );
    expect(profile.docsUrl).toBe('https://help.mxdraw.com/');
    expect(profile.subtitle).toBe('CAD 协同平台');
    expect(profile.legal.productShortName).toBe('CloudCAD');
    expect(profile.legal.productName).toBeUndefined();
    expect(profile.support).toEqual(SUPPORT_DEFAULTS);
  });

  it('config.json 字段覆盖内置默认值', () => {
    const profile = getBrandProfile({
      title: '标题',
      logo: '/logo.png',
      copyrightYear: '2025',
      copyrightHolder: 'Holder Inc.',
      copyrightLine: '© {year} {appName} — 保留所有权利',
      docsUrl: 'https://docs.example.com/',
      subtitle: '新副标题',
    });
    expect(profile.copyrightYear).toBe('2025');
    expect(profile.copyrightHolder).toBe('Holder Inc.');
    expect(profile.copyrightLine).toBe('© {year} {appName} — 保留所有权利');
    expect(profile.docsUrl).toBe('https://docs.example.com/');
    expect(profile.subtitle).toBe('新副标题');
  });

  it('空串等同未配置，回落内置默认值', () => {
    const profile = getBrandProfile({
      title: '标题',
      logo: '/logo.png',
      copyrightYear: '',
      subtitle: '',
      support: { email: '', phone: '', hours: '' },
    });
    expect(profile.copyrightYear).toBe('2026');
    expect(profile.subtitle).toBe('CAD 协同平台');
    expect(profile.support).toEqual(SUPPORT_DEFAULTS);
  });

  it('support 逐字段回落：只配 email 时 phone/hours 用内置值', () => {
    const profile = getBrandProfile({
      title: '标题',
      logo: '/logo.png',
      support: { email: 'new@x.com' },
    });
    expect(profile.support.email).toBe('new@x.com');
    expect(profile.support.phone).toBe(SUPPORT_DEFAULTS.phone);
    expect(profile.support.hours).toBe(SUPPORT_DEFAULTS.hours);
  });

  it('legal.identities 逐语言逐字段合并：远程空条目不覆盖内置语言', () => {
    const profile = getBrandProfile({
      title: '标题',
      logo: '/logo.png',
      legal: { identities: { 'en-US': {}, 'zh-CN': { entityName: '远程主体' } } },
    });
    expect(profile.legal.identities['en-US']?.entityName).toBe(
      'Chengdu Dreamkaide Technology Co., Ltd.'
    );
    expect(profile.legal.identities['zh-CN']?.entityName).toBe('远程主体');
  });

  it('legal.identities 支持新增语言条目且保留内置语言', () => {
    const profile = getBrandProfile({
      title: '标题',
      logo: '/logo.png',
      legal: { identities: { 'ja-JP': { entityName: '株式会社' } } },
    });
    expect(Object.keys(profile.legal.identities).sort()).toEqual([
      'en-US',
      'ja-JP',
      'ko-KR',
      'zh-CN',
      'zh-TW',
    ]);
    expect(profile.legal.identities['ja-JP']?.entityName).toBe('株式会社');
    expect(profile.legal.identities['zh-TW']?.entityName).toBe(
      '成都夢想凱德科技有限公司'
    );
  });

  it('legal.productName 与 productShortName 覆盖内置值', () => {
    const profile = getBrandProfile({
      title: '标题',
      logo: '/logo.png',
      legal: { productName: '统一产品全称', productShortName: 'Short' },
    });
    expect(profile.legal.productName).toBe('统一产品全称');
    expect(profile.legal.productShortName).toBe('Short');
  });
});

describe('getAppBrandConfig（5 层优先级，永不返回 null）', () => {
  it('不带 appId 时返回全局默认品牌（环境变量优先于硬编码）', () => {
    expect(getAppBrandConfig()).toEqual({
      title: DEFAULT_APP_NAME,
      tagline: '',
      logo: DEFAULT_APP_LOGO,
    });
  });

  it('未注册 appId 回落全局默认，不返回 null', () => {
    expect(getAppBrandConfig('unregistered-app')).toEqual({
      title: DEFAULT_APP_NAME,
      tagline: '',
      logo: DEFAULT_APP_LOGO,
    });
  });

  it('默认品牌与不带 appId 的调用等价', () => {
    expect(getDefaultAppBrandConfig()).toEqual(getAppBrandConfig());
  });
});

describe('mergeBrandOverrides（运行时 brandProfile 覆盖）', () => {
  const base: BrandConfig = {
    title: '静态品牌',
    logo: '/static-logo.png',
    tagline: '静态标语',
    subtitle: '静态副标题',
    docsUrl: 'https://static.example/',
    support: { email: 'base@x.com', phone: '100', hours: '静态服务时间' },
    legal: {
      productShortName: '静态短名',
      identities: {
        'zh-CN': { entityName: '静态主体' },
        'en-US': { entityName: 'Static entity' },
      },
    },
  };

  it('运行时为空对象时原样返回 base，不做任何覆盖', () => {
    expect(mergeBrandOverrides(base, {})).toEqual(base);
    expect(mergeBrandOverrides(null, {})).toEqual({
      title: DEFAULT_APP_NAME,
      logo: DEFAULT_APP_LOGO,
    });
  });

  it('逐字段浅合并：只覆盖声明了的字段，其余保留 base', () => {
    const merged = mergeBrandOverrides(base, { subtitle: '运行时副标题' });
    expect(merged.subtitle).toBe('运行时副标题');
    expect(merged.title).toBe('静态品牌');
    expect(merged.tagline).toBe('静态标语');
    expect(merged.docsUrl).toBe('https://static.example/');
    expect(merged.support.hours).toBe('静态服务时间');
  });

  it('客服邮箱以 supportEmail 运行时项为准，高于 brandProfile.support', () => {
    const merged = mergeBrandOverrides(
      base,
      { support: { email: 'brand@x.com', hours: '运行时服务时间' } },
      { email: 'runtime@x.com' }
    );
    expect(merged.support.email).toBe('runtime@x.com');
    // 运行时 supportEmail 未设置时回落 brandProfile，再回落 base
    expect(merged.support.phone).toBe('100');
    expect(merged.support.hours).toBe('运行时服务时间');
  });

  it('brandProfile.support.hours 可用于补充服务时间', () => {
    const merged = mergeBrandOverrides(base, {
      support: { hours: '7x24' },
    });
    expect(merged.support.hours).toBe('7x24');
    expect(merged.support.email).toBe('base@x.com');
  });

  it('legal.identities 按语言浅合并，不整块替换', () => {
    const merged = mergeBrandOverrides(base, {
      legal: { identities: { 'zh-CN': { entityName: '运行时主体' } } },
    });
    expect(merged.legal.identities?.['zh-CN']).toEqual({
      entityName: '运行时主体',
    });
    expect(merged.legal.identities?.['en-US']).toEqual({
      entityName: 'Static entity',
    });
  });

  it('base 为空时运行时字段直接生效，缺失字段回落内置默认值', () => {
    const merged = mergeBrandOverrides(null, { title: '运行时品牌' });
    expect(merged.title).toBe('运行时品牌');
    expect(merged.logo).toBe(DEFAULT_APP_LOGO);
  });
});

describe('getAppBrandConfig 的运行时覆盖层', () => {
  afterEach(() => {
    setRuntimeBrandConfig(null);
  });

  it('未注入运行时配置时保持静态值', () => {
    expect(getAppBrandConfig().title).toBe(DEFAULT_APP_NAME);
  });

  it('注入运行时配置后 getAppBrandConfig / getAppName 读到覆盖值', () => {
    setRuntimeBrandConfig({ title: '运行时品牌名' });
    expect(getAppBrandConfig().title).toBe('运行时品牌名');
    expect(getAppName()).toBe('运行时品牌名');
  });

  it('清除运行时配置后回落到静态值', () => {
    setRuntimeBrandConfig({ title: '运行时品牌名' });
    setRuntimeBrandConfig(null);
    expect(getAppBrandConfig().title).toBe(DEFAULT_APP_NAME);
  });
});

describe('resolveSupportContact（三层优先级）', () => {
  it('无运行时配置时返回品牌档案内置联系方式', () => {
    expect(resolveSupportContact()).toEqual(SUPPORT_DEFAULTS);
  });

  it('后端运行时配置优先于品牌档案', () => {
    const contact = resolveSupportContact({
      supportEmail: 'runtime@x.com',
      supportPhone: '12345',
    });
    expect(contact.email).toBe('runtime@x.com');
    expect(contact.phone).toBe('12345');
    expect(contact.hours).toBe(SUPPORT_DEFAULTS.hours);
  });

  it('运行时只给 email 时 phone 回落品牌档案', () => {
    const contact = resolveSupportContact({ supportEmail: 'only@x.com' });
    expect(contact.email).toBe('only@x.com');
    expect(contact.phone).toBe(SUPPORT_DEFAULTS.phone);
  });

  it('hours 不受运行时配置影响（只在配置中心维护）', () => {
    const contact = resolveSupportContact({
      supportEmail: 'x@x.com',
      supportPhone: '1',
    });
    expect(contact.hours).toBe(resolveSupportContact().hours);
  });
});

describe('getBrandLegalNames', () => {
  it('四语言各自返回内置签约主体', () => {
    expect(getBrandLegalNames('zh-CN').entityName).toBe(
      '成都梦想凯德科技有限公司'
    );
    expect(getBrandLegalNames('zh-TW').entityName).toBe(
      '成都夢想凱德科技有限公司'
    );
    expect(getBrandLegalNames('en-US').entityName).toBe(
      'Chengdu Dreamkaide Technology Co., Ltd.'
    );
    expect(getBrandLegalNames('ko-KR').entityName).toBe(
      '청두 드림카이드 테크놀로지 유한공사'
    );
  });

  it('未配置语言回落到 zh-CN 条目', () => {
    expect(getBrandLegalNames('fr-FR').entityName).toBe(
      getBrandLegalNames('zh-CN').entityName
    );
  });

  it('缺省参数按 zh-CN 解析', () => {
    expect(getBrandLegalNames()).toEqual(getBrandLegalNames('zh-CN'));
  });

  it('产品全称按语言返回内置值，未配置语言回落 zh-CN', () => {
    expect(getBrandLegalNames('en-US').productName).toBe(
      'Dream Web CAD Real-time Collaboration Platform'
    );
    expect(getBrandLegalNames('fr-FR').productName).toBe(
      getBrandLegalNames('zh-CN').productName
    );
  });
});

describe('getCopyrightLine', () => {
  it('默认模板逐字解析 {year} / {appName}', () => {
    expect(getCopyrightLine('CloudCAD')).toBe(
      '© 2026 CloudCAD. All rights reserved.'
    );
  });

  it('缺省 appName 取 getAppName()', () => {
    expect(getCopyrightLine()).toBe(
      `© 2026 ${getAppName()}. All rights reserved.`
    );
  });
});

describe('fetchBrandConfig（config.json 生效后的全链覆盖）', () => {
  const cleanup = () => {
    vi.unstubAllGlobals();
    vi.resetModules();
  };

  it('apps[appId] 覆盖全局 title/logo，未覆盖字段回落全局', async () => {
    cleanup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          title: '全局标题',
          logo: '/global-logo.png',
          apps: { demo: { title: '应用标题', logo: '/demo-logo.png' } },
        }),
      })
    );

    try {
      const mod = await import('./appConfig');
      await mod.fetchBrandConfig();
      expect(mod.getAppBrandConfig('demo')).toEqual({
        title: '应用标题',
        tagline: '',
        logo: '/demo-logo.png',
      });
      expect(mod.getDefaultAppBrandConfig()).toEqual({
        title: '全局标题',
        tagline: '',
        logo: '/global-logo.png',
      });
      expect(mod.getAppName()).toBe('全局标题');
    } finally {
      cleanup();
    }
  }, 10000);

  it('自定义 copyrightLine / copyrightYear / legal.productName 全链生效', async () => {
    cleanup();
    const config: BrandConfig = {
      title: '全局标题',
      logo: '/global-logo.png',
      copyrightYear: '2025',
      copyrightLine: '© {year} {appName} — 保留所有权利',
      legal: { productName: '统一产品全称' },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => config })
    );

    try {
      const mod = await import('./appConfig');
      await mod.fetchBrandConfig();
      expect(mod.getCopyrightLine('AppX')).toBe(
        '© 2025 AppX — 保留所有权利'
      );
      // legal.productName 是单值，配置后覆盖全部语言
      expect(mod.getBrandLegalNames('en-US').productName).toBe('统一产品全称');
      expect(mod.getBrandLegalNames('zh-CN').productName).toBe('统一产品全称');
      // 未配置的语言条目仍按内置逐语言值
      expect(mod.getBrandLegalNames('ko-KR').entityName).toBe(
        '청두 드림카이드 테크놀로지 유한공사'
      );
    } finally {
      cleanup();
    }
  }, 10000);

  it('config.json 请求失败时回落内置默认品牌', async () => {
    cleanup();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));

    try {
      const mod = await import('./appConfig');
      await mod.fetchBrandConfig();
      expect(mod.getAppBrandConfig().title).toBe(DEFAULT_APP_NAME);
      expect(mod.getAppBrandConfig().logo).toBe(DEFAULT_APP_LOGO);
    } finally {
      cleanup();
    }
  }, 10000);
});

import { describe, expect, it } from 'vitest';

import { resolveLegalText } from './legalText';
import type { BrandSupport } from '@/constants/appConfig';

describe('resolveLegalText', () => {
  it('替换全部 5 个品牌占位符', () => {
    const out = resolveLegalText(
      '{{productName}}（{{productShortName}}）由{{entityName}}运营，电话{{supportPhone}}，邮箱{{supportEmail}}'
    );
    expect(out).toBe(
      '梦想网页CAD实时协同平台（CloudCAD）由成都梦想凯德科技有限公司运营，电话17381962637，邮箱710714273@qq.com'
    );
  });

  it('language 决定 entityName 与 productName', () => {
    const out = resolveLegalText('{{entityName}} / {{productName}}', 'en-US');
    expect(out).toBe(
      'Chengdu Dreamkaide Technology Co., Ltd. / Dream Web CAD Real-time Collaboration Platform'
    );
  });

  it('未配置语言回落到 zh-CN', () => {
    expect(resolveLegalText('{{entityName}}', 'fr-FR')).toBe(
      resolveLegalText('{{entityName}}', 'zh-CN')
    );
  });

  it('support 第三参数覆盖联系方式', () => {
    const support: BrandSupport = {
      email: 'a@b.com',
      phone: '123',
      hours: '全天',
    };
    expect(
      resolveLegalText('{{supportEmail}} / {{supportPhone}}', undefined, support)
    ).toBe('a@b.com / 123');
  });

  it('未知占位符原样保留，显式暴露配置漏项', () => {
    expect(resolveLegalText('{{unknownVar}}')).toBe('{{unknownVar}}');
  });

  it('i18n 单花括号 flexvars 不做替换', () => {
    expect(resolveLegalText('{productName}')).toBe('{productName}');
  });

  it('占位符两侧空白容忍', () => {
    expect(resolveLegalText('{{ entityName }}')).toContain('成都梦想凯德科技有限公司');
  });
});

describe('真实法务正文：4 语言 × 2 文档解析后无残留占位符', () => {
  const cases = [
    ['zh-CN', 'legal-terms'],
    ['zh-CN', 'legal-privacy'],
    ['zh-TW', 'legal-terms'],
    ['zh-TW', 'legal-privacy'],
    ['en-US', 'legal-terms'],
    ['en-US', 'legal-privacy'],
    ['ko-KR', 'legal-terms'],
    ['ko-KR', 'legal-privacy'],
  ] as const;

  it.each(cases)('%s / %s', async (language, doc) => {
    const mod = await import(`@/languages/paragraphs/${language}/${doc}`);
    const raw = String(mod.default);

    // 文案源非空，防止 import 到空模块造成假通过
    expect(raw.length).toBeGreaterThan(100);

    const out = resolveLegalText(raw, language);
    expect(out).not.toMatch(/\{\{[a-zA-Z]/);
    // 两份文档都带客服联系方式
    expect(out).toContain('17381962637');
    expect(out).toContain('710714273@qq.com');

    if (doc === 'legal-terms') {
      expect(out).toContain('CloudCAD');
      expect(out).toContain(resolveLegalText('{{entityName}}', language));
      expect(out).toContain(resolveLegalText('{{productName}}', language));
    }
  });
});

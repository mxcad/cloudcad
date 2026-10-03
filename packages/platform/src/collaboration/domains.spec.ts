import { describe, expect, it } from 'vitest';

import { isCollaborationAllowed } from './domains';

describe('@cloudcad/platform · collaboration/domains', () => {
  it('白名单为空 = 不限制（运行时配置默认值）', () => {
    expect(isCollaborationAllowed('', 'anything.example.com')).toBe(true);
  });

  it('命中白名单才放行，大小写不敏感', () => {
    expect(isCollaborationAllowed('mx.example.com', 'mx.example.com')).toBe(true);
    expect(isCollaborationAllowed('MX.Example.COM', 'mx.example.com')).toBe(true);
    expect(isCollaborationAllowed('other.example.com', 'mx.example.com')).toBe(false);
  });

  it('逗号分隔多项，并容忍每项两侧空白', () => {
    const domains = ' a.example.com , b.example.com ';
    expect(isCollaborationAllowed(domains, 'a.example.com')).toBe(true);
    expect(isCollaborationAllowed(domains, 'b.example.com')).toBe(true);
    expect(isCollaborationAllowed(domains, 'c.example.com')).toBe(false);
  });

  it('全空白 / 只剩逗号的脏值按「不限制」处理，避免误拦全网', () => {
    expect(isCollaborationAllowed('   ', 'x.example.com')).toBe(true);
    expect(isCollaborationAllowed(',', 'x.example.com')).toBe(true);
    expect(isCollaborationAllowed(', ,', 'x.example.com')).toBe(true);
  });

  it('不匹配子域或包含关系（精确匹配，不做后缀匹配）', () => {
    expect(isCollaborationAllowed('mx.example.com', 'evil-mx.example.com')).toBe(false);
    expect(isCollaborationAllowed('mx.example.com', 'sub.mx.example.com')).toBe(false);
  });
});

import { matchScrapeCredentials, safeEqualString } from './scrape-token';

describe('safeEqualString', () => {
  it('相同字符串返回 true', () => {
    expect(safeEqualString('abc-token', 'abc-token')).toBe(true);
  });

  it('不同字符串返回 false', () => {
    expect(safeEqualString('abc-token', 'abd-token')).toBe(false);
  });

  it('长度不同返回 false（不抛异常）', () => {
    expect(safeEqualString('short', 'a-much-longer-value')).toBe(false);
  });
});

describe('matchScrapeCredentials', () => {
  const TOKEN = 's3cret-scrape-token';

  describe('Bearer 认证', () => {
    it('Bearer 令牌匹配返回 true', () => {
      expect(
        matchScrapeCredentials(`Bearer ${TOKEN}`, TOKEN),
      ).toBe(true);
    });

    it('Bearer 令牌不匹配返回 false', () => {
      expect(matchScrapeCredentials('Bearer wrong-token', TOKEN)).toBe(false);
    });

    it('Bearer 空令牌返回 false', () => {
      expect(matchScrapeCredentials('Bearer ', TOKEN)).toBe(false);
    });
  });

  describe('Basic 认证（Prometheus basic_auth：密码字段比对令牌，用户名任意）', () => {
    const encode = (plain: string) =>
      Buffer.from(plain, 'utf8').toString('base64');

    it('密码字段等于令牌返回 true', () => {
      expect(matchScrapeCredentials(`Basic ${encode('prometheus:' + TOKEN)}`, TOKEN)).toBe(
        true,
      );
    });

    it('用户名可省略（":token" 形式）', () => {
      expect(matchScrapeCredentials(`Basic ${encode(':' + TOKEN)}`, TOKEN)).toBe(
        true,
      );
    });

    it('密码字段不匹配返回 false', () => {
      expect(
        matchScrapeCredentials(`Basic ${encode('prometheus:wrong')}`, TOKEN),
      ).toBe(false);
    });

    it('无冒号分隔符返回 false', () => {
      expect(matchScrapeCredentials(`Basic ${encode('no-separator')}`, TOKEN)).toBe(
        false,
      );
    });
  });

  describe('非法输入', () => {
    it('undefined Authorization 返回 false', () => {
      expect(matchScrapeCredentials(undefined, TOKEN)).toBe(false);
    });

    it('其他认证方案返回 false', () => {
      expect(matchScrapeCredentials(`Digest ${TOKEN}`, TOKEN)).toBe(false);
    });

    it('服务端未配置令牌返回 false', () => {
      expect(matchScrapeCredentials(`Bearer ${TOKEN}`, '')).toBe(false);
    });
  });
});

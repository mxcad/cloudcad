import { describe, expect, it } from 'vitest';

import {
  AUTH_TRANSFER_QUERY,
  MOBILE_TO_PC_ALIASES,
  NON_MAPPABLE_PC_PREFIXES,
  ROUTE_ALIASES,
  authTransferParamNames,
  buildAuthTransferQuery,
  isMappableRoute,
  isMobileByUA,
  isTouchDevice,
  isWechatByUA,
  parseAuthTransferQuery,
  resolveMobileRoute,
  resolvePcPath,
  shouldUseMobilePresentation,
} from './index';
import {
  compilePathPattern,
  matchPathPattern,
  renderPathPattern,
} from './routes/match';
import { parseSearch } from './routes/resolve';

describe('@cloudcad/platform · env/device', () => {
  const UA = {
    iPhone:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    // iPad 桌面版 Safari 会伪装成 Mac——UA 里根本没有 iPad 字样，
    // 所以它判为桌面是正确行为，不是漏判。
    iPadDesktop:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15',
    iPad:
      'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    desktopChrome:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    androidWebView:
      'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Mobile Safari/537.36',
    // 只带 Mobi 不带机型名的自定义浏览器。
    // 收敛前 PC 端两份正则有分歧：isMobile.ts 认不出它，WechatPayButton.tsx 认得出。
    mobiOnly:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36 Mobi/MyBrowser',
    wechat:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.50 NetType/WIFI',
    empty: '',
  };

  it('recognizes mobile UAs including the Mobi-only case the old regexes disagreed on', () => {
    for (const key of ['iPhone', 'iPad', 'androidWebView', 'mobiOnly'] as const) {
      expect(isMobileByUA(UA[key]), key).toBe(true);
    }
  });

  it('does not misclassify desktop browsers or iPad desktop mode', () => {
    for (const key of ['desktopChrome', 'iPadDesktop', 'empty'] as const) {
      expect(isMobileByUA(UA[key]), key).toBe(false);
    }
  });

  it('detects wechat inbuilt browser', () => {
    expect(isWechatByUA(UA.wechat)).toBe(true);
    expect(isWechatByUA(UA.desktopChrome)).toBe(false);
    expect(isWechatByUA(UA.iPhone)).toBe(false);
  });

  it('treats touch support as a hint only', () => {
    expect(isTouchDevice(5)).toBe(true);
    expect(isTouchDevice(0)).toBe(false);
    expect(isTouchDevice(undefined)).toBe(false);
  });

  it('keeps wide mobile devices on the desktop presentation', () => {
    expect(
      shouldUseMobilePresentation({ ua: UA.iPhone, width: 390 })
    ).toBe(true);
    // 大屏 Android 平板 / iPad Pro 分屏：UA 是移动设备，但用户在用桌面姿态
    expect(shouldUseMobilePresentation({ ua: UA.iPhone, width: 1280 })).toBe(
      false
    );
    // 宽屏阈值恰好落在 1024
    expect(
      shouldUseMobilePresentation({ ua: UA.iPad, width: 1024 })
    ).toBe(false);
    expect(
      shouldUseMobilePresentation({ ua: UA.iPad, width: 1023 })
    ).toBe(true);
  });

  it('falls back to UA alone when viewport width is unknown', () => {
    expect(shouldUseMobilePresentation({ ua: UA.androidWebView })).toBe(true);
    expect(
      shouldUseMobilePresentation({ ua: UA.desktopChrome, width: 1920 })
    ).toBe(false);
  });
});

describe('@cloudcad/platform · routes/match', () => {
  it('matches named params', () => {
    const pattern = compilePathPattern('/projects/:projectId/files/:nodeId');
    expect(matchPathPattern(pattern, '/projects/p1/files/n2')).toEqual({
      projectId: 'p1',
      nodeId: 'n2',
    });
  });

  it('requires an exact segment count', () => {
    const pattern = compilePathPattern('/projects/:projectId/files');
    expect(matchPathPattern(pattern, '/projects/p1/files')).toEqual({
      projectId: 'p1',
    });
    expect(matchPathPattern(pattern, '/projects/p1/files/n2')).toBeNull();
    expect(matchPathPattern(pattern, '/projects')).toBeNull();
    expect(matchPathPattern(pattern, '/other/p1/files')).toBeNull();
  });

  it('round-trips a pattern through its params', () => {
    const pattern = compilePathPattern('/projects/:projectId/files');
    expect(renderPathPattern(pattern, { projectId: 'p1' })).toBe(
      '/projects/p1/files'
    );
  });

  it('renders missing params as an empty segment', () => {
    const pattern = compilePathPattern('/a/:b/c');
    expect(renderPathPattern(pattern, {})).toBe('/a//c');
  });
});

describe('@cloudcad/platform · routes/resolve', () => {
  it('parses search strings tolerating a leading ? and empty values', () => {
    expect(parseSearch(undefined)).toEqual({});
    expect(parseSearch('')).toEqual({});
    expect(parseSearch('?')).toEqual({});
    expect(parseSearch('?a=1&b=2')).toEqual({ a: '1', b: '2' });
    expect(parseSearch('a=1&b=2')).toEqual({ a: '1', b: '2' });
    expect(parseSearch('a=1&&b=2')).toEqual({ a: '1', b: '2' });
    expect(parseSearch('flag')).toEqual({ flag: '' });
    expect(parseSearch('%E4%BD%A0=ok')).toEqual({ 你: 'ok' });
    // 畸形编码不抛错，保持原样
    expect(parseSearch('a=%E4')).toEqual({ a: '%E4' });
  });

  it('maps every declared alias to its mobile target', () => {
    for (const entry of ROUTE_ALIASES) {
      // 用占位值渲染 pcPath，再断言解析结果的 path 形状等于渲染后的 mobilePath
      const placeholderValues = (
        pattern: ReturnType<typeof compilePathPattern>
      ): Record<string, string> =>
        Object.fromEntries(
          pattern
            .filter((s): s is { param: string } => typeof s === 'object')
            .map((s) => [s.param, `x_${s.param}`])
        );

      const concretePcPath = renderPathPattern(
        entry.pcPattern,
        placeholderValues(entry.pcPattern)
      );
      const expectedMobilePath = renderPathPattern(
        entry.mobilePattern,
        placeholderValues(entry.mobilePattern)
      );

      const resolved = resolveMobileRoute({ pcPathname: concretePcPath });
      expect(resolved, entry.pcPath).not.toBeNull();
      expect(resolved?.path, entry.pcPath).toBe(expectedMobilePath);
    }
  });

  it('hoists path params into query as declared', () => {
    expect(
      resolveMobileRoute({ pcPathname: '/cad-editor/abc-123' })
    ).toEqual({ path: '/shell', query: { fileId: 'abc-123' } });

    expect(
      resolveMobileRoute({
        pcPathname: '/projects/p1/files/n2',
        pcSearch: '?v=3',
      })
    ).toEqual({
      path: '/shell/file/project/p1',
      query: { v: '3', nodeId: 'n2' },
    });

    expect(
      resolveMobileRoute({ pcPathname: '/personal-space/n9' })
    ).toEqual({
      path: '/shell/file',
      query: { domain: 'personal', nodeId: 'n9' },
    });

    expect(
      resolveMobileRoute({ pcPathname: '/library/drawing/d1' })
    ).toEqual({
      path: '/shell',
      query: { library: 'drawing', fileId: 'd1' },
    });
  });

  it('preserves user context query while applying fixed and hoisted fields', () => {
    expect(
      resolveMobileRoute({
        pcPathname: '/cad-editor/f1',
        pcSearch: '?shareToken=st&fileName=dwg&back=%2Fprojects',
      })
    ).toEqual({
      path: '/shell',
      query: {
        shareToken: 'st',
        fileName: 'dwg',
        back: '/projects',
        fileId: 'f1',
      },
    });
  });

  it('keeps semantic fixedQuery winning over an incoming user query', () => {
    // 语义固有属性（个人空间域）不能被用户在 query 里伪造
    expect(
      resolveMobileRoute({
        pcPathname: '/personal-space/n1',
        pcSearch: '?domain=project',
      })
    ).toEqual({
      path: '/shell/file',
      query: { domain: 'personal', nodeId: 'n1' },
    });
  });

  it('maps auth pages onto themselves', () => {
    for (const path of [
      '/login',
      '/register',
      '/verify-email',
      '/verify-phone',
      '/forgot-password',
      '/reset-password',
    ]) {
      expect(resolveMobileRoute({ pcPathname: path })).toEqual({
        path,
        query: {},
      });
    }
  });

  it('returns null for unknown paths', () => {
    expect(resolveMobileRoute({ pcPathname: '/totally-unknown' })).toBeNull();
  });

  it('never maps desktop admin surfaces', () => {
    expect(NON_MAPPABLE_PC_PREFIXES.length).toBeGreaterThan(0);
    for (const prefix of NON_MAPPABLE_PC_PREFIXES) {
      expect(isMappableRoute(`${prefix}/anything`), prefix).toBe(false);
      expect(resolveMobileRoute({ pcPathname: `${prefix}/anything` })).toBe(
        null
      );
    }
    // /shares 是公开分享管理页，必须可映射；/share（单数，移动端死链形态）不在表内
    expect(isMappableRoute('/shares')).toBe(true);
    expect(isMappableRoute('/share/token-abc')).toBe(false);
  });

  it('reverse-resolves mobile pages back to PC canonical paths', () => {
    for (const entry of MOBILE_TO_PC_ALIASES) {
      const concrete = renderPathPattern(
        entry.mobilePattern,
        Object.fromEntries(
          entry.mobilePattern
            .filter((s): s is { param: string } => typeof s === 'object')
            .map((s) => [s.param, 'x'])
        )
      );
      expect(resolvePcPath({ mobilePathname: concrete }), entry.mobilePath).toBe(
        entry.pcPath.replace(':projectId', 'x')
      );
    }
    expect(resolvePcPath({ mobilePathname: '/shell/profile' })).toBe('/profile');
    expect(resolvePcPath({ mobilePathname: '/shell' })).toBe('/cad-editor');
    expect(resolvePcPath({ mobilePathname: '/unknown' })).toBeNull();
  });
});

describe('@cloudcad/platform · env/auth-transfer', () => {
  it('round-trips credentials through a query source', () => {
    const built = buildAuthTransferQuery(
      { accessToken: 'at', refreshToken: 'rt', user: '{"id":1}' },
      { markRedirect: true }
    );

    expect(built).toEqual({
      accessToken: 'at',
      refreshToken: 'rt',
      user: '{"id":1}',
      _redirect: '1',
    });

    const parsed = parseAuthTransferQuery(new URLSearchParams(built));
    expect(parsed.isRedirect).toBe(true);
    expect(parsed.credentials).toEqual({
      accessToken: 'at',
      refreshToken: 'rt',
      user: '{"id":1}',
    });
  });

  it('omits optional credentials and the redirect marker when not requested', () => {
    expect(
      buildAuthTransferQuery({ accessToken: 'at' }, {})
    ).toEqual({ accessToken: 'at' });

    expect(
      buildAuthTransferQuery({ accessToken: 'at', refreshToken: 'rt' }, {
        markRedirect: false,
      })
    ).toEqual({ accessToken: 'at', refreshToken: 'rt' });
  });

  it('returns no credentials for an empty query but still reports the marker', () => {
    const parsed = parseAuthTransferQuery(new URLSearchParams('_redirect=1'));
    expect(parsed.credentials).toBeNull();
    expect(parsed.isRedirect).toBe(true);

    expect(parseAuthTransferQuery(new URLSearchParams('a=b'))).toEqual({
      credentials: null,
      isRedirect: false,
    });
  });

  it('does not fabricate a redirect marker from any truthy value', () => {
    expect(
      parseAuthTransferQuery(
        new URLSearchParams(`${AUTH_TRANSFER_QUERY.isRedirect}=true`)
      ).isRedirect
    ).toBe(false);
  });

  it('exposes the exact transfer param names for URL scrubbing', () => {
    expect([...authTransferParamNames()].sort()).toEqual([
      AUTH_TRANSFER_QUERY.isRedirect,
      AUTH_TRANSFER_QUERY.accessToken,
      AUTH_TRANSFER_QUERY.refreshToken,
      AUTH_TRANSFER_QUERY.user,
    ]);
  });
});

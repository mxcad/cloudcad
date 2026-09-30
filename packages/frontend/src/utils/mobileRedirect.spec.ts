/**
 * mobileRedirect 的纯函数测试——只覆盖不吃 `getConfig` 的部分。
 *
 * `performMobileRedirectIfNeeded` / `getMobileRedirectConfig` 依赖网络与
 * `location.replace`，走 jsdom 模拟收益低，不在此覆盖。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/getConfig', () => ({
  getConfig: vi.fn(),
}));

import {
  buildMobilePassthroughUrl,
  getMobileAccessPath,
  isMobileAccessPath,
} from './mobileRedirect';

beforeEach(() => {
  // getMobileBaseUrl 在 DEV 下固定指向移动端 dev server，这里测的是生产分支
  vi.stubEnv('DEV', false);
});

describe('isMobileAccessPath', () => {
  it('matches the access path itself and its children', () => {
    expect(isMobileAccessPath('/mxcad_mobile', 'mxcad_mobile')).toBe(true);
    expect(isMobileAccessPath('/mxcad_mobile/', 'mxcad_mobile')).toBe(true);
    expect(isMobileAccessPath('/mxcad_mobile/?a=1', 'mxcad_mobile')).toBe(
      true
    );
  });

  it('does not match a mere prefix of the access path', () => {
    // /mxcad_mobilex 不是 /mxcad_mobile 的子路径
    expect(isMobileAccessPath('/mxcad_mobilex', 'mxcad_mobile')).toBe(false);
    expect(isMobileAccessPath('/mxcad_mobilez/', 'mxcad_mobile')).toBe(false);
  });

  it('honours a configured access path', () => {
    expect(isMobileAccessPath('/app_mobile', 'app_mobile')).toBe(true);
    expect(isMobileAccessPath('/mxcad_mobile', 'app_mobile')).toBe(false);
  });

  it('returns false for ordinary PC paths', () => {
    for (const path of [
      '/',
      '/cad-editor',
      '/projects',
      '/shell/file',
    ]) {
      expect(isMobileAccessPath(path, 'mxcad_mobile')).toBe(false);
    }
  });
});

describe('getMobileAccessPath', () => {
  it('falls back to mxcad_mobile', () => {
    expect(getMobileAccessPath(undefined)).toBe('mxcad_mobile');
    expect(getMobileAccessPath({})).toBe('mxcad_mobile');
  });

  it('uses the configured value', () => {
    expect(getMobileAccessPath({ mobileAccessPath: 'app_mobile' })).toBe(
      'app_mobile'
    );
  });
});

describe('buildMobilePassthroughUrl', () => {
  it('keeps path, search and hash untouched on the same origin', () => {
    const url = buildMobilePassthroughUrl(undefined, {
      pathname: '/mxcad_mobile',
      search: '?fileId=f1&v=3',
      hash: '#/shell/file',
    });

    expect(url).toBe(
      `${window.location.origin}/mxcad_mobile?fileId=f1&v=3#/shell/file`
    );
  });

  it('moves the URL to the configured mobile origin when it differs', () => {
    const url = buildMobilePassthroughUrl(
      { mobilePageUrl: 'https://m.example.com/mxcad_mobile/' },
      { pathname: '/mxcad_mobile', search: '?fileId=f1', hash: '#/shell/share' }
    );

    // base 的 pathname 原样保留（含结尾斜杠）
    expect(url).toBe(
      'https://m.example.com/mxcad_mobile/?fileId=f1#/shell/share'
    );
  });

  it('does not repeat the PC sub-path when the mobile site is served at root', () => {
    // PC 在 /mxcad_mobile 子路径，移动端站点却部署在另一台主机的根路径
    const url = buildMobilePassthroughUrl(
      { mobilePageUrl: 'https://m.example.com/' },
      { pathname: '/mxcad_mobile', search: '', hash: '#/shell/share' }
    );

    expect(url).toBe('https://m.example.com/#/shell/share');
  });

  it('returns null when the configured base is not a valid URL', () => {
    expect(
      buildMobilePassthroughUrl({ mobilePageUrl: 'http://[invalid' }, {
        pathname: '/mxcad_mobile',
        search: '',
        hash: '',
      })
    ).toBe(null);
  });
});

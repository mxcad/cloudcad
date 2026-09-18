import { describe, it, expect, beforeEach } from 'vitest';
import {
  isDesktopOriginUrl,
  markDesktopOrigin,
  isDesktopOrigin,
} from './desktopOrigin';

describe('isDesktopOriginUrl', () => {
  it('识别桌面端 EXE 打开的 4 类入口 URL', () => {
    expect(
      isDesktopOriginUrl(
        '/logo',
        '?redirect_uri=http://127.0.0.1:8080/callback&state=abc'
      )
    ).toBe(true);
    expect(
      isDesktopOriginUrl('/device', '?user_code=ABCD-1234&client_id=mx_cad_viewer')
    ).toBe(true);
    expect(
      isDesktopOriginUrl('/session-transfer', '?token=tok&redirect=%2Fprofile')
    ).toBe(true);
    expect(isDesktopOriginUrl('/member-center', '?auto=1')).toBe(true);
  });

  it('不误判非桌面端 URL', () => {
    // /logo 缺 redirect_uri 参数
    expect(isDesktopOriginUrl('/logo', '')).toBe(false);
    // 普通登录页带 redirect_uri 不算桌面端入口
    expect(
      isDesktopOriginUrl(
        '/login',
        '?redirect_uri=http://127.0.0.1:8080/callback'
      )
    ).toBe(false);
    // /device 缺 user_code 参数
    expect(isDesktopOriginUrl('/device', '?client_id=mx_cad_viewer')).toBe(
      false
    );
    // /member-center 缺 auto=1
    expect(isDesktopOriginUrl('/member-center', '')).toBe(false);
    expect(isDesktopOriginUrl('/member-center', '?auto=0')).toBe(false);
    // 普通页面
    expect(isDesktopOriginUrl('/profile', '?token=xxx')).toBe(false);
    expect(isDesktopOriginUrl('/', '')).toBe(false);
  });
});

describe('markDesktopOrigin / isDesktopOrigin', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('当前 URL 命中桌面端入口时写入标记', () => {
    window.history.replaceState(null, '', '/device?user_code=ABCD-1234');
    markDesktopOrigin();
    expect(isDesktopOrigin()).toBe(true);
  });

  it('当前 URL 非桌面端入口时不写入标记', () => {
    markDesktopOrigin();
    expect(isDesktopOrigin()).toBe(false);
  });

  it('重复调用幂等', () => {
    window.history.replaceState(null, '', '/session-transfer?token=tok');
    markDesktopOrigin();
    markDesktopOrigin();
    expect(isDesktopOrigin()).toBe(true);
  });
});

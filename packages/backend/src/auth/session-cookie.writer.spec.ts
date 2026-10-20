import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import {
  AUTH_COOKIE_MAX_AGE,
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_PATH,
  REFRESH_COOKIE_MAX_AGE,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  SessionCookieWriter,
} from './session-cookie.writer';

function makeWriter(cookieSecure?: boolean | null) {
  const configService = {
    get: jest.fn((key: string) =>
      key === 'session.cookieSecure' ? cookieSecure : undefined,
    ),
  } as unknown as ConfigService;
  return new SessionCookieWriter(configService);
}

function makeRes(): Response {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as Response;
}

describe('会话 cookie 契约常量', () => {
  it('auth_token：1 小时，path=/（供所有请求路径读取）', () => {
    expect(AUTH_COOKIE_NAME).toBe('auth_token');
    expect(AUTH_COOKIE_MAX_AGE).toBe(60 * 60 * 1000);
    expect(AUTH_COOKIE_PATH).toBe('/');
  });

  it('refresh_token：7 天，path 限定为刷新端点（缩小暴露面）', () => {
    expect(REFRESH_COOKIE_NAME).toBe('refresh_token');
    expect(REFRESH_COOKIE_MAX_AGE).toBe(7 * 24 * 60 * 60 * 1000);
    expect(REFRESH_COOKIE_PATH).toBe('/api/v1/auth/refresh');
  });
});

describe('SessionCookieWriter.resolveSecure', () => {
  it('显式 true 优先于请求协议', () => {
    expect(makeWriter(true).resolveSecure({ secure: false })).toBe(true);
  });

  it('显式 false 优先于请求协议（离线 http 部署不被 https 协议误判）', () => {
    expect(makeWriter(false).resolveSecure({ secure: true })).toBe(false);
  });

  it('未配置时按请求协议自适应', () => {
    const writer = makeWriter(undefined);
    expect(writer.resolveSecure({ secure: true })).toBe(true);
    expect(writer.resolveSecure({ secure: false })).toBe(false);
  });

  it('未配置且请求无协议信息时默认 false', () => {
    expect(makeWriter(undefined).resolveSecure({})).toBe(false);
  });
});

describe('SessionCookieWriter.setAuthCookies', () => {
  it('下发 httpOnly auth_token（secure 随协议，sameSite=lax，1 小时，path=/）', () => {
    const writer = makeWriter(undefined);
    const res = makeRes();

    writer.setAuthCookies({ secure: true }, res, { accessToken: 'access-1' });

    expect(res.cookie).toHaveBeenCalledWith(AUTH_COOKIE_NAME, 'access-1', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: AUTH_COOKIE_MAX_AGE,
      path: AUTH_COOKIE_PATH,
    });
  });

  it('有 refreshToken 时一并下发 refresh_token（7 天，限定刷新路径）', () => {
    const res = makeRes();

    makeWriter(undefined).setAuthCookies(
      { secure: false },
      res,
      { accessToken: 'access-1', refreshToken: 'refresh-1' },
    );

    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE_NAME,
      'refresh-1',
      expect.objectContaining({
        httpOnly: true,
        secure: false,
        maxAge: REFRESH_COOKIE_MAX_AGE,
        path: REFRESH_COOKIE_PATH,
      }),
    );
    expect(res.cookie).toHaveBeenCalledTimes(2);
  });

  it('无 refreshToken 时不写第二个 cookie', () => {
    const res = makeRes();

    makeWriter(undefined).setAuthCookies({ secure: false }, res, {
      accessToken: 'access-1',
    });

    expect(res.cookie).toHaveBeenCalledTimes(1);
  });
});

describe('SessionCookieWriter.clearTokenCookies', () => {
  it('按各自的 path 清除两个 token cookie（path 不匹配 cookie 删不掉）', () => {
    const res = makeRes();

    makeWriter(undefined).clearTokenCookies(res);

    expect(res.clearCookie).toHaveBeenCalledWith(
      AUTH_COOKIE_NAME,
      expect.objectContaining({ path: AUTH_COOKIE_PATH }),
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      REFRESH_COOKIE_NAME,
      expect.objectContaining({ path: REFRESH_COOKIE_PATH }),
    );
  });

  it('清除沿用写入侧的属性集（secure 跟随同一 resolveSecure 决策）', () => {
    const res = makeRes();

    makeWriter(undefined).clearTokenCookies(res, { secure: true });

    expect(res.clearCookie).toHaveBeenCalledWith(AUTH_COOKIE_NAME, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: AUTH_COOKIE_PATH,
    });
    expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
    });
  });

  it('显式 cookieSecure 配置同时约束写入与清除', () => {
    const res = makeRes();

    makeWriter(true).clearTokenCookies(res);

    expect(res.clearCookie).toHaveBeenCalledWith(
      AUTH_COOKIE_NAME,
      expect.objectContaining({ secure: true }),
    );
  });

  it('写入与清除共享同一属性构造（防漂移不变量）', () => {
    const writer = makeWriter(undefined);
    const res = makeRes();

    writer.setAuthCookies({ secure: true }, res, { accessToken: 'a' });
    writer.clearTokenCookies(res, { secure: true });

    const [, , setOpts] = (res.cookie as jest.Mock).mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    const [, clearOpts] = (res.clearCookie as jest.Mock).mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];

    const { maxAge: _maxAge, ...setRest } = setOpts;
    expect(clearOpts).toEqual(setRest);
  });
});

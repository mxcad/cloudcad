import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

/** auth_token cookie 契约：1 小时，与 JWT access token 过期时间一致。 */
export const AUTH_COOKIE_NAME = 'auth_token';
export const AUTH_COOKIE_PATH = '/';
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 1000;

/** refresh_token cookie 契约：7 天，与 refresh token 一致。 */
export const REFRESH_COOKIE_NAME = 'refresh_token';
export const REFRESH_COOKIE_PATH = '/api/v1/auth/refresh';
export const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/** token cookie 的 sameSite 契约；`as const` 保住字面量类型以通过 express CookieOptions 收窄。 */
const TOKEN_COOKIE_SAMESITE = 'lax' as const;

/**
 * 会话 cookie 契约的单一事实源：名称 / 路径 / 时效 / secure 决策。
 *
 * 浏览器按「名称 + path + domain」识别同一 cookie。此前同一契约在
 * auth.controller / admin-auth.controller / session-transfer.controller 各持
 * 一份常量与一份 setAuthCookies 私有方法，wechat-callback.service 再内联第 4 份；
 * 任一份漂移到不同 maxAge 或 secure 规则，用户就会在一处登录、另一处被判过期，
 * 而差异在代码里看不出来。
 */
@Injectable()
export class SessionCookieWriter {
  constructor(private readonly configService: ConfigService) {}

  /**
   * secure 决策：`session.cookieSecure` 显式设置时以显式值为准，否则按请求协议
   * 自适应（http 不带 Secure，https 带 Secure）——修复离线 http 部署 cookie 被丢弃。
   */
  resolveSecure(req: { secure?: boolean }): boolean {
    const cookieSecure = this.configService.get<boolean | null | undefined>(
      'session.cookieSecure',
    );
    return cookieSecure ?? req.secure ?? false;
  }

  /**
   * 写入与清除共用的属性集。浏览器按「名称 + path + domain」判定是否为同一 cookie，
   * 写入侧一旦改了这些属性而清除侧漏改，登出就静默删不掉 token（用户已登出却仍能访问）。
   * 故两侧只准从这里取值，不允许各自手抄。
   */
  private tokenCookieOpts(req: { secure?: boolean }): {
    httpOnly: boolean;
    secure: boolean;
    sameSite: typeof TOKEN_COOKIE_SAMESITE;
  } {
    return {
      httpOnly: true,
      secure: this.resolveSecure(req),
      sameSite: TOKEN_COOKIE_SAMESITE,
    };
  }

  /**
   * 下发 httpOnly auth_token（+ 可选 refresh_token）。
   * 登录 / 管理员登录 / 会话转移 / 微信扫码登录共用同一出口。
   */
  setAuthCookies(
    req: { secure?: boolean },
    response: Response,
    result: { accessToken: string; refreshToken?: string },
  ): void {
    response.cookie(AUTH_COOKIE_NAME, result.accessToken, {
      ...this.tokenCookieOpts(req),
      maxAge: AUTH_COOKIE_MAX_AGE,
      path: AUTH_COOKIE_PATH,
    });

    if (result.refreshToken) {
      response.cookie(REFRESH_COOKIE_NAME, result.refreshToken, {
        ...this.tokenCookieOpts(req),
        maxAge: REFRESH_COOKIE_MAX_AGE,
        path: REFRESH_COOKIE_PATH,
      });
    }
  }

  /**
   * 幂等清除两个 token cookie（登出）。session cookie 与这两个名字不同，
   * 由调用方单独清除。
   */
  clearTokenCookies(
    response: Response,
    req: { secure?: boolean } = {},
  ): void {
    response.clearCookie(AUTH_COOKIE_NAME, {
      ...this.tokenCookieOpts(req),
      path: AUTH_COOKIE_PATH,
    });
    response.clearCookie(REFRESH_COOKIE_NAME, {
      ...this.tokenCookieOpts(req),
      path: REFRESH_COOKIE_PATH,
    });
  }
}

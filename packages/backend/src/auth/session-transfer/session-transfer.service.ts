///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright notice.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 桌面端 EXE → 系统浏览器 会话转移（等保 8.1.4.1 会话切换可追溯）。
 *
 * 双轨认证现状下，浏览器登录态由「Cookie Session（express-session+Redis）」与
 * 「JWT access/refresh（httpOnly cookie + localStorage Bearer）」共同构成。本服务
 * 把两者作为同一会话生命周期统一处理：
 *  - createTransfer：为已登录用户签发一次性转移凭证（Redis 60s TTL），EXE 拿到
 *    transferUrl 直接 openExternal 打开系统浏览器；
 *  - consumeTransfer：浏览器透明路由消费凭证，原子取出即焚 → 彻底销毁旧会话
 *    （旧 access token 黑名单 + 旧用户 web 端 refresh token 删除 + session regenerate
 *    换新 SID 防会话固定）→ 建立新会话（新 SessionID + 新 access/refresh token），
 *    全程用户无感。
 *
 * 注：「收敛到服务端 Session+Redis（Cookie 只存不透明 SID）」是正确方向，但属另一张票，
 * 本次保持双轨并用现状。
 */

import {
  Injectable,
  Logger,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { randomBytes } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { I18nContext } from 'nestjs-i18n';
import {
  AUTH_TOKEN_SERVICE,
  USER_REPOSITORY,
  REFRESH_TOKEN_REPOSITORY,
  TOKEN_BLACKLIST,
} from '@cloudcad/contracts';
import type {
  IAuthTokenService,
  IUserRepository,
  IRefreshTokenRepository,
  ITokenBlacklistService,
  UserRecord,
} from '@cloudcad/contracts';
import type { Request as ExpressRequest } from 'express';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { MembershipService } from '../../vip/membership.service';
import { membershipTierOf } from '../../vip/membership-tier';
import { AuditAction, ResourceType } from '../../common/enums/audit.enum';
import { Audit } from '../../common/decorators/audit.decorator';
import type { AuthResponseDto } from '../dto/auth.dto';
import {
  SESSION_TRANSFER_TOKEN_EXPIRES_IN,
  sessionTransferKey,
} from './session-transfer.constants';
import {
  SessionTransferCreateResponseDto,
  SessionTransferConsumeResponseDto,
} from './dto/session-transfer.dto';

/**
 * express-session 的 regenerate() 是回调式（非 Promise），须包装为 Promise 以在
 * 换新 SID 后再写新会话字段（regenerate 完成后 req.session 被替换为新对象）。
 */
function regenerateSession(request: ExpressRequest): Promise<void> {
  const session = request.session;
  if (!session || typeof session.regenerate !== 'function') {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

@Injectable()
export class SessionTransferService {
  private readonly logger = new Logger(SessionTransferService.name);

  constructor(
    @InjectRedis() private readonly redis: Redis,
    @Inject(AUTH_TOKEN_SERVICE) private readonly authTokenService: IAuthTokenService,
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokenRepo: IRefreshTokenRepository,
    @Inject(TOKEN_BLACKLIST) private readonly tokenBlacklistService: ITokenBlacklistService,
    private readonly runtimeConfigService: RuntimeConfigService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly membershipService: MembershipService,
  ) {}

  /**
   * 签发一次性会话转移凭证（EXE 侧调用，需已登录）。
   * @param userId 发起转移的用户（EXE 已登录身份）
   * @param redirect 转移完成后浏览器跳转路径（同源，可选）
   */
  @Audit(AuditAction.USER_SESSION_TRANSFER, ResourceType.USER, {
    // createTransfer 返回值不含 user，须从入参取 userId（默认提取器会得 'unknown' 而跳过审计）
    userId: (_result, args) => args[0] as string,
    resourceId: (_result, args) => args[0] as string,
    details: (_result, args) => {
      const [, redirect] = args as [string, string | undefined];
      return {
        loginMethod: 'session_transfer_create',
        redirect: redirect ?? null,
      };
    },
  })
  async createTransfer(
    userId: string,
    redirect?: string,
  ): Promise<SessionTransferCreateResponseDto> {
    const token = randomBytes(32).toString('base64url');
    await this.redis.set(
      sessionTransferKey(token),
      userId,
      'EX',
      SESSION_TRANSFER_TOKEN_EXPIRES_IN,
    );

    const domain = await this.runtimeConfigService.getValue<string>(
      'deviceAuthFrontendDomain',
      'http://localhost:3000',
    );
    const sanitized = this.sanitizeRedirect(redirect);
    const query = `token=${token}`;
    const transferUrl = `${domain}/session-transfer?${query}${
      sanitized ? `&redirect=${encodeURIComponent(sanitized)}` : ''
    }`;

    this.logger.log(`Session transfer credential created for user ${userId}`);
    return new SessionTransferCreateResponseDto({
      token,
      expiresIn: SESSION_TRANSFER_TOKEN_EXPIRES_IN,
      transferUrl,
    });
  }

  /**
   * 消费转移凭证并切换浏览器会话（前端透明路由调用，Public）。
   * 返回新会话凭证（access/refresh token + 用户信息），由 Controller 下发 httpOnly cookie。
   */
  @Audit(AuditAction.USER_SESSION_TRANSFER, ResourceType.USER, {
    details: () => ({ loginMethod: 'session_transfer_consume' }),
  })
  async consumeTransfer(
    token: string,
    request: ExpressRequest,
  ): Promise<SessionTransferConsumeResponseDto> {
    // ① 原子消费：Lua GETDEL，取出即焚（一次性，杜绝重放）
    const userId = await this.consumeToken(token);
    if (!userId) {
      throw new UnauthorizedException(
        I18nContext.current()?.t('error.auth.session_transfer_invalid') ??
          '转移凭证无效或已过期',
      );
    }

    // ② 用户有效性（与 jwt.strategy 判定口径一致：ACTIVE 且未注销）
    const user = await this.userRepo.findById(userId);
    if (!user || user.status !== 'ACTIVE' || user.deletedAt) {
      this.logger.warn(`Session transfer rejected: user ${userId} invalid or inactive`);
      throw new UnauthorizedException(
        I18nContext.current()?.t('error.auth.session_transfer_invalid') ??
          '转移凭证无效或已过期',
      );
    }

    // ③ 旧会话彻底销毁：先捕获旧身份与旧 access token（regenerate 前）
    const oldUserId = request.session?.userId;
    const oldAccessToken = request.cookies?.['auth_token'];
    await this.teardownOldSession(oldUserId, oldAccessToken, request);

    // ④ 建立新会话：regenerate 后 req.session 已被替换，须从 request 重读新对象
    const { password: _password, ...userWithoutPassword } = user;
    const tokens = await this.authTokenService.generateTokens(userWithoutPassword);
    const roleName = user.role?.name ?? 'UNKNOWN';
    await this.establishNewSession(user.id, roleName, user.email, request);

    // ⑤ 组装响应：会员信息展平，与 login 响应形状一致
    const membership = await this.membershipService.getMembership(user.id);
    const membershipTierLevel = membership.tierLevel;
    const membershipExpiresAt = membership.expiresAt
      ? membership.expiresAt.toISOString()
      : null;

    this.logger.log(
      `Session transfer consumed: user ${user.id}, role ${roleName}${
        oldUserId && oldUserId !== user.id ? `, replaced old session ${oldUserId}` : ''
      }`,
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        ...userWithoutPassword,
        nickname: userWithoutPassword.nickname || undefined,
        avatar: userWithoutPassword.avatar || undefined,
        role: userWithoutPassword.role,
        status: userWithoutPassword.status,
        hasPassword: !!user.password,
        membershipTierLevel,
        membershipExpiresAt,
        isVip: membershipTierLevel > 0,
        membershipTier: membershipTierOf(membershipTierLevel),
      },
    };
  }

  /** Lua GETDEL：原子「读 + 删」，并发下仅首个请求能取到值（一次性） */
  private readonly CONSUME_LUA_SCRIPT = `
    local value = redis.call('GET', KEYS[1])
    if value then
      redis.call('DEL', KEYS[1])
    end
    return value
  `;

  private async consumeToken(token: string): Promise<string | null> {
    const result = await this.redis.eval(
      this.CONSUME_LUA_SCRIPT,
      1,
      sessionTransferKey(token),
    );
    // Lua GETDEL 返回 userId 字符串或 nil（ioredis 转 null）；eval 返回类型 unknown，按契约收窄
    return typeof result === 'string' ? result : null;
  }

  /**
   * 旧会话销毁：
   *  - 旧 access token 进黑名单（按 exp 剩余时间）；
   *  - 删除旧用户 web 端 refresh token（clientId=null，EXE 的带 clientId 不受影响）；
   *  - session.regenerate() 换新 SID（防会话固定），Redis 故障时降级跳过。
   */
  private async teardownOldSession(
    oldUserId: string | undefined,
    oldAccessToken: string | undefined,
    request: ExpressRequest,
  ): Promise<void> {
    if (oldAccessToken) {
      try {
        const payload = this.jwtService.verify(oldAccessToken, {
          secret: this.configService.get<string>('jwt.secret'),
        }) as Record<string, unknown> & { exp: number; type: string };
        if (payload.type === 'access') {
          const now = Math.floor(Date.now() / 1000);
          const expiresIn = payload.exp - now;
          if (expiresIn > 0) {
            await this.tokenBlacklistService.addToBlacklist(
              oldAccessToken,
              expiresIn,
            );
          }
        }
      } catch {
        // 旧 token 已失效/格式异常：无需黑名单
      }
    }

    if (oldUserId) {
      try {
        await this.refreshTokenRepo.deleteByUserId(oldUserId, null);
      } catch (error) {
        this.logger.error(
          `Session transfer: failed to delete old web refresh tokens: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    try {
      await regenerateSession(request);
    } catch (error) {
      // Redis 故障降级：session 中间件本就跳过，Bearer/cookie token 侧照常完成转移
      this.logger.warn(
        `Session transfer: session regenerate failed (degraded): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * 建立新会话：写入 userId/userRole/userEmail 并持久化。
   * regenerate 后 req.session 为新对象；Redis 故障（session 未挂载）时降级跳过。
   */
  private async establishNewSession(
    userId: string,
    userRole: string,
    userEmail: string | null,
    request: ExpressRequest,
  ): Promise<void> {
    const session = request.session;
    if (!session) {
      this.logger.warn(
        'Session transfer: session unavailable (degraded); token side still effective',
      );
      return;
    }
    session.userId = userId;
    session.userRole = userRole;
    session.userEmail = userEmail ?? undefined;
    // express-session 的 save() 返回 this（非 Promise），显式回调式等待确保持久化完成
    await new Promise<void>((resolve, reject) => {
      session.save((err) => (err ? reject(err) : resolve()));
    });
  }

  /** 仅接受同源绝对路径（以单个 / 开头），排除协议相对（//）与外部 URL */
  private sanitizeRedirect(redirect?: string): string | undefined {
    if (!redirect) {
      return undefined;
    }
    if (!redirect.startsWith('/') || redirect.startsWith('//')) {
      return undefined;
    }
    return redirect;
  }
}

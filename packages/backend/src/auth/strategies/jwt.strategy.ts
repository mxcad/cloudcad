///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { DatabaseService } from '../../database/database.service';
import { TokenBlacklistService } from '../services/token-blacklist.service';
import { RoleInheritanceService } from '../../permission/services/role-inheritance.service';
import { SystemRole, isAdminRole } from '../../common/enums/permissions.enum';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { PasswordPolicyService } from '../services/password-policy.service';

import { I18nContext } from 'nestjs-i18n';

import { extractTokenFromRequest } from '../utils/token-extractor';

/**
 * 安全锁（#415 TOTP / #416 口令强改）共用的解锁白名单。
 *
 * 两把锁必须取**并集**，不能各自只放行自己的解锁端点：安全模式会同时开启
 * mfaEnforceEnabled 与 passwordPolicyChangeEnforceEnabled，而初始管理员通常
 * 既未绑定 TOTP 也未改过初始口令。白名单互斥时，绑定页的 mfa/setup 被口令锁
 * 打回 PASSWORD_CHANGE_REQUIRED → 前端跳改密页；改密页的轮询/提交又被 MFA 锁
 * 打回 MFA_SETUP_REQUIRED → 前端跳绑定页，两页无限跳转。
 *
 * 这些端点都只作用于当前登录用户自己的凭据（改密需旧口令、绑定需动态码），
 * 在任一锁定态下放行都不扩大权限。
 */
const SECURITY_UNLOCK_PATHS = [
  '/api/v1/admin/auth/mfa/setup',
  '/api/v1/admin/auth/mfa/bind',
  '/api/v1/users/change-password',
  '/api/v1/auth/profile',
  '/api/v1/auth/logout',
];

/**
 * Passport JWT 请求最小形状：extractedJwtToken 在 jwtFromRequest 与 validate 间
 * 经 request 传递（passport 无全局类型增强，用结构接口精确化而非 any）。
 */
interface JwtStrategyRequest {
  headers?: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string | undefined>;
  extractedJwtToken?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);
  private readonly prisma: DatabaseService;
  private readonly tokenBlacklistService: TokenBlacklistService;
  private readonly roleInheritanceService: RoleInheritanceService;
  private readonly runtimeConfigService: RuntimeConfigService;
  private readonly passwordPolicyService: PasswordPolicyService;
  private readonly isDevelopment: boolean;

  constructor(
    @Inject(ConfigService) configService: ConfigService,
    @Inject(DatabaseService) prisma: DatabaseService,
    @Inject(TokenBlacklistService) tokenBlacklistService: TokenBlacklistService,
    @Inject(RoleInheritanceService) roleInheritanceService: RoleInheritanceService,
    @Inject(RuntimeConfigService) runtimeConfigService: RuntimeConfigService,
    @Inject(PasswordPolicyService) passwordPolicyService: PasswordPolicyService
  ) {
    const jwtSecret = configService.get<string>('jwt.secret');

    if (!jwtSecret) {
      throw new BadRequestException('JWT_SECRET environment variable is required');
    }

    super({
      jwtFromRequest: (request: JwtStrategyRequest) => {
        const token = ExtractJwt.fromExtractors([
          ExtractJwt.fromAuthHeaderAsBearerToken(),
          (req) => extractTokenFromRequest(req),
        ])(request);

        if (token && request) {
          request.extractedJwtToken = token;
        }
        return token;
      },
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
      passReqToCallback: true,
    });

    this.prisma = prisma;
    this.tokenBlacklistService = tokenBlacklistService;
    this.roleInheritanceService = roleInheritanceService;
    this.runtimeConfigService = runtimeConfigService;
    this.passwordPolicyService = passwordPolicyService;
    this.isDevelopment =
      configService.get<string>('node.env') === 'development';
  }

  async validate(request: JwtStrategyRequest, payload: {
    sub: string;
    email: string;
    username: string;
    role: string;
    roleId: string;
    type: string;
  }) {
    if (!payload.sub) {
      return null;
    }

    if (payload.type && payload.type !== 'access') {
      throw new UnauthorizedException(I18nContext.current()?.t('error.auth.token_invalid') ?? '无效的Token类型');
    }

    const token = request?.extractedJwtToken;
    if (token) {
      const isTokenBlacklisted = await this.tokenBlacklistService.isBlacklisted(token);
      if (isTokenBlacklisted) {
        if (this.isDevelopment) {
          this.logger.warn(`Token已在黑名单中: ${token.substring(0, 20)}...`);
        }
        throw new UnauthorizedException(I18nContext.current()?.t('error.auth.token_revoked') ?? 'Token已被撤销');
      }
    }

    // 没有用户级 Redis 名单门（Gitea #484）：下面的 DB 查询已按 status 判定并抛同一个
    // error.auth.user_disabled，而那道门在 Redis 出错时 fail-closed 返回 true——Redis 一抖
    // 全平台用户被拒。令牌级名单（上面 isBlacklisted）保留。
    // 快速检查用户状态（1 次轻量查询，查 id + status + 实时角色 + TOTP 状态 + 口令修改时间）
    const userStatus = await this.prisma.user.findUnique({
      where: { id: payload.sub, deletedAt: null },
      select: {
        id: true,
        status: true,
        totpEnabled: true,
        passwordChangedAt: true,
        role: { select: { name: true, id: true } },
      },
    });

    if (!userStatus) {
      if (this.isDevelopment) {
        this.logger.warn(`用户不存在: ${payload.sub}`);
      }
      throw new UnauthorizedException(I18nContext.current()?.t('error.auth.token_invalid') ?? '无效的Token');
    }

    if (userStatus.status !== 'ACTIVE') {
      if (this.isDevelopment) {
        this.logger.warn(`用户状态非ACTIVE: ${userStatus.status}`);
      }
      throw new UnauthorizedException(I18nContext.current()?.t('error.auth.user_disabled') ?? '用户已被禁用');
    }

    // 优先使用 DB 查出的实时角色（角色降级/升级在 token 有效期内立即生效），否则回退到 payload 角色
    const effectiveRole = userStatus.role?.name ?? payload.role;

    // #415 强制引导：未绑定 TOTP 的管理员被锁定——仅解锁端点（MFA 绑定、
    // 改密、profile 刷新/登出）可用，后台其余端点一律拒绝。基于 DB 实时状态判定，
    // 绑定完成（totpEnabled=true）后锁定自动解除，无需刷新 token。
    // 总闸 mfaEnforceEnabled（运行时配置，默认关闭）关闭时整个锁定不生效。
    // 判定顺序固定：MFA 锁先于口令锁（前端登录落地页依赖此优先级）。
    if (isAdminRole(effectiveRole) && !userStatus.totpEnabled) {
      const mfaEnforceEnabled =
        await this.runtimeConfigService.getValue<boolean>(
          'mfaEnforceEnabled'
        );
      // 总闸开启时才执行锁定；关闭时未绑定管理员不被锁定，正常放行
      if (mfaEnforceEnabled) {
        const reqPath = (request as { path?: string })?.path ?? '';
        if (!SECURITY_UNLOCK_PATHS.includes(reqPath)) {
          this.logger.warn(
            `未绑定 TOTP 的管理员访问被拒: ${payload.username} -> ${reqPath}`
          );
          throw new ForbiddenException({
            statusCode: 403,
            message:
              I18nContext.current()?.t('error.mfa.setup_required') ??
              '请先完成 TOTP 双因素认证绑定',
            code: 'MFA_SETUP_REQUIRED',
          });
        }
      }
    }

    // #416 强制引导：口令到期/首登未改密的管理员被锁定——仅解锁端点（改密、
    // MFA 绑定、profile 刷新/登出）可用，后台其余端点一律拒绝。基于 DB 实时
    // passwordChangedAt 判定，改密成功（写 passwordChangedAt=now）后锁定自动解除，
    // 无需刷新 token。仅 ADMIN 角色生效；普通用户不做 180 天拦截（体验优先）。
    if (isAdminRole(effectiveRole)) {
      const passwordChangeStatus =
        await this.passwordPolicyService.getPasswordChangeStatus(
          userStatus.passwordChangedAt
        );
      if (passwordChangeStatus.required) {
        const reqPath = (request as { path?: string })?.path ?? '';
        if (!SECURITY_UNLOCK_PATHS.includes(reqPath)) {
          this.logger.warn(
            `口令到期/首登未改密的管理员访问被拒: ${payload.username} -> ${reqPath} (required=${passwordChangeStatus.required})`
          );
          throw new ForbiddenException({
            statusCode: 403,
            message:
              I18nContext.current()?.t('error.auth.password_change_required') ??
              '请先修改密码',
            code: 'PASSWORD_CHANGE_REQUIRED',
          });
        }
      }
    }

    // 从 Redis 角色缓存获取权限列表（0 DB 查询，所有同角色用户共享缓存）
    let permissions: string[] = [];
    try {
      permissions = await this.roleInheritanceService.getRolePermissions(
        effectiveRole as SystemRole
      );
    } catch (error) {
      this.logger.warn(`获取角色权限失败: ${(error as Error).message}`);
    }

    // 从 payload 构建用户信息，不再查角色/权限表
    // 后端 Guard 通过角色名从 Redis 角色缓存获取权限
    return {
      id: payload.sub,
      email: payload.email,
      username: payload.username,
      nickname: null,
      avatar: null,
      status: userStatus.status,
      roleId: userStatus.role?.id ?? payload.roleId,
      phone: null,
      phoneVerified: false,
      wechatId: null,
      provider: null,
      role: {
        name: effectiveRole,
        description: null,
        permissions,
      },
    };
  }
}

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

import {
  ForbiddenException,
  Injectable,
  Inject,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { I18nContext } from 'nestjs-i18n';
import { AuditAction, ResourceType } from '../../common/enums/audit.enum';
import { Audit } from '../../common/decorators/audit.decorator';
import { DatabaseService } from '../../database/database.service';
import { SystemRole } from '../../common/enums/permissions.enum';
import {
  USER_SERVICE,
  IUserService,
} from '../../common/interfaces/user-service.interface';
import {
  AUTH_TOKEN_SERVICE,
  IAuthTokenService,
} from '../interfaces/service-interfaces';
import type { SessionRequest } from '../interfaces/jwt-payload.interface';
import { establishSession } from '../session-establishment';
import { AccountRateLimitService } from './account-rate-limit.service';
import { PasswordPolicyService } from './password-policy.service';
import { InitializationService } from './initialization.service';
import {
  CreateFirstAdminDto,
  SetupStatusResponseDto,
} from '../dto/first-admin.dto';
import { AuthResponseDto } from '../dto/auth.dto';
import { maskEmail } from '../../common/pii/pii-crypto.service';

/**
 * 首启「创建首个管理员」服务（Web 首启页的后端）。
 *
 * 与 INITIAL_ADMIN_PASSWORD 启动路径互补（两条腿并存，Portainer/n8n 模式）：
 * - env 预置了 INITIAL_ADMIN_PASSWORD → 启动时自动建管理员（部署包路径）
 * - env 未预置 → 系统以零用户状态启动，登录页展示首启设置表单，
 *   由人交互创建首个管理员（源码启动 / 手动跑 backend 的路径）
 *
 * 安全边界：
 * - 仅在 userCount===0 时可用，创建过任何用户后永久关闭（403）
 * - 口令必须过口令策略（复杂度 + 弱口令黑名单），无缺省口令
 * - Redis NX 锁 + 锁内复查，防并发双开各建一个管理员
 * - 创建的用户固定 ADMIN 角色；passwordChangedAt 保持 now()
 *   （口令由人当场交互设置，不适用「首登强制改密」——那是部署工具
 *   代写口令的场景）
 */
@Injectable()
export class FirstAdminSetupService {
  private readonly logger = new Logger(FirstAdminSetupService.name);
  private static readonly LOCK_KEY = 'first-admin-setup:lock';

  constructor(
    private readonly prisma: DatabaseService,
    @Inject(USER_SERVICE)
    private readonly userService: IUserService,
    @Inject(AUTH_TOKEN_SERVICE)
    private readonly authTokenService: IAuthTokenService,
    private readonly passwordPolicyService: PasswordPolicyService,
    private readonly accountRateLimitService: AccountRateLimitService,
    private readonly initializationService: InitializationService,
    @InjectRedis() private readonly redis: Redis
  ) {}

  /** 首启状态：零用户 = 登录页应展示首启设置表单 */
  async getSetupStatus(): Promise<SetupStatusResponseDto> {
    const userCount = await this.prisma.user.count();
    return { setupRequired: userCount === 0 };
  }

  @Audit(AuditAction.USER_REGISTER, ResourceType.USER, {
    details: (_result, args) => {
      const [dto] = args as [CreateFirstAdminDto];
      // #417：审计 details 邮箱部分掩码，防明文 PII 落库/导出
      return {
        username: dto.username,
        email: dto.email ? maskEmail(dto.email) : undefined,
        channel: 'first_admin_setup',
      };
    },
  })
  async createFirstAdmin(
    dto: CreateFirstAdminDto,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    // 唯一窗口：系统零用户。已有任何用户（含抢先注册的普通用户）即永久关闭
    const userCount = await this.prisma.user.count();
    if (userCount > 0) {
      throw this.setupCompletedError();
    }

    // 口令策略（复杂度 + 弱口令黑名单）：首启口令同样不得弱
    await this.passwordPolicyService.assertPasswordPolicy(dto.password);

    // 账号维度限流（复用 register 维度：同为「创建账号」语义）
    await this.accountRateLimitService.checkLimit('register', dto.username);

    // Redis NX 锁：两个并发请求同时通过 userCount 检查时，只放行一个
    const locked = await this.redis
      .set(FirstAdminSetupService.LOCK_KEY, '1', 'EX', 30, 'NX')
      .catch(() => null);
    if (!locked) {
      throw this.setupCompletedError();
    }

    try {
      // 锁内复查：堵住「通过 userCount 检查 → 拿锁前对方已创建」的窗口
      const recount = await this.prisma.user.count();
      if (recount > 0) {
        throw this.setupCompletedError();
      }

      const adminRole = await this.prisma.role.findFirst({
        where: { name: SystemRole.ADMIN },
      });
      if (!adminRole) {
        throw new InternalServerErrorException(
          I18nContext.current()?.t('error.auth.setup_admin_role_missing') ??
            'ADMIN 角色不存在，请检查系统初始化'
        );
      }

      const user = await this.userService.create({
        email: dto.email || undefined,
        username: dto.username,
        password: dto.password,
        nickname: dto.nickname || dto.username,
        roleId: adminRole.id,
      });

      // 公共资源库在零用户启动时被跳过（找不到 owner），此处补建，
      // 与 INITIAL_ADMIN_PASSWORD 启动路径的最终状态一致
      await this.initializationService.ensurePublicLibraries();

      const tokens = await this.authTokenService.generateTokens(user);
      if (req && req.session) {
        await establishSession(req, user, {
          save: false,
          fallbackRole: 'ADMIN',
        });
      }

      // 不打印用户名/邮箱/口令（#416 等保 8.1.4.1 同口径）
      this.logger.log('✅ 首个管理员账户已通过 Web 首启页创建');
      return { ...tokens, user: { ...user, role: user.role, status: user.status } };
    } finally {
      await this.redis.del(FirstAdminSetupService.LOCK_KEY).catch(() => undefined);
    }
  }

  private setupCompletedError(): ForbiddenException {
    return new ForbiddenException(
      I18nContext.current()?.t('error.auth.setup_already_completed') ??
        '系统已完成初始化，无法再创建首个管理员'
    );
  }
}

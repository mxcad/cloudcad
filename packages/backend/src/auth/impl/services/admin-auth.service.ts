import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { I18nContext } from 'nestjs-i18n';
import type { IUserRepository, UserRecord } from '@cloudcad/contracts';
import { USER_REPOSITORY } from '@cloudcad/contracts';
import type { SecurityAttemptReason } from '@cloudcad/db';
import type { LoginDto, AuthResponseDto } from '../../dto/auth.dto';
import type { SessionRequest } from '../../interfaces/jwt-payload.interface';
import { AuditLogService } from '../../../audit/audit-log.service';
import { AuditAction, ResourceType } from '../../../common/enums/audit.enum';
import { IpWhitelistService } from '../../../ip-whitelist/ip-whitelist.service';
import { IpBlacklistService } from '../../../ip-blacklist/ip-blacklist.service';
import { SecurityAccessAttemptService } from '../../../security/security-access-attempt.service';
import { AuthTokenService } from './auth-token.service';
import { AccountRateLimitService } from '../../services/account-rate-limit.service';
import { MfaService } from '../../services/mfa.service';
import { PasswordPolicyService } from '../../services/password-policy.service';
import { RuntimeConfigService } from '../../../runtime-config/runtime-config.service';

/** 管理员登录请求：Session 基础上携带 headers（审计 user-agent） */
type AdminLoginRequest = SessionRequest & { headers?: Record<string, unknown> };

/**
 * 管理员专用登录服务（独立入口 POST /admin/auth/login）
 *
 * 与普通登录（LoginService）的关键差异：
 * 1. 仅 ADMIN 角色可通过；非管理员账号与密码错误返回**同一防枚举文案**
 *    （不暴露"该账号是管理员"的线索）；
 * 2. 登录前先做管理员 IP 白名单校验（fail-close）：白名单外的请求
 *    直接 403，不触发账号查询/限流计数/密码比对；
 * 3. 白名单判定见 IpWhitelistService（DB ∪ 服务器本地文件，环回恒放行）；
 * 4. 系统管理员账号在普通登录入口被 LoginService 阻断（对称防御）。
 */
@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    private readonly authTokenService: AuthTokenService,
    private readonly accountRateLimitService: AccountRateLimitService,
    private readonly auditLogService: AuditLogService,
    private readonly ipWhitelistService: IpWhitelistService,
    private readonly ipBlacklistService: IpBlacklistService,
    private readonly securityAccessAttemptService: SecurityAccessAttemptService,
    private readonly mfaService: MfaService,
    private readonly runtimeConfigService: RuntimeConfigService,
    private readonly passwordPolicyService: PasswordPolicyService
  ) {}

  async login(
    loginDto: LoginDto,
    req: AdminLoginRequest | undefined,
    clientIp: string
  ): Promise<AuthResponseDto> {
    const { account, password } = loginDto;

    // 0. IP 黑名单拦截（比白名单更前置：被拉黑的 IP 直接拒绝并记录，即使尚未在白名单）
    const blocked = await this.ipBlacklistService.isBlocked(clientIp);
    if (blocked) {
      this.logger.warn(
        `管理员登录拒绝 - IP 在黑名单: ${account} (IP: ${clientIp})`
      );
      await this.recordSecurityAttempt(
        account,
        clientIp,
        req,
        'blacklisted'
      );
      throw new ForbiddenException(
        I18nContext.current()?.t('error.admin_auth.ip_blocked') ??
          '当前 IP 已被禁止登录'
      );
    }

    // 1. IP 白名单校验（最前置：白名单外不消耗任何账号信息与限流计数）
    const allowed = await this.ipWhitelistService.isAllowed(clientIp);
    if (!allowed) {
      this.logger.warn(
        `管理员登录拒绝 - IP 不在白名单: ${account} (IP: ${clientIp})`
      );
      await this.auditAdminLoginFailure(
        account,
        clientIp,
        req,
        'ip_not_allowed'
      );
      throw new ForbiddenException(
        I18nContext.current()?.t('error.admin_auth.ip_not_allowed') ??
          '当前 IP 不在管理员白名单中，禁止登录'
      );
    }

    // 2. 账号维度限流（防撞库；与 IP 维度 RateLimitGuard 互补）
    await this.accountRateLimitService.checkLimit('login', account);
    // 失败锁定检查（#416 等保 8.1.4.1 c)）：锁期内正确密码也拒绝，含剩余时间
    await this.accountRateLimitService.checkAccountLock(account);

    // 3. 账号校验（全部走同一防枚举文案：不暴露账号存在性/状态/是否管理员）
    const genericReject = () =>
      new UnauthorizedException(
        I18nContext.current()?.t('error.auth.invalid_credentials') ??
          '账号或密码错误'
      );

    const user = await this.userRepo.findLoginUserIncludingDeleted(account);
    if (!user) {
      this.logger.warn(`管理员登录失败 - 用户不存在: ${account}`);
      await this.auditAdminLoginFailure(
        account,
        clientIp,
        req,
        'user_not_found'
      );
      throw genericReject();
    }

    if (user.status !== 'ACTIVE' || user.deletedAt) {
      this.logger.warn(
        `管理员登录失败 - 账号不可用: ${account} (状态: ${user.status})`
      );
      await this.auditAdminLoginFailure(
        account,
        clientIp,
        req,
        'account_unavailable',
        user.id
      );
      throw genericReject();
    }

    // 仅系统管理员角色可通过此入口；非管理员与密码错误同文案（防枚举）
    if (user.role?.name !== 'ADMIN') {
      this.logger.warn(`管理员登录失败 - 非管理员账号: ${account}`);
      await this.auditAdminLoginFailure(
        account,
        clientIp,
        req,
        'not_admin',
        user.id
      );
      throw genericReject();
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      this.logger.warn(`管理员登录失败 - 密码错误: ${account}`);
      // 失败锁定计数（#416）：连续失败达阈值 → 锁 30 分钟
      await this.accountRateLimitService.recordLoginFailure(account);
      await this.auditAdminLoginFailure(
        account,
        clientIp,
        req,
        'bad_password',
        user.id
      );
      throw genericReject();
    }

    // 3.5 TOTP 双因素（仅管理员入口，#415 等保 8.1.4.1(d)）：
    // 总闸 mfaEnforceEnabled（运行时配置，默认关闭）关闭时 TOTP 完全不生效
    // （含已绑定者也无需动态码，totpCode 参数被忽略）；开启时：
    // - 未绑定：正常签发 token，响应带 mfaSetupRequired 标记——前端锁定至绑定页，
    //   完成绑定前 JwtStrategy 层拦截后台其余端点（强制引导）；
    // - 已绑定：动态码必传。缺码 → MFA_REQUIRED（前端据此进入第二因子输入）；
    //   错码 → 计入账号限流 + 失败审计，返回 MFA_CODE_INVALID（第一因子已验证，
    //   暴露"码错误"不构成账号枚举风险）
    let mfaSetupRequired = false;
    const mfaEnforceEnabled = await this.runtimeConfigService.getValue<boolean>(
      'mfaEnforceEnabled',
      false
    );
    if (mfaEnforceEnabled) {
      if (!user.totpEnabled) {
        mfaSetupRequired = true;
      } else if (!loginDto.totpCode) {
        this.logger.warn(`管理员登录拒绝 - TOTP 动态码缺失: ${account}`);
        await this.auditAdminLoginFailure(
          account,
          clientIp,
          req,
          'mfa_code_missing',
          user.id
        );
        throw new HttpException(
          {
            statusCode: HttpStatus.UNAUTHORIZED,
            message:
              I18nContext.current()?.t('error.mfa.required') ??
              '请输入双因素认证动态码',
            code: 'MFA_REQUIRED',
          },
          HttpStatus.UNAUTHORIZED
        );
      } else if (
        !(await this.mfaService.verifyCode(user.id, loginDto.totpCode))
      ) {
        this.logger.warn(`管理员登录失败 - TOTP 动态码错误: ${account}`);
        // 复用登录维度限流：错码尝试与密码错误共享同一账号计数窗口
        await this.accountRateLimitService.checkLimit('login', account);
        await this.auditAdminLoginFailure(
          account,
          clientIp,
          req,
          'mfa_code_invalid',
          user.id
        );
        throw new HttpException(
          {
            statusCode: HttpStatus.UNAUTHORIZED,
            message:
              I18nContext.current()?.t('error.mfa.code_invalid') ??
              '双因素认证动态码错误，请重试',
            code: 'MFA_CODE_INVALID',
          },
          HttpStatus.UNAUTHORIZED
        );
      }
    }

    // 3.6 口令定期更换判定（#416 等保 8.1.4.1 b)，仅管理员入口）：
    // passwordChangedAt=null → 首登未改密（强制改密）；>180 天 → 到期强制改密；
    // >166 天 → 提前 14 天软提示（不拦截）。
    // 标记随响应下发，JwtStrategy 据此对未改密管理员做强制引导（复用 #415 MFA 锁定模式）。
    const passwordChangeStatus =
      this.passwordPolicyService.getPasswordChangeStatus(
        user.passwordChangedAt
      );
    const passwordChangeRequired = passwordChangeStatus.required;
    const passwordExpiringSoon = passwordChangeStatus.expiringSoon;

    // 4. 签发 token（与普通登录同构：登录后使用完整管理功能与既有鉴权链路）
    const userWithMembership = user as UserRecord & {
      membership?: { tierLevel: number; expiresAt: Date | null } | null;
    };
    const {
      password: _,
      membership: userMembership,
      ...userWithoutPassword
    } = userWithMembership;
    const tokens =
      await this.authTokenService.generateTokens(userWithoutPassword);

    // 5. Session（与普通登录一致，供 cookie 会话链路复用）
    const roleName = user.role?.name ?? 'ADMIN';
    if (req && req.session) {
      req.session.userId = user.id;
      req.session.userRole = roleName;
      req.session.userEmail = user.email ?? undefined;
      await req.session.save();
      this.logger.log(
        `管理员登录 Session 已设置 userId=${user.id}, role=${roleName}`
      );
    }

    // 登录成功，清空该账号的失败计数（频率限流 + 失败锁定链）
    await this.accountRateLimitService.reset('login', account);
    await this.accountRateLimitService.clearLoginFailures(account);

    this.logger.log(
      `管理员登录成功: ${account} (ID: ${user.id}, IP: ${clientIp})`
    );

    // 6. 安全审计（管理员入口登录为高价值安全事件：成功失败均留痕）
    await this.auditLogService.log(
      AuditAction.ADMIN_LOGIN,
      ResourceType.USER,
      user.id,
      user.id,
      true,
      undefined,
      undefined,
      undefined,
      user.username || user.email || user.id,
      {
        account,
        ip: clientIp,
        loginMethod: mfaSetupRequired
          ? 'admin_password_mfa_pending'
          : 'admin_password',
        mfaSetupRequired,
      },
      clientIp,
      req?.headers?.['user-agent'] as string | undefined
    );

    return {
      ...tokens,
      ...(mfaSetupRequired ? { mfaSetupRequired: true } : {}),
      ...(passwordChangeRequired
        ? { passwordChangeRequired }
        : {}),
      ...(passwordExpiringSoon ? { passwordExpiringSoon: true } : {}),
      user: {
        ...userWithoutPassword,
        nickname: userWithoutPassword.nickname || undefined,
        avatar: userWithoutPassword.avatar || undefined,
        role: userWithoutPassword.role,
        status: userWithoutPassword.status,
        hasPassword: true,
        membershipTierLevel: 0,
        membershipExpiresAt: null,
        isVip: false,
      },
    };
  }

  /**
   * 管理员入口登录失败：统一留痕。
   *
   * 双通道：
   * 1. SecurityAccessAttempt（独立表，无 userId 外键）——认证前（IP 拦截/账号不存在）
   *    也能写入，用于安全回溯 + 页面聚合展示 + 一键拉白拉黑（本需求核心）；
   * 2. AuditLog（userId 强外键）——仅当已查到真实 userId 时写入，避免 'unknown'
   *    占位导致 audit_logs_userId_fkey 冲突（ADMIN_LOGIN 失败审计）。
   */
  private async auditAdminLoginFailure(
    account: string,
    clientIp: string,
    req: AdminLoginRequest | undefined,
    reason: string,
    userId?: string
  ): Promise<void> {
    await this.recordSecurityAttempt(account, clientIp, req, reason);

    // 未认证成功（IP 拦截/账号不存在）无合法 userId，跳过 AuditLog（已由上述通道留痕）
    if (!userId) return;
    try {
      await this.auditLogService.log(
        AuditAction.ADMIN_LOGIN,
        ResourceType.USER,
        userId,
        userId,
        false,
        `admin login failed: ${reason}`,
        undefined,
        undefined,
        account,
        { account, ip: clientIp, reason, loginMethod: 'admin_password' },
        clientIp,
        req?.headers?.['user-agent'] as string | undefined
      );
    } catch {
      // 审计写库失败不影响登录拒绝流程
    }
  }

  /**
   * 记录一条高危访问尝试（写 security_access_attempts，独立于 AuditLog，
   * 不依赖 userId 外键）。reason 由内部调用方传入，均为已知枚举值。
   * 写库失败由 SecurityAccessAttemptService 内部捕获，不抛出。
   */
  private async recordSecurityAttempt(
    account: string,
    clientIp: string,
    req: AdminLoginRequest | undefined,
    reason: string
  ): Promise<void> {
    await this.securityAccessAttemptService.record({
      ip: clientIp,
      endpoint: '/api/v1/admin/auth/login',
      reason: reason as SecurityAttemptReason,
      account,
      userAgent: req?.headers?.['user-agent'] as string | undefined,
    });
  }
}

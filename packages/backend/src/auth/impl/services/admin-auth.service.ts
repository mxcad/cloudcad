import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { I18nContext } from 'nestjs-i18n';
import type { IUserRepository, UserRecord } from '@cloudcad/contracts';
import { USER_REPOSITORY } from '@cloudcad/contracts';
import type { LoginDto, AuthResponseDto } from '../../dto/auth.dto';
import type { SessionRequest } from '../../interfaces/jwt-payload.interface';
import { AuditLogService } from '../../../audit/audit-log.service';
import { AuditAction, ResourceType } from '../../../common/enums/audit.enum';
import { IpWhitelistService } from '../../../ip-whitelist/ip-whitelist.service';
import { AuthTokenService } from './auth-token.service';
import { AccountRateLimitService } from '../../services/account-rate-limit.service';

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
    private readonly ipWhitelistService: IpWhitelistService
  ) {}

  async login(
    loginDto: LoginDto,
    req: AdminLoginRequest | undefined,
    clientIp: string
  ): Promise<AuthResponseDto> {
    const { account, password } = loginDto;

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
        'account_unavailable'
      );
      throw genericReject();
    }

    // 仅系统管理员角色可通过此入口；非管理员与密码错误同文案（防枚举）
    if (user.role?.name !== 'ADMIN') {
      this.logger.warn(`管理员登录失败 - 非管理员账号: ${account}`);
      await this.auditAdminLoginFailure(account, clientIp, req, 'not_admin');
      throw genericReject();
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      this.logger.warn(`管理员登录失败 - 密码错误: ${account}`);
      await this.auditAdminLoginFailure(account, clientIp, req, 'bad_password');
      throw genericReject();
    }

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

    // 登录成功，清空该账号的失败计数
    await this.accountRateLimitService.reset('login', account);

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
      { account, ip: clientIp, loginMethod: 'admin_password' },
      clientIp,
      req?.headers?.['user-agent'] as string | undefined
    );

    return {
      ...tokens,
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

  /** 管理员入口登录失败审计（含失败原因，供安全回溯；userId 未知时记 unknown） */
  private async auditAdminLoginFailure(
    account: string,
    clientIp: string,
    req: AdminLoginRequest | undefined,
    reason: string
  ): Promise<void> {
    try {
      await this.auditLogService.log(
        AuditAction.ADMIN_LOGIN,
        ResourceType.USER,
        undefined,
        'unknown',
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
}

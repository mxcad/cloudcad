import {
  Injectable,
  Logger,
  UnauthorizedException,
  Inject,
  Optional,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuthTokenService } from './auth-token.service';
import { PASSWORD_HASHER } from '../../../users/interfaces/password-hasher.interface';
import type { IPasswordHasher } from '../../../users/interfaces/password-hasher.interface';
import type { LoginDto, AuthResponseDto } from '../../dto/auth.dto';
import type { SessionRequest } from '../../interfaces/jwt-payload.interface';
import type {
  IUserRepository,
  IRuntimeConfigService,
  IUserSyncHook,
  UserRecord,
} from '@cloudcad/contracts';
import { USER_REPOSITORY, USER_SYNC_HOOK } from '@cloudcad/contracts';
import { isAdminUser } from '../../../common/enums/permissions.enum';
import { AccountRateLimitService } from '../../services/account-rate-limit.service';
import { membershipTierOf } from '../../../vip/membership-tier';
import { I18nContext } from 'nestjs-i18n';
import { UserLifecycleEventPayload } from '../../../users/interfaces/user-lifecycle-event.interface';
import { establishSession } from '../../session-establishment';

/** 注销冷静期已过、拒绝登录时的专用错误码（前端据此弹出客服信息弹框） */
export const ACCOUNT_DEACTIVATED_CODE = 'ACCOUNT_DEACTIVATED';
/** 彻底删除已注销用户数据的默认延迟天数（与 userCleanup.delayDays 默认值一致，30 天） */
export const DEACTIVATED_CLEANUP_DAYS = 30;

@Injectable()
export class LoginService {
  private readonly logger = new Logger(LoginService.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: IPasswordHasher,
    @Inject('CONFIG')
    private readonly runtimeConfigService: IRuntimeConfigService,
    private authTokenService: AuthTokenService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private accountRateLimitService: AccountRateLimitService,
    private eventEmitter: EventEmitter2,
    // 可选登录同步扩展点：私有实现（如 impl-mx）注册 USER_SYNC_HOOK 时生效，OSS 无实现时为零
    @Optional()
    @Inject(USER_SYNC_HOOK)
    private readonly userSyncHook?: IUserSyncHook
  ) {}

  async login(
    loginDto: LoginDto,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    const { account, password } = loginDto;
    this.logger.log(`用户登录尝试: ${account}`);

    // 账号维度限流（防撞库/暴力破解），与 IP 维度 RateLimitGuard 互补
    await this.accountRateLimitService.checkLimit('login', account);
    // 失败锁定检查（#416 等保 8.1.4.1 c)）：锁期内正确密码也拒绝，含剩余时间
    await this.accountRateLimitService.checkAccountLock(account);

    // 登录前同步扩展点：私有实现可在此代理外部认证并创建/更新本地用户，主流程不变
    if (this.userSyncHook) {
      await this.userSyncHook.syncBeforeLogin(account, password);
    }

    // 含已注销用户查询：命中注销用户时由 recoverIfPendingDeletion 决定「冷静期内自动恢复」或「拒绝」
    type LoginUserRecord = UserRecord & {
      membership?: { tierLevel: number; expiresAt: Date | null } | null;
    };
    let user: LoginUserRecord | null =
      await this.userRepo.findLoginUserIncludingDeleted(account);

    if (!user) {
      this.logger.warn(`登录失败 - 用户不存在: ${account}`);
      throw new UnauthorizedException(
        I18nContext.current()?.t('error.auth.invalid_credentials') ??
          '账号或密码错误'
      );
    }

    // 未注销的禁用/未激活账号：保持防枚举提前拒绝（不泄露账号状态）
    if (user.status !== 'ACTIVE' && !user.deletedAt) {
      this.logger.warn(
        `登录失败 - 账号已禁用: ${account} (状态: ${user.status})`
      );
      // 防枚举：禁用账号与"用户不存在/密码错误"返回同一通用文案，避免攻击者区分账号状态
      throw new UnauthorizedException(
        I18nContext.current()?.t('error.auth.invalid_credentials') ??
          '账号或密码错误'
      );
    }

    // 先认证（密码校验）后处理注销状态：错误密码的尝试不得触发自动恢复等 DB 副作用。
    // 无密码账号（微信注册等 password=null）：bcrypt.compare(hash=null) 会 reject
    // 抛异常 → 500，破坏下方防枚举统一文案（攻击者可用 500 vs 401 区分此类账号存在性），
    // 故按「密码错误」同路径处理（计数 + 通用 401）
    const isPasswordValid = user.password
      ? await this.passwordHasher.compare(password, user.password)
      : false;
    if (!isPasswordValid) {
      this.logger.warn(`登录失败 - 密码错误: ${account}`);
      // 失败锁定计数（#416）：连续失败达阈值 → 锁 30 分钟
      await this.accountRateLimitService.recordLoginFailure(account);
      throw new UnauthorizedException(
        I18nContext.current()?.t('error.auth.invalid_credentials') ??
          '账号或密码错误'
      );
    }

    // 登录资格（管理员入口隔离 → 注销冷静期恢复）统一走 assertLoginEligible：
    // 管理员门在前，保证已注销的 ADMIN 账号不会因一次登录尝试被自动恢复（写库 + user.restored 副作用）
    const originalMembership = user.membership;
    const { user: eligibleUser, restored } = await this.assertLoginEligible(
      user,
      '普通登录'
    );
    if (restored) {
      // 恢复查询不带 membership，从原记录回填，保证 VIP 信息不丢
      user = { ...eligibleUser, membership: originalMembership };
    }

    if (user.status !== 'ACTIVE') {
      this.logger.warn(
        `登录失败 - 账号已禁用: ${account} (状态: ${user.status})`
      );
      // 防枚举：禁用账号与"用户不存在/密码错误"返回同一通用文案，避免攻击者区分账号状态
      throw new UnauthorizedException(
        I18nContext.current()?.t('error.auth.invalid_credentials') ??
          '账号或密码错误'
      );
    }

    const mailEnabled = await this.runtimeConfigService.getValue<boolean>(
      'mailEnabled',
      false
    );
    const requireEmailVerification =
      await this.runtimeConfigService.getValue<boolean>(
        'requireEmailVerification',
        false
      );

    if (mailEnabled && requireEmailVerification && !user.emailVerified) {
      if (!user.email) {
        const tempToken = this.jwtService.sign(
          { sub: user.id, type: 'bind_email_temp' },
          {
            secret: this.configService.get<string>('jwt.secret'),
            expiresIn: '30m',
          }
        );
        throw new UnauthorizedException({
          code: 'EMAIL_REQUIRED',
          message:
            I18nContext.current()?.t('success.login_bind_email_first') ??
            '请先绑定邮箱后再登录',
          tempToken,
        });
      }
      throw new UnauthorizedException({
        code: 'EMAIL_NOT_VERIFIED',
        message:
          I18nContext.current()?.t('success.login_verify_email_first') ??
          '请先验证邮箱后再登录',
        email: user.email,
      });
    }

    const smsEnabled = await this.runtimeConfigService.getValue<boolean>(
      'smsEnabled',
      false
    );
    const requirePhoneVerification =
      await this.runtimeConfigService.getValue<boolean>(
        'requirePhoneVerification',
        false
      );

    if (smsEnabled && requirePhoneVerification && !user.phoneVerified) {
      if (!user.phone) {
        const tempToken = this.jwtService.sign(
          { sub: user.id, type: 'bind_phone_temp' },
          {
            secret: this.configService.get<string>('jwt.secret'),
            expiresIn: '30m',
          }
        );
        throw new UnauthorizedException({
          code: 'PHONE_REQUIRED',
          message:
            I18nContext.current()?.t('success.login_bind_phone_first') ??
            '请先绑定手机号后再登录',
          tempToken,
        });
      }
      throw new UnauthorizedException({
        code: 'PHONE_NOT_VERIFIED',
        message:
          I18nContext.current()?.t('success.login_verify_phone_first') ??
          '请先验证手机号后再登录',
        phone: user.phone,
      });
    }

    const hasPassword = !!user.password;
    // 展平会员信息：membership 关系对象 → membershipTierLevel/membershipExpiresAt。
    // 有效会员判定（与 membership.service / user-crud.flattenMembership 一致）：仅当
    // membership 存在 && (expiresAt === null 永久 || expiresAt > now) 才返回原等级与到期时间，过期/失效统一为 0/null。
    const userWithMembership = user as UserRecord & {
      membership?: { tierLevel: number; expiresAt: Date | null } | null;
    };
    const {
      password: _,
      membership: userMembership,
      ...userWithoutPassword
    } = userWithMembership;
    const membershipValid =
      !!userMembership &&
      (userMembership.expiresAt === null ||
        userMembership.expiresAt > new Date());
    const membershipTierLevel = membershipValid ? userMembership.tierLevel : 0;
    const membershipExpiresAt =
      membershipValid && userMembership.expiresAt
        ? userMembership.expiresAt.toISOString()
        : null;
    const tokens =
      await this.authTokenService.generateTokens(userWithoutPassword);
    const roleName = user.role?.name ?? 'UNKNOWN';

    if (req && req.session) {
      await establishSession(req, user, { fallbackRole: 'UNKNOWN', withEmail: true });
      this.logger.log(`Session 已设置 userId=${user.id}, role=${roleName}`);
    }

    // 登录成功，清空该账号的失败计数（频率限流 + 失败锁定链）
    await this.accountRateLimitService.reset('login', account);
    await this.accountRateLimitService.clearLoginFailures(account);

    this.logger.log(
      `用户登录成功: ${account} (ID: ${user.id}, 角色: ${roleName})`
    );

    return {
      ...tokens,
      restored: restored || undefined,
      user: {
        ...userWithoutPassword,
        nickname: userWithoutPassword.nickname || undefined,
        avatar: userWithoutPassword.avatar || undefined,
        role: userWithoutPassword.role,
        status: userWithoutPassword.status,
        hasPassword,
        membershipTierLevel,
        membershipExpiresAt,
        isVip: membershipTierLevel > 0,
        membershipTier: membershipTierOf(membershipTierLevel),
      },
    };
  }

  /**
   * 注销冷静期自动恢复（仅用户自助注销 deactivatedBy='SELF' 生效；管理员软删不自动恢复）：
   * - 冷静期内（deletedAt 距今 < graceDays，graceDays 读运行时配置 userCancelGraceDays）：
   *   恢复账户（deletedAt=null, status=ACTIVE），发 user.restored 事件，返回恢复后的用户记录
   * - 冷静期已过：抛 UnauthorizedException({ code: 'ACCOUNT_DEACTIVATED', graceDays, cleanupDays })，
   *   前端据此弹出客服信息弹框（联系客服恢复 + 30 天后彻底删除）
   * - 管理员软删/存量数据（deactivatedBy !== 'SELF'）：返回 null，由调用方拒绝。
   *   密码路径保持防枚举（返回 null → 通用「账号或密码错误」）；
   *   手机/微信路径在验证码/扫码通过（身份已确认）后明确提示「账号已被注销」，无枚举暴露面
   */
  async recoverIfPendingDeletion(
    user: UserRecord
  ): Promise<UserRecord | null> {
    if (!user.deletedAt || user.deactivatedBy !== 'SELF') {
      return null;
    }

    const graceDays = await this.runtimeConfigService.getValue<number>(
      'userCancelGraceDays',
      7
    );
    const graceEnd = new Date(user.deletedAt);
    graceEnd.setDate(graceEnd.getDate() + graceDays);

    if (graceEnd > new Date()) {
      const restoredUser = await this.userRepo.update(user.id, {
        deletedAt: null,
        status: 'ACTIVE',
        deactivatedBy: null,
      });
      this.logger.log(
        `注销冷静期内登录，账户已自动恢复: ${user.username || user.email} (ID: ${user.id})`
      );
      this.eventEmitter.emit('user.restored', {
        userId: user.id,
        email: user.email,
        username: user.username,
        timestamp: new Date(),
      } satisfies UserLifecycleEventPayload);
      return restoredUser;
    }

    // 冷静期已过：仅自助注销给出明确提示（用户已知晓自己注销过，无账号枚举风险）；
    // 管理员软删返回 null → 密码路径防枚举「账号或密码错误」；手机/微信路径（身份已确认）明确提示「账号已被注销」
    this.logger.warn(
      `登录失败 - 注销冷静期已过: ${user.username || user.email} (ID: ${user.id})`
    );
    // cleanupDays 与 userCleanup.delayDays 保持单一来源（默认 30 天），避免配置漂移
    const cleanupDays = this.configService.get<number>(
      'userCleanup.delayDays',
      DEACTIVATED_CLEANUP_DAYS
    );
    throw new UnauthorizedException({
      code: ACCOUNT_DEACTIVATED_CODE,
      message:
        I18nContext.current()?.t('error.auth.account_deactivated_expired', {
          args: { cleanupDays },
        }) ??
        `账号已注销且已过冷静期，请联系客服恢复。数据将在${cleanupDays}天后彻底删除`,
      graceDays,
      cleanupDays,
    });
  }

  /**
   * post-credential 登录资格断言（普通入口）：管理员入口隔离 → 注销冷静期恢复。
   *
   * 顺序固定为「管理员门在前、恢复在后」：已注销的 ADMIN 账号仅凭一次普通入口尝试
   * （手机码 / 微信 / 邮箱）就会触发 recoverIfPendingDeletion 的写库 + user.restored
   * 审计副作用，随后又被管理员门拒绝——恢复成为无意义且有害的副作用（把自注销的
   * 管理员账号拉回 ACTIVE）。密码路径（login）一直是这个顺序，三个 provider 流程此前
   * 把恢复放在管理员门之前，本方法统一纠正并作为唯一出口。
   *
   * 状态校验（ACTIVE / SUSPENDED / INACTIVE，各入口文案不同）留在调用方，本方法不碰。
   * 仅用于「拒绝管理员」的普通入口；管理员专用入口（AdminAuthService）逻辑相反，不走这里。
   */
  async assertLoginEligible(
    user: UserRecord,
    entry: string
  ): Promise<{ user: UserRecord; restored: boolean }> {
    if (isAdminUser(user)) {
      // 管理员入口形态（profile 驱动）：ISOLATED = 只能走专用入口；MERGED = 可走任一入口。
      // MERGED 下放行后，下面的注销冷静期恢复照常生效——这正是「两个入口合一」的语义，
      // 不再复现前科里的「恢复后又立即被拒」的无意义写库副作用。
      // 仅管理员才读配置：普通用户的绝大多数登录尝试不做这次查询。
      const adminLoginEntry =
        await this.runtimeConfigService.getValue<string>(
          'adminLoginEntry',
          'ISOLATED'
        );
      if (adminLoginEntry === 'ISOLATED') {
        this.logger.warn(
          `${entry} 登录拒绝 - 系统管理员账号须使用管理员专用入口: ${
            user.username || user.email || user.id
          }`
        );
        throw new UnauthorizedException(
          I18nContext.current()?.t('error.auth.invalid_credentials') ??
            '账号或密码错误'
        );
      }
    }

    let restored = false;
    if (user.deletedAt) {
      const recovered = await this.recoverIfPendingDeletion(user);
      if (recovered) {
        user = recovered;
        restored = true;
      }
    }
    return { user, restored };
  }
}

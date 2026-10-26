import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { WechatService } from '../services/wechat.service';
import { RegistrationService } from '../services/registration.service';
import { LoginService } from '../services/login.service';
import { PasswordService } from '../services/password.service';
import { AuthTokenService } from '../services/auth-token.service';
import { PasswordPolicyService } from '../../services/password-policy.service';
import type {
  LoginDto, RegisterDto, AuthResponseDto, UserDto,
  WechatLoginResponseDto, WechatLoginUserDto, SessionRequest,
  IUserService, IAuthenticationHandler, IOAuthHandler,
  ISmsAuthHandler, IPasswordResetHandler, IAccountBindingHandler,
  ITokenHandler, IUserRepository, IRoleRepository,
  ISmsVerificationService, IEmailVerificationService, IRuntimeConfigService,
} from '@cloudcad/contracts';
import { USER_REPOSITORY, ROLE_REPOSITORY, toPublicUser } from '@cloudcad/contracts';
import { AccountRateLimitService } from '../../services/account-rate-limit.service';
import { InitializationService } from '../../services/initialization.service';
import { establishSession } from '../../session-establishment';
import { I18nContext } from 'nestjs-i18n';

@Injectable()
export class OssAuthProvider
  implements
    IAuthenticationHandler,
    IOAuthHandler,
    ISmsAuthHandler,
    IPasswordResetHandler,
    IAccountBindingHandler,
    ITokenHandler
{
  private readonly logger = new Logger(OssAuthProvider.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(ROLE_REPOSITORY) private readonly roleRepo: IRoleRepository,
    private jwtService: JwtService,
    private configService: ConfigService,
    @Inject('SMS') private readonly smsVerificationService: ISmsVerificationService,
    @Inject('EMAIL') private readonly emailVerificationService: IEmailVerificationService,
    private wechatService: WechatService,
    @Inject('CONFIG') private readonly runtimeConfigService: IRuntimeConfigService,
    @Inject('USER_SERVICE') private readonly userService: IUserService,
    private registrationService: RegistrationService,
    private loginService: LoginService,
    private passwordService: PasswordService,
    private authTokenService: AuthTokenService,
    private accountRateLimitService: AccountRateLimitService,
    private initializationService: InitializationService,
    private passwordPolicyService: PasswordPolicyService
  ) {}

  async login(
    credentials: LoginDto,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    return this.loginService.login(credentials, req);
  }

  async loginByPhone(
    phone: string,
    code: string,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    this.logger.log(`手机号验证码登录尝试: ${phone}`);

    // 账号维度限流（防验证码爆破），与 IP 维度 RateLimitGuard 互补
    await this.accountRateLimitService.checkLimit('login', phone);

    const verifyResult = await this.smsVerificationService.verifyCode(
      phone,
      code
    );

    if (!verifyResult.valid) {
      throw new BadRequestException(verifyResult.message);
    }

    const formattedPhone = phone.replace(/^\+86/, '');

    // 含已注销用户查询：命中注销用户时走「冷静期自动恢复或拒绝」，防止已注销手机号被误自动注册新账号
    let user = await this.userRepo.findByPhoneIncludingDeleted(formattedPhone);

    if (!user) {
      const allowAutoRegister = await this.runtimeConfigService.getValue<boolean>(
        'allowAutoRegisterOnPhoneLogin'
      );

      const allowRegister = await this.runtimeConfigService.getValue<boolean>(
        'allowRegister'
      );

      if (allowAutoRegister && allowRegister) {
        // 首启守卫：零用户系统禁止自动注册抢先占用「首个用户」
        await this.initializationService.assertInitialized();

        // 死账号防御：自动注册创建的是**无邮箱**账号（见下方 create 调用，
        // 不传 email），而 requireEmailVerification 开启时登录必须有已验证邮箱
        // ——两者同时开启会让自动注册的账号永远无法再次登录。配置层已用
        // conflictsWith 在更新路径拦下「新制造」的共存，这里覆盖门禁上线前
        // 遗留的共存状态（门禁只拦新制造、不动遗留态）。
        const requireEmailVerification = await this.runtimeConfigService.getValue<boolean>(
          'requireEmailVerification'
        );
        if (requireEmailVerification) {
          this.logger.warn(
            `拒绝手机自动注册（requireEmailVerification 已开启，` +
              `自动注册的账号将无邮箱、永远无法登录）: ${formattedPhone}`
          );
          throw new HttpException(
            {
              code: 'PHONE_NOT_REGISTERED',
              message:
                I18nContext.current()?.t('success.phone_not_registered') ??
                '手机号未注册，请先注册',
              phone: formattedPhone,
            },
            HttpStatus.PRECONDITION_FAILED,
          );
        }

        this.logger.log(`手机号未注册，开始自动注册: ${formattedPhone}`);

        const baseUsername = `u_${formattedPhone.slice(-8)}`;
        let username = baseUsername;
        let suffix = 1;

        while (await this.userRepo.findByUsername(username)) {
          username = `${baseUsername}_${suffix}`;
          suffix++;
        }

        const newUser = await this.userService.create({
          username,
          password: crypto.randomBytes(9).toString('base64url').slice(0, 12) + '!Aa',
          nickname: `用户${formattedPhone.slice(-4)}`,
          phone: formattedPhone,
          phoneVerified: true,
        });

        this.logger.log(
          `手机号自动注册成功: ${formattedPhone}, username: ${username}`
        );

        user = await this.userRepo.findById(newUser.id);
      } else {
        throw new HttpException(
          {
            code: 'PHONE_NOT_REGISTERED',
            message: I18nContext.current()?.t('success.phone_not_registered') ?? '手机号未注册，请先注册',
            phone: formattedPhone,
          },
          HttpStatus.PRECONDITION_FAILED,
        );
      }
    }

    if (!user) {
      throw new InternalServerErrorException(I18nContext.current()?.t('error.user.create_failed') ?? '用户创建失败');
    }

    // 登录资格（管理员入口隔离 → 注销冷静期恢复）统一走 LoginService.assertLoginEligible：
    // 管理员门在前，保证已注销的 ADMIN 账号不会因一次手机码尝试被自动恢复
    const { user: eligibleUser, restored } = await this.loginService.assertLoginEligible(
      user,
      '手机验证码登录'
    );
    user = eligibleUser;

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException(I18nContext.current()?.t('error.auth.account_deactivated') ?? '账号已被注销');
    }

    const tokens = await this.authTokenService.generateTokens(toPublicUser(user));

    if (req && req.session) {
      await establishSession(req, user, { withEmail: true });
      this.logger.log(
        `Session 已设置 userId=${user.id}, role=${user.role?.name ?? 'USER'}`
      );
    }

    this.logger.log(`手机号验证码登录成功: ${formattedPhone}`);;

    return {
      ...tokens,
      restored: restored || undefined,
      user: {
        ...toPublicUser(user),
        nickname: user.nickname || undefined,
        avatar: user.avatar || undefined,
        role: user.role,
        status: user.status,
      },
    };
  }

  async loginByWechat(
    code: string,
    state: string
  ): Promise<WechatLoginResponseDto> {
    if (!this.wechatService.validateState(state)) {
      throw new BadRequestException(I18nContext.current()?.t('error.account_binding.invalid_state_param') ?? '无效的状态参数');
    }

    const wechatEnabled = await this.runtimeConfigService.getValue<boolean>(
      'wechatEnabled'
    );
    if (!wechatEnabled) {
      throw new BadRequestException(I18nContext.current()?.t('error.auth_extra.wechat_login_disabled') ?? '微信登录功能未启用');
    }

    const tokenData = await this.wechatService.getAccessToken(code);

    const wechatUser = await this.wechatService.getUserInfo(
      tokenData.access_token,
      tokenData.openid
    );

    if (!wechatUser?.openid) {
      this.logger.warn('[wechat login] 微信授权响应缺少 openid，拒绝登录');
      throw new BadRequestException('授权失败：缺少 openid');
    }

    // 含已注销用户查询：命中注销用户时走「冷静期自动恢复或拒绝」，防止已注销微信被误自动注册新账号
    let user = await this.userRepo.findByWechatIdIncludingDeleted(wechatUser.openid);
    // 注销冷静期自动恢复标记（仅自助注销）：恢复成功后随登录响应返回供前端提示
    let restored = false;

    const wechatAutoRegister = await this.runtimeConfigService.getValue<boolean>(
      'wechatAutoRegister'
    );
    const requireEmailVerification = await this.runtimeConfigService.getValue<boolean>(
      'requireEmailVerification'
    );
    const requirePhoneVerification = await this.runtimeConfigService.getValue<boolean>(
      'requirePhoneVerification'
    );

    if (!user) {
      const allowRegister = await this.runtimeConfigService.getValue<boolean>(
        'allowRegister'
      );

      if (wechatAutoRegister && allowRegister) {
        // 首启守卫：零用户系统禁止微信自动注册抢先占用「首个用户」
        await this.initializationService.assertInitialized();
        let username = `wechat_${wechatUser.openid.slice(0, 8)}`;
        let counter = 0;
        while (await this.userRepo.findByUsername(username)) {
          counter++;
          username = `wechat_${wechatUser.openid.slice(0, 8)}_${counter}`;
        }

        const defaultRole = await this.roleRepo.findByName('USER');

        if (!defaultRole) {
          throw new InternalServerErrorException(I18nContext.current()?.t('error.user.default_role_missing') ?? '默认角色不存在');
        }

        user = await this.userRepo.create({
          wechatId: wechatUser.openid,
          provider: 'WECHAT',
          username,
          nickname: wechatUser.nickname,
          roleId: defaultRole.id,
          status: 'ACTIVE',
        });

        this.logger.log(`微信自动注册新用户: ${username} (ID: ${user.id})`);

        // 微信头像落盘：成功由 syncWechatAvatar 写入本地 URL；不落库微信 URL——
        // 页面 COEP=require-corp，前端直连微信头像域名必被拦，落库即永久无效
        await this.userService.syncWechatAvatar(user.id, wechatUser.headimgurl);
      } else {
        const tempToken = this.jwtService.sign(
          {
            sub: 'pending',
            type: 'wechat_temp',
            wechatId: wechatUser.openid,
            nickname: wechatUser.nickname,
            avatar: wechatUser.headimgurl,
          },
          {
            secret: this.configService.get<string>('jwt.secret'),
            expiresIn: '30m',
          }
        );

        return {
          accessToken: '',
          refreshToken: '',
          user: null as unknown as WechatLoginUserDto,
          requireEmailBinding: false,
          requirePhoneBinding: false,
          needRegister: true,
          tempToken,
        };
      }
    } else {
      // 登录资格（管理员入口隔离 → 注销冷静期恢复）统一走 LoginService.assertLoginEligible：
      // 管理员门在前，保证已注销的 ADMIN 账号不会因一次微信尝试被自动恢复
      const eligible = await this.loginService.assertLoginEligible(user, '微信登录');
      user = eligible.user;
      restored = eligible.restored;

      if (user.status === 'SUSPENDED') {
        throw new UnauthorizedException(I18nContext.current()?.t('error.auth_extra.account_suspended') ?? '账号已被暂停使用');
      } else if (user.status === 'INACTIVE') {
        throw new UnauthorizedException(I18nContext.current()?.t('error.auth_extra.account_not_activated') ?? '账号尚未激活');
      } else if (user.status !== 'ACTIVE') {
        throw new UnauthorizedException(I18nContext.current()?.t('error.auth_extra.account_status_abnormal') ?? '账号状态异常');
      }

      // 用户已上传本地头像时不覆盖；仅当 avatar 为空或仍为微信 URL 时同步并落盘
      const avatarIsLocal =
        !!user.avatar && user.avatar.startsWith('/api/v1/users/avatar/');

      if (!avatarIsLocal) {
        // 不预写微信 URL（页面 COEP=require-corp，前端直连微信头像域名必被拦，
        // 落库即永久无效）；清空存量微信 URL，avatar 只由 syncWechatAvatar 成功后写入本地 URL
        await this.userRepo.update(user.id, {
          nickname: wechatUser.nickname,
          avatar: null,
        });

        await this.userService.syncWechatAvatar(
          user.id,
          wechatUser.headimgurl
        );
      } else {
        await this.userRepo.update(user.id, {
          nickname: wechatUser.nickname,
        });
      }

      this.logger.log(`微信用户登录成功: ${user.username} (ID: ${user.id})`);
    }

    const needEmailBinding = requireEmailVerification && !user.email;
    const needPhoneBinding = requirePhoneVerification && !user.phone;

    if (needEmailBinding || needPhoneBinding) {
      const tempToken = this.jwtService.sign(
        {
          sub: user.id,
          type: 'wechat_bind_temp',
          wechatId: user.wechatId,
        },
        {
          secret: this.configService.get<string>('jwt.secret'),
          expiresIn: '30m',
        }
      );

      return {
        accessToken: '',
        refreshToken: '',
        user: {
          ...user,
          nickname: user.nickname || undefined,
          avatar: user.avatar || undefined,
          role: user.role,
          status: user.status,
        },
        restored: restored || undefined,
        requireEmailBinding: needEmailBinding,
        requirePhoneBinding: needPhoneBinding,
        tempToken,
      };
    }

    const tokens = await this.authTokenService.generateTokens(user);

    return {
      ...tokens,
      restored: restored || undefined,
      user: {
        ...user,
        nickname: user.nickname || undefined,
        avatar: user.avatar || undefined,
        role: user.role,
        status: user.status,
      },
      requireEmailBinding: false,
      requirePhoneBinding: false,
    };
  }

  async register(
    data: RegisterDto,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    return this.registrationService.register(data, req);
  }

  async refreshToken(token: string): Promise<AuthResponseDto> {
    const result = await this.authTokenService.refreshToken(token);

    const user = await this.userRepo.findById(result.user.id);

    if (!user) {
      throw new UnauthorizedException(I18nContext.current()?.t('error.user.not_found') ?? '用户不存在');
    }

    return {
      ...result,
      user: {
        ...toPublicUser(user),
        nickname: user.nickname || undefined,
        avatar: user.avatar || undefined,
        role: user.role,
        status: user.status,
        hasPassword: result.user.hasPassword,
      },
    };
  }

  async getUserInfo(userId: string): Promise<UserDto> {
    const user = await this.userRepo.findById(userId);

    if (!user) {
      throw new UnauthorizedException(I18nContext.current()?.t('error.user.not_found') ?? '用户不存在');
    }

    return {
      ...toPublicUser(user),
      nickname: user.nickname || undefined,
      avatar: user.avatar || undefined,
      phone: user.phone || undefined,
    };
  }

  async verifyPhoneAndLogin(
    phone: string,
    code: string,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    this.logger.log(`开始验证手机号: ${phone}`);

    // 账号维度限流（防验证码爆破），与 IP 维度 RateLimitGuard 互补
    await this.accountRateLimitService.checkLimit('login', phone);

    const verifyResult = await this.smsVerificationService.verifyCode(
      phone,
      code
    );
    if (!verifyResult.valid) {
      throw new BadRequestException(verifyResult.message);
    }

    const formattedPhone = phone.replace(/^\+86/, '');

    // 含已注销用户查询：命中注销用户时走「冷静期自动恢复或拒绝」
    let user = await this.userRepo.findByPhoneIncludingDeleted(formattedPhone);
    // 注销冷静期自动恢复标记（仅自助注销）：恢复成功后随登录响应返回供前端提示
    let restored = false;

    if (!user) {
      // 防账号枚举：统一文案，不区分手机号是否注册
      throw new BadRequestException(I18nContext.current()?.t('error.user.verification_failed_generic') ?? '验证失败');
    }

    // 登录资格（管理员入口隔离 → 注销冷静期恢复）统一走 LoginService.assertLoginEligible：
    // 管理员门在前，保证已注销的 ADMIN 账号不会因一次手机验证尝试被自动恢复
    const eligible = await this.loginService.assertLoginEligible(user, '手机验证登录');
    user = eligible.user;
    restored = eligible.restored;

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException(I18nContext.current()?.t('error.auth.account_deactivated') ?? '账号已被注销');
    }

    await this.userRepo.update(user.id, {
      phoneVerified: true,
      phoneVerifiedAt: new Date(),
    });

    this.logger.log(`手机号验证成功: ${formattedPhone}, userId: ${user.id}`);

    const userWithoutPassword = toPublicUser(user);
    const tokens =
      await this.authTokenService.generateTokens(userWithoutPassword);

    if (req && req.session) {
      await establishSession(req, user);
    }

    return {
      ...tokens,
      restored: restored || undefined,
      user: {
        ...userWithoutPassword,
        phoneVerified: true,
      },
    };
  }

  async bindEmailAndLogin(
    tempToken: string,
    email: string,
    code: string,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    this.logger.log(`开始绑定邮箱并登录: ${email}`);

    let payload: { sub: string; type: string };
    try {
      payload = this.jwtService.verify(tempToken, {
        secret: this.configService.get<string>('jwt.secret'),
      });
    } catch {
      throw new BadRequestException(I18nContext.current()?.t('error.auth_extra.temp_token_invalid') ?? '临时令牌无效或已过期，请重新登录');
    }

    if (payload.type !== 'bind_email_temp') {
      throw new BadRequestException(I18nContext.current()?.t('error.auth_extra.invalid_token_type') ?? '无效的令牌类型');
    }

    const userId = payload.sub;

    const result = await this.emailVerificationService.verifyEmail(email, code);
    if (!result.valid) {
      throw new BadRequestException(result.message);
    }

    const existingUser = await this.userRepo.findByEmail(email);
    if (existingUser && existingUser.id !== userId) {
      throw new ConflictException(I18nContext.current()?.t('error.account_binding.email_conflict') ?? '该邮箱已被其他账号绑定');
    }

    const user = await this.userRepo.update(userId, {
      email,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });

    this.logger.log(`邮箱绑定成功: userId=${userId}, email=${email}`);

    const userWithoutPassword = toPublicUser(user);
    const tokens =
      await this.authTokenService.generateTokens(userWithoutPassword);

    if (req && req.session) {
      await establishSession(req, user);
    }

    return {
      ...tokens,
      user: userWithoutPassword,
    };
  }

  async bindPhoneAndLogin(
    tempToken: string,
    phone: string,
    code: string,
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    this.logger.log(`开始绑定手机号并登录: ${phone}`);

    let payload: { sub: string; type: string };
    try {
      payload = this.jwtService.verify(tempToken, {
        secret: this.configService.get<string>('jwt.secret'),
      });
    } catch {
      throw new BadRequestException(I18nContext.current()?.t('error.auth_extra.temp_token_invalid') ?? '临时令牌无效或已过期，请重新登录');
    }

    if (payload.type !== 'bind_phone_temp') {
      throw new BadRequestException(I18nContext.current()?.t('error.auth_extra.invalid_token_type') ?? '无效的令牌类型');
    }

    const userId = payload.sub;

    const verifyResult = await this.smsVerificationService.verifyCode(
      phone,
      code
    );
    if (!verifyResult.valid) {
      throw new BadRequestException(verifyResult.message);
    }

    const formattedPhone = phone.replace(/^\+86/, '');

    const existingUser = await this.userRepo.findByPhone(formattedPhone);
    if (existingUser && existingUser.id !== userId) {
      throw new ConflictException(I18nContext.current()?.t('error.account_binding.phone_conflict') ?? '该手机号已被其他账号绑定');
    }

    const user = await this.userRepo.update(userId, {
      phone: formattedPhone,
      phoneVerified: true,
      phoneVerifiedAt: new Date(),
    });

    this.logger.log(
      `手机号绑定成功: userId=${userId}, phone=${formattedPhone}`
    );

    const userWithoutPassword = toPublicUser(user);
    const tokens =
      await this.authTokenService.generateTokens(userWithoutPassword);

    if (req && req.session) {
      await establishSession(req, user);
    }

    return {
      ...tokens,
      user: userWithoutPassword,
    };
  }

  async verifyEmailAndRegisterPhone(
    email: string,
    emailCode: string,
    registerData: {
      phone: string;
      code: string;
      username: string;
      password: string;
      nickname?: string;
    },
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    this.logger.log(
      `开始验证邮箱并完成手机号注册: ${email}, phone: ${registerData.phone}`
    );

    // 账号维度限流（防批量注册），与 IP 维度 RateLimitGuard 互补
    await this.accountRateLimitService.checkLimit('register', email);

    // 口令策略（长度/复杂度/弱口令）由运行时配置驱动，DTO 只保留结构性校验。
    // 此路径此前跳过策略校验，等保档下 9 字符纯字母口令会被直接建成用户
    await this.passwordPolicyService.assertPasswordPolicy(registerData.password);

    const emailVerifyResult = await this.emailVerificationService.verifyEmail(
      email,
      emailCode
    );
    if (!emailVerifyResult.valid) {
      throw new BadRequestException(emailVerifyResult.message);
    }

    const phoneVerifyResult = await this.smsVerificationService.verifyCode(
      registerData.phone,
      registerData.code
    );
    if (!phoneVerifyResult.valid) {
      throw new BadRequestException(phoneVerifyResult.message);
    }

    const { phone, username, password, nickname } = registerData;
    const formattedPhone = phone.replace(/^\+86/, '');

    // 防账号枚举：统一文案，不区分具体哪个账号字段已被占用
    const existingUserByPhone = await this.userRepo.findByPhone(formattedPhone);
    if (existingUserByPhone) {
      throw new ConflictException(I18nContext.current()?.t('error.auth.registration_conflict') ?? '注册信息已被占用，请更换后重试');
    }

    const existingUserByUsername = await this.userRepo.findByUsername(username);
    if (existingUserByUsername) {
      throw new ConflictException(I18nContext.current()?.t('error.auth.registration_conflict') ?? '注册信息已被占用，请更换后重试');
    }

    const existingUserByEmail = await this.userRepo.findByEmail(email);
    if (existingUserByEmail) {
      throw new ConflictException(I18nContext.current()?.t('error.auth.registration_conflict') ?? '注册信息已被占用，请更换后重试');
    }

    const user = await this.userService.create({
      username,
      password,
      nickname: nickname || username,
      email,
      emailVerified: true,
      phone: formattedPhone,
      phoneVerified: true,
    });

    this.logger.log(
      `手机号注册成功（邮箱验证后）: ${formattedPhone}, email: ${email}, username: ${username}`
    );

    const tokens = await this.authTokenService.generateTokens(user);

    if (req && req.session) {
      await establishSession(req, user);
    }

    return {
      ...tokens,
      user: {
        ...user,
        role: user.role,
        status: user.status,
      },
    };
  }

  async registerByPhone(
    registerDto: RegisterDto & { phone: string; code: string },
    req?: SessionRequest
  ): Promise<AuthResponseDto> {
    const { phone, code, username, password, nickname } = registerDto;

    const allowRegister = await this.runtimeConfigService.getValue<boolean>(
      'allowRegister'
    );
    if (!allowRegister) {
      throw new BadRequestException(I18nContext.current()?.t('error.auth.registration_disabled') ?? '系统已关闭注册功能');
    }

    // 策略校验前置到限流与验证码消耗之前，与 RegistrationService.register 顺序一致
    await this.passwordPolicyService.assertPasswordPolicy(password);

    // 首启守卫：零用户系统禁止注册抢先占用「首个用户」
    await this.initializationService.assertInitialized();

    // 账号维度限流（防批量注册），与 IP 维度 RateLimitGuard 互补
    await this.accountRateLimitService.checkLimit('register', phone);

    const smsEnabled = await this.runtimeConfigService.getValue<boolean>(
      'smsEnabled'
    );
    const requirePhoneVerification =
      await this.runtimeConfigService.getValue<boolean>(
        'requirePhoneVerification'
      );
    if (!smsEnabled || !requirePhoneVerification) {
      throw new BadRequestException(I18nContext.current()?.t('error.auth_extra.phone_registration_disabled') ?? '手机号注册未启用，请使用邮箱注册');
    }

    const verifyResult = await this.smsVerificationService.verifyCode(
      phone,
      code
    );
    if (!verifyResult.valid) {
      throw new BadRequestException(verifyResult.message);
    }

    const formattedPhone = phone.replace(/^\+86/, '');

    // 防账号枚举：统一文案，不区分具体哪个账号字段已被占用
    const existingUserByPhone = await this.userRepo.findByPhone(formattedPhone);
    if (existingUserByPhone) {
      throw new ConflictException(I18nContext.current()?.t('error.auth.registration_conflict') ?? '注册信息已被占用，请更换后重试');
    }

    const existingUserByUsername = await this.userRepo.findByUsername(username);
    if (existingUserByUsername) {
      throw new ConflictException(I18nContext.current()?.t('error.auth.registration_conflict') ?? '注册信息已被占用，请更换后重试');
    }

    const user = await this.userService.create({
      username,
      password,
      nickname: nickname || username,
      phone: formattedPhone,
      phoneVerified: true,
    });

    this.logger.log(`手机号注册成功: ${formattedPhone}, username: ${username}`);

    const tokens = await this.authTokenService.generateTokens(user);

    if (req && req.session) {
      await establishSession(req, user);
    }

    return {
      ...tokens,
      user: {
        ...user,
        role: user.role,
        status: user.status,
      },
    };
  }

  async forgotPassword(
    email?: string,
    phone?: string
  ): Promise<{
    message: string;
    mailEnabled: boolean;
    smsEnabled: boolean;
    supportEmail?: string;
    supportPhone?: string;
  }> {
    return this.passwordService.forgotPassword(email, phone);
  }

  async resetPassword(
    email?: string,
    phone?: string,
    code?: string,
    newPassword?: string
  ): Promise<{ message: string }> {
    return this.passwordService.resetPassword(email, phone, code, newPassword);
  }
}

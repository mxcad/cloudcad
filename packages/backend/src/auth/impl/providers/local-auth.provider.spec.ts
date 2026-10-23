import { Test, type TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { USER_REPOSITORY, ROLE_REPOSITORY } from '@cloudcad/contracts';
import { OssAuthProvider } from './local-auth.provider';
import { WechatService } from '../services/wechat.service';
import { RegistrationService } from '../services/registration.service';
import { LoginService } from '../services/login.service';
import { PasswordService } from '../services/password.service';
import { AuthTokenService } from '../services/auth-token.service';
import { AccountRateLimitService } from '../../services/account-rate-limit.service';
import { InitializationService } from '../../services/initialization.service';
import { PasswordPolicyService } from '../../services/password-policy.service';

/** 微信头像 CDN 地址：落库后在 COEP 页面下前端直连必被拦，故只能作为落盘输入 */
const WECHAT_AVATAR_URL =
  'https://thirdwx.qlogo.cn/mmopen/vi_32/O9HiacB/132';
const LOCAL_AVATAR_URL = '/api/v1/users/avatar/user-1';

describe('OssAuthProvider.loginByWechat（微信头像不落库微信 URL）', () => {
  let service: OssAuthProvider;

  const mockUserRepo = {
    findByWechatIdIncludingDeleted: jest.fn(),
    findByUsername: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findById: jest.fn(),
    findByPhoneIncludingDeleted: jest.fn(),
  };

  const mockRoleRepo = {
    findByName: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
    signAsync: jest.fn(),
    verify: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(() => 'jwt-secret'),
  };

  const mockWechatService = {
    validateState: jest.fn(),
    getAccessToken: jest.fn(),
    getUserInfo: jest.fn(),
  };

  const mockRuntimeConfigService = {
    getValue: jest.fn(),
  };

  const mockUserService = {
    syncWechatAvatar: jest.fn(),
    create: jest.fn(),
  };

  const mockAuthTokenService = {
    generateTokens: jest
      .fn()
      .mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' }),
  };

  const mockAccountRateLimitService = {
    checkLimit: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn().mockResolvedValue(undefined),
  };

  // 首启守卫替身：默认透传（await undefined 直接继续），不改变既有测试行为
  const mockInitializationService = {
    assertInitialized: jest.fn(),
  };

  // 口令策略替身：默认放行，个别用例改为抛错以验证注册路径的拦截
  const mockPasswordPolicyService = {
    assertPasswordPolicy: jest.fn(),
  };

  const noopService = {
    syncBeforeLogin: jest.fn(),
    verifyCode: jest.fn(),
    // LoginService 替身：登录资格断言默认透传（非管理员、未注销 → 不触发恢复）
    assertLoginEligible: jest.fn(),
  };

  const wechatUser = {
    openid: 'wechat-openid-123',
    nickname: '微信昵称',
    headimgurl: WECHAT_AVATAR_URL,
  };

  const localRole = { id: 'role-1', name: 'USER', isSystem: true };

  function baseUser(overrides: Record<string, unknown> = {}) {
    return {
      id: 'user-1',
      email: null,
      username: 'wechat_user',
      password: 'hashed-password',
      nickname: '旧昵称',
      avatar: null,
      phone: null,
      phoneVerified: false,
      emailVerified: false,
      status: 'ACTIVE',
      wechatId: 'wechat-openid-123',
      provider: 'WECHAT',
      roleId: 'role-1',
      role: localRole,
      deletedAt: null,
      deactivatedBy: null,
      ...overrides,
    };
  }

  async function compileModule() {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OssAuthProvider,
        { provide: USER_REPOSITORY, useValue: mockUserRepo },
        { provide: ROLE_REPOSITORY, useValue: mockRoleRepo },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: 'SMS', useValue: noopService },
        { provide: 'EMAIL', useValue: noopService },
        { provide: WechatService, useValue: mockWechatService },
        { provide: 'CONFIG', useValue: mockRuntimeConfigService },
        { provide: 'USER_SERVICE', useValue: mockUserService },
        { provide: RegistrationService, useValue: noopService },
        { provide: LoginService, useValue: noopService },
        { provide: PasswordService, useValue: noopService },
        { provide: AuthTokenService, useValue: mockAuthTokenService },
        {
          provide: AccountRateLimitService,
          useValue: mockAccountRateLimitService,
        },
        {
          provide: InitializationService,
          useValue: mockInitializationService,
        },
        {
          provide: PasswordPolicyService,
          useValue: mockPasswordPolicyService,
        },
      ],
    }).compile();
    return module.get<OssAuthProvider>(OssAuthProvider);
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    service = await compileModule();
    mockWechatService.validateState.mockReturnValue(true);
    mockWechatService.getAccessToken.mockResolvedValue({
      access_token: 'access-token',
      openid: 'wechat-openid-123',
    });
    mockWechatService.getUserInfo.mockResolvedValue(wechatUser);
    mockRoleRepo.findByName.mockResolvedValue(localRole);
    mockAuthTokenService.generateTokens.mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
    });
    mockAccountRateLimitService.checkLimit.mockResolvedValue(undefined);
    mockAccountRateLimitService.reset.mockResolvedValue(undefined);
    // resetMocks 会清掉实现：口令策略默认放行
    mockPasswordPolicyService.assertPasswordPolicy.mockResolvedValue(undefined);
    // 微信启用 + 允许注册 + 自动注册；不强制邮箱/手机绑定
    mockRuntimeConfigService.getValue.mockImplementation(
      async (key: string) => {
        if (key === 'wechatEnabled') return true;
        if (key === 'allowRegister') return true;
        if (key === 'wechatAutoRegister') return true;
        return false;
      }
    );
    // resetMocks 会清掉实现：登录资格断言默认透传（非管理员、未注销 → 原样返回、不恢复）
    noopService.assertLoginEligible.mockImplementation(
      async (user: unknown) => ({ user, restored: false })
    );
  });

  it('新用户：create 不携带微信头像 URL，sync 仍以其为落盘输入', async () => {
    mockUserRepo.findByWechatIdIncludingDeleted.mockResolvedValue(null);
    mockUserRepo.findByUsername.mockResolvedValue(null);
    mockUserRepo.create.mockResolvedValue(baseUser());
    mockUserService.syncWechatAvatar.mockResolvedValue(null);

    await service.loginByWechat('code', 'state');

    expect(mockUserRepo.create).toHaveBeenCalledTimes(1);
    const payload = mockUserRepo.create.mock.calls[0][0];
    // 关键断言：微信 URL 从未进入 create 参数（否则落库后 COEP 页面永久无效）
    expect(payload.avatar).toBeUndefined();
    expect(mockUserRepo.update).not.toHaveBeenCalled();
    expect(mockUserService.syncWechatAvatar).toHaveBeenCalledWith(
      'user-1',
      WECHAT_AVATAR_URL
    );
  });

  it('新用户：sync 失败不抛错，登录正常完成且 avatar 保持空', async () => {
    mockUserRepo.findByWechatIdIncludingDeleted.mockResolvedValue(null);
    mockUserRepo.findByUsername.mockResolvedValue(null);
    // 回显 payload：让响应里的 avatar 反映实际落库内容，避免断言打在 mock 常量上
    mockUserRepo.create.mockImplementation(async (payload) => ({
      ...baseUser(),
      ...payload,
    }));
    mockUserService.syncWechatAvatar.mockResolvedValue(null);

    const result = await service.loginByWechat('code', 'state');

    expect(result.accessToken).toBe('at');
    // sync 失败降级为空，不残留微信 URL（否则 COEP 页面下永久无效）
    expect(result.user.avatar).toBeFalsy();
  });

  it('已有用户（avatar 为存量微信 URL）：update 清空而非预写微信 URL', async () => {
    mockUserRepo.findByWechatIdIncludingDeleted.mockResolvedValue(
      baseUser({ avatar: WECHAT_AVATAR_URL })
    );
    mockUserRepo.update.mockResolvedValue(baseUser({ avatar: null }));
    mockUserService.syncWechatAvatar.mockResolvedValue(null);

    await service.loginByWechat('code', 'state');

    expect(mockUserRepo.update).toHaveBeenCalledWith('user-1', {
      nickname: '微信昵称',
      avatar: null,
    });
    expect(mockUserService.syncWechatAvatar).toHaveBeenCalledWith(
      'user-1',
      WECHAT_AVATAR_URL
    );
  });

  it('已有用户（avatar 为本地 URL）：不覆盖、不触发微信头像同步', async () => {
    mockUserRepo.findByWechatIdIncludingDeleted.mockResolvedValue(
      baseUser({ avatar: LOCAL_AVATAR_URL })
    );

    const result = await service.loginByWechat('code', 'state');

    // 只刷新昵称，不触碰 avatar（用户自传的本地头像优先级最高）
    expect(mockUserRepo.update).toHaveBeenCalledWith('user-1', {
      nickname: '微信昵称',
    });
    expect(mockUserService.syncWechatAvatar).not.toHaveBeenCalled();
    expect(result.user.avatar).toBe(LOCAL_AVATAR_URL);
  });

  // 回归：bcrypt 哈希（cost 12）曾经 getUserInfo / loginByPhone 直接展开 UserRecord 泄漏进
  // 响应体 → 前端 localStorage。现统一经 toPublicUser 剥离。UserDto 类型本就不含 password，
  // 故用运行时对象断言（绕过类型）证明「对象里确实没有 password 键」。
  it('getUserInfo 返回的用户对象不含 password 哈希', async () => {
    mockUserRepo.findById.mockResolvedValue(baseUser());

    const result = (await service.getUserInfo('user-1')) as unknown as Record<string, unknown>;

    expect(result.password).toBeUndefined();
    expect(result.id).toBe('user-1');
    expect(result.username).toBe('wechat_user');
  });

  it('loginByPhone 返回的用户对象不含 password 哈希', async () => {
    mockUserRepo.findByPhoneIncludingDeleted.mockResolvedValue(baseUser());
    noopService.verifyCode.mockResolvedValue({ valid: true, message: '' });

    const result = (await service.loginByPhone('13800000000', '123456')) as unknown as {
      user: Record<string, unknown>;
    };

    expect(result.user.password).toBeUndefined();
    expect(result.user.id).toBe('user-1');
    expect(result.user.status).toBe('ACTIVE');
  });
});

// 回归：手机号注册 / 邮箱验证后注册两条路径此前完全跳过口令策略校验，
// DTO 的 @MinLength(8) 是唯一的长度闸门 → 等保档下 9 字符纯字母口令被直接建成用户。
// 现由 PasswordPolicyService 统一把关，DTO 只保留结构性校验。
describe('OssAuthProvider 注册路径的口令策略校验', () => {
  let service: OssAuthProvider;

  const mockUserRepo = {
    create: jest.fn(),
    findByPhone: jest.fn(),
    findByUsername: jest.fn(),
    findByEmail: jest.fn(),
  };

  const mockAuthTokenService = {
    generateTokens: jest
      .fn()
      .mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' }),
  };

  const mockAccountRateLimitService = {
    checkLimit: jest.fn().mockResolvedValue(undefined),
  };

  const mockPasswordPolicyService = {
    assertPasswordPolicy: jest.fn().mockResolvedValue(undefined),
  };

  const noopService = {
    verifyCode: jest.fn().mockResolvedValue({ valid: true, message: '' }),
    verifyEmail: jest.fn().mockResolvedValue({ valid: true, message: '' }),
  };

  async function compileModule() {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OssAuthProvider,
        { provide: USER_REPOSITORY, useValue: mockUserRepo },
        { provide: ROLE_REPOSITORY, useValue: { findByName: jest.fn() } },
        { provide: JwtService, useValue: { sign: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn(() => 'jwt-secret') } },
        { provide: 'SMS', useValue: noopService },
        { provide: 'EMAIL', useValue: noopService },
        { provide: WechatService, useValue: {} },
        {
          provide: 'CONFIG',
          useValue: {
            getValue: jest.fn(async (key: string) =>
              key === 'smsEnabled' ||
              key === 'requirePhoneVerification' ||
              key === 'allowRegister'
                ? true
                : false
            ),
          },
        },
        { provide: 'USER_SERVICE', useValue: mockUserRepo },
        { provide: RegistrationService, useValue: noopService },
        { provide: LoginService, useValue: noopService },
        { provide: PasswordService, useValue: noopService },
        { provide: AuthTokenService, useValue: mockAuthTokenService },
        { provide: AccountRateLimitService, useValue: mockAccountRateLimitService },
        { provide: InitializationService, useValue: { assertInitialized: jest.fn() } },
        { provide: PasswordPolicyService, useValue: mockPasswordPolicyService },
      ],
    }).compile();
    return module.get<OssAuthProvider>(OssAuthProvider);
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    service = await compileModule();
    // resetMocks 会清掉实现：默认验证码/邮箱验证均通过、口令策略放行
    noopService.verifyCode.mockResolvedValue({ valid: true, message: '' });
    noopService.verifyEmail.mockResolvedValue({ valid: true, message: '' });
    mockPasswordPolicyService.assertPasswordPolicy.mockResolvedValue(undefined);
  });

  it('registerByPhone：弱口令被拒，且不建用户、不消耗短信验证码', async () => {
    mockPasswordPolicyService.assertPasswordPolicy.mockRejectedValue(
      new Error('密码长度至少 10 位')
    );

    await expect(
      service.registerByPhone({
        phone: '13800000000',
        code: '123456',
        username: 'newuser',
        password: 'aaaaaaa',
      } as never)
    ).rejects.toThrow('密码长度至少 10 位');

    expect(mockUserRepo.create).not.toHaveBeenCalled();
    expect(noopService.verifyCode).not.toHaveBeenCalled();
  });

  it('registerByPhone：策略放行后照常建用户', async () => {
    mockUserRepo.create.mockResolvedValue({ id: 'user-9' });

    await expect(
      service.registerByPhone({
        phone: '13800000000',
        code: '123456',
        username: 'newuser',
        password: 'Password123!',
      } as never)
    ).resolves.toBeDefined();

    expect(mockPasswordPolicyService.assertPasswordPolicy).toHaveBeenCalledWith(
      'Password123!'
    );
    expect(mockUserRepo.create).toHaveBeenCalledTimes(1);
  });

  it('verifyEmailAndRegisterPhone：弱口令被拒，且不建用户、不消耗验证码', async () => {
    mockPasswordPolicyService.assertPasswordPolicy.mockRejectedValue(
      new Error('密码过于简单')
    );

    await expect(
      service.verifyEmailAndRegisterPhone('a@example.com', '111111', {
        phone: '13800000000',
        code: '123456',
        username: 'newuser',
        password: 'aaa',
      })
    ).rejects.toThrow('密码过于简单');

    expect(mockUserRepo.create).not.toHaveBeenCalled();
    expect(noopService.verifyEmail).not.toHaveBeenCalled();
    expect(noopService.verifyCode).not.toHaveBeenCalled();
  });
});

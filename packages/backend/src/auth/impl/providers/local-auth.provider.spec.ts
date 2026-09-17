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

  const noopService = { syncBeforeLogin: jest.fn() };

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
    // 微信启用 + 允许注册 + 自动注册；不强制邮箱/手机绑定
    mockRuntimeConfigService.getValue.mockImplementation(
      async (key: string) => {
        if (key === 'wechatEnabled') return true;
        if (key === 'allowRegister') return true;
        if (key === 'wechatAutoRegister') return true;
        return false;
      }
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
});

import { Test, type TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcryptjs';
import { LoginService, ACCOUNT_DEACTIVATED_CODE } from './login.service';
import { AuthTokenService } from './auth-token.service';
import { AccountRateLimitService } from '../../services/account-rate-limit.service';
import { USER_REPOSITORY, USER_SYNC_HOOK } from '@cloudcad/contracts';

// jest.quick.json 配置了 resetMocks:true，会清掉 setup.ts 里 bcryptjs mock 的实现，
// 这里显式恢复 compare/hash 的实现，保证密码校验可控。
beforeEach(() => {
  (bcrypt.compare as jest.Mock).mockResolvedValue(true);
  (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
});

describe('LoginService（登录同步扩展点 + 注销冷静期自动恢复）', () => {
  let service: LoginService;

  const mockUserRepo = {
    findLoginUserIncludingDeleted: jest.fn(),
    update: jest.fn(),
  };

  const mockEmailVerificationService = {
    sendVerificationEmail: jest.fn(),
    verifyEmail: jest.fn(),
  };

  const mockRuntimeConfigService = {
    getValue: jest.fn().mockResolvedValue(false),
  };

  const mockAuthTokenService = {
    generateTokens: jest
      .fn()
      .mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' }),
  };

  const mockTokenBlacklistService = {
    removeUserFromBlacklist: jest.fn(),
  };

  const mockJwtService = {
    signAsync: jest.fn(),
    sign: jest.fn(),
  };

  const mockConfigService = {
    // 按 key 返回：jwt secret 与 userCleanup.delayDays（cleanupDays 单一来源）
    get: jest.fn((key: string) => {
      if (key === 'userCleanup.delayDays') return 30;
      return 'secret';
    }),
  };

  const mockAccountRateLimitService = {
    checkLimit: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn().mockResolvedValue(undefined),
  };

  const mockSyncHook = {
    syncBeforeLogin: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  let loginUser: Record<string, unknown>;

  beforeEach(async () => {
    // resetMocks:true 会清空 mock 实现，这里统一恢复依赖实现
    jest.clearAllMocks();
    mockAuthTokenService.generateTokens.mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
    });
    mockAccountRateLimitService.checkLimit.mockResolvedValue(undefined);
    mockAccountRateLimitService.reset.mockResolvedValue(undefined);
    // 按 key 返回：登录功能开关默认 false，注销冷静期默认 7 天
    mockRuntimeConfigService.getValue.mockImplementation(
      async (key: string) => {
        if (key === 'userCancelGraceDays') return 7;
        return false;
      }
    );
    // resetMocks 清掉了按 key 实现，这里恢复（jwt secret + cleanupDays 单一来源）
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'userCleanup.delayDays') return 30;
      return 'secret';
    });
    loginUser = {
      id: 'user-1',
      email: 'test@example.com',
      username: '13800138000',
      password: 'hashed-password',
      phone: '13800138000',
      phoneVerified: true,
      emailVerified: true,
      status: 'ACTIVE',
      role: { id: 'role-1', name: 'USER' },
      nickname: 'User',
      avatar: null,
      deletedAt: null,
      deactivatedBy: null,
    };
  });

  async function compileModule() {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoginService,
        { provide: USER_REPOSITORY, useValue: mockUserRepo },
        { provide: 'EMAIL', useValue: mockEmailVerificationService },
        { provide: 'CONFIG', useValue: mockRuntimeConfigService },
        { provide: AuthTokenService, useValue: mockAuthTokenService },
        { provide: 'TOKEN_BLACKLIST', useValue: mockTokenBlacklistService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: AccountRateLimitService,
          useValue: mockAccountRateLimitService,
        },
        { provide: USER_SYNC_HOOK, useValue: mockSyncHook },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();
    return module.get<LoginService>(LoginService);
  }

  it('账号已禁用：返回与密码错误相同的通用文案（防枚举）', async () => {
    service = await compileModule();
    mockUserRepo.findLoginUserIncludingDeleted.mockResolvedValue({
      ...loginUser,
      status: 'DISABLED',
    });

    await expect(
      service.login({ account: '13800138000', password: 'password123' })
    ).rejects.toThrow(new UnauthorizedException('账号或密码错误'));
  });

  it('calls sync hook before looking up the local user', async () => {
    service = await compileModule();
    mockUserRepo.findLoginUserIncludingDeleted.mockResolvedValue(loginUser);

    await service.login({ account: '13800138000', password: 'password123' });

    expect(mockSyncHook.syncBeforeLogin).toHaveBeenCalledWith(
      '13800138000',
      'password123'
    );
    const syncOrder = mockSyncHook.syncBeforeLogin.mock.invocationCallOrder[0];
    const lookupOrder =
      mockUserRepo.findLoginUserIncludingDeleted.mock.invocationCallOrder[0];
    expect(syncOrder).toBeLessThan(lookupOrder);
  });

  it('lets the hook create the user then continues the standard login flow', async () => {
    service = await compileModule();
    // 钩子在 findLoginUser 之前同步建号，主流程一次查询即可命中
    mockUserRepo.findLoginUserIncludingDeleted.mockResolvedValue(loginUser);

    const result = await service.login({
      account: '13800138000',
      password: 'password123',
    });

    expect(mockSyncHook.syncBeforeLogin).toHaveBeenCalledWith(
      '13800138000',
      'password123'
    );
    expect(result.accessToken).toBe('at');
  });

  it('propagates auth errors raised by the hook', async () => {
    service = await compileModule();
    mockSyncHook.syncBeforeLogin.mockRejectedValue(
      new UnauthorizedException('手机号或密码错误')
    );

    await expect(
      service.login({ account: '13800138000', password: 'wrong' })
    ).rejects.toThrow(UnauthorizedException);
    expect(mockUserRepo.findLoginUserIncludingDeleted).not.toHaveBeenCalled();
  });

  it('skips the hook entirely when no USER_SYNC_HOOK provider is registered', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoginService,
        { provide: USER_REPOSITORY, useValue: mockUserRepo },
        { provide: 'EMAIL', useValue: mockEmailVerificationService },
        { provide: 'CONFIG', useValue: mockRuntimeConfigService },
        { provide: AuthTokenService, useValue: mockAuthTokenService },
        { provide: 'TOKEN_BLACKLIST', useValue: mockTokenBlacklistService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: AccountRateLimitService,
          useValue: mockAccountRateLimitService,
        },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();
    const ossService = module.get<LoginService>(LoginService);
    mockUserRepo.findLoginUserIncludingDeleted.mockResolvedValue(loginUser);

    const result = await ossService.login({
      account: '13800138000',
      password: 'password123',
    });

    expect(result.accessToken).toBe('at');
    expect(mockSyncHook.syncBeforeLogin).not.toHaveBeenCalled();
  });

  it('注销冷静期内重新登录：自动恢复账户并返回 restored 标记', async () => {
    service = await compileModule();
    // 用户 5 天前自助注销（graceDays 默认 7）
    const deletedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    mockUserRepo.findLoginUserIncludingDeleted.mockResolvedValue({
      ...loginUser,
      status: 'INACTIVE',
      deletedAt,
      deactivatedBy: 'SELF',
    });
    // 恢复成功后返回 ACTIVE 用户
    mockUserRepo.update.mockResolvedValue({
      ...loginUser,
      status: 'ACTIVE',
      deletedAt: null,
      deactivatedBy: null,
    });

    const result = await service.login({
      account: '13800138000',
      password: 'password123',
    });

    expect(mockUserRepo.update).toHaveBeenCalledWith('user-1', {
      deletedAt: null,
      status: 'ACTIVE',
      deactivatedBy: null,
    });
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'user.restored',
      expect.objectContaining({ userId: 'user-1' })
    );
    expect(result.restored).toBe(true);
    expect(result.user.status).toBe('ACTIVE');
  });

  it('注销冷静期已过：拒绝登录并抛 ACCOUNT_DEACTIVATED（含 graceDays/cleanupDays）', async () => {
    service = await compileModule();
    mockRuntimeConfigService.getValue.mockImplementation(async (key: string) => {
      if (key === 'userCancelGraceDays') return 7;
      return false;
    });
    // 用户 10 天前自助注销，冷静期 7 天已过
    const deletedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    mockUserRepo.findLoginUserIncludingDeleted.mockResolvedValue({
      ...loginUser,
      status: 'INACTIVE',
      deletedAt,
      deactivatedBy: 'SELF',
    });

    await expect(
      service.login({ account: '13800138000', password: 'password123' })
    ).rejects.toMatchObject({
      response: {
        code: ACCOUNT_DEACTIVATED_CODE,
        graceDays: 7,
        cleanupDays: 30,
      },
    });
    expect(mockUserRepo.update).not.toHaveBeenCalled();
  });

  it('管理员软删账户登录：不自动恢复，走防枚举通用错误', async () => {
    service = await compileModule();
    // 管理员软删（deactivatedBy=ADMIN），即使 deletedAt 在 7 天内也不自动恢复
    const deletedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    mockUserRepo.findLoginUserIncludingDeleted.mockResolvedValue({
      ...loginUser,
      status: 'INACTIVE',
      deletedAt,
      deactivatedBy: 'ADMIN',
    });

    await expect(
      service.login({ account: '13800138000', password: 'password123' })
    ).rejects.toThrow(new UnauthorizedException('账号或密码错误'));
    expect(mockUserRepo.update).not.toHaveBeenCalled();
  });

  it('存量注销数据（deactivatedBy 为 null）：不自动恢复，走防枚举通用错误', async () => {
    service = await compileModule();
    const deletedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    mockUserRepo.findLoginUserIncludingDeleted.mockResolvedValue({
      ...loginUser,
      status: 'INACTIVE',
      deletedAt,
      deactivatedBy: null,
    });

    await expect(
      service.login({ account: '13800138000', password: 'password123' })
    ).rejects.toThrow(new UnauthorizedException('账号或密码错误'));
    expect(mockUserRepo.update).not.toHaveBeenCalled();
  });

  it('系统管理员禁止通过普通登录入口认证（统一防枚举文案，不发 token）', async () => {
    service = await compileModule();
    mockUserRepo.findLoginUserIncludingDeleted.mockResolvedValue({
      ...loginUser,
      role: { id: 'role-admin', name: 'ADMIN' },
    });

    await expect(
      service.login({ account: '13800138000', password: 'password123' })
    ).rejects.toThrow(new UnauthorizedException('账号或密码错误'));
    // 管理员走专用入口，普通登录不得签发 token，也不触发注销恢复等 DB 副作用
    expect(mockAuthTokenService.generateTokens).not.toHaveBeenCalled();
    expect(mockUserRepo.update).not.toHaveBeenCalled();
  });
});

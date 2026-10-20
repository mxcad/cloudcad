import {
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { FirstAdminSetupService } from './first-admin-setup.service';
import { DatabaseService } from '../../database/database.service';
import { USER_SERVICE } from '../../common/interfaces/user-service.interface';
import { AUTH_TOKEN_SERVICE } from '../interfaces/service-interfaces';
import { AccountRateLimitService } from './account-rate-limit.service';
import { PasswordPolicyService } from './password-policy.service';
import { InitializationService } from './initialization.service';
import { CreateFirstAdminDto } from '../dto/first-admin.dto';

describe('FirstAdminSetupService（Web 首启页创建首个管理员）', () => {
  let service: FirstAdminSetupService;

  const mockPrisma = {
    user: { count: jest.fn() },
    role: { findFirst: jest.fn() },
  } as any;
  const mockUserService = { create: jest.fn() };
  const mockAuthTokenService = { generateTokens: jest.fn() };
  const mockPasswordPolicyService = { assertPasswordPolicy: jest.fn() };
  const mockAccountRateLimitService = { checkLimit: jest.fn() };
  const mockInitializationService = { ensurePublicLibraries: jest.fn() };
  const mockRedis = { set: jest.fn(), del: jest.fn() };

  const validDto: CreateFirstAdminDto = {
    username: 'admin',
    password: 'Str0ng!Passw0rd#2026',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FirstAdminSetupService,
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: USER_SERVICE, useValue: mockUserService },
        { provide: AUTH_TOKEN_SERVICE, useValue: mockAuthTokenService },
        { provide: PasswordPolicyService, useValue: mockPasswordPolicyService },
        {
          provide: AccountRateLimitService,
          useValue: mockAccountRateLimitService,
        },
        {
          provide: InitializationService,
          useValue: mockInitializationService,
        },
        { provide: 'default_IORedisModuleConnectionToken', useValue: mockRedis },
      ],
    }).compile();

    service = module.get<FirstAdminSetupService>(FirstAdminSetupService);
  });

  /** 模拟「拿锁成功 + 锁内复查仍零用户 + ADMIN 角色存在」的通过前置 */
  function mockLockAcquired(userCount = 0) {
    mockPrisma.user.count.mockResolvedValue(userCount);
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);
    mockPrisma.role.findFirst.mockResolvedValue({ id: 'role-admin' });
  }

  describe('getSetupStatus', () => {
    it('零用户 → setupRequired=true', async () => {
      mockPrisma.user.count.mockResolvedValue(0);

      await expect(service.getSetupStatus()).resolves.toEqual({
        setupRequired: true,
      });
    });

    it('已有用户 → setupRequired=false', async () => {
      mockPrisma.user.count.mockResolvedValue(3);

      await expect(service.getSetupStatus()).resolves.toEqual({
        setupRequired: false,
      });
    });
  });

  describe('createFirstAdmin', () => {
    it('已有用户时拒绝（403），不创建用户', async () => {
      mockPrisma.user.count.mockResolvedValue(1);

      await expect(service.createFirstAdmin(validDto)).rejects.toThrow(
        ForbiddenException
      );
      expect(mockUserService.create).not.toHaveBeenCalled();
    });

    it('口令不符合策略时拒绝（策略异常向上传播）', async () => {
      mockLockAcquired();
      mockPasswordPolicyService.assertPasswordPolicy.mockRejectedValue(
        new Error('weak password')
      );

      await expect(service.createFirstAdmin(validDto)).rejects.toThrow(
        'weak password'
      );
      expect(mockUserService.create).not.toHaveBeenCalled();
    });

    it('账号限流超限时拒绝（限流异常向上传播）', async () => {
      mockLockAcquired();
      mockAccountRateLimitService.checkLimit.mockRejectedValue(
        new Error('rate limited')
      );

      await expect(service.createFirstAdmin(validDto)).rejects.toThrow(
        'rate limited'
      );
      expect(mockUserService.create).not.toHaveBeenCalled();
    });

    it('Redis 锁被占用（并发双开）时拒绝，fail-closed', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockRedis.set.mockResolvedValue(null);

      await expect(service.createFirstAdmin(validDto)).rejects.toThrow(
        ForbiddenException
      );
      expect(mockUserService.create).not.toHaveBeenCalled();
    });

    it('Redis 故障时 fail-closed（不放行）', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockRedis.set.mockRejectedValue(new Error('redis down'));

      await expect(service.createFirstAdmin(validDto)).rejects.toThrow(
        ForbiddenException
      );
      expect(mockUserService.create).not.toHaveBeenCalled();
    });

    it('锁内复查发现已有用户（拿锁前对方已创建）时拒绝', async () => {
      // 首次 count=0 通过前置检查，锁内复查 count=1
      let call = 0;
      mockPrisma.user.count.mockImplementation(async () => {
        call += 1;
        return call === 1 ? 0 : 1;
      });
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.del.mockResolvedValue(1);

      await expect(service.createFirstAdmin(validDto)).rejects.toThrow(
        ForbiddenException
      );
      expect(mockUserService.create).not.toHaveBeenCalled();
    });

    it('ADMIN 角色缺失时抛 InternalServerErrorException', async () => {
      mockLockAcquired();
      mockPrisma.role.findFirst.mockResolvedValue(null);

      await expect(service.createFirstAdmin(validDto)).rejects.toThrow(
        InternalServerErrorException
      );
      expect(mockUserService.create).not.toHaveBeenCalled();
    });

    it('成功路径：以 ADMIN 角色建用户 + 补建公共资源库 + 发 token + 写会话', async () => {
      mockLockAcquired();
      const createdUser = {
        id: 'admin-1',
        username: 'admin',
        email: null,
        role: { id: 'role-admin', name: 'ADMIN' },
        status: 'ACTIVE',
      };
      mockUserService.create.mockResolvedValue(createdUser);
      mockAuthTokenService.generateTokens.mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
      });
      mockInitializationService.ensurePublicLibraries.mockResolvedValue(undefined);

      const req = {
        session: {
          userId: undefined as string | undefined,
          userRole: undefined as string | undefined,
          save: jest.fn().mockResolvedValue(undefined),
        },
      };

      const result = await service.createFirstAdmin(validDto, req as any);

      // 以 ADMIN 角色创建
      expect(mockUserService.create).toHaveBeenCalledWith({
        email: undefined,
        username: 'admin',
        password: validDto.password,
        nickname: 'admin',
        roleId: 'role-admin',
      });
      // 补建公共资源库（零用户启动时被跳过）
      expect(mockInitializationService.ensurePublicLibraries).toHaveBeenCalled();
      // 发 token + 写会话（角色回落 ADMIN）
      expect(mockAuthTokenService.generateTokens).toHaveBeenCalledWith(createdUser);
      expect(req.session.userId).toBe('admin-1');
      expect(req.session.userRole).toBe('ADMIN');
      // 返回 token + 用户
      expect(result).toEqual({
        accessToken: 'at',
        refreshToken: 'rt',
        user: createdUser,
      });
      // 锁释放
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('成功路径：nickname 缺省取用户名，email 空串归一为 undefined', async () => {
      mockLockAcquired();
      mockUserService.create.mockResolvedValue({
        id: 'admin-1',
        username: 'admin',
        email: null,
        role: { id: 'role-admin', name: 'ADMIN' },
        status: 'ACTIVE',
      });
      mockAuthTokenService.generateTokens.mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
      });

      await service.createFirstAdmin({
        username: 'admin',
        password: validDto.password,
        email: '',
      });

      expect(mockUserService.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: undefined, nickname: 'admin' })
      );
    });
  });
});

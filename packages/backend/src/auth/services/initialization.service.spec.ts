import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { BlacklistSource } from '@cloudcad/db';
import { InitializationService } from './initialization.service';
import { DatabaseService } from '../../database/database.service';
import { RoleInheritanceService } from '../../permission/services/role-inheritance.service';
import { USER_SERVICE } from '../../common/interfaces/user-service.interface';
import { PASSWORD_HASHER } from '../../users/interfaces/password-hasher.interface';

describe('InitializationService（#416 初始管理员 env 必填）', () => {
  let service: InitializationService;

  const mockPrisma = {
    user: {
      count: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    fileSystemNode: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    role: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    rolePermission: {
      createMany: jest.fn(),
    },
    projectRole: {
      findFirst: jest.fn(),
    },
    projectRolePermission: {
      createMany: jest.fn(),
    },
    ipWhitelistEntry: {
      findMany: jest.fn(),
      createMany: jest.fn(),
    },
  } as any;
  const mockConfigService = {
    get: jest.fn(),
  };
  const mockRoleInheritanceService = {
    initializeRoleHierarchy: jest.fn(),
    forceRefreshRolePermissions: jest.fn(),
    clearRoleCache: jest.fn(),
  };
  const mockUserService = {
    create: jest.fn(),
  };
  const mockPasswordHasher = {
    compare: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockRoleInheritanceService.initializeRoleHierarchy.mockResolvedValue(
      undefined
    );
    mockRoleInheritanceService.forceRefreshRolePermissions.mockResolvedValue(
      undefined
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InitializationService,
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: RoleInheritanceService,
          useValue: mockRoleInheritanceService,
        },
        { provide: USER_SERVICE, useValue: mockUserService },
        { provide: PASSWORD_HASHER, useValue: mockPasswordHasher },
      ],
    }).compile();

    service = module.get<InitializationService>(InitializationService);
  });

  /** 模拟首次启动（空库）+ 已有 ADMIN 角色的前置条件 */
  function mockFirstBoot(adminPassword: string | undefined) {
    mockPrisma.user.count.mockResolvedValue(0);
    mockPrisma.role.findFirst.mockResolvedValue({ id: 'role-admin' });
    mockPrisma.user.update.mockResolvedValue({});
    mockConfigService.get.mockImplementation((key: string, def?: unknown) => {
      if (key === 'INITIAL_ADMIN_EMAIL') return 'admin@example.com';
      if (key === 'INITIAL_ADMIN_USERNAME') return 'admin';
      if (key === 'INITIAL_ADMIN_PASSWORD') return adminPassword;
      return def;
    });
    mockUserService.create.mockResolvedValue({ id: 'admin-1' });
  }

  it('无 INITIAL_ADMIN_PASSWORD env 时首次启动不崩溃：告警并等待 Web 首启页创建首个管理员', async () => {
    mockFirstBoot(undefined);
    const warnSpy = jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation(() => undefined);

    // 不再抛错（旧行为：抛 InternalServerErrorException 致启动失败）
    await (service as any).checkAndCreateInitialAdmin();

    // 不创建用户，仅告警提示走 Web 首启页
    expect(mockUserService.create).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('有 INITIAL_ADMIN_PASSWORD env 时创建初始管理员并置 passwordChangedAt=null（首登未改密标记）', async () => {
    mockFirstBoot('Str0ng!Admin#2026');

    await (service as any).checkAndCreateInitialAdmin();

    expect(mockUserService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        password: 'Str0ng!Admin#2026',
        roleId: 'role-admin',
      })
    );
    // 创建后置 passwordChangedAt=null（覆盖 create 默认写入的 now()）
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'admin-1' },
      data: { passwordChangedAt: null },
    });
  });

  it('启动日志不打印明文口令（#416 安全回归）', async () => {
    mockFirstBoot('Str0ng!Admin#2026');
    const logSpy = jest
      .spyOn((service as any).logger, 'log')
      .mockImplementation(() => undefined);

    await (service as any).checkAndCreateInitialAdmin();

    // 所有日志输出均不应包含明文口令
    const allLogOutput = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(allLogOutput).not.toContain('Str0ng!Admin#2026');
  });

  it('非首次启动（已有用户）时跳过管理员创建', async () => {
    mockPrisma.user.count.mockResolvedValue(5);
    mockConfigService.get.mockImplementation(() => undefined);

    await (service as any).checkAndCreateInitialAdmin();

    expect(mockUserService.create).not.toHaveBeenCalled();
    expect(mockPrisma.role.findFirst).not.toHaveBeenCalled();
  });

  it('回归：首次启动全流程（onModuleInit）默认白名单条目必须在管理员创建前写入', async () => {
    // 状态化用户数：首次启动为 0，管理员创建后变 1——复现 onModuleInit 的真实时序。
    // 缺陷形态：ensureDefaultAdminIpWhitelist 排在 checkAndCreateInitialAdmin 之后时，
    // 其 userCount==0 守卫恒假 → 默认放行条目永不写入 → 白名单空表 fail-close，
    // 远程管理员在全新部署上无法登录（2026-10-20 docker windows 宿主 E2E 实测）。
    let userCount = 0;
    mockPrisma.user.count.mockImplementation(async () => userCount);
    mockPrisma.role.findMany.mockResolvedValue([]); // 无重复系统角色
    mockPrisma.role.findFirst.mockResolvedValue({
      id: 'role-admin',
      name: 'ADMIN',
      permissions: [],
    });
    mockPrisma.rolePermission.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.projectRole.findFirst.mockResolvedValue({
      id: 'proj-role',
      name: 'PROJECT_OWNER',
      permissions: [],
    });
    mockPrisma.projectRolePermission.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.user.update.mockResolvedValue({});
    mockPrisma.user.findFirst.mockResolvedValue(null); // 无管理员用户 → 跳过资源库
    mockPrisma.user.findMany.mockResolvedValue([]); // 无用户 → 跳过私人空间
    mockPrisma.fileSystemNode.findMany.mockResolvedValue([]);
    mockPrisma.fileSystemNode.findFirst.mockResolvedValue({ id: 'lib-1' });
    mockPrisma.ipWhitelistEntry.findMany.mockResolvedValue([]);
    mockPrisma.ipWhitelistEntry.createMany.mockResolvedValue({ count: 2 });
    mockConfigService.get.mockImplementation((key: string, def?: unknown) => {
      if (key === 'INITIAL_ADMIN_EMAIL') return 'admin@example.com';
      if (key === 'INITIAL_ADMIN_USERNAME') return 'admin';
      if (key === 'INITIAL_ADMIN_PASSWORD') return 'Str0ng!Admin#2026';
      return def;
    });
    mockUserService.create.mockImplementation(async () => {
      userCount = 1; // 管理员创建完成
      return { id: 'admin-1' };
    });

    await service.onModuleInit();

    // 默认放行条目必须已写入（守卫 userCount==0 只在管理员创建前成立）
    expect(mockPrisma.ipWhitelistEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ ip: '0.0.0.0/0' }),
        expect.objectContaining({ ip: '::/0' }),
      ],
    });
  });

  describe('ensureDefaultAdminIpWhitelist（首次部署默认全局可访问）', () => {
    it('首次启动写入 0.0.0.0/0 + ::/0（source=AUTO, createdBy=system）', async () => {
      mockFirstBoot('Str0ng!Admin#2026');
      mockPrisma.ipWhitelistEntry.findMany.mockResolvedValue([]);
      mockPrisma.ipWhitelistEntry.createMany.mockResolvedValue({ count: 2 });

      await (service as any).ensureDefaultAdminIpWhitelist();

      expect(mockPrisma.ipWhitelistEntry.createMany).toHaveBeenCalledWith({
        data: [
          {
            ip: '0.0.0.0/0',
            source: BlacklistSource.AUTO,
            reason: expect.any(String),
            createdBy: 'system',
          },
          {
            ip: '::/0',
            source: BlacklistSource.AUTO,
            reason: expect.any(String),
            createdBy: 'system',
          },
        ],
      });
    });

    it('非首次启动永不插入：升级与重启不自动放宽白名单', async () => {
      mockPrisma.user.count.mockResolvedValue(3);

      await (service as any).ensureDefaultAdminIpWhitelist();

      expect(mockPrisma.ipWhitelistEntry.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.ipWhitelistEntry.createMany).not.toHaveBeenCalled();
    });

    it('删除默认条目后重启不会重新插入（仅首次启动 + 一次性）', async () => {
      // 模拟：用户已删掉默认条目，且环境已有用户（非首次启动）
      mockPrisma.user.count.mockResolvedValue(1);
      mockPrisma.ipWhitelistEntry.findMany.mockResolvedValue([]);

      await (service as any).ensureDefaultAdminIpWhitelist();

      expect(mockPrisma.ipWhitelistEntry.createMany).not.toHaveBeenCalled();
    });

    it('部分存在时仅插入缺失条目（幂等）', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.ipWhitelistEntry.findMany.mockResolvedValue([
        { ip: '0.0.0.0/0' },
      ]);
      mockPrisma.ipWhitelistEntry.createMany.mockResolvedValue({ count: 1 });

      await (service as any).ensureDefaultAdminIpWhitelist();

      expect(mockPrisma.ipWhitelistEntry.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ ip: '::/0' })],
      });
    });

    it('默认条目已全存在时跳过插入', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.ipWhitelistEntry.findMany.mockResolvedValue([
        { ip: '0.0.0.0/0' },
        { ip: '::/0' },
      ]);

      await (service as any).ensureDefaultAdminIpWhitelist();

      expect(mockPrisma.ipWhitelistEntry.createMany).not.toHaveBeenCalled();
    });
  });

  describe('assertInitialized（首启守卫：零用户系统禁止非供给路径建用户）', () => {
    it('零用户时抛 BadRequestException（注册等入口据此拒绝）', async () => {
      mockPrisma.user.count.mockResolvedValue(0);

      await expect(service.assertInitialized()).rejects.toThrow(
        BadRequestException
      );
    });

    it('已有用户时放行', async () => {
      mockPrisma.user.count.mockResolvedValue(1);

      await expect(service.assertInitialized()).resolves.toBeUndefined();
    });
  });

  describe('warnIfStaleInitialAdminPassword（幽灵初始管理员密码告警）', () => {
    /** 已有用户 + 预置口令的前置条件 */
    function mockInitializedWithPreset(preset: string) {
      mockPrisma.user.count.mockResolvedValue(1);
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'INITIAL_ADMIN_USERNAME') return 'admin';
        if (key === 'INITIAL_ADMIN_PASSWORD') return preset;
        return undefined;
      });
    }

    it('初始管理员不存在（由 Web 首启等路径以其他用户名创建）→ 告警', async () => {
      mockInitializedWithPreset('Phantom#Pass2026');
      mockPrisma.user.findFirst.mockResolvedValue(null);
      const warnSpy = jest
        .spyOn((service as any).logger, 'warn')
        .mockImplementation(() => undefined);

      await (service as any).checkAndCreateInitialAdmin();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('不会生效'));
    });

    it('初始管理员从未改密但哈希与预置口令不符（上次部署/手工改 .env 残留）→ 告警', async () => {
      mockInitializedWithPreset('Phantom#Pass2026');
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'admin-1',
        username: 'admin',
        password: '$2b$10$someOtherHash',
        passwordChangedAt: null,
      });
      mockPasswordHasher.compare.mockResolvedValue(false);
      const warnSpy = jest
        .spyOn((service as any).logger, 'warn')
        .mockImplementation(() => undefined);

      await (service as any).checkAndCreateInitialAdmin();

      expect(mockPasswordHasher.compare).toHaveBeenCalledWith(
        'Phantom#Pass2026',
        '$2b$10$someOtherHash'
      );
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('不会生效'));
    });

    it('哈希相符（预置口令正是当前生效密码，正常部署重启）→ 静默不误报', async () => {
      mockInitializedWithPreset('Str0ng!Admin#2026');
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'admin-1',
        username: 'admin',
        password: '$2b$10$matchingHash',
        passwordChangedAt: null,
      });
      mockPasswordHasher.compare.mockResolvedValue(true);
      const warnSpy = jest
        .spyOn((service as any).logger, 'warn')
        .mockImplementation(() => undefined);

      await (service as any).checkAndCreateInitialAdmin();

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('用户已自行改密（passwordChangedAt 非空）→ 静默（预置值已无意义）', async () => {
      mockInitializedWithPreset('Phantom#Pass2026');
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'admin-1',
        username: 'admin',
        password: '$2b$10$someHash',
        passwordChangedAt: new Date(),
      });

      await (service as any).checkAndCreateInitialAdmin();

      // 已改密 → 连哈希比对都不做
      expect(mockPasswordHasher.compare).not.toHaveBeenCalled();
    });

    it('未设置 INITIAL_ADMIN_PASSWORD → 不查用户、不告警', async () => {
      mockPrisma.user.count.mockResolvedValue(1);
      mockConfigService.get.mockImplementation(() => undefined);

      await (service as any).checkAndCreateInitialAdmin();

      expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    });
  });
});

import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { AccountRateLimitService } from './account-rate-limit.service';
import { AlertService } from '../../alert/alert.service';

describe('AccountRateLimitService', () => {
  let service: AccountRateLimitService;

  const mockRedis = {
    incr: jest.fn(),
    expire: jest.fn(),
    del: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
  } as any;

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockAlertService = {
    raise: jest.fn().mockResolvedValue({ id: 'alert-1' }),
  };

  const defaultConfig = {
    loginMax: 5,
    loginWindowSeconds: 60,
    passwordResetMax: 5,
    passwordResetWindowSeconds: 3600,
    registerMax: 5,
    registerWindowSeconds: 3600,
  };

  const defaultLockConfig = {
    failThreshold: 10,
    windowSeconds: 900,
    durationSeconds: 1800,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'authRateLimit') {
        return { ...defaultConfig };
      }
      if (key === 'accountLock') {
        return { ...defaultLockConfig };
      }
      return undefined;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountRateLimitService,
        { provide: 'default_IORedisModuleConnectionToken', useValue: mockRedis },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AlertService, useValue: mockAlertService },
      ],
    }).compile();

    service = module.get<AccountRateLimitService>(AccountRateLimitService);
  });

  describe('checkLimit', () => {
    it('应在未超过阈值时放行并设置过期时间', async () => {
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);

      await expect(service.checkLimit('login', 'user@example.com')).resolves.toBeUndefined();

      expect(mockRedis.incr).toHaveBeenCalledWith('account-rate-limit:login:user@example.com');
      expect(mockRedis.expire).toHaveBeenCalledWith(
        'account-rate-limit:login:user@example.com',
        60,
      );
    });

    it('超过阈值（第 6 次）时抛出 429', async () => {
      mockRedis.incr.mockResolvedValue(6);

      await expect(service.checkLimit('login', 'user@example.com')).rejects.toThrow(
        HttpException,
      );
      await expect(service.checkLimit('login', 'user@example.com')).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
    });

    it('未超过阈值时不抛异常', async () => {
      mockRedis.incr.mockResolvedValue(5);

      await expect(service.checkLimit('login', 'user@example.com')).resolves.toBeUndefined();
    });

    it('标识符应做大小写与空白归一化（防绕过）', async () => {
      mockRedis.incr.mockResolvedValue(1);

      await service.checkLimit('login', '  User@Example.COM  ');

      expect(mockRedis.incr).toHaveBeenCalledWith('account-rate-limit:login:user@example.com');
    });

    it('password_reset 使用 1 小时窗口', async () => {
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);

      await service.checkLimit('password_reset', 'user@example.com');

      expect(mockRedis.expire).toHaveBeenCalledWith(
        'account-rate-limit:password_reset:user@example.com',
        3600,
      );
    });

    it('register 使用独立阈值', async () => {
      mockRedis.incr.mockResolvedValue(6);

      await expect(service.checkLimit('register', 'new-user')).rejects.toThrow(HttpException);
    });

    it('max 为 0 时禁用限流（不调用 Redis）', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'authRateLimit') {
          return { ...defaultConfig, loginMax: 0 };
        }
        return undefined;
      });

      await expect(service.checkLimit('login', 'user@example.com')).resolves.toBeUndefined();
      expect(mockRedis.incr).not.toHaveBeenCalled();
    });

    it('空标识符直接放行', async () => {
      await expect(service.checkLimit('login', '')).resolves.toBeUndefined();
      await expect(service.checkLimit('login', undefined as unknown as string)).resolves.toBeUndefined();
      expect(mockRedis.incr).not.toHaveBeenCalled();
    });

    it('Redis 故障时 fail-open（放行）', async () => {
      mockRedis.incr.mockRejectedValue(new Error('redis down'));

      await expect(service.checkLimit('login', 'user@example.com')).resolves.toBeUndefined();
    });
  });

  describe('reset', () => {
    it('应删除对应账号的计数键', async () => {
      mockRedis.del.mockResolvedValue(1);

      await service.reset('login', 'user@example.com');

      expect(mockRedis.del).toHaveBeenCalledWith('account-rate-limit:login:user@example.com');
    });

    it('Redis 故障时不抛异常', async () => {
      mockRedis.del.mockRejectedValue(new Error('redis down'));

      await expect(service.reset('login', 'user@example.com')).resolves.toBeUndefined();
    });
  });

  describe('checkAccountLock（#416 失败锁定）', () => {
    it('锁期内抛 429 并告知剩余分钟', async () => {
      const lockUntil = Date.now() + 10 * 60 * 1000; // 10 分钟后到期
      mockRedis.get.mockResolvedValue(String(lockUntil));

      await expect(service.checkAccountLock('user@example.com')).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
      expect(mockRedis.get).toHaveBeenCalledWith(
        'account-lock:locked:user@example.com',
      );
    });

    it('未锁定（无 lock key）时放行', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(service.checkAccountLock('user@example.com')).resolves.toBeUndefined();
    });

    it('锁已过期（lockUntil 已过）时放行', async () => {
      mockRedis.get.mockResolvedValue(String(Date.now() - 1000));

      await expect(service.checkAccountLock('user@example.com')).resolves.toBeUndefined();
    });

    it('Redis 故障时降级进程内判定（无进程内锁则放行）', async () => {
      mockRedis.get.mockRejectedValue(new Error('redis down'));

      await expect(service.checkAccountLock('user@example.com')).resolves.toBeUndefined();
    });
  });

  describe('recordLoginFailure（#416 失败计数→锁定）', () => {
    it('首次失败（count=1）设置窗口 TTL', async () => {
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);

      await service.recordLoginFailure('user@example.com');

      expect(mockRedis.incr).toHaveBeenCalledWith(
        'account-lock:fail:user@example.com',
      );
      // 窗口从首次失败起算（滑动窗口）
      expect(mockRedis.expire).toHaveBeenCalledWith(
        'account-lock:fail:user@example.com',
        900,
      );
      // 未达阈值，不置锁
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('达阈值（第 10 次）时置 30 分钟锁', async () => {
      mockRedis.incr.mockResolvedValue(10);
      mockRedis.set.mockResolvedValue('OK');

      await service.recordLoginFailure('user@example.com');

      expect(mockRedis.incr).toHaveBeenCalledWith(
        'account-lock:fail:user@example.com',
      );
      // 锁 key 写入到期时间戳，TTL=durationSeconds
      expect(mockRedis.set).toHaveBeenCalledWith(
        'account-lock:locked:user@example.com',
        expect.any(String),
        'EX',
        1800,
      );
    });

    it('未达阈值（第 5 次）时不置锁', async () => {
      mockRedis.incr.mockResolvedValue(5);
      mockRedis.expire.mockResolvedValue(1);

      await service.recordLoginFailure('user@example.com');

      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('达阈值置锁时上报 P1 暴力破解告警（#418）', async () => {
      mockRedis.incr.mockResolvedValue(10);
      mockRedis.set.mockResolvedValue('OK');

      await service.recordLoginFailure('user@example.com');

      expect(mockAlertService.raise).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'auth',
          messageKey: 'security.brute_force_suspected',
          level: 'P1',
          detail: {
            account: 'user@example.com',
            count: 10,
            lockMinutes: 30,
          },
        }),
      );
    });

    it('未达阈值不上报暴力破解告警（#418）', async () => {
      mockRedis.incr.mockResolvedValue(5);
      mockRedis.expire.mockResolvedValue(1);

      await service.recordLoginFailure('user@example.com');

      expect(mockAlertService.raise).not.toHaveBeenCalled();
    });

    it('Redis 故障时降级进程内计数（达阈值置进程内锁）', async () => {
      mockRedis.incr.mockRejectedValue(new Error('redis down'));

      // 连续 10 次失败（进程内计数）
      for (let i = 0; i < 10; i++) {
        await service.recordLoginFailure('user@example.com');
      }

      // 进程内已锁定：checkAccountLock 在 Redis 故障时降级判定应抛 429
      mockRedis.get.mockRejectedValue(new Error('redis down'));
      await expect(service.checkAccountLock('user@example.com')).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
    });
  });

  describe('clearLoginFailures（#416 成功清零）', () => {
    it('应删除失败计数键（锁 key 不清除，到期自愈）', async () => {
      mockRedis.del.mockResolvedValue(1);

      await service.clearLoginFailures('user@example.com');

      expect(mockRedis.del).toHaveBeenCalledWith(
        'account-lock:fail:user@example.com',
      );
    });

    it('Redis 故障时不抛异常', async () => {
      mockRedis.del.mockRejectedValue(new Error('redis down'));

      await expect(service.clearLoginFailures('user@example.com')).resolves.toBeUndefined();
    });
  });
});

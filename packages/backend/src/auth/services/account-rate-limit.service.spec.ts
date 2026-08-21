import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { AccountRateLimitService } from './account-rate-limit.service';

describe('AccountRateLimitService', () => {
  let service: AccountRateLimitService;

  const mockRedis = {
    incr: jest.fn(),
    expire: jest.fn(),
    del: jest.fn(),
  } as any;

  const mockConfigService = {
    get: jest.fn(),
  };

  const defaultConfig = {
    loginMax: 5,
    loginWindowSeconds: 60,
    passwordResetMax: 5,
    passwordResetWindowSeconds: 3600,
    registerMax: 5,
    registerWindowSeconds: 3600,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'authRateLimit') {
        return { ...defaultConfig };
      }
      return undefined;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountRateLimitService,
        { provide: 'default_IORedisModuleConnectionToken', useValue: mockRedis },
        { provide: ConfigService, useValue: mockConfigService },
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
});

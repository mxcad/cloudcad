///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRedisConnectionToken } from '@nestjs-modules/ioredis';
import { EmailService } from './email.service';
import { EmailVerificationService } from './email-verification.service';

/** 内存版 Redis 假实现：覆盖 setex/get/exists/incr/ttl/expire/del */
function createMockRedis() {
  const store = new Map<string, string>();
  return {
    store,
    setex: jest.fn(async (key: string, _ttl: number, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    exists: jest.fn(async (key: string) => (store.has(key) ? 1 : 0)),
    incr: jest.fn(async (key: string) => {
      const next = (parseInt(store.get(key) || '0', 10) || 0) + 1;
      store.set(key, String(next));
      return next;
    }),
    ttl: jest.fn(async () => 60),
    expire: jest.fn(async () => 1),
    del: jest.fn(async (...keys: string[]) => {
      keys.forEach((k) => store.delete(k));
      return keys.length;
    }),
  };
}

describe('EmailVerificationService', () => {
  let service: EmailVerificationService;
  let mockRedis: ReturnType<typeof createMockRedis>;
  const mockEmailService = { sendVerificationEmail: jest.fn() };

  const cacheTTL = {
    verificationCode: 900,
    verificationRateLimit: 60,
    tokenBlacklist: 300,
    cacheVersion: 60,
    default: 300,
    mxcad: 300,
    permission: 300,
    policy: 300,
  };

  const codeKey = (email: string) => `email_verification:code:${email}`;
  const rateKey = (email: string) => `email_verification:rate_limit:${email}`;
  const attemptsKey = (email: string) =>
    `email_verification:verify_attempts:${email}:${new Date().toISOString().slice(0, 10)}`;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedis = createMockRedis();
    mockEmailService.sendVerificationEmail.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailVerificationService,
        { provide: EmailService, useValue: mockEmailService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'cacheTTL' ? cacheTTL : undefined
            ),
          },
        },
        { provide: getRedisConnectionToken(), useValue: mockRedis },
      ],
    }).compile();

    service = module.get<EmailVerificationService>(EmailVerificationService);
  });

  describe('sendVerificationEmail', () => {
    it('should generate 6-digit code, send email and set rate limit', async () => {
      await service.sendVerificationEmail('a@b.com');

      const code = mockRedis.store.get(codeKey('a@b.com'));
      expect(code).toMatch(/^\d{6}$/);
      expect(mockEmailService.sendVerificationEmail).toHaveBeenCalledWith(
        'a@b.com',
        code
      );
      expect(mockRedis.store.get(rateKey('a@b.com'))).toBe('1');
    });

    it('should reject when rate limited', async () => {
      mockRedis.store.set(rateKey('a@b.com'), '1');

      await expect(service.sendVerificationEmail('a@b.com')).rejects.toThrow(
        '发送过于频繁，请稍后再试'
      );
      expect(mockEmailService.sendVerificationEmail).not.toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    it('should reject when code not stored or expired', async () => {
      await expect(
        service.verifyEmail('a@b.com', '123456')
      ).rejects.toThrow('验证码无效或已过期');
    });

    it('should succeed with correct code and clear all keys', async () => {
      mockRedis.store.set(codeKey('a@b.com'), '123456');
      mockRedis.store.set(rateKey('a@b.com'), '1');

      const result = await service.verifyEmail('a@b.com', '123456');

      expect(result).toEqual({ valid: true, message: '验证成功' });
      expect(mockRedis.store.has(codeKey('a@b.com'))).toBe(false);
      expect(mockRedis.store.has(rateKey('a@b.com'))).toBe(false);
    });

    it('should decrement remaining attempts on wrong code', async () => {
      mockRedis.store.set(codeKey('a@b.com'), '123456');

      await expect(
        service.verifyEmail('a@b.com', '000000')
      ).rejects.toThrow('验证码错误，剩余 4 次尝试机会');
      expect(mockRedis.store.get(attemptsKey('a@b.com'))).toBe('1');
    });

    it('should exhaust after max attempts and delete code', async () => {
      mockRedis.store.set(codeKey('a@b.com'), '123456');

      // 前 5 次错答：剩余 4/3/2/1/0 次
      for (let remaining = 4; remaining >= 0; remaining--) {
        await expect(
          service.verifyEmail('a@b.com', '000000')
        ).rejects.toThrow(`验证码错误，剩余 ${remaining} 次尝试机会`);
      }
      expect(mockRedis.store.has(codeKey('a@b.com'))).toBe(true);

      // 第 6 次错答：次数用尽，验证码与计数一并清除
      await expect(
        service.verifyEmail('a@b.com', '000000')
      ).rejects.toThrow('验证次数已用完，请重新获取验证码');
      expect(mockRedis.store.has(codeKey('a@b.com'))).toBe(false);
      expect(mockRedis.store.has(attemptsKey('a@b.com'))).toBe(false);
    });
  });

  describe('resendVerificationEmail', () => {
    it('should delegate to sendVerificationEmail', async () => {
      await service.resendVerificationEmail('a@b.com');

      expect(mockEmailService.sendVerificationEmail).toHaveBeenCalledTimes(1);
      expect(mockRedis.store.has(codeKey('a@b.com'))).toBe(true);
    });
  });
});

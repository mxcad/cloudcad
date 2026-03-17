///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailVerificationService } from './email-verification.service';
import { EmailService } from './email.service';

describe('EmailVerificationService', () => {
  let service: EmailVerificationService;
  let emailService: jest.Mocked<EmailService>;
  let configService: jest.Mocked<ConfigService>;
  let mockRedis: any;

  beforeEach(async () => {
    mockRedis = {
      setex: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
    };

    const mockEmailService = {
      sendVerificationEmail: jest.fn(),
    } as any;

    const mockConfigService = {
      get: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailVerificationService,
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: 'default_IORedisModuleConnectionToken',
          useValue: mockRedis,
        },
      ],
    })
      .setLogger({
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        verbose: jest.fn(),
      })
      .compile();

    service = module.get<EmailVerificationService>(EmailVerificationService);
    emailService = module.get(EmailService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateVerificationToken', () => {
    it('should generate a 6-digit verification code', async () => {
      const email = 'test@example.com';
      mockRedis.setex.mockResolvedValue('OK');

      const token = await service.generateVerificationToken(email);

      expect(token).toMatch(/^\d{6}$/);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        `email_verification:code:${email}`,
        15 * 60,
        token
      );
    });

    it('should store code in Redis with 15 minutes TTL', async () => {
      const email = 'test@example.com';
      mockRedis.setex.mockResolvedValue('OK');

      await service.generateVerificationToken(email);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringContaining('email_verification:code:'),
        15 * 60,
        expect.any(String)
      );
    });
  });

  describe('sendVerificationEmail', () => {
    it('should send verification email successfully', async () => {
      const email = 'test@example.com';
      mockRedis.exists.mockResolvedValue(0);
      mockRedis.setex.mockResolvedValue('OK');
      emailService.sendVerificationEmail.mockResolvedValue(undefined);

      await service.sendVerificationEmail(email);

      expect(mockRedis.exists).toHaveBeenCalledWith(
        `email_verification:rate_limit:${email}`
      );
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
        email,
        expect.stringMatching(/^\d{6}$/)
      );
      expect(mockRedis.setex).toHaveBeenCalledWith(
        `email_verification:rate_limit:${email}`,
        60,
        '1'
      );
    });

    it('should throw BadRequestException when rate limit exceeded', async () => {
      const email = 'test@example.com';
      mockRedis.exists.mockResolvedValue(1);

      await expect(service.sendVerificationEmail(email)).rejects.toThrow(
        BadRequestException
      );
      await expect(service.sendVerificationEmail(email)).rejects.toThrow(
        '发送过于频繁，请稍后再试'
      );
    });

    it('should handle email service errors', async () => {
      const email = 'test@example.com';
      mockRedis.exists.mockResolvedValue(0);
      mockRedis.setex.mockResolvedValue('OK');
      emailService.sendVerificationEmail.mockRejectedValue(
        new Error('Email service error')
      );

      await expect(service.sendVerificationEmail(email)).rejects.toThrow(
        'Email service error'
      );
    });
  });

  describe('verifyEmail', () => {
    it('should verify email successfully with correct code', async () => {
      const email = 'test@example.com';
      const code = '123456';
      mockRedis.get.mockResolvedValue(code);
      mockRedis.del.mockResolvedValue(1);

      const result = await service.verifyEmail(email, code);

      expect(result).toBe(true);
      expect(mockRedis.get).toHaveBeenCalledWith(
        `email_verification:code:${email}`
      );
      expect(mockRedis.del).toHaveBeenCalledWith(
        `email_verification:code:${email}`
      );
    });

    it('should throw BadRequestException for incorrect code', async () => {
      const email = 'test@example.com';
      const code = '123456';
      mockRedis.get.mockResolvedValue('654321');

      await expect(service.verifyEmail(email, code)).rejects.toThrow(
        BadRequestException
      );
      await expect(service.verifyEmail(email, code)).rejects.toThrow(
        '验证码错误'
      );
      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when code not found', async () => {
      const email = 'test@example.com';
      const code = '123456';
      mockRedis.get.mockResolvedValue(null);

      await expect(service.verifyEmail(email, code)).rejects.toThrow(
        BadRequestException
      );
      await expect(service.verifyEmail(email, code)).rejects.toThrow(
        '验证码无效或已过期'
      );
    });

    it('should throw BadRequestException when code is expired', async () => {
      const email = 'test@example.com';
      const code = '123456';
      mockRedis.get.mockResolvedValue(null);

      await expect(service.verifyEmail(email, code)).rejects.toThrow(
        BadRequestException
      );
      await expect(service.verifyEmail(email, code)).rejects.toThrow(
        '验证码无效或已过期'
      );
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { AccountBindingService } from './account-binding.service';
import { DatabaseService } from '../../database/database.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EmailVerificationService } from './email-verification.service';
import { SmsVerificationService } from './sms';
import { WechatService } from './wechat.service';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { AuthTokenService } from './auth-token.service';

describe('AccountBindingService.checkFieldUniqueness', () => {
  let service: AccountBindingService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountBindingService,
        { provide: DatabaseService, useValue: prisma },
        { provide: JwtService, useValue: {} },
        { provide: ConfigService, useValue: {} },
        { provide: EmailVerificationService, useValue: {} },
        { provide: SmsVerificationService, useValue: {} },
        { provide: WechatService, useValue: {} },
        { provide: RuntimeConfigService, useValue: {} },
        { provide: AuthTokenService, useValue: {} },
      ],
    }).compile();

    service = module.get(AccountBindingService);
  });

  it('should return false for all fields when dto is empty', async () => {
    const result = await service.checkFieldUniqueness({});
    expect(result).toEqual({
      usernameExists: false,
      emailExists: false,
      phoneExists: false,
    });
  });

  it('should check username uniqueness', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: '1', username: 'admin' });

    const result = await service.checkFieldUniqueness({ username: 'admin' });

    expect(result.usernameExists).toBe(true);
    expect(result.emailExists).toBe(false);
    expect(result.phoneExists).toBe(false);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { username: 'admin' },
    });
  });

  it('should return false for non-existent username', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await service.checkFieldUniqueness({ username: 'nonexistent' });

    expect(result.usernameExists).toBe(false);
  });

  it('should check email uniqueness', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: '1', email: 'test@example.com' });

    const result = await service.checkFieldUniqueness({ email: 'test@example.com' });

    expect(result.emailExists).toBe(true);
    expect(result.usernameExists).toBe(false);
    expect(result.phoneExists).toBe(false);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: 'test@example.com', deletedAt: null },
    });
  });

  it('should check phone uniqueness', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: '1', phone: '13800138000' });

    const result = await service.checkFieldUniqueness({ phone: '13800138000' });

    expect(result.phoneExists).toBe(true);
    expect(result.usernameExists).toBe(false);
    expect(result.emailExists).toBe(false);
  });

  it('should check multiple fields at once', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: '1', username: 'admin' });
    prisma.user.findFirst
      .mockResolvedValueOnce({ id: '1', email: 'test@example.com' })
      .mockResolvedValueOnce(null);

    const result = await service.checkFieldUniqueness({
      username: 'admin',
      email: 'test@example.com',
      phone: '13800138000',
    });

    expect(result.usernameExists).toBe(true);
    expect(result.emailExists).toBe(true);
    expect(result.phoneExists).toBe(false);
  });

  it('should handle dto being undefined without throwing', async () => {
    // This simulates what happens when the controller receives no body
    const result = await service.checkFieldUniqueness(undefined as any);
    expect(result).toEqual({
      usernameExists: false,
      emailExists: false,
      phoneExists: false,
    });
  });

  it('should handle dto being null without throwing', async () => {
    const result = await service.checkFieldUniqueness(null as any);
    expect(result).toEqual({
      usernameExists: false,
      emailExists: false,
      phoneExists: false,
    });
  });

  it('should check phone uniqueness with +86 prefix', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: '1', phone: '+8613800138000' });

    const result = await service.checkFieldUniqueness({ phone: '+8613800138000' });

    expect(result.phoneExists).toBe(true);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { phone: '+8613800138000', deletedAt: null },
          { phone: '13800138000', deletedAt: null },
          { phone: '+8613800138000', deletedAt: null },
        ],
      },
    });
  });

  it('should not query when no fields are provided', async () => {
    const result = await service.checkFieldUniqueness({});
    expect(result).toEqual({
      usernameExists: false,
      emailExists: false,
      phoneExists: false,
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});

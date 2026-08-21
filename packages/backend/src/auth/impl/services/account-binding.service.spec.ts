import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AccountBindingService } from './account-binding.service';
import { WechatService } from './wechat.service';
import { AuthTokenService } from './auth-token.service';
import { USER_REPOSITORY } from '@cloudcad/contracts';

/**
 * bindWechat 接管（takeover）逻辑测试：
 * - openid 未占用 → 直接绑定
 * - 已绑定他人且未接管 → 409
 * - 已绑定他人 + takeover + 旧账号有其他登录方式 → 迁移（旧账号 wechatId 置空）
 * - 已绑定他人 + takeover + 旧账号仅微信 → 仍 409（避免锁死旧账号）
 * - state 无效 → 400
 */
describe('AccountBindingService.bindWechat (takeover)', () => {
  let service: AccountBindingService;

  const mockUserRepo = {
    findById: jest.fn(),
    findByWechatId: jest.fn(),
    findByEmail: jest.fn(),
    findByPhone: jest.fn(),
    findByUsername: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  };

  const mockWechatService = {
    validateState: jest.fn().mockReturnValue(true),
    getAccessToken: jest
      .fn()
      .mockResolvedValue({ access_token: 'at', openid: 'openid-1' }),
  };

  const mockJwtService = { signAsync: jest.fn(), verify: jest.fn() };
  const mockConfigService = { get: jest.fn() };
  const mockEmail = { sendVerificationEmail: jest.fn(), verifyEmail: jest.fn() };
  const mockSms = { sendVerificationCode: jest.fn(), verifyCode: jest.fn() };
  const mockRuntimeConfig = { getValue: jest.fn().mockResolvedValue(true) };
  const mockAuthTokenService = { generateTokens: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockWechatService.validateState.mockReturnValue(true);
    mockWechatService.getAccessToken.mockResolvedValue({
      access_token: 'at',
      openid: 'openid-1',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountBindingService,
        { provide: USER_REPOSITORY, useValue: mockUserRepo },
        { provide: 'EMAIL', useValue: mockEmail },
        { provide: 'SMS', useValue: mockSms },
        { provide: 'CONFIG', useValue: mockRuntimeConfig },
        { provide: WechatService, useValue: mockWechatService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AuthTokenService, useValue: mockAuthTokenService },
      ],
    }).compile();

    service = module.get<AccountBindingService>(AccountBindingService);
  });

  it('openid 未被占用：直接绑定成功', async () => {
    mockUserRepo.findByWechatId.mockResolvedValue(null);
    mockUserRepo.update.mockResolvedValue({ id: 'me' });

    const result = await service.bindWechat('me', 'code-1', 'state-1');

    expect(result.success).toBe(true);
    expect(mockUserRepo.update).toHaveBeenCalledWith('me', {
      wechatId: 'openid-1',
      provider: 'WECHAT',
    });
    expect(mockUserRepo.update).toHaveBeenCalledTimes(1);
  });

  it('openid 已绑定他人且未接管：409 Conflict', async () => {
    mockUserRepo.findByWechatId.mockResolvedValue({
      id: 'other',
      username: 'wechat_xxx',
      password: 'hash',
    });

    await expect(
      service.bindWechat('me', 'code-1', 'state-1')
    ).rejects.toThrow(ConflictException);
    expect(mockUserRepo.update).not.toHaveBeenCalled();
  });

  it('openid 已绑定他人 + takeover + 旧账号有其他登录方式：迁移到当前账号', async () => {
    mockUserRepo.findByWechatId.mockResolvedValue({
      id: 'other',
      username: 'wechat_xxx',
      password: 'hash', // 旧账号有密码，不会因接管锁死
    });
    mockUserRepo.update.mockResolvedValue({});

    const result = await service.bindWechat('me', 'code-1', 'state-1', true);

    expect(result.success).toBe(true);
    // 旧账号解绑（wechatId 置空 + provider 回 LOCAL）
    expect(mockUserRepo.update).toHaveBeenCalledWith('other', {
      wechatId: null,
      provider: 'LOCAL',
    });
    // 当前账号绑定 openid
    expect(mockUserRepo.update).toHaveBeenCalledWith('me', {
      wechatId: 'openid-1',
      provider: 'WECHAT',
    });
  });

  it('openid 已绑定他人 + takeover + 旧账号仅微信登录：仍 409（防锁死）', async () => {
    mockUserRepo.findByWechatId.mockResolvedValue({
      id: 'other',
      username: 'wechat_xxx',
      // 无 password / email / phone
    });

    await expect(
      service.bindWechat('me', 'code-1', 'state-1', true)
    ).rejects.toThrow(ConflictException);
    expect(mockUserRepo.update).not.toHaveBeenCalled();
  });

  it('openid 已绑定他人 + takeover + 旧账号有邮箱：迁移成功', async () => {
    mockUserRepo.findByWechatId.mockResolvedValue({
      id: 'other',
      username: 'wechat_xxx',
      email: 'old@example.com',
    });
    mockUserRepo.update.mockResolvedValue({});

    const result = await service.bindWechat('me', 'code-1', 'state-1', true);

    expect(result.success).toBe(true);
    expect(mockUserRepo.update).toHaveBeenCalledWith('other', {
      wechatId: null,
      provider: 'LOCAL',
    });
  });

  it('state 无效：400 BadRequest', async () => {
    mockWechatService.validateState.mockReturnValue(false);

    await expect(
      service.bindWechat('me', 'code-1', 'bad-state')
    ).rejects.toThrow(BadRequestException);
  });

  it('微信授权响应缺少 openid：400 BadRequest', async () => {
    mockUserRepo.findByWechatId.mockResolvedValue(null);
    mockWechatService.getAccessToken.mockResolvedValue({
      access_token: 'at',
      openid: undefined,
    });

    await expect(
      service.bindWechat('me', 'code-1', 'state-1')
    ).rejects.toThrow(BadRequestException);
  });
});

describe('AccountBindingService.unbindEmail/unbindPhone (验证码解绑)', () => {
  let service: AccountBindingService;

  const mockUserRepo = {
    findById: jest.fn(),
    findByWechatId: jest.fn(),
    findByEmail: jest.fn(),
    findByPhone: jest.fn(),
    findByUsername: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  };

  const mockWechatService = {
    validateState: jest.fn(),
    getAccessToken: jest.fn(),
  };

  const mockJwtService = { signAsync: jest.fn(), verify: jest.fn() };
  const mockConfigService = { get: jest.fn() };
  const mockEmail = { sendVerificationEmail: jest.fn(), verifyEmail: jest.fn() };
  const mockSms = { sendVerificationCode: jest.fn(), verifyCode: jest.fn() };
  const mockRuntimeConfig = { getValue: jest.fn().mockResolvedValue(true) };
  const mockAuthTokenService = { generateTokens: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRuntimeConfig.getValue.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountBindingService,
        { provide: USER_REPOSITORY, useValue: mockUserRepo },
        { provide: 'EMAIL', useValue: mockEmail },
        { provide: 'SMS', useValue: mockSms },
        { provide: 'CONFIG', useValue: mockRuntimeConfig },
        { provide: WechatService, useValue: mockWechatService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AuthTokenService, useValue: mockAuthTokenService },
      ],
    }).compile();

    service = module.get<AccountBindingService>(AccountBindingService);
  });

  const baseUser = {
    id: 'me',
    email: 'me@example.com',
    phone: '13800138000',
    password: 'hash',
  };

  it('unbindEmail：邮件服务未启用时拒绝', async () => {
    mockRuntimeConfig.getValue.mockResolvedValue(false);
    mockUserRepo.findById.mockResolvedValue(baseUser);

    await expect(
      service.unbindEmail('me', '123456')
    ).rejects.toThrow(BadRequestException);
    expect(mockUserRepo.update).not.toHaveBeenCalled();
  });

  it('unbindEmail：验证码错误时不执行解绑', async () => {
    mockUserRepo.findById.mockResolvedValue(baseUser);
    mockEmail.verifyEmail.mockResolvedValue({ valid: false, message: '验证码错误' });

    await expect(
      service.unbindEmail('me', '000000')
    ).rejects.toThrow(BadRequestException);
    expect(mockUserRepo.update).not.toHaveBeenCalled();
  });

  it('unbindEmail：验证码正确且保留其他登录方式时解绑成功', async () => {
    mockUserRepo.findById.mockResolvedValue(baseUser);
    mockEmail.verifyEmail.mockResolvedValue({ valid: true });
    mockUserRepo.update.mockResolvedValue({ id: 'me' });

    const result = await service.unbindEmail('me', '123456');

    expect(result.success).toBe(true);
    expect(mockEmail.verifyEmail).toHaveBeenCalledWith('me@example.com', '123456');
    expect(mockUserRepo.update).toHaveBeenCalledWith('me', {
      email: null,
      emailVerified: false,
      emailVerifiedAt: null,
    });
  });

  it('unbindEmail：仅剩邮箱一种登录方式时拒绝解绑', async () => {
    mockUserRepo.findById.mockResolvedValue({
      id: 'me',
      email: 'me@example.com',
      password: null,
      phone: null,
      wechatId: null,
    });
    mockEmail.verifyEmail.mockResolvedValue({ valid: true });

    await expect(
      service.unbindEmail('me', '123456')
    ).rejects.toThrow(BadRequestException);
    expect(mockUserRepo.update).not.toHaveBeenCalled();
  });

  it('unbindPhone：短信服务未启用时拒绝', async () => {
    mockRuntimeConfig.getValue.mockResolvedValue(false);
    mockUserRepo.findById.mockResolvedValue(baseUser);

    await expect(
      service.unbindPhone('me', '123456')
    ).rejects.toThrow(BadRequestException);
    expect(mockUserRepo.update).not.toHaveBeenCalled();
  });

  it('unbindPhone：验证码错误时不执行解绑', async () => {
    mockUserRepo.findById.mockResolvedValue(baseUser);
    mockSms.verifyCode.mockResolvedValue({ valid: false, message: '验证码错误' });

    await expect(
      service.unbindPhone('me', '000000')
    ).rejects.toThrow(BadRequestException);
    expect(mockUserRepo.update).not.toHaveBeenCalled();
  });

  it('unbindPhone：验证码正确且保留其他登录方式时解绑成功', async () => {
    mockUserRepo.findById.mockResolvedValue(baseUser);
    mockSms.verifyCode.mockResolvedValue({ valid: true });
    mockUserRepo.update.mockResolvedValue({ id: 'me' });

    const result = await service.unbindPhone('me', '123456');

    expect(result.success).toBe(true);
    expect(mockSms.verifyCode).toHaveBeenCalledWith('13800138000', '123456');
    expect(mockUserRepo.update).toHaveBeenCalledWith('me', {
      phone: null,
      phoneVerified: false,
      phoneVerifiedAt: null,
    });
  });

  it('unbindPhone：仅剩手机号一种登录方式时拒绝解绑', async () => {
    mockUserRepo.findById.mockResolvedValue({
      id: 'me',
      phone: '13800138000',
      password: null,
      email: null,
      wechatId: null,
    });
    mockSms.verifyCode.mockResolvedValue({ valid: true });

    await expect(
      service.unbindPhone('me', '123456')
    ).rejects.toThrow(BadRequestException);
    expect(mockUserRepo.update).not.toHaveBeenCalled();
  });
});

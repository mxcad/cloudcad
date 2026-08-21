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

import { BadRequestException, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import { DeviceAuthService } from './device-auth.service';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { DatabaseService } from '../../database/database.service';
import { DEVICE_AUTH_STATUS, deviceAuthKey, deviceAuthUserCodeKey } from './device-auth.constants';

describe('DeviceAuthService', () => {
  let service: DeviceAuthService;

  const mockRedis = {
    pipeline: jest.fn(),
    get: jest.fn(),
    eval: jest.fn(),
  } as any;

  const mockPipeline = {
    hset: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    setex: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  } as any;

  const mockRuntimeConfigService = {
    getValue: jest.fn(),
  };

  const mockJwtService = {
    signAsync: jest.fn(),
    verify: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockRedis.pipeline.mockReturnValue(mockPipeline);
    mockPipeline.exec.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceAuthService,
        { provide: 'default_IORedisModuleConnectionToken', useValue: mockRedis },
        { provide: RuntimeConfigService, useValue: mockRuntimeConfigService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DatabaseService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DeviceAuthService>(DeviceAuthService);
  });

  describe('requestDeviceCode', () => {
    it('应拒绝无效 client_id', async () => {
      await expect(service.requestDeviceCode('invalid_client')).rejects.toThrow(BadRequestException);
    });

    it('应为 mx_cad_viewer 生成设备码', async () => {
      mockRuntimeConfigService.getValue.mockResolvedValue('http://localhost:3000');

      const result = await service.requestDeviceCode('mx_cad_viewer');

      expect(result.device_code).toBeDefined();
      expect(result.device_code.length).toBeGreaterThan(0);
      expect(result.user_code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(result.verification_uri).toBe('http://localhost:3000/device');
      expect(result.verification_uri_complete).toContain('user_code=');
      expect(result.verification_uri_complete).toContain('client_id=mx_cad_viewer');
      expect(result.expires_in).toBe(300);
      expect(result.interval).toBe(5);

      expect(mockPipeline.hset).toHaveBeenCalled();
      expect(mockPipeline.expire).toHaveBeenCalled();
      expect(mockPipeline.setex).toHaveBeenCalled();
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it('应为 mx_cad_editor 生成设备码', async () => {
      mockRuntimeConfigService.getValue.mockResolvedValue('https://cloudcad.example.com');

      const result = await service.requestDeviceCode('mx_cad_editor');

      expect(result.device_code).toBeDefined();
      expect(result.verification_uri_complete).toContain('https://cloudcad.example.com/device');
    });
  });

  describe('authorizeDevice', () => {
    const userCode = 'ABCD-1234';
    const userId = 'user-123';
    const deviceCode = 'test-device-code';

    it('应在 user_code 不存在时抛出 NotFound', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(service.authorizeDevice(userCode, userId)).rejects.toThrow(NotFoundException);
    });

    it('应成功授权并更新 Redis 状态', async () => {
      mockRedis.get.mockResolvedValue(deviceCode);
      mockRedis.eval.mockResolvedValue(1);

      const result = await service.authorizeDevice(userCode, userId);

      expect(result.success).toBe(true);
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.any(String),
        2,
        deviceAuthKey(deviceCode),
        deviceAuthUserCodeKey(userCode),
        DEVICE_AUTH_STATUS.PENDING,
        DEVICE_AUTH_STATUS.AUTHORIZED,
        userId,
      );
    });

    it('应在 Redis eval 返回非 1 时抛出 BadRequest', async () => {
      mockRedis.get.mockResolvedValue(deviceCode);
      mockRedis.eval.mockResolvedValue(0);

      await expect(service.authorizeDevice(userCode, userId)).rejects.toThrow(BadRequestException);
    });
  });

  describe('pollForToken', () => {
    const deviceCode = 'test-device-code';
    const clientId = 'mx_cad_viewer';

    it('应拒绝无效 client_id', async () => {
      await expect(service.pollForToken(deviceCode, 'invalid')).rejects.toThrow(BadRequestException);
    });

    it('应在 authorized 状态下发 token', async () => {
      const mockUser = { id: 'user-1', email: 'test@test.com', username: 'testuser', role: { id: 'role-1', name: 'USER' } };
      mockRedis.eval.mockResolvedValue(['AUTHORIZED', 'user-1']);
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockConfigService.get.mockReturnValue({ secret: 'jwt-secret', refreshSecret: 'refresh-secret' });
      mockJwtService.signAsync.mockResolvedValueOnce('access-token');
      mockJwtService.signAsync.mockResolvedValueOnce('refresh-token');
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 86400 });

      const result = await service.pollForToken(deviceCode, clientId);

      expect(result.access_token).toBe('access-token');
      expect(result.token_type).toBe('Bearer');
      expect(result.expires_in).toBe(604800);
      expect(result.refresh_token).toBe('refresh-token');
    });

    it('应在 pending 状态抛出 authorization_pending', async () => {
      mockRedis.eval.mockResolvedValue(['authorization_pending']);

      await expect(service.pollForToken(deviceCode, clientId))
        .rejects
        .toThrow(new HttpException({ error: 'authorization_pending' }, HttpStatus.BAD_REQUEST));
    });

    it('应在过期时抛出 expired_token', async () => {
      mockRedis.eval.mockResolvedValue(['expired_token']);

      await expect(service.pollForToken(deviceCode, clientId))
        .rejects
        .toThrow(new HttpException({ error: 'expired_token' }, HttpStatus.BAD_REQUEST));
    });
  });
});

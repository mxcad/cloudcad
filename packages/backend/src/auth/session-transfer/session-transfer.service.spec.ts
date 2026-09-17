///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright notice.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  AUTH_TOKEN_SERVICE,
  USER_REPOSITORY,
  REFRESH_TOKEN_REPOSITORY,
  TOKEN_BLACKLIST,
} from '@cloudcad/contracts';
import type { Request as ExpressRequest } from 'express';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { MembershipService } from '../../vip/membership.service';
import { SessionTransferService } from './session-transfer.service';

/** 测试用 session mock：仅覆盖 service 读写的字段（userId / regenerate / save） */
type MockSession = {
  userId: string | undefined;
  regenerate: (cb: (err?: Error) => void) => void;
  save: (cb: (err?: Error) => void) => void;
};

/**
 * 构造请求 mock：初始 session 为旧用户；regenerate 后 request.session 被替换为 newSession
 * （模拟 express-session regenerate 用全新 session 对象替换旧对象的行为）。
 * 返回的 req 是部分 mock，cast 到 ExpressRequest 仅供 service 签名使用。
 */
const makeRequest = () => {
  const newSession: MockSession = {
    userId: undefined,
    regenerate: jest.fn((cb: (err?: Error) => void) => cb()),
    save: jest.fn((cb: (err?: Error) => void) => cb()),
  };
  const req: {
    session: MockSession;
    cookies: Record<string, string>;
    secure: boolean;
  } = {
    session: {
      userId: 'old-user',
      regenerate: jest.fn((cb: (err?: Error) => void) => {
        req.session = newSession;
        cb();
      }),
      save: jest.fn((cb: (err?: Error) => void) => cb()),
    },
    cookies: { auth_token: 'old-access-token' },
    secure: false,
  };
  return {
    req: req as unknown as ExpressRequest,
    newSession,
  };
};

describe('SessionTransferService', () => {
  let service: SessionTransferService;

  const mockRedis = {
    set: jest.fn(),
    eval: jest.fn(),
  };
  const mockAuthTokenService = {
    generateTokens: jest.fn(),
  };
  const mockUserRepo = {
    findById: jest.fn(),
  };
  const mockRefreshTokenRepo = {
    deleteByUserId: jest.fn(),
  };
  const mockTokenBlacklistService = {
    addToBlacklist: jest.fn(),
  };
  const mockRuntimeConfigService = {
    getValue: jest.fn(),
  };
  const mockJwtService = {
    verify: jest.fn(),
  };
  const mockConfigService = {
    get: jest.fn(),
  };
  const mockMembershipService = {
    getMembership: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedis.set.mockResolvedValue('OK');
    mockRefreshTokenRepo.deleteByUserId.mockResolvedValue(undefined);
    mockTokenBlacklistService.addToBlacklist.mockResolvedValue(undefined);
    mockRuntimeConfigService.getValue.mockResolvedValue('http://localhost:3000');
    mockConfigService.get.mockReturnValue('secret');
    mockMembershipService.getMembership.mockResolvedValue({
      tierLevel: 2,
      expiresAt: new Date('2027-01-01T00:00:00.000Z'),
      daysRemaining: 100,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionTransferService,
        { provide: 'default_IORedisModuleConnectionToken', useValue: mockRedis },
        { provide: AUTH_TOKEN_SERVICE, useValue: mockAuthTokenService },
        { provide: USER_REPOSITORY, useValue: mockUserRepo },
        { provide: REFRESH_TOKEN_REPOSITORY, useValue: mockRefreshTokenRepo },
        { provide: TOKEN_BLACKLIST, useValue: mockTokenBlacklistService },
        { provide: RuntimeConfigService, useValue: mockRuntimeConfigService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MembershipService, useValue: mockMembershipService },
      ],
    }).compile();

    service = module.get<SessionTransferService>(SessionTransferService);
  });

  describe('createTransfer', () => {
    it('stores one-time token in Redis with TTL and builds transferUrl', async () => {
      const result = await service.createTransfer('user-123');

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('session_transfer:'),
        'user-123',
        'EX',
        60,
      );
      expect(result.token).toHaveLength(43);
      expect(result.expiresIn).toBe(60);
      expect(result.transferUrl).toBe(
        `http://localhost:3000/session-transfer?token=${result.token}`,
      );
    });

    it('appends sanitized same-origin redirect', async () => {
      const result = await service.createTransfer('user-123', '/member-center');
      expect(result.transferUrl).toContain('redirect=%2Fmember-center');
    });

    it('rejects protocol-relative redirect (open redirect protection)', async () => {
      const result = await service.createTransfer('user-123', '//evil.com');
      expect(result.transferUrl).not.toContain('redirect=');
    });
  });

  describe('consumeTransfer', () => {
    it('consumes token, tears down old session, establishes new session', async () => {
      mockRedis.eval.mockResolvedValue('new-user-id');
      mockUserRepo.findById.mockResolvedValue({
        id: 'new-user-id',
        username: 'newuser',
        email: 'new@example.com',
        status: 'ACTIVE',
        deletedAt: null,
        password: 'hash',
        role: { name: 'USER' },
      });
      mockAuthTokenService.generateTokens.mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      });
      mockJwtService.verify.mockReturnValue({
        type: 'access',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const { req, newSession } = makeRequest();
      const result = await service.consumeTransfer('some-token', req);

      expect(mockRedis.eval).toHaveBeenCalled();
      expect(result.accessToken).toBe('new-access');
      expect(result.refreshToken).toBe('new-refresh');
      expect(result.user.id).toBe('new-user-id');
      expect(result.user.membershipTierLevel).toBe(2);
      expect(result.user.isVip).toBe(true);
      // 旧 access token 进黑名单
      expect(mockTokenBlacklistService.addToBlacklist).toHaveBeenCalledWith(
        'old-access-token',
        expect.any(Number),
      );
      // 旧用户 web 端 refresh token 删除（clientId=null，绝不动 EXE 的）
      expect(mockRefreshTokenRepo.deleteByUserId).toHaveBeenCalledWith(
        'old-user',
        null,
      );
      // 新会话建立在 regenerate 后的新 session 对象上
      expect(newSession.userId).toBe('new-user-id');
      expect(newSession.save).toHaveBeenCalled();
    });

    it('throws 401 when token not found (invalid/expired/already consumed)', async () => {
      mockRedis.eval.mockResolvedValue(null);
      const { req } = makeRequest();
      await expect(
        service.consumeTransfer('bad-token', req),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      // 消费失败不得触碰旧会话
      expect(mockRefreshTokenRepo.deleteByUserId).not.toHaveBeenCalled();
    });

    it('throws 401 when user is disabled or deleted', async () => {
      mockRedis.eval.mockResolvedValue('disabled-user');
      mockUserRepo.findById.mockResolvedValue({
        id: 'disabled-user',
        status: 'INACTIVE',
        deletedAt: null,
      });
      const { req } = makeRequest();
      await expect(
        service.consumeTransfer('tok', req),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(mockRefreshTokenRepo.deleteByUserId).not.toHaveBeenCalled();
    });

    it('degrades when session unavailable (Redis down) but completes token side', async () => {
      mockRedis.eval.mockResolvedValue('new-user-id');
      mockUserRepo.findById.mockResolvedValue({
        id: 'new-user-id',
        username: 'u',
        email: null,
        status: 'ACTIVE',
        deletedAt: null,
        password: null,
        role: null,
      });
      mockAuthTokenService.generateTokens.mockResolvedValue({
        accessToken: 'a',
        refreshToken: 'r',
      });
      // session 中间件未挂载（Redis 故障降级）：request.session 为 undefined
      const req = {
        session: undefined,
        cookies: {},
        secure: false,
      } as unknown as ExpressRequest;
      const result = await service.consumeTransfer('tok', req);
      expect(result.accessToken).toBe('a');
      expect(result.refreshToken).toBe('r');
    });
  });
});

///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { UnauthorizedException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import jwt from 'jsonwebtoken';
import { CooperateAuthService } from './cooperate-auth.service';
import { TokenBlacklistService } from '../auth/services/token-blacklist.service';
import { DatabaseService } from '../database/database.service';

describe('CooperateAuthService', () => {
  const JWT_SECRET = 'test-secret';
  const USER_ID = 'user-001';

  let service: CooperateAuthService;
  let mockTokenBlacklist: {
    isBlacklisted: jest.Mock;
    isUserBlacklisted: jest.Mock;
  };
  let mockDatabase: { user: { findUnique: jest.Mock } };

  const signToken = (payload: object): string =>
    jwt.sign(payload, JWT_SECRET);

  beforeEach(async () => {
    mockTokenBlacklist = {
      isBlacklisted: jest.fn().mockResolvedValue(false),
      isUserBlacklisted: jest.fn().mockResolvedValue(false),
    };
    mockDatabase = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: USER_ID, status: 'ACTIVE' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: TokenBlacklistService,
          useValue: mockTokenBlacklist,
        },
        { provide: DatabaseService, useValue: mockDatabase },
        {
          provide: CooperateAuthService,
          useFactory: () =>
            new CooperateAuthService(
              mockTokenBlacklist as unknown as TokenBlacklistService,
              mockDatabase as unknown as DatabaseService,
              JWT_SECRET
            ),
        },
      ],
    }).compile();

    service = module.get(CooperateAuthService);
  });

  describe('authenticateJwt', () => {
    describe('when token is a valid access token', () => {
      it('should return the userId', async () => {
        const token = signToken({ sub: USER_ID, type: 'access' });

        await expect(service.authenticateJwt(token)).resolves.toBe(USER_ID);
      });

      it('should run blacklist and user status checks', async () => {
        const token = signToken({ sub: USER_ID, type: 'access' });

        await service.authenticateJwt(token);

        expect(mockTokenBlacklist.isBlacklisted).toHaveBeenCalledWith(token);
        expect(mockTokenBlacklist.isUserBlacklisted).toHaveBeenCalledWith(
          USER_ID
        );
        expect(mockDatabase.user.findUnique).toHaveBeenCalledWith({
          where: { id: USER_ID, deletedAt: null },
          select: { id: true, status: true },
        });
      });
    });

    describe('when token type is refresh', () => {
      it('should reject with UnauthorizedException', async () => {
        const token = signToken({ sub: USER_ID, type: 'refresh' });

        await expect(service.authenticateJwt(token)).rejects.toThrow(
          UnauthorizedException
        );
      });

      it('should not query the blacklist for a non-access token', async () => {
        const token = signToken({ sub: USER_ID, type: 'refresh' });

        await expect(service.authenticateJwt(token)).rejects.toThrow(
          UnauthorizedException
        );
        expect(mockTokenBlacklist.isBlacklisted).not.toHaveBeenCalled();
      });
    });

    describe('when token type is missing', () => {
      it('should accept the token (aligned with JwtStrategy)', async () => {
        const token = signToken({ sub: USER_ID });

        await expect(service.authenticateJwt(token)).resolves.toBe(USER_ID);
      });
    });

    describe('when token is blacklisted', () => {
      it('should reject with UnauthorizedException', async () => {
        mockTokenBlacklist.isBlacklisted.mockResolvedValue(true);
        const token = signToken({ sub: USER_ID, type: 'access' });

        await expect(service.authenticateJwt(token)).rejects.toThrow(
          UnauthorizedException
        );
      });
    });

    describe('when user is blacklisted', () => {
      it('should reject with UnauthorizedException', async () => {
        mockTokenBlacklist.isUserBlacklisted.mockResolvedValue(true);
        const token = signToken({ sub: USER_ID, type: 'access' });

        await expect(service.authenticateJwt(token)).rejects.toThrow(
          UnauthorizedException
        );
      });
    });

    describe('when user status is not ACTIVE', () => {
      it('should reject with UnauthorizedException', async () => {
        mockDatabase.user.findUnique.mockResolvedValue({
          id: USER_ID,
          status: 'DISABLED',
        });
        const token = signToken({ sub: USER_ID, type: 'access' });

        await expect(service.authenticateJwt(token)).rejects.toThrow(
          UnauthorizedException
        );
      });
    });

    describe('when user is deleted', () => {
      it('should reject with UnauthorizedException', async () => {
        mockDatabase.user.findUnique.mockResolvedValue(null);
        const token = signToken({ sub: USER_ID, type: 'access' });

        await expect(service.authenticateJwt(token)).rejects.toThrow(
          UnauthorizedException
        );
      });
    });

    describe('when payload has no sub', () => {
      it('should reject with UnauthorizedException', async () => {
        const token = signToken({ type: 'access' });

        await expect(service.authenticateJwt(token)).rejects.toThrow(
          UnauthorizedException
        );
      });
    });

    describe('when token signature is invalid', () => {
      it('should reject with UnauthorizedException', async () => {
        const token = jwt.sign(
          { sub: USER_ID, type: 'access' },
          'wrong-secret'
        );

        await expect(service.authenticateJwt(token)).rejects.toThrow(
          UnauthorizedException
        );
      });
    });
  });

  describe('authenticateSession', () => {
    describe('when user is blacklisted', () => {
      it('should reject with UnauthorizedException', async () => {
        mockTokenBlacklist.isUserBlacklisted.mockResolvedValue(true);

        await expect(service.authenticateSession(USER_ID)).rejects.toThrow(
          UnauthorizedException
        );
      });
    });

    describe('when user status is not ACTIVE', () => {
      it('should reject with UnauthorizedException', async () => {
        mockDatabase.user.findUnique.mockResolvedValue({
          id: USER_ID,
          status: 'INACTIVE',
        });

        await expect(service.authenticateSession(USER_ID)).rejects.toThrow(
          UnauthorizedException
        );
      });
    });

    describe('when user is active', () => {
      it('should resolve', async () => {
        await expect(service.authenticateSession(USER_ID)).resolves.toBeUndefined();
      });
    });
  });
});

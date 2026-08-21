///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { IpBlacklistGuard } from './ip-blacklist.guard';
import { IpBlacklistService } from './ip-blacklist.service';

describe('IpBlacklistGuard', () => {
  let guard: IpBlacklistGuard;

  const mockIpBlacklistService = {
    isBlocked: jest.fn(),
  };

  const mockCls = {
    get: jest.fn().mockReturnValue('203.0.113.7'),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('development'),
  };

  const createContext = (ip?: string) => {
    const request = {
      headers: {},
      ip,
      connection: { remoteAddress: ip },
    } as any;
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
      }),
    } as any;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfigService.get.mockReturnValue('development');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IpBlacklistGuard,
        { provide: IpBlacklistService, useValue: mockIpBlacklistService },
        { provide: ClsService, useValue: mockCls },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    guard = module.get<IpBlacklistGuard>(IpBlacklistGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('allows localhost in development without checking blacklist', async () => {
    mockCls.get.mockReturnValue('127.0.0.1');
    await expect(guard.canActivate(createContext())).resolves.toBe(true);
    expect(mockIpBlacklistService.isBlocked).not.toHaveBeenCalled();
  });

  it('blocks when IP is blacklisted', async () => {
    mockConfigService.get.mockReturnValue('production');
    mockIpBlacklistService.isBlocked.mockResolvedValue(true);
    await expect(guard.canActivate(createContext())).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it('allows when IP is not blacklisted', async () => {
    mockConfigService.get.mockReturnValue('production');
    mockIpBlacklistService.isBlocked.mockResolvedValue(false);
    await expect(guard.canActivate(createContext())).resolves.toBe(true);
  });

  it('reads IP from CLS when present', async () => {
    mockConfigService.get.mockReturnValue('production');
    mockIpBlacklistService.isBlocked.mockResolvedValue(false);
    mockCls.get.mockReturnValue('198.51.100.5');
    await guard.canActivate(createContext());
    expect(mockIpBlacklistService.isBlocked).toHaveBeenCalledWith(
      '198.51.100.5'
    );
  });

  it('falls back to x-forwarded-for header when CLS empty', async () => {
    mockConfigService.get.mockReturnValue('production');
    mockIpBlacklistService.isBlocked.mockResolvedValue(false);
    mockCls.get.mockReturnValue('unknown');
    const context = createContext('10.0.0.1');
    context.switchToHttp().getRequest().headers['x-forwarded-for'] =
      '203.0.113.9, 10.0.0.1';
    await guard.canActivate(context);
    expect(mockIpBlacklistService.isBlocked).toHaveBeenCalledWith(
      '203.0.113.9'
    );
  });

  it('falls back to request.ip when no headers', async () => {
    mockConfigService.get.mockReturnValue('production');
    mockIpBlacklistService.isBlocked.mockResolvedValue(false);
    mockCls.get.mockReturnValue('unknown');
    await guard.canActivate(createContext('10.1.2.3'));
    expect(mockIpBlacklistService.isBlocked).toHaveBeenCalledWith('10.1.2.3');
  });
});

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
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from './database.service';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// Mock PrismaClient
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ result: 1 }]),
  })),
}));

// Mock PrismaPg adapter
jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn().mockImplementation(() => ({})),
}));

describe('DatabaseService', () => {
  let service: DatabaseService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'DATABASE_URL') {
        return 'postgresql://test:test@localhost:5432/test';
      }
      return undefined;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
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

    service = module.get<DatabaseService>(DatabaseService);
    configService = module.get<ConfigService>(ConfigService);

    service.$connect = jest.fn().mockResolvedValue(undefined);
    service.$queryRaw = jest.fn().mockResolvedValue([{ result: 1 }]);
    service.$disconnect = jest.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create PrismaClient with adapter', () => {
    expect(PrismaPg).toHaveBeenCalled();
    expect(PrismaClient).toHaveBeenCalled();
  });

  describe('onModuleInit', () => {
    it('should connect to database', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service.onModuleInit();

      expect(service.$connect).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('数据库连接成功');

      consoleSpy.mockRestore();
    });

    it('should handle connection errors', async () => {
      const error = new Error('Connection failed');
      service.$connect = jest.fn().mockRejectedValueOnce(error);

      await expect(service.onModuleInit()).rejects.toThrow('Connection failed');
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect from database', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service.onModuleDestroy();

      expect(service.$disconnect).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('数据库连接已断开');

      consoleSpy.mockRestore();
    });

    it('should handle disconnection errors', async () => {
      const error = new Error('Disconnection failed');
      service.$disconnect = jest.fn().mockRejectedValueOnce(error);

      await expect(service.onModuleDestroy()).rejects.toThrow(
        'Disconnection failed'
      );
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when database is accessible', async () => {
      const result = await service.healthCheck();

      expect(service.$queryRaw).toHaveBeenCalled();
      expect(result).toEqual({
        status: 'healthy',
        message: '数据库连接正常',
      });
    });

    it('should return unhealthy status when database is not accessible', async () => {
      const error = new Error('Database connection failed');
      service.$queryRaw = jest.fn().mockRejectedValueOnce(error);

      const result = await service.healthCheck();

      expect(result).toEqual({
        status: 'unhealthy',
        message: '数据库连接失败',
        error: 'Database connection failed',
      });
    });
  });
});

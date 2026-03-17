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
import { Reflector } from '@nestjs/core';
import { HealthController } from './health.controller';
import { HealthCheckService } from '@nestjs/terminus';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { PermissionService } from '../common/services/permission.service';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: HealthCheckService;
  let databaseService: DatabaseService;
  let storageService: StorageService;

  const mockHealthCheckService = {
    check: jest.fn(),
  };

  const mockDatabaseService = {
    healthCheck: jest
      .fn()
      .mockResolvedValue({ status: 'healthy', message: 'OK' }),
  };

  const mockStorageService = {
    healthCheck: jest
      .fn()
      .mockResolvedValue({ status: 'healthy', message: 'OK' }),
  };

  const mockPermissionService = {
    checkSystemPermission: jest.fn().mockResolvedValue(true),
    checkSystemPermissionWithContext: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: mockHealthCheckService,
        },
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
        {
          provide: StorageService,
          useValue: mockStorageService,
        },
        {
          provide: PermissionService,
          useValue: mockPermissionService,
        },
        Reflector,
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

    controller = module.get<HealthController>(HealthController);
    healthCheckService = module.get<HealthCheckService>(HealthCheckService);
    databaseService = module.get<DatabaseService>(DatabaseService);
    storageService = module.get<StorageService>(StorageService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should have health check service', () => {
    expect(healthCheckService).toBeDefined();
  });

  it('should have database service', () => {
    expect(databaseService).toBeDefined();
  });

  it('should have storage service', () => {
    expect(storageService).toBeDefined();
  });
});

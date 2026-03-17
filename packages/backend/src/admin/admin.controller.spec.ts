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
import { AdminController } from './admin.controller';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionService } from '../common/services/permission.service';
import { PermissionCacheService } from '../common/services/permission-cache.service';

describe('AdminController', () => {
  let controller: AdminController;

  const mockPermissionService = {
    getUserPermissions: jest.fn(),
  };

  const mockPermissionCacheService = {
    getStats: jest.fn(),
    cleanup: jest.fn(),
    clearUserCache: jest.fn(),
    clearProjectCache: jest.fn(),
    clearFileCache: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: PermissionService,
          useValue: mockPermissionService,
        },
        {
          provide: PermissionCacheService,
          useValue: mockPermissionCacheService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: () => true,
        constructor: jest.fn(),
      })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: () => true,
        constructor: jest.fn(),
      })
      .compile();

    controller = module.get<AdminController>(AdminController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

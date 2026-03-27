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

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { FontsController } from './fonts.controller';
import { FontsService } from './fonts.service';
import { FontsModule } from './fonts.module';

describe('FontsModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
        MulterModule.register({
          limits: {
            fileSize: 10 * 1024 * 1024, // 10MB
          },
        }),
        FontsModule,
      ],
    }).compile();
  });

  it('应该定义模块', () => {
    expect(module).toBeDefined();
  });

  it('应该提供 FontsService', () => {
    const service = module.get<FontsService>(FontsService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(FontsService);
  });

  it('应该提供 FontsController', () => {
    const controller = module.get<FontsController>(FontsController);
    expect(controller).toBeDefined();
    expect(controller).toBeInstanceOf(FontsController);
  });

  it('应该导出 FontsService', () => {
    const service = module.get<FontsService>(FontsService);
    expect(service).toBeDefined();
  });

  it('应该配置 MulterModule', () => {
    const multerModule = module.get<MulterModule>(MulterModule);
    expect(multerModule).toBeDefined();
  });

  it('应该配置 ConfigModule', () => {
    const configModule = module.get<ConfigModule>(ConfigModule);
    expect(configModule).toBeDefined();
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });
});

///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { ThumbnailGenerationService } from './thumbnail-generation.service';
import { ConfigService } from '@nestjs/config';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

describe('ThumbnailGenerationService', () => {
  let service: ThumbnailGenerationService;

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // 模拟 Windows 平台
    jest.spyOn(os, 'platform').mockReturnValue('win32');
    jest.spyOn(fs.promises, 'access').mockResolvedValue(undefined);
    jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
    jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
    jest.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined);

    mockConfigService.get.mockReturnValue({
      autoGenerateEnabled: true,
      width: 200,
      height: 200,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ThumbnailGenerationService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ThumbnailGenerationService>(ThumbnailGenerationService);
    // 等待 onModuleInit 完成
    await new Promise((r) => setTimeout(r, 10));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isEnabled', () => {
    it('should return true when enabled on Windows with exe available', () => {
      expect(service.isEnabled()).toBe(true);
    });

    it('should return false on Linux', async () => {
      jest.restoreAllMocks();
      jest.spyOn(os, 'platform').mockReturnValue('linux');
      jest.spyOn(fs.promises, 'access').mockResolvedValue(undefined);
      jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);

      mockConfigService.get.mockReturnValue({
        autoGenerateEnabled: true,
        width: 200,
        height: 200,
      });

      const module = await Test.createTestingModule({
        providers: [
          ThumbnailGenerationService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const linuxService = module.get<ThumbnailGenerationService>(ThumbnailGenerationService);
      await new Promise((r) => setTimeout(r, 10));

      expect(linuxService.isEnabled()).toBe(false);
    });
  });

  describe('generateThumbnail', () => {
    it('should return error when disabled', async () => {
      // 创建一个禁用的服务实例
      jest.restoreAllMocks();
      jest.spyOn(os, 'platform').mockReturnValue('linux');
      jest.spyOn(fs.promises, 'access').mockResolvedValue(undefined);
      jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);

      mockConfigService.get.mockReturnValue({
        autoGenerateEnabled: true,
        width: 200,
        height: 200,
      });

      const module = await Test.createTestingModule({
        providers: [
          ThumbnailGenerationService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const linuxService = module.get<ThumbnailGenerationService>(ThumbnailGenerationService);
      await new Promise((r) => setTimeout(r, 10));

      const result = await linuxService.generateThumbnail(
        path.join(os.tmpdir(), 'test.dwg'),
        os.tmpdir(),
        'node1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('不启用');
    });
  });

  describe('getThumbnailSize', () => {
    it('should return configured thumbnail size', () => {
      const size = service.getThumbnailSize();
      expect(size.width).toBe(200);
      expect(size.height).toBe(200);
    });
  });
});

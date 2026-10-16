///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AppConfig } from '../config/app.config';
import {
  BRAND_LOGO_ALLOWED_MIME_TYPES,
  BRAND_LOGO_EXTENSIONS,
  BRAND_LOGO_MAX_SIZE,
  BRAND_LOGO_MIME_BY_EXTENSION,
  BRAND_LOGO_URL,
  BrandAssetService,
} from './brand-asset.service';

describe('BrandAssetService', () => {
  let service: BrandAssetService;
  let filesDataPath: string;

  /** ConfigService 只被用来取 `filesDataPath`，给个最小替身即可 */
  const buildService = (dataRoot: string): BrandAssetService =>
    new BrandAssetService({
      get: jest.fn(() => dataRoot),
    } as unknown as ConfigService<AppConfig>);

  beforeAll(async () => {
    filesDataPath = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'brand-logo-')
    );
  });

  // jest.config 开了 resetMocks，beforeAll 里建的 mock 到第一个用例实现就被清掉
  beforeEach(() => {
    service = buildService(filesDataPath);
  });

  afterAll(async () => {
    await fs.promises.rm(filesDataPath, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.promises.rm(path.join(filesDataPath, 'brand'), {
      recursive: true,
      force: true,
    });
  });

  it('MIME 白名单与落盘后缀表同源，覆盖 png/jpg/gif/webp', () => {
    expect([...BRAND_LOGO_ALLOWED_MIME_TYPES].sort()).toEqual([
      'image/gif',
      'image/jfif',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
    ]);
    expect([...BRAND_LOGO_EXTENSIONS].sort()).toEqual(
      [...Object.keys(BRAND_LOGO_MIME_BY_EXTENSION)].sort()
    );
    expect(BRAND_LOGO_URL).toBe('/api/v1/runtime-config/brand-logo');
    expect(BRAND_LOGO_MAX_SIZE).toBe(2 * 1024 * 1024);
  });

  describe('readLogo', () => {
    it('尚未上传时返回 null（不落日志噪音，不抛错）', async () => {
      await expect(service.readLogo()).resolves.toBeNull();
    });

    it('按后缀清单命中已有文件并返回对应 Content-Type', async () => {
      await service.uploadLogo(Buffer.from('png-bytes'), 'image/png');

      await expect(service.readLogo()).resolves.toEqual({
        filePath: path.join(filesDataPath, 'brand', 'logo.png'),
        mimeType: 'image/png',
      });
    });

    it('目录不存在时同样返回 null，而不是把 ENOENT 抛给调用方', async () => {
      const fresh = buildService(path.join(filesDataPath, 'no-such-root'));
      await expect(fresh.readLogo()).resolves.toBeNull();
    });
  });

  describe('uploadLogo', () => {
    it('拒绝非白名单 MIME，且不创建目录、不写任何文件', async () => {
      await expect(
        service.uploadLogo(Buffer.from('x'), 'text/plain')
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        fs.promises.access(path.join(filesDataPath, 'brand'), fs.constants.F_OK)
      ).rejects.toThrow();
    });

    it('拒绝空文件', async () => {
      await expect(service.uploadLogo(Buffer.alloc(0), 'image/png')).rejects.toBeInstanceOf(
        BadRequestException
      );
    });

    it('拒绝超过 2MB 的文件', async () => {
      await expect(
        service.uploadLogo(Buffer.alloc(BRAND_LOGO_MAX_SIZE + 1), 'image/png')
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('接受恰好等于上限的文件', async () => {
      await expect(
        service.uploadLogo(Buffer.alloc(BRAND_LOGO_MAX_SIZE), 'image/png')
      ).resolves.toBeDefined();
    });

    it('写入 <filesDataPath>/brand/logo.png 并返回前端可直接引用的 URL 与字节数', async () => {
      const buffer = Buffer.from('fake-png-content');

      await expect(service.uploadLogo(buffer, 'image/png')).resolves.toEqual({
        logoUrl: BRAND_LOGO_URL,
        size: buffer.length,
      });

      await expect(
        fs.promises.readFile(path.join(filesDataPath, 'brand', 'logo.png'))
      ).resolves.toEqual(buffer);
    });

    it('落盘后缀由 MIME 决定而非客户端文件名：jfif/jpeg 归一成 .jpg', async () => {
      const buffer = Buffer.from('fake-jpeg');

      await expect(
        service.uploadLogo(buffer, 'image/jfif')
      ).resolves.toEqual({ logoUrl: BRAND_LOGO_URL, size: buffer.length });

      await expect(
        fs.promises.readFile(path.join(filesDataPath, 'brand', 'logo.jpg'))
      ).resolves.toEqual(buffer);
      await expect(
        fs.promises.access(
          path.join(filesDataPath, 'brand', 'logo.png'),
          fs.constants.F_OK
        )
      ).rejects.toThrow();
    });

    it('覆盖上传后只保留一张 Logo，旧后缀文件被清理', async () => {
      await service.uploadLogo(Buffer.from('old-png'), 'image/png');
      await service.uploadLogo(Buffer.from('new-webp'), 'image/webp');

      await expect(
        fs.promises.readFile(path.join(filesDataPath, 'brand', 'logo.webp'))
      ).resolves.toEqual(Buffer.from('new-webp'));
      await expect(
        fs.promises.access(
          path.join(filesDataPath, 'brand', 'logo.png'),
          fs.constants.F_OK
        )
      ).rejects.toThrow();

      await expect(service.readLogo()).resolves.toEqual({
        filePath: path.join(filesDataPath, 'brand', 'logo.webp'),
        mimeType: 'image/webp',
      });
    });

    it('同后缀重复上传原地覆盖，返回值反映最新字节数', async () => {
      await service.uploadLogo(Buffer.from('12345'), 'image/png');

      await expect(service.uploadLogo(Buffer.from('67890'), 'image/png')).resolves.toEqual(
        { logoUrl: BRAND_LOGO_URL, size: 5 }
      );

      await expect(
        fs.promises.readFile(path.join(filesDataPath, 'brand', 'logo.png'))
      ).resolves.toEqual(Buffer.from('67890'));
    });
  });
});

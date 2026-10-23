///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2026，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 品牌静态资源（Logo）读写。
 *
 * 运行时配置页的 `brandProfile.logo` 是前端直接引用的 URL：运维在页面上上传图片，
 * 文件落在 `brandAssetPath`（默认 `data/brand`），由
 * `GET /api/v1/runtime-config/brand-logo` 公开流出（登录页与 favicon 都要读，
 * 故 `@Public()`）。
 *
 * 刻意不落 `filesDataPath`：`data/files` 既是 SVN 工作副本（`setupGlobalIgnores`
 * 会对整个 `filesDataPath` 做 `svn commit`），又被 `DirectoryAllocator` 按
 * `{YYYYMM}/{nodeId}/` 扫描目录，非图纸资产落进去会被当成月份目录列举。
 *
 * 单个 Logo 只保留一份文件，上传即覆盖并清掉旧后缀——与 config-service 的品牌
 * Logo 上传同一语义，历史多后缀文件不会残留成孤儿。
 */

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import type { AppConfig } from '../config/app.config';

/** 落盘后缀 → Content-Type（读取侧按后缀扫描时用） */
export const BRAND_LOGO_MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  // 浏览器标签图标常用格式；上传后同时作为 favicon 使用
  '.ico': 'image/x-icon',
};

/** 全部落盘后缀：读取侧扫描与旧文件清理共用 */
export const BRAND_LOGO_EXTENSIONS = Object.keys(BRAND_LOGO_MIME_BY_EXTENSION);

/**
 * MIME → 落盘后缀。客户端文件名不可信（`x.png` 装 webp 内容很常见），
 * 落盘后缀一律由 MIME 决定，保证「文件内容」与「响应 Content-Type」一致；
 * `image/jpg` / `image/jfif` 是 JPEG 的两个历史写法（jfif 常见于移动端 WebView）。
 */
const BRAND_LOGO_EXTENSION_BY_MIME: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(BRAND_LOGO_MIME_BY_EXTENSION).map(([ext, mime]) => [
      mime,
      ext,
    ])
  ),
  'image/jpg': '.jpg',
  'image/jfif': '.jpg',
};

/** 允许上传的 MIME 类型（白名单本身由上表派生） */
export const BRAND_LOGO_ALLOWED_MIME_TYPES = Object.keys(
  BRAND_LOGO_EXTENSION_BY_MIME
);

/** 单张 Logo 上限，与 config-service 的品牌 Logo 限制一致 */
export const BRAND_LOGO_MAX_SIZE = 2 * 1024 * 1024;

/** 前端可直接引用的 Logo URL（与 `users/avatar/:id` 同形态：后端同源） */
export const BRAND_LOGO_URL = '/api/v1/runtime-config/brand-logo';

@Injectable()
export class BrandAssetService {
  private readonly logger = new Logger(BrandAssetService.name);

  constructor(private readonly configService: ConfigService<AppConfig>) {}

  private get brandDir(): string {
    return this.configService.get('brandAssetPath', { infer: true });
  }

  private logoPathOf(ext: string): string {
    return path.join(this.brandDir, `logo${ext}`);
  }

  /**
   * 覆盖式写入品牌 Logo。
   * 返回前端可直接放进 `<img src>` 的 URL 与实际字节数（前端用于提示超出限制）。
   */
  async uploadLogo(
    buffer: Buffer,
    mimeType: string
  ): Promise<{ logoUrl: string; size: number }> {
    if (!BRAND_LOGO_ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new BadRequestException(
        `不支持的图片格式，仅支持: ${BRAND_LOGO_ALLOWED_MIME_TYPES.join(', ')}`
      );
    }
    if (buffer.length === 0 || buffer.length > BRAND_LOGO_MAX_SIZE) {
      throw new BadRequestException(
        `图片大小不能超过 ${BRAND_LOGO_MAX_SIZE / 1024 / 1024}MB`
      );
    }

    const ext = BRAND_LOGO_EXTENSION_BY_MIME[mimeType] ?? '.png';
    await fs.promises.mkdir(this.brandDir, { recursive: true }).catch(() => {});

    await Promise.all(
      BRAND_LOGO_EXTENSIONS.filter((oldExt) => oldExt !== ext).map((oldExt) =>
        fs.promises.unlink(this.logoPathOf(oldExt)).catch(() => {})
      )
    );
    await fs.promises.writeFile(this.logoPathOf(ext), buffer);

    this.logger.log(`品牌 Logo 已更新: ${ext} (${buffer.length} bytes)`);
    return { logoUrl: BRAND_LOGO_URL, size: buffer.length };
  }

  /**
   * 读取当前 Logo。多后缀历史文件按后缀清单逐个探测，命中即返回。
   * 返回 `null` 表示尚未上传过（前端回落内置默认 Logo）。
   */
  async readLogo(): Promise<{ filePath: string; mimeType: string } | null> {
    for (const ext of BRAND_LOGO_EXTENSIONS) {
      const filePath = this.logoPathOf(ext);
      try {
        await fs.promises.access(filePath, fs.constants.F_OK);
        return {
          filePath,
          mimeType: BRAND_LOGO_MIME_BY_EXTENSION[ext] ?? 'application/octet-stream',
        };
      } catch {
        continue;
      }
    }
    return null;
  }
}

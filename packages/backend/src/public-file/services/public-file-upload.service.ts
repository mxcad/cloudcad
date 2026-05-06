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

import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fsPromises from 'fs/promises';
import { AppConfig } from '../../config/app.config';
import { FileUtils } from '../../common/utils/file-utils';

/**
 * 公开文件上传服务
 * 提供文件路径和基础操作方法，供 PublicFileService 使用
 */
@Injectable()
export class PublicFileUploadService {
  private readonly logger = new Logger(PublicFileUploadService.name);
  private readonly uploadPath: string;

  constructor(
    private readonly configService: ConfigService<AppConfig>,
  ) {
    this.uploadPath = this.configService.get('mxcadUploadPath', {
      infer: true,
    });
  }

  /**
   * 查找 uploads 目录中以指定前缀开头的文件
   */
  async findFilesByPrefix(prefix: string): Promise<string[]> {
    const files = await FileUtils.readDirectory(this.uploadPath);
    return files.filter((f) => f.startsWith(prefix));
  }

  /**
   * 获取 uploads 目录路径
   */
  getUploadPath(): string {
    return this.uploadPath;
  }

  /**
   * 读取文件内容
   */
  async readFile(filePath: string): Promise<Buffer> {
    const exists = await FileUtils.exists(filePath);
    if (!exists) {
      throw new BadRequestException('文件不存在');
    }

    try {
      const buffer = await fsPromises.readFile(filePath);
      return buffer;
    } catch (error) {
      this.logger.error(`读取文件失败: ${filePath}`, error);
      throw new InternalServerErrorException('读取文件失败');
    }
  }

  /**
   * 删除文件
   */
  async deleteFile(filePath: string): Promise<void> {
    try {
      const exists = await FileUtils.exists(filePath);
      if (exists) {
        await fsPromises.unlink(filePath);
        this.logger.log(`文件已删除: ${filePath}`);
      }
    } catch (error) {
      this.logger.error(`删除文件失败: ${error.message}`, error);
    }
  }
}

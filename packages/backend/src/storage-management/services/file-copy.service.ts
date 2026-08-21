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

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';

@Injectable()
export class FileCopyService {
  private readonly logger = new Logger(FileCopyService.name);
  private readonly uploadsPath: string;

  constructor(private configService: ConfigService) {
    this.uploadsPath = this.configService.get(
      'mxcadUploadPath',
      '../../uploads'
    );
  }

  /**
   * 拷贝单个文件
   * @param sourcePath 源文件路径
   * @param targetPath 目标文件路径
   * @returns 是否成功
   */
  async copyFile(sourcePath: string, targetPath: string): Promise<boolean> {
    try {
      // 确保目标目录存在
      const targetDir = path.dirname(targetPath);
      await fsPromises.mkdir(targetDir, { recursive: true });

      // 拷贝文件
      await fsPromises.copyFile(sourcePath, targetPath);
      this.logger.log(`文件拷贝成功: ${sourcePath} -> ${targetPath}`);
      return true;
    } catch (error) {
      this.logger.error(
        `文件拷贝失败: ${sourcePath} -> ${targetPath}`,
        error.stack
      );
      return false;
    }
  }

  /**
   * 拷贝目录（递归）
   * @param sourceDir 源目录路径
   * @param targetDir 目标目录路径
   * @returns 是否成功
   */
  async copyDirectory(sourceDir: string, targetDir: string): Promise<boolean> {
    try {
      // 确保目标目录存在
      await fsPromises.mkdir(targetDir, { recursive: true });

      // 递归拷贝
      const entries = await fsPromises.readdir(sourceDir, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);

        if (entry.isDirectory()) {
          // 递归拷贝子目录
          await this.copyDirectory(sourcePath, targetPath);
        } else {
          // 拷贝文件
          await fsPromises.copyFile(sourcePath, targetPath);
        }
      }

      this.logger.log(`目录拷贝成功: ${sourceDir} -> ${targetDir}`);
      return true;
    } catch (error) {
      this.logger.error(
        `目录拷贝失败: ${sourceDir} -> ${targetDir}`,
        error.stack
      );
      return false;
    }
  }

  /**
   * 删除目录（递归）
   * @param dirPath 目录路径
   * @returns 是否成功
   */
  async deleteDirectory(dirPath: string): Promise<boolean> {
    try {
      await fsPromises.rm(dirPath, { recursive: true, force: true });
      this.logger.log(`目录删除成功: ${dirPath}`);
      return true;
    } catch (error) {
      this.logger.error(`目录删除失败: ${dirPath}`, error.stack);
      return false;
    }
  }

  /**
   * 检查文件是否存在
   * @param filePath 文件路径
   * @returns 是否存在
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fsPromises.access(filePath, fs.constants.F_OK);
      return true;
    } catch (error) {
      this.logger.warn(`fileExists check failed for path: ${filePath}, error: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * 获取文件大小
   * @param filePath 文件路径
   * @returns 文件大小（字节）
   */
  async getFileSize(filePath: string): Promise<number> {
    try {
      const stats = await fsPromises.stat(filePath);
      return stats.size;
    } catch (error) {
      this.logger.error(`获取文件大小失败: ${filePath}`, error.stack);
      return 0;
    }
  }

  /**
   * 获取目录大小（递归）
   * @param dirPath 目录路径
   * @returns 目录大小（字节）
   */
  async getDirectorySize(dirPath: string): Promise<number> {
    try {
      let totalSize = 0;

      const traverse = async (dir: string) => {
        const entries = await fsPromises.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            // 递归计算子目录大小
            await traverse(fullPath);
          } else {
            // 累加文件大小
            const stats = await fsPromises.stat(fullPath);
            totalSize += stats.size;
          }
        }
      };

      await traverse(dirPath);
      return totalSize;
    } catch (error) {
      this.logger.error(`获取目录大小失败: ${dirPath}`, error.stack);
      return 0;
    }
  }
}

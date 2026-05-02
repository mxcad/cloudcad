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

export interface CopyResult {
  success: boolean;
  copiedFiles: string[];
  error?: string;
}

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
   * 从 uploads 拷贝文件到目标目录
   * @param fileHash 文件哈希
   * @param targetDir 目标目录（完整路径）
   * @returns 拷贝结果
   */
  async copyFilesByHash(
    fileHash: string,
    targetDir: string
  ): Promise<CopyResult> {
    try {
      this.logger.log(`开始拷贝文件: hash=${fileHash}, targetDir=${targetDir}`);

      // 确保目标目录存在
      await fsPromises.mkdir(targetDir, { recursive: true });

      // 查找 uploads 中所有包含该 hash 的文件
      const sourceFiles = await this.findFilesByHash(fileHash);

      if (sourceFiles.length === 0) {
        const error = `未找到 hash 为 ${fileHash} 的文件`;
        this.logger.error(error);
        return { success: false, copiedFiles: [], error };
      }

      // 拷贝文件
      const copiedFiles: string[] = [];
      for (const sourceFile of sourceFiles) {
        try {
          const fileName = path.basename(sourceFile);
          const targetFile = path.join(targetDir, fileName);

          await fsPromises.copyFile(sourceFile, targetFile);
          copiedFiles.push(fileName);
          this.logger.log(`文件拷贝成功: ${fileName}`);
        } catch (error) {
          this.logger.error(`文件拷贝失败: ${sourceFile}`, error.stack);
          // 如果单个文件拷贝失败，继续尝试其他文件
        }
      }

      if (copiedFiles.length === 0) {
        const error = `所有文件拷贝失败`;
        this.logger.error(error);
        return { success: false, copiedFiles: [], error };
      }

      this.logger.log(
        `文件拷贝完成: hash=${fileHash}, 共拷贝 ${copiedFiles.length} 个文件`
      );
      return { success: true, copiedFiles };
    } catch (error) {
      this.logger.error(`文件拷贝失败: hash=${fileHash}`, error.stack);
      return {
        success: false,
        copiedFiles: [],
        error: error.message,
      };
    }
  }

  /**
   * 查找 uploads 中所有包含指定 hash 的文件
   * @param fileHash 文件哈希
   * @returns 文件路径列表
   */
  private async findFilesByHash(fileHash: string): Promise<string[]> {
    const matchedFiles: string[] = [];

    try {
      // 递归遍历 uploads 目录
      const traverse = async (dir: string) => {
        const entries = await fsPromises.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            // 递归遍历子目录
            await traverse(fullPath);
          } else if (entry.isFile()) {
            // 严格匹配：文件名必须以 hash 开头
            // 支持格式：{hash}, {hash}.{ext}, {hash}_..., {hash}-...
            // 例如：abc123.dwg, abc123_timestamp.dwg, abc123-converted.dwg
            const fileNameWithoutExt = entry.name.split('.')[0];
            const parts = fileNameWithoutExt.split(/[_-]/);
            const hashPrefix = parts[0];

            if (hashPrefix === fileHash) {
              // 确保文件名以 hash 开头，避免误匹配如 "123abc.dwg"
              if (fileNameWithoutExt.startsWith(fileHash)) {
                matchedFiles.push(fullPath);
                this.logger.debug(
                  `匹配文件: ${entry.name} (hash: ${fileHash})`
                );
              }
            }
          }
        }
      };

      await traverse(this.uploadsPath);
      this.logger.log(
        `找到 ${matchedFiles.length} 个匹配 hash 的文件: ${fileHash}`
      );
      return matchedFiles;
    } catch (error) {
      this.logger.error(`查找文件失败: hash=${fileHash}`, error.stack);
      return [];
    }
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
    } catch {
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

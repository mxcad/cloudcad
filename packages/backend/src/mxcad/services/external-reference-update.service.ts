///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileSystemNodeService } from './filesystem-node.service';
import { StorageManager } from '../../common/services/storage-manager.service';
import { PreloadingDataDto } from '../dto/preloading-data.dto';
import {
  ExternalReferenceStats,
  ExternalReferenceInfo,
} from '../types/external-reference.types';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { AppConfig } from '../../config/app.config';

/**
 * 外部参照更新服务
 * 负责处理文件上传后的外部参照信息更新逻辑
 * 
 * 此服务从 MxCadService 中提取，用于消除循环依赖：
 * MxCadService → FileUploadManagerFacadeService → FileConversionUploadService → MxCadService
 */
@Injectable()
export class ExternalReferenceUpdateService {
  private readonly logger = new Logger(ExternalReferenceUpdateService.name);
  private readonly mxcadUploadPath: string;

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    private readonly fileSystemNodeService: FileSystemNodeService,
    private readonly storageManager: StorageManager
  ) {
    this.mxcadUploadPath = this.configService.get('mxcadUploadPath', { infer: true });
  }

  /**
   * 上传完成后更新外部参照信息
   * @param nodeId 文件系统节点 ID
   */
  async updateAfterUpload(nodeId: string): Promise<void> {
    try {
      // 添加短暂延迟，确保文件系统已经完成写入
      await new Promise((resolve) => setTimeout(resolve, 100));

      const stats = await this.getStats(nodeId);

      if (stats.totalCount > 0) {
        await this.updateInfo(nodeId, stats);
        this.logger.log(
          `上传完成后更新外部参照信息成功: nodeId=${nodeId}, 缺失数量=${stats.missingCount}`
        );
      }
    } catch (error) {
      this.logger.error(
        `上传完成后更新外部参照信息失败（不影响主流程）: ${error.message}`,
        error.stack
      );
    }
  }

  /**
   * 获取外部参照统计信息
   * @param nodeId 文件系统节点 ID
   * @returns 外部参照统计信息
   */
  async getStats(nodeId: string): Promise<ExternalReferenceStats> {
    const preloadingData = await this.getPreloadingData(nodeId);

    if (!preloadingData) {
      return {
        hasMissing: false,
        missingCount: 0,
        totalCount: 0,
        references: [],
      };
    }

    // 过滤掉 http/https 开头的 URL
    const missingImages = preloadingData.images.filter(
      (name: string) => !name.startsWith('http:') && !name.startsWith('https:')
    );
    const missingRefs = preloadingData.externalReference;

    const references: ExternalReferenceInfo[] = [];

    // 检查 DWG 外部参照
    for (const name of missingRefs) {
      const exists = await this.checkExists(nodeId, name);
      references.push({
        name,
        type: 'dwg',
        exists,
        required: true,
      });
    }

    // 检查图片外部参照
    for (const name of missingImages) {
      const exists = await this.checkExists(nodeId, name);
      references.push({
        name,
        type: 'image',
        exists,
        required: true,
      });
    }

    const missingCount = references.filter((ref) => !ref.exists).length;

    return {
      hasMissing: missingCount > 0,
      missingCount,
      totalCount: references.length,
      references,
    };
  }

  /**
   * 更新文件节点的外部参照信息
   * @param nodeId 文件系统节点 ID
   * @param stats 外部参照统计信息
   */
  async updateInfo(
    nodeId: string,
    stats: ExternalReferenceStats
  ): Promise<void> {
    try {
      const node = await this.fileSystemNodeService.findById(nodeId);

      if (!node) {
        this.logger.warn(`文件节点不存在: nodeId=${nodeId}`);
        return;
      }

      await this.fileSystemNodeService.updateExternalReferenceInfo(
        node.id,
        stats.hasMissing,
        stats.missingCount,
        stats.references
      );

      this.logger.log(
        `更新外部参照信息成功: nodeId=${nodeId}, fileHash=${node.fileHash}, 缺失数量: ${stats.missingCount}`
      );
    } catch (error) {
      this.logger.error(`更新外部参照信息失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 获取外部参照预加载数据
   * @param nodeId 文件系统节点 ID
   * @returns 预加载数据，如果文件不存在则返回 null
   */
  async getPreloadingData(nodeId: string): Promise<PreloadingDataDto | null> {
    try {
      const node = await this.fileSystemNodeService.findById(nodeId);

      if (!node) {
        this.logger.warn(`[getPreloadingData] 节点不存在: nodeId=${nodeId}`);
        return null;
      }

      if (node.isFolder) {
        this.logger.warn(
          `[getPreloadingData] 节点是文件夹，不是文件: nodeId=${nodeId}, name=${node.name}`
        );
        return null;
      }

      if (!node.fileHash) {
        this.logger.warn(
          `[getPreloadingData] 文件节点没有 fileHash: nodeId=${nodeId}, name=${node.name}, fileStatus=${node.fileStatus}`
        );
        return null;
      }

      const fileHash = node.fileHash;

      // 验证哈希值格式
      if (!this.isValidFileHash(fileHash)) {
        this.logger.warn(`无效的文件哈希格式: ${fileHash}`);
        return null;
      }

      // 获取存储根路径
      const storageRootPath = await this.getStorageRootPath(nodeId);
      this.logger.debug(`[getPreloadingData] 存储根路径: ${storageRootPath}`);

      // 构造预加载数据文件路径
      const preloadingFileName = `${nodeId}.dwg.mxweb_preloading.json`;
      const preloadingFilePath = path.join(storageRootPath, preloadingFileName);

      // 检查文件是否存在
      try {
        const content = await fsPromises.readFile(preloadingFilePath, 'utf-8');
        const data = JSON.parse(content) as PreloadingDataDto;

        this.logger.debug(
          `成功获取预加载数据: nodeId=${nodeId}, 外部参照数: ${data.externalReference?.length || 0}, 图片数: ${data.images?.length || 0}`
        );
        return data;
      } catch (readError) {
        if (readError.code === 'ENOENT') {
          this.logger.warn(
            `[getPreloadingData] 预加载数据文件不存在: ${preloadingFilePath}`
          );
        } else {
          this.logger.error(
            `[getPreloadingData] 读取文件失败: ${readError.message}`,
            readError.stack
          );
        }
        return null;
      }
    } catch (error) {
      this.logger.error(`获取预加载数据失败: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * 检查外部参照文件是否存在
   * @param nodeId 源图纸文件的节点 ID
   * @param fileName 外部参照文件名
   * @returns 文件是否存在
   */
  async checkExists(nodeId: string, fileName: string): Promise<boolean> {
    try {
      const sourceNode = await this.fileSystemNodeService.findById(nodeId);

      if (!sourceNode || !sourceNode.path) {
        this.logger.warn(
          `[checkExists] 源图纸节点不存在或没有 path: nodeId=${nodeId}`
        );
        return false;
      }

      // 获取存储根路径（已包含 YYYYMM[/N]/sourceNodeId）
      const storageRootPath = await this.getStorageRootPath(nodeId);

      // 获取外部参照目录名称
      const externalRefDirName = await this.getExtRefDirName(nodeId);

      // 判断文件类型
      const ext = path.extname(fileName).toLowerCase();
      const isDwgFile = ['.dwg', '.dxf'].includes(ext);
      const isImageFile = [
        '.png',
        '.jpg',
        '.jpeg',
        '.gif',
        '.webp',
        '.bmp',
      ].includes(ext);

      // 构建目标文件名
      let targetFileName: string;
      if (isDwgFile) {
        targetFileName = `${fileName}.mxweb`;
      } else if (isImageFile) {
        targetFileName = fileName;
      } else {
        targetFileName = `${fileName}.mxweb`;
      }

      // 外部参照文件统一存储在 storageRootPath/{src_file_md5}/ 目录中
      const targetFilePath = path.join(
        storageRootPath,
        externalRefDirName,
        targetFileName
      );

      // 检查文件是否存在
      try {
        await fsPromises.access(targetFilePath);
        this.logger.log(
          `[checkExists] 文件存在: nodeId=${nodeId}, fileName=${fileName}, target=${targetFilePath}`
        );
        return true;
      } catch (error) {
        this.logger.log(
          `[checkExists] 文件不存在: nodeId=${nodeId}, fileName=${fileName}, target=${targetFilePath}`
        );
        return false;
      }
    } catch (error) {
      this.logger.error(
        `[checkExists] 检查失败: ${error.message}`,
        error.stack
      );
      return false;
    }
  }

  /**
   * 获取外部参照目录名称
   * 从源图纸的 preloading.json 文件中读取 src_file_md5 字段作为目录名
   * @param nodeId 源图纸节点 ID
   * @returns 外部参照目录名称（src_file_md5 值）
   */
  async getExtRefDirName(nodeId: string): Promise<string> {
    try {
      const storageRootPath = await this.getStorageRootPath(nodeId);

      const preloadingFileName = `${nodeId}.dwg.mxweb_preloading.json`;
      const preloadingFilePath = path.join(storageRootPath, preloadingFileName);

      try {
        const content = await fsPromises.readFile(preloadingFilePath, 'utf-8');
        const data = JSON.parse(content);

        const srcFileMd5 = data.src_file_md5;

        if (!srcFileMd5) {
          this.logger.warn(
            `[getExtRefDirName] preloading.json 中没有 src_file_md5 字段: ${preloadingFilePath}`
          );
          return nodeId;
        }

        this.logger.log(
          `[getExtRefDirName] 获取到 src_file_md5: ${srcFileMd5}`
        );
        return srcFileMd5;
      } catch (readError) {
        if (readError.code === 'ENOENT') {
          this.logger.warn(
            `[getExtRefDirName] preloading.json 文件不存在: ${preloadingFilePath}`
          );
        } else {
          this.logger.error(
            `[getExtRefDirName] 读取文件失败: ${readError.message}`,
            readError.stack
          );
        }
        return nodeId;
      }
    } catch (error) {
      this.logger.error(
        `[getExtRefDirName] 获取失败: ${error.message}`,
        error.stack
      );
      return nodeId;
    }
  }

  /**
   * 获取节点的存储根路径
   * @param nodeId 节点 ID
   * @returns 存储根路径，如果找不到节点则返回 uploads 路径（兼容旧文件）
   */
  private async getStorageRootPath(nodeId: string): Promise<string> {
    try {
      const sourceNode = await this.fileSystemNodeService.findById(nodeId);

      if (sourceNode && sourceNode.path) {
        const fullPath = this.storageManager.getFullPath(sourceNode.path);
        const directoryPath = path.dirname(fullPath);
        return directoryPath;
      }
    } catch (error) {
      this.logger.warn(`[getStorageRootPath] 查找节点失败: ${error.message}`);
    }

    return this.mxcadUploadPath;
  }

  /**
   * 验证哈希值格式（32位十六进制）
   */
  private isValidFileHash(fileHash: string): boolean {
    return /^[a-f0-9]{32}$/i.test(fileHash);
  }
}

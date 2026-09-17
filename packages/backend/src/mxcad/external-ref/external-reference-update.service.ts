///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { NodeType } from '@cloudcad/db';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { StorageManager } from '../../storage-management/services/storage-manager.service';
import { ExtRefPreloadingService } from './ext-ref-preloading.service';
import {
  PreloadingDataDto,
  PreloadingFileInfoDto,
} from '../dto/preloading-data.dto';
import {
  ExternalReferenceStats,
  ExternalReferenceInfo,
  PreloadingData,
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
    private readonly storageManager: StorageManager,
    private readonly extRefPreloadingService: ExtRefPreloadingService,
  ) {
    this.mxcadUploadPath = this.configService.get('mxcadUploadPath', {
      infer: true,
    });
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
      (item) => !item.name.startsWith('http:') && !item.name.startsWith('https:')
    );
    const missingRefs = preloadingData.externalReference;

    const references: ExternalReferenceInfo[] = [];

    // 检查 DWG 外部参照
    for (const item of missingRefs) {
      const exists = await this.checkExists(nodeId, item.name);
      references.push({
        name: item.name,
        type: item.type === 'dwg' ? 'dwg' : 'image',
        size: item.size,
        exists,
        required: true,
      });
    }

    // 检查图片外部参照
    for (const item of missingImages) {
      const exists = await this.checkExists(nodeId, item.name);
      references.push({
        name: item.name,
        type: 'image',
        size: item.size,
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
      let nodePath: string | undefined;

      if (node) {
        if (node.nodeType !== NodeType.FILE) {
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
        if (!this.isValidFileHash(fileHash)) {
          this.logger.warn(`无效的文件哈希格式: ${fileHash}`);
          return null;
        }

        nodePath = node.path;
      } else {
        this.logger.debug(`[getPreloadingData] 节点不存在，使用临时存储: nodeId=${nodeId}`);
      }

      const storageRootPath = await this.getStorageRootPath(nodeId);
      this.logger.debug(`[getPreloadingData] 存储根路径: ${storageRootPath}`);

      const preloadingFileName = this.extRefPreloadingService.getPreloadingFileName(nodeId, nodePath);
      const preloadingFilePath = path.join(storageRootPath, preloadingFileName);

      try {
        const content = await fsPromises.readFile(preloadingFilePath, 'utf-8');
        const rawData: PreloadingData = JSON.parse(content);

        const extRefDirName = rawData.src_file_md5 || nodeId;

        const externalReference =
          await this.enrichFileInfoList(
            rawData.externalReference,
            storageRootPath,
            extRefDirName,
            'dwg'
          );
        const images =
          await this.enrichFileInfoList(
            rawData.images,
            storageRootPath,
            extRefDirName,
            'image'
          );

        this.logger.debug(
          `成功获取预加载数据: nodeId=${nodeId}, 外部参照数: ${externalReference.length}, 图片数: ${images.length}`
        );

        return {
          tz: rawData.tz,
          src_file_md5: rawData.src_file_md5,
          images,
          externalReference,
        };
      } catch (readError) {
        if (readError.code === 'ENOENT') {
          this.logger.warn(
            `[getPreloadingData] 预加载数据文件不存在: ${preloadingFilePath}`
          );
        } else {
          this.logger.error(
            `[getPreloadingData] 读取文件失败: ${readError.message}`,
            (readError as Error).stack
          );
        }
        return null;
      }
    } catch (error) {
      this.logger.error(`获取预加载数据失败: ${error.message}`, (error as Error).stack);
      return null;
    }
  }

  /**
   * 将文件名列表转为包含文件大小和类型的对象列表
   * @param fileNames 原始文件名列表
   * @param storageRootPath 存储根路径
   * @param extRefDirName 外部参照子目录名 (src_file_md5)
   * @param defaultType 默认文件类型
   */
  private async enrichFileInfoList(
    fileNames: string[],
    storageRootPath: string,
    extRefDirName: string,
    defaultType: 'dwg' | 'image',
  ): Promise<PreloadingFileInfoDto[]> {
    if (!fileNames || fileNames.length === 0) return [];

    const results: PreloadingFileInfoDto[] = [];
    for (const name of fileNames) {
      let size = 0;
      let type = defaultType;

      // 根据扩展名精确判断类型
      const ext = path.extname(name).toLowerCase();
      const isDwgFile = ['.dwg', '.dxf'].includes(ext);
      const isImageFile = ['.png', '.jpg', '.jpeg', '.jfif', '.gif', '.webp', '.bmp'].includes(ext);
      if (isDwgFile) type = 'dwg';
      else if (isImageFile) type = 'image';

      // 构造目标文件路径（与 checkExists 逻辑一致）
      const targetFileName = isDwgFile ? `${name}.mxweb` : name;
      const targetFilePath = path.join(storageRootPath, extRefDirName, targetFileName);

      try {
        const stat = await fsPromises.stat(targetFilePath);
        size = stat.size;
      } catch {
        // 文件不存在时 size 保持 0
      }

      results.push({ name, size, type });
    }
    return results;
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
        this.logger.debug(
          `[checkExists] 节点不存在或无 path，使用临时存储: nodeId=${nodeId}`
        );
      }

      // 获取存储根路径（已包含 YYYYMM[/N]/sourceNodeId）
      const storageRootPath = await this.getStorageRootPath(nodeId);

      // 获取外部参照目录名称
      const externalRefDirName = await this.extRefPreloadingService.getExtRefDirName(nodeId);

      // 判断文件类型
      const ext = path.extname(fileName).toLowerCase();
      const isDwgFile = ['.dwg', '.dxf'].includes(ext);
      const isImageFile = [
        '.png',
        '.jpg',
        '.jpeg',
        '.jfif',
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
      }

      // 降级检查：扫描目录精确匹配 targetFileName
      try {
        const extRefDir = path.join(storageRootPath, externalRefDirName);
        let actualScanDir: string;
        try {
          await fsPromises.access(extRefDir);
          actualScanDir = extRefDir;
        } catch {
          actualScanDir = storageRootPath;
          this.logger.debug(
            `[checkExists] 标准目录不存在，降级到扁平结构: ${actualScanDir}`
          );
        }

        const dirEntries = await fsPromises.readdir(actualScanDir);
        const match = dirEntries.find((entry) => entry.toLowerCase() === targetFileName.toLowerCase());
        if (match) {
          this.logger.log(
            `[checkExists] 通过精确匹配找到文件: nodeId=${nodeId}, fileName=${fileName}, matched=${match}`
          );
          return true;
        }
      } catch (scanError) {
        // 扫描目录失败不影响主流程
        this.logger.debug(
          `[checkExists] 降级扫描目录失败: ${scanError.message}`
        );
      }

      return false;
    } catch (error) {
      this.logger.error(
        `[checkExists] 检查失败: ${error.message}`,
        error.stack
      );
      return false;
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

  /**
   * 上传图片后更新预加载 JSON，将图片文件名加入 images 数组
   * @param nodeId 文件节点 ID
   * @param imageFileName 上传的图片文件名
   */
  async addImageToPreloadingData(
    nodeId: string,
    imageFileName: string
  ): Promise<void> {
    try {
      const storageRootPath = await this.getStorageRootPath(nodeId);

      // 获取节点路径以确定 preloading 文件名的扩展名，同时获取 fileHash 作为 src_file_md5
      let nodePath: string | undefined;
      let nodeFileHash: string | undefined;
      try {
        const node = await this.fileSystemNodeService.findById(nodeId);
        nodePath = node?.path;
        nodeFileHash = node?.fileHash;
      } catch {
        // 忽略，使用 fallback
      }

      const preloadingFileName = this.extRefPreloadingService.getPreloadingFileName(nodeId, nodePath);
      const preloadingFilePath = path.join(storageRootPath, preloadingFileName);

      let data: PreloadingData;
      try {
        const content = await fsPromises.readFile(preloadingFilePath, 'utf-8');
        data = JSON.parse(content) as PreloadingData;
      } catch (readError) {
        // 新建图纸可能完全没有外部参照记录（preloading.json 尚未生成）：
        // 按规范自动创建 { tz:false, src_file_md5:<fileHash|nodeId>, images:[...], externalReference:[] }
        if ((readError as NodeJS.ErrnoException).code !== 'ENOENT') {
          this.logger.error(
            `[addImageToPreloadingData] 读取失败: ${(readError as Error).message}`,
            (readError as Error).stack
          );
          return;
        }
        data = {
          tz: false,
          src_file_md5: nodeFileHash || nodeId,
          images: [],
          externalReference: [],
        };
        this.logger.log(
          `[addImageToPreloadingData] preloading.json 不存在，自动创建: ${preloadingFilePath}`
        );
      }

      if (!data.images) {
        data.images = [];
      }

      if (!data.images.includes(imageFileName)) {
        data.images.push(imageFileName);
        await fsPromises.writeFile(
          preloadingFilePath,
          JSON.stringify(data, null, 2),
          'utf-8'
        );
        this.logger.log(
          `[addImageToPreloadingData] 已添加图片到预加载数据: nodeId=${nodeId}, image=${imageFileName}`
        );
      }
    } catch (error) {
      this.logger.error(
        `[addImageToPreloadingData] 更新失败: ${error.message}`,
        error.stack
      );
    }
  }

  /**
   * 上传后更新预加载数据（封装替换/追加分支逻辑）
   * @param nodeId 文件节点 ID
   * @param extRefFileName 上传的文件名
   * @param originalXrefName 替换模式时的原始外部参照名（可选，传此值表示替换而非追加）
   */
  async updatePreloadingAfterUpload(
    nodeId: string,
    extRefFileName: string,
    originalXrefName?: string
  ): Promise<void> {
    if (originalXrefName) {
      await this.replaceInPreloadingData(nodeId, originalXrefName);
    } else {
      await this.addImageToPreloadingData(nodeId, extRefFileName);
    }
  }

  /**
   * 替换预加载 JSON 中的外部参照条目
   * 替换模式时，将 originalName 替换为 newName
   * 若 originalName 与 newName 相同，则不做修改（仅验证存在）
   * @param nodeId 文件节点 ID
   * @param originalName 原始外部参照文件名
   * @param newName 新的外部参照文件名（可选，不传则视为仅验证）
   */
  async replaceInPreloadingData(
    nodeId: string,
    originalName: string,
    newName?: string
  ): Promise<void> {
    try {
      const storageRootPath = await this.getStorageRootPath(nodeId);

      let nodePath: string | undefined;
      try {
        const node = await this.fileSystemNodeService.findById(nodeId);
        nodePath = node?.path;
      } catch {
        // 忽略
      }

      const preloadingFileName = this.extRefPreloadingService.getPreloadingFileName(nodeId, nodePath);
      const preloadingFilePath = path.join(storageRootPath, preloadingFileName);

      let data: PreloadingData;
      try {
        const content = await fsPromises.readFile(preloadingFilePath, 'utf-8');
        data = JSON.parse(content) as PreloadingData;
      } catch {
        this.logger.warn(
          `[replaceInPreloadingData] preloading.json 不存在: ${preloadingFilePath}`
        );
        return;
      }

      let changed = false;

      // 替换 externalReference 中的条目
      if (data.externalReference) {
        const idx = data.externalReference.indexOf(originalName);
        if (idx !== -1) {
          if (newName && newName !== originalName) {
            data.externalReference[idx] = newName;
            changed = true;
          }
        }
      }

      // 替换 images 中的条目
      if (data.images) {
        const idx = data.images.indexOf(originalName);
        if (idx !== -1) {
          if (newName && newName !== originalName) {
            data.images[idx] = newName;
            changed = true;
          }
        }
      }

      if (changed) {
        await fsPromises.writeFile(
          preloadingFilePath,
          JSON.stringify(data, null, 2),
          'utf-8'
        );
        this.logger.log(
          `[replaceInPreloadingData] 已替换预加载数据条目: nodeId=${nodeId}, ${originalName} -> ${newName}`
        );
      } else {
        this.logger.log(
          `[replaceInPreloadingData] 条目已存在或无需变更: nodeId=${nodeId}, name=${originalName}`
        );
      }
    } catch (error) {
      this.logger.error(
        `[replaceInPreloadingData] 更新失败: ${error.message}`,
        error.stack
      );
    }
  }

  /**
   * 获取外部参照文件的下载路径
   * @param nodeId 文件节点 ID
   * @param fileName 外部参照文件名
   * @returns 完整的文件路径，如果文件不存在则返回 null
   */
  async getExternalRefDownloadPath(nodeId: string, fileName: string): Promise<string | null> {
    try {
      const storageRootPath = await this.getStorageRootPath(nodeId);
      const extRefDirName = await this.extRefPreloadingService.getExtRefDirName(nodeId);
      const ext = path.extname(fileName).toLowerCase();
      const isDwgFile = ['.dwg', '.dxf'].includes(ext);

      // 构建磁盘文件名：
      // - DWG/DXF: 追加 .mxweb 后缀 → A1.dwg → A1.dwg.mxweb
      // - 图片等: 使用原名 → image.png → image.png
      const targetFileName = isDwgFile ? `${fileName}.mxweb` : fileName;

      // 尝试多个可能的文件名模式
      const candidates: string[] = [];
      candidates.push(path.join(storageRootPath, extRefDirName, targetFileName));

      // 兼容旧格式：部分文件可能以去扩展名的方式存储（如 A1.mxweb 而非 A1.dwg.mxweb）
      if (isDwgFile) {
        const baseName = path.basename(fileName, ext);
        candidates.push(path.join(storageRootPath, extRefDirName, `${baseName}.mxweb`));
      }

      if (!isDwgFile) {
        // 旧格式 URL 兼容：fileName 带 .mxweb 尾部（旧路由遗留），
        // 实际磁盘文件是不带 .mxweb 的原名
        if (fileName.toLowerCase().endsWith('.mxweb')) {
          const nameWithoutMxweb = fileName.slice(0, -'.mxweb'.length);
          if (nameWithoutMxweb) {
            candidates.push(path.join(storageRootPath, extRefDirName, nameWithoutMxweb));
            const innerExt = path.extname(nameWithoutMxweb).toLowerCase();
            if (['.dwg', '.dxf'].includes(innerExt)) {
              const innerBase = path.basename(nameWithoutMxweb, innerExt);
              candidates.push(path.join(storageRootPath, extRefDirName, `${innerBase}.mxweb`));
            }
          }
        }
      }

      for (const candidate of candidates) {
        try {
          await fsPromises.access(candidate);
          return candidate;
        } catch {
          continue;
        }
      }

      this.logger.warn(`[getExternalRefDownloadPath] 外部参照文件不存在: ${candidates.join(', ')}`);
      return null;
    } catch (error) {
      this.logger.error(`[getExternalRefDownloadPath] 获取下载路径失败: ${error.message}`, error.stack);
      return null;
    }
  }
}

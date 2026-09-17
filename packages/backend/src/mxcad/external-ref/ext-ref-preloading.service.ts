import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { StorageManager } from '../../storage-management/services/storage-manager.service';
import { AppConfig } from '../../config/app.config';
import * as path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';

export interface PreloadingDataResult {
  srcFileMd5: string | null;
  tz: boolean;
  images: string[];
  externalReference: string[];
}

export interface WritePreloadingData {
  srcFileMd5?: string;
  tz?: boolean;
  images?: string[];
  externalReference?: string[];
}

/**
 * 外部参照预加载 JSON 的统一管理服务
 *
 * 消除以下服务中 preloading JSON 的重复逻辑：
 * - ExternalReferenceUpdateService
 * - ExternalRefService
 * - ExternalReferenceHandler
 */
@Injectable()
export class ExtRefPreloadingService {
  private readonly logger = new Logger(ExtRefPreloadingService.name);
  private readonly mxcadUploadPath: string;

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    private readonly fileSystemNodeService: FileSystemNodeService,
    private readonly storageManager: StorageManager,
  ) {
    this.mxcadUploadPath = this.configService.get('mxcadUploadPath', { infer: true });
  }

  /**
   * 根据节点路径获取 preloading JSON 文件名
   * node.path 格式为 {nodeId}.{ext}.mxweb，从中提取 ext 构造 preloading 文件名
   */
  getPreloadingFileName(nodeId: string, nodePath: string): string {
    if (!nodePath) {
      return `${nodeId}.dwg.mxweb_preloading.json`;
    }
    const basename = path.basename(nodePath);
    const withoutMxweb = basename.replace(/\.mxweb$/, '');

    let ext: string;
    if (withoutMxweb.startsWith(nodeId + '.')) {
      ext = withoutMxweb.substring(nodeId.length + 1);
    } else if (withoutMxweb.startsWith(nodeId)) {
      ext = withoutMxweb.substring(nodeId.length);
    } else {
      ext = path.extname(withoutMxweb).replace(/^\./, '');
    }

    if (!ext) {
      return `${nodeId}.dwg.mxweb_preloading.json`;
    }
    return `${nodeId}.${ext}.mxweb_preloading.json`;
  }

  /**
   * 获取 preloading JSON 的完整文件路径
   */
  async getPreloadingFilePath(nodeId: string): Promise<string | null> {
    const node = await this.fileSystemNodeService.findById(nodeId);
    const nodePath = node?.path || '';

    // 用户云端：按 node.path 解析存储目录；游客/临时：回退到 mxcadUploadPath
    const storageRootPath = node?.path
      ? path.dirname(this.storageManager.getFullPath(node.path))
      : this.mxcadUploadPath;

    const preloadingFileName = this.getPreloadingFileName(nodeId, nodePath);
    return path.join(storageRootPath, preloadingFileName);
  }

  /**
   * 读取并解析 preloading JSON 文件
   * @returns 解析后的数据对象，或 null（文件不存在）
   */
  async readPreloadingData(nodeId: string): Promise<PreloadingDataResult | null> {
    try {
      const filePath = await this.getPreloadingFilePath(nodeId);
      if (!filePath) return null;

      const content = await fsPromises.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      return {
        srcFileMd5: data.src_file_md5 || null,
        tz: !!data.tz,
        images: data.images || [],
        externalReference: data.externalReference || [],
      };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.logger.warn(`[readPreloadingData] preloading.json 不存在: nodeId=${nodeId}`);
        return null;
      }
      this.logger.error(`[readPreloadingData] 读取失败: nodeId=${nodeId}, ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * 检查 preloading JSON 文件是否存在
   */
  async checkExists(nodeId: string): Promise<boolean> {
    try {
      const filePath = await this.getPreloadingFilePath(nodeId);
      if (!filePath) return false;
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }

  /**
   * 写入/更新 preloading JSON 文件
   */
  async writePreloading(nodeId: string, data: WritePreloadingData): Promise<boolean> {
    try {
      const existing = await this.readPreloadingData(nodeId);
      const merged: WritePreloadingData = {
        srcFileMd5: data.srcFileMd5 ?? existing?.srcFileMd5 ?? undefined,
        tz: data.tz ?? existing?.tz ?? false,
        images: data.images ?? existing?.images ?? [],
        externalReference: data.externalReference ?? existing?.externalReference ?? [],
      };

      const filePath = await this.getPreloadingFilePath(nodeId);
      if (!filePath) return false;

      const raw = {
        src_file_md5: merged.srcFileMd5,
        tz: merged.tz,
        images: merged.images,
        externalReference: merged.externalReference,
      };

      await fsPromises.writeFile(filePath, JSON.stringify(raw, null, 2), 'utf-8');
      this.logger.log(`[writePreloading] 写入成功: nodeId=${nodeId}`);
      return true;
    } catch (err) {
      this.logger.error(`[writePreloading] 写入失败: nodeId=${nodeId}, ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * 获取外部参照目录名称
   * 从源图纸的 preloading.json 中读取 src_file_md5 作为目录名
   * 降级返回 nodeId
   */
  async getExtRefDirName(nodeId: string): Promise<string> {
    const data = await this.readPreloadingData(nodeId);
    return data?.srcFileMd5 || nodeId;
  }

}

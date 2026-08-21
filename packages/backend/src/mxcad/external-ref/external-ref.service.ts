///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FileSystemService as MxFileSystemService } from '../infra/file-system.service';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { StorageManager } from '../../storage-management/services/storage-manager.service';
import { ExtRefPreloadingService } from './ext-ref-preloading.service';
import { FileSystemNodeContext } from '../node/filesystem-node.service';
import { FileTreeService } from '../../file-system/file-tree/file-tree.service';
import * as path from 'path';
import * as fsPromises from 'fs/promises';
import { I18nContext } from 'nestjs-i18n';
import { NodeMutationGuard } from '../../file-operations/node-mutation.guard';

@Injectable()
export class ExternalRefService {
  private readonly logger = new Logger(ExternalRefService.name);

  constructor(
    private readonly fileSystemService: MxFileSystemService,
    private readonly fileSystemNodeService: FileSystemNodeService,
    private readonly fileTreeService: FileTreeService,
    private readonly storageManager: StorageManager,
    private readonly extRefPreloadingService: ExtRefPreloadingService,
    private readonly nodeMutationGuard: NodeMutationGuard
  ) {}

  async getExternalRefDirName(srcDwgNodeId: string): Promise<string> {
    try {
      return await this.extRefPreloadingService.getExtRefDirName(srcDwgNodeId);
    } catch (error) {
      this.logger.error(
        `[getExternalRefDirName] 读取失败: ${error.message}`,
        error.stack
      );
      return srcDwgNodeId;
    }
  }

  async handleExternalReferenceFile(
    extRefHash: string,
    srcDwgNodeId: string,
    extRefFileName: string,
    srcFilePath: string
  ): Promise<void> {
    try {
      this.logger.log(
        `[handleExternalReferenceFile] 开始处理: extRefHash=${extRefHash}, srcDwgNodeId=${srcDwgNodeId}, extRefFileName=${extRefFileName}`
      );

      const sourceNode =
        await this.fileSystemNodeService.findById(srcDwgNodeId);
      if (!sourceNode || !sourceNode.path) {
        throw new NotFoundException(
          I18nContext.current()?.t(
            'error.file_extra.source_drawing_not_exist',
            { args: { id: srcDwgNodeId } }
          ) ?? `源图纸节点不存在: ${srcDwgNodeId}`
        );
      }

      const sourceNodePath = this.storageManager.getFullPath(sourceNode.path);
      const sourceNodeDir = path.dirname(sourceNodePath);
      const externalRefDirName = await this.getExternalRefDirName(srcDwgNodeId);
      const externalRefDir = path.join(sourceNodeDir, externalRefDirName);

      if (!(await this.fileSystemService.exists(externalRefDir))) {
        await fsPromises.mkdir(externalRefDir, { recursive: true });
      }

      const targetFile = path.join(externalRefDir, `${extRefFileName}.mxweb`);

      if (!(await this.fileSystemService.exists(srcFilePath))) {
        throw new NotFoundException(
          I18nContext.current()?.t(
            'error.file_extra.converted_file_not_exist',
            { args: { path: srcFilePath } }
          ) ?? `转换后的文件不存在: ${srcFilePath}`
        );
      }

      await fsPromises.copyFile(srcFilePath, targetFile);
      this.logger.log(
        `[handleExternalReferenceFile] mxweb 文件拷贝成功: ${targetFile}`
      );
    } catch (error) {
      this.logger.error(
        `[handleExternalReferenceFile] 处理失败: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  async handleExternalReferenceImage(
    fileHash: string,
    srcDwgNodeId: string,
    extRefFileName: string,
    srcFilePath: string,
    context: FileSystemNodeContext
  ): Promise<void> {
    try {
      this.logger.log(
        `[handleExternalReferenceImage] 开始处理: srcDwgNodeId=${srcDwgNodeId}, extRefFileName=${extRefFileName}`
      );

      const sourceNode =
        await this.fileSystemNodeService.findById(srcDwgNodeId);
      if (!sourceNode || !sourceNode.path) {
        throw new NotFoundException(
          I18nContext.current()?.t(
            'error.file_extra.source_drawing_not_exist',
            { args: { id: srcDwgNodeId } }
          ) ?? `源图纸节点不存在: ${srcDwgNodeId}`
        );
      }

      if (context?.userId && context?.fileSize) {
        await this.nodeMutationGuard.assertByteQuota(
          { node: { id: context.nodeId }, incrementBytes: context.fileSize },
          context.userId
        );
      }

      const sourceNodePath = this.storageManager.getFullPath(sourceNode.path);
      const sourceNodeDir = path.dirname(sourceNodePath);
      // 优先使用 preloading.json 的 src_file_md5；新建图纸尚无 preloading.json 时，
      // 降级使用源节点 fileHash，与 addImageToPreloadingData 自动创建时写入的 src_file_md5 保持一致，
      // 避免图片落入 nodeId 目录而 preloading 记录指向 fileHash 目录，导致校验/外部参照列表找不到图片
      const preloading = await this.extRefPreloadingService.readPreloadingData(srcDwgNodeId);
      const externalRefDirName = preloading?.srcFileMd5 || sourceNode.fileHash || srcDwgNodeId;
      const externalRefDir = path.join(sourceNodeDir, externalRefDirName);

      if (!(await this.fileSystemService.exists(externalRefDir))) {
        await fsPromises.mkdir(externalRefDir, { recursive: true });
      }

      const targetImageFile = path.join(externalRefDir, extRefFileName);
      await fsPromises.copyFile(srcFilePath, targetImageFile);
      this.logger.log(
        `[handleExternalReferenceImage] 图片文件拷贝成功: ${targetImageFile}`
      );
    } catch (error) {
      this.logger.error(
        `[handleExternalReferenceImage] 处理失败: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }
}

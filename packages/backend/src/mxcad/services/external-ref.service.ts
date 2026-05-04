///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FileSystemService as MxFileSystemService } from './file-system.service';
import { FileSystemNodeService, FileSystemNodeContext } from '../node/filesystem-node.service';
import { StorageManager } from '../../common/services/storage-manager.service';
import * as path from 'path';
import * as fsPromises from 'fs/promises';

@Injectable()
export class ExternalRefService {
  private readonly logger = new Logger(ExternalRefService.name);

  constructor(
    private readonly fileSystemService: MxFileSystemService,
    private readonly fileSystemNodeService: FileSystemNodeService,
    private readonly storageManager: StorageManager
  ) {}

  async getExternalRefDirName(srcDwgNodeId: string): Promise<string> {
    try {
      const sourceNode = await this.fileSystemNodeService.findById(srcDwgNodeId);
      if (!sourceNode || !sourceNode.path) {
        throw new NotFoundException(`源图纸节点不存在: ${srcDwgNodeId}`);
      }

      const sourceNodePath = this.storageManager.getFullPath(sourceNode.path);
      const sourceNodeDir = path.dirname(sourceNodePath);
      const preloadingFileName = `${srcDwgNodeId}.dwg.mxweb_preloading.json`;
      const preloadingFilePath = path.join(sourceNodeDir, preloadingFileName);

      if (!(await this.fileSystemService.exists(preloadingFilePath))) {
        return srcDwgNodeId;
      }

      const content = await fsPromises.readFile(preloadingFilePath, 'utf-8');
      const data = JSON.parse(content);
      const srcFileMd5 = data.src_file_md5;

      if (!srcFileMd5) {
        return srcDwgNodeId;
      }

      return srcFileMd5;
    } catch (error) {
      this.logger.error(`[getExternalRefDirName] 读取失败: ${error.message}`, error.stack);
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

      const sourceNode = await this.fileSystemNodeService.findById(srcDwgNodeId);
      if (!sourceNode || !sourceNode.path) {
        throw new NotFoundException(`源图纸节点不存在: ${srcDwgNodeId}`);
      }

      const sourceNodePath = this.storageManager.getFullPath(sourceNode.path);
      const sourceNodeDir = path.dirname(sourceNodePath);
      const externalRefDirName = await this.getExternalRefDirName(srcDwgNodeId);
      const externalRefDir = path.join(sourceNodeDir, externalRefDirName);

      if (!(await this.fileSystemService.exists(externalRefDir))) {
        await fsPromises.mkdir(externalRefDir, { recursive: true } as any);
      }

      const targetFile = path.join(externalRefDir, `${extRefFileName}.mxweb`);

      if (!(await this.fileSystemService.exists(srcFilePath))) {
        throw new NotFoundException(`转换后的文件不存在: ${srcFilePath}`);
      }

      await fsPromises.copyFile(srcFilePath, targetFile);
      this.logger.log(`[handleExternalReferenceFile] mxweb 文件拷贝成功: ${targetFile}`);
    } catch (error) {
      this.logger.error(`[handleExternalReferenceFile] 处理失败: ${error.message}`, error.stack);
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

      const sourceNode = await this.fileSystemNodeService.findById(srcDwgNodeId);
      if (!sourceNode || !sourceNode.path) {
        throw new NotFoundException(`源图纸节点不存在: ${srcDwgNodeId}`);
      }

      const sourceNodePath = this.storageManager.getFullPath(sourceNode.path);
      const sourceNodeDir = path.dirname(sourceNodePath);
      const externalRefDirName = await this.getExternalRefDirName(srcDwgNodeId);
      const externalRefDir = path.join(sourceNodeDir, externalRefDirName);

      if (!(await this.fileSystemService.exists(externalRefDir))) {
        await fsPromises.mkdir(externalRefDir, { recursive: true } as any);
      }

      const targetImageFile = path.join(externalRefDir, extRefFileName);
      await fsPromises.copyFile(srcFilePath, targetImageFile);
      this.logger.log(`[handleExternalReferenceImage] 图片文件拷贝成功: ${targetImageFile}`);
    } catch (error) {
      this.logger.error(`[handleExternalReferenceImage] 处理失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}
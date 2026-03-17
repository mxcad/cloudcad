///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';
import { DirectoryAllocator } from './directory-allocator.service';
import { LocalStorageProvider } from '../../storage/local-storage.provider';
import * as path from 'path';

export interface NodeStorageInfo {
  nodeId: string;
  directory: string; // YYYYMM[/N]
  fullPath: string; // 完整路径
  relativePath: string; // 相对路径：YYYYMM[/N]/nodeId/...
}

@Injectable()
export class StorageManager {
  private readonly logger = new Logger(StorageManager.name);

  constructor(
    private readonly directoryAllocator: DirectoryAllocator,
    private readonly localStorageProvider: LocalStorageProvider
  ) {}

  /**
   * 为新节点分配存储空间
   * @param nodeId 节点 ID
   * @param fileName 文件名（可选）
   * @returns 存储信息
   */
  async allocateNodeStorage(
    nodeId: string,
    fileName?: string
  ): Promise<NodeStorageInfo> {
    // 分配目标目录
    const allocation = await this.directoryAllocator.allocateDirectory();

    // 创建节点目录（使用正斜杠确保跨平台兼容）
    const nodeRelativePath = `${allocation.targetDirectory}/${nodeId}`;
    await this.localStorageProvider.createDirectory(nodeRelativePath);

    // 构建相对路径
    let relativePath = nodeRelativePath;
    if (fileName) {
      relativePath = `${nodeRelativePath}/${fileName}`;
    }

    const storageInfo: NodeStorageInfo = {
      nodeId,
      directory: allocation.targetDirectory,
      fullPath: this.localStorageProvider['getAbsolutePath'](relativePath),
      relativePath,
    };

    this.logger.log(
      `为节点 ${nodeId} 分配存储成功: ${storageInfo.relativePath}`
    );
    return storageInfo;
  }

  /**
   * 获取节点存储信息
   * @param nodeId 节点 ID
   * @param directory 目录（YYYYMM[/N]）
   * @param fileName 文件名（可选）
   * @returns 存储信息
   */
  getNodeStorageInfo(
    nodeId: string,
    directory: string,
    fileName?: string
  ): NodeStorageInfo {
    let relativePath = `${directory}/${nodeId}`;
    if (fileName) {
      relativePath = `${relativePath}/${fileName}`;
    }

    return {
      nodeId,
      directory,
      fullPath: this.localStorageProvider['getAbsolutePath'](relativePath),
      relativePath,
    };
  }

  /**
   * 删除节点存储
   * @param nodeId 节点 ID
   * @param directory 目录（YYYYMM[/N]）
   */
  async deleteNodeStorage(nodeId: string, directory: string): Promise<void> {
    const nodeRelativePath = `${directory}/${nodeId}`;
    await this.localStorageProvider.deleteDirectory(nodeRelativePath);
    this.logger.log(`删除节点存储成功: ${nodeId} (${directory})`);
  }

  /**
   * 检查节点存储是否存在
   * @param nodeId 节点 ID
   * @param directory 目录（YYYYMM[/N]）
   * @returns 是否存在
   */
  async nodeStorageExists(nodeId: string, directory: string): Promise<boolean> {
    const nodeRelativePath = path.join(directory, nodeId);
    return await this.localStorageProvider.directoryExists(nodeRelativePath);
  }

  /**
   * 获取存储统计信息
   * @returns 统计信息
   */
  async getStorageStats(): Promise<{
    totalDirectories: number;
    totalNodes: number;
    directories: Array<{
      name: string;
      nodeCount: number;
      isFull: boolean;
    }>;
  }> {
    const directories = await this.directoryAllocator.listDirectories();
    const totalNodes = directories.reduce((sum, dir) => sum + dir.nodeCount, 0);

    return {
      totalDirectories: directories.length,
      totalNodes,
      directories,
    };
  }

  /**
   * 清理空目录
   * @returns 清理的目录数量
   */
  async cleanupEmptyDirectories(): Promise<number> {
    try {
      const directories = await this.directoryAllocator.listDirectories();
      let cleanedCount = 0;

      for (const dir of directories) {
        if (dir.nodeCount === 0) {
          await this.localStorageProvider.deleteDirectory(dir.name);
          cleanedCount++;
          this.logger.log(`清理空目录: ${dir.name}`);
        }
      }

      return cleanedCount;
    } catch (error) {
      this.logger.error(`清理空目录失败`, error.stack);
      return 0;
    }
  }

  /**
   * 获取节点完整路径
   * @param relativePath 相对路径（可能是 /mxcad/file/YYYYMM[/N]/nodeId/... 或 YYYYMM[/N]/nodeId/...）
   * @returns 完整路径
   */
  getFullPath(relativePath: string): string {
    // 去掉 /mxcad/file/ 前缀，获取实际的存储路径
    const storagePath = relativePath.replace(/^\/mxcad\/file\//, '');
    return this.localStorageProvider['getAbsolutePath'](storagePath);
  }
}

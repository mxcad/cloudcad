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
import { DirectoryAllocator } from './directory-allocator.service';
import { LocalStorageProvider } from '../../storage/local-storage.provider';
import * as fsPromises from 'fs/promises';

export interface NodeStorageInfo {
  nodeId: string;
  directory: string; // YYYYMM[/N]

  /** 节点目录的完整路径 (YYYYMM/nodeId) */
  nodeDirectoryPath: string;

  /** 节点目录的相对路径 (YYYYMM/nodeId) */
  nodeDirectoryRelativePath: string;

  /** 文件的完整路径 (如果传了 fileName: YYYYMM/nodeId/fileName) */
  filePath?: string;

  /** 文件的相对路径 (如果传了 fileName: YYYYMM/nodeId/fileName) */
  fileRelativePath?: string;
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

    // 构建路径
    const nodeDirectoryPath =
      this.localStorageProvider.getAbsolutePath(nodeRelativePath);

    const storageInfo: NodeStorageInfo = {
      nodeId,
      directory: allocation.targetDirectory,
      nodeDirectoryPath,
      nodeDirectoryRelativePath: nodeRelativePath,
    };

    // 如果提供了文件名，构建文件路径
    if (fileName) {
      const fileRelativePath = `${nodeRelativePath}/${fileName}`;
      storageInfo.filePath =
        this.localStorageProvider.getAbsolutePath(fileRelativePath);
      storageInfo.fileRelativePath = fileRelativePath;
    }

    this.logger.log(
      `[allocateNodeStorage] nodeId=${nodeId}, directory=${allocation.targetDirectory}, fileName=${fileName || 'none'}`
    );

    this.logger.log(
      `为节点 ${nodeId} 分配存储成功: ${storageInfo.nodeDirectoryRelativePath}`
    );
    return storageInfo;
  }

  /**
   * 删除节点存储
   * @param nodePath 数据库存储路径（YYYYMM[/N]/nodeId/...，可带 /mxcad/file/ 前缀）
   */
  async deleteNodeStorage(nodePath: string): Promise<void> {
    const nodeDirectory = this.parseNodeDirectory(nodePath);
    if (!nodeDirectory) {
      this.logger.warn(`删除节点存储跳过，路径无法解析为节点目录: ${nodePath}`);
      return;
    }
    await this.localStorageProvider.deleteDirectory(nodeDirectory);
    this.logger.log(`删除节点存储成功: ${nodeDirectory}`);
  }

  /**
   * 检查节点存储是否存在
   * @param nodePath 数据库存储路径（YYYYMM[/N]/nodeId/...，可带 /mxcad/file/ 前缀）
   * @returns 是否存在（路径无法解析时返回 false）
   */
  async nodeStorageExists(nodePath: string): Promise<boolean> {
    const nodeDirectory = this.parseNodeDirectory(nodePath);
    if (!nodeDirectory) {
      this.logger.warn(
        `检查节点存储跳过，路径无法解析为节点目录: ${nodePath}`
      );
      return false;
    }
    return await this.localStorageProvider.directoryExists(nodeDirectory);
  }

  /**
   * 判断请求路径是否落在主文件的同一节点目录下（分享 IDOR 安全比较）。
   * 必须带尾部 / 比较：裸 startsWith 会让同月前缀兄弟目录（YYYYMM/<nodeId>-evil/…）
   * 被误判为同节点。两侧均按原始字符串比较，不做前缀剥离（保持既有 403 行为）。
   * @param requestedPath 请求的存储路径（攻击者可控）
   * @param mainFilePath 主文件的数据库存储路径
   */
  isSameNodeStoragePath(requestedPath: string, mainFilePath: string): boolean {
    const mainParts = mainFilePath.split('/').filter(Boolean);
    if (mainParts.length < 2) {
      return false;
    }
    return requestedPath.startsWith(`${mainParts[0]}/${mainParts[1]}/`);
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
   * 递归复制目录
   */
  private async recursiveCopyDirectory(
    sourceDir: string,
    targetDir: string
  ): Promise<void> {
    // 列出源目录中的所有条目
    const entries = await this.localStorageProvider.listFiles(sourceDir);

    for (const entry of entries) {
      const sourcePath = entry;
      const destPath = entry.replace(sourceDir, targetDir);

      // 检查是否是目录
      const absoluteSourcePath =
        this.localStorageProvider.getAbsolutePath(sourcePath);
      const stats = await fsPromises.stat(absoluteSourcePath);

      if (stats.isDirectory()) {
        // 创建目标目录
        await this.localStorageProvider.createDirectory(destPath);
        // 递归复制子目录
        await this.recursiveCopyDirectory(sourcePath, destPath);
      } else {
        // 复制文件
        await this.localStorageProvider.copyFile(sourcePath, destPath);
      }
    }
  }

  /**
   * 复制整个节点目录（包括所有相关文件）
   * @param sourceDirRelativePath 源目录相对路径
   * @param targetNodeId 目标节点ID
   * @param fileName 文件名
   * @returns 目标文件的相对路径
   */
  async copyNodeDirectory(
    sourceDirRelativePath: string,
    targetNodeId: string,
    fileName: string
  ): Promise<string> {
    // 为目标节点分配存储空间
    const storageInfo = await this.allocateNodeStorage(targetNodeId, fileName);

    // 递归复制整个目录结构（包括所有相关文件，如外部参照、缩略图等）
    await this.recursiveCopyDirectory(
      sourceDirRelativePath,
      storageInfo.nodeDirectoryRelativePath
    );

    return storageInfo.fileRelativePath;
  }

  /**
   * 获取节点完整路径
   * @param relativePath 相对路径（可能是 /mxcad/file/YYYYMM[/N]/nodeId/... 或 YYYYMM[/N]/nodeId/...）
   * @returns 完整路径
   */
  getFullPath(relativePath: string): string {
    // 去掉 /mxcad/file/ 前缀，获取实际的存储路径。
    // 不再把 .. / ~ 静默改写为 _：与 standalone 侧 FileHandler._resolvePath 对齐，
    // 交由 getAbsolutePath 内的 validatePath 统一拒绝 .. / ~（fail-closed）。
    // 合法存储路径（YYYYMM/nodeId/src_file_md5/fileName）本就不含 .. / ~，且写入时
    // validatePath 已拒绝 .. / ~，故 DB 中不存在含 .. / ~ 的路径，此改动零行为变化。
    const storagePath = relativePath.replace(/^\/mxcad\/file\//, '');
    return this.localStorageProvider.getAbsolutePath(storagePath);
  }

  /**
   * 从数据库存储路径解码节点目录（约定单点：YYYYMM[/N]/nodeId）。
   * @param dbPath 数据库存储路径（可带 /mxcad/file/ 前缀）
   * @returns 节点目录相对路径 (YYYYMM/nodeId)；段数不足 2 时返回 null
   */
  parseNodeDirectory(dbPath: string): string | null {
    const cleanPath = dbPath.replace(/^\/mxcad\/file\//, '');
    const pathParts = cleanPath.split('/').filter(Boolean);
    if (pathParts.length < 2) {
      return null;
    }
    return `${pathParts[0]}/${pathParts[1]}`;
  }

  /**
   * 从数据库存储路径中提取节点目录相对路径
   * @param dbRelativePath 数据库中的相对路径
   * @returns 节点目录的相对路径 (YYYYMM/nodeId)；无法解码时回落去前缀原路径
   */
  getNodeDirectoryRelativePath(dbRelativePath: string): string {
    return (
      this.parseNodeDirectory(dbRelativePath) ??
      dbRelativePath.replace(/^\/mxcad\/file\//, '')
    );
  }
}

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

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { Request } from 'express';

/**
 * 文件系统节点上下文
 * 用于传递用户、节点等信息
 */
export interface FileSystemNodeContext {
  /** 用户 ID */
  userId: string;
  /** 用户名 */
  username?: string;
  /** 用户角色 */
  role?: string;
  /** 用户角色（兼容 MxCadContext） */
  userRole: string;
  /** 节点 ID */
  nodeId: string;
  /** 文件大小（可选，用于秒传） */
  fileSize?: number;
  /** 冲突策略（可选，用于批量导入） */
  conflictStrategy?: 'skip' | 'overwrite' | 'rename';
  /** 源 DWG 节点 ID（转换流程使用） */
  srcDwgNodeId?: string;
  /** 是否为图片文件 */
  isImage?: boolean;
  /** 是否为图库文件 */
  isLibrary?: boolean;
}

/**
 * 文件系统节点服务
 *
 * 职责：
 * 1. 提供文件系统节点的查询功能
 * 2. 为 MxCAD 应用推断上下文信息
 * 3. 提供节点路径解析功能
 */
@Injectable()
export class FileSystemNodeService {
  private readonly logger = new Logger(FileSystemNodeService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * 为 MxCAD 应用推断上下文信息
   * @param fileHash 文件哈希值
   * @param request HTTP 请求对象
   * @returns 文件系统节点上下文或 null
   */
  async inferContextForMxCadApp(
    fileHash: string,
    request: Request
  ): Promise<FileSystemNodeContext | null> {
    try {
      // 从请求中获取用户信息
      const user = (request as any).user;
      if (!user) {
        this.logger.warn('无法从请求中获取用户信息');
        return null;
      }

      // 根据文件哈希查找节点
      const node = await this.databaseService.fileSystemNode.findFirst({
        where: {
          fileHash,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

      if (!node) {
        this.logger.warn(`未找到哈希为 ${fileHash} 的文件节点`);
        return null;
      }

      // 构建上下文
      const context: FileSystemNodeContext = {
        userId: user.userId || user.id,
        username: user.username || user.name,
        role: user.role,
        userRole: user.userRole || user.role || 'USER',
        nodeId: node.id,
      };

      this.logger.log(
        `成功推断上下文: userId=${context.userId}, nodeId=${context.nodeId}`
      );
      return context;
    } catch (error) {
      this.logger.error(
        `推断上下文失败: ${error.message}`,
        error.stack
      );
      return null;
    }
  }

  /**
   * 根据存储路径查找文件节点
   * @param storagePath 本地存储路径
   * @returns 文件节点或 null
   */
  async findByPath(storagePath: string): Promise<any | null> {
    try {
      const node = await this.databaseService.fileSystemNode.findFirst({
        where: {
          path: storagePath,
          deletedAt: null,
        },
      });
      return node;
    } catch (error) {
      this.logger.error(
        `根据路径查找节点失败: ${error.message}`,
        error.stack
      );
      return null;
    }
  }

  /**
   * 根据节点 ID 查找文件节点
   * @param nodeId 文件系统节点 ID
   * @returns 文件节点或 null
   */
  async findById(nodeId: string): Promise<any | null> {
    try {
      const node = await this.databaseService.fileSystemNode.findUnique({
        where: {
          id: nodeId,
          deletedAt: null,
        },
      });
      return node;
    } catch (error) {
      this.logger.error(
        `根据 ID 查找节点失败: ${error.message}`,
        error.stack
      );
      return null;
    }
  }

  /**
   * 根据节点 ID 获取节点信息（含项目信息）
   * @param nodeId 节点 ID
   * @returns 节点信息或抛出 NotFoundException
   */
  async getNodeById(nodeId: string): Promise<any> {
    const node = await this.databaseService.fileSystemNode.findUnique({
      where: {
        id: nodeId,
        deletedAt: null,
      },
      include: {
        project: true,
      },
    });

    if (!node) {
      throw new NotFoundException(`节点不存在: ${nodeId}`);
    }

    return node;
  }

  /**
   * 根据文件哈希查找节点
   */
  async findByFileHash(hash: string): Promise<any | null> {
    try {
      return await this.databaseService.fileSystemNode.findFirst({
        where: { fileHash: hash, deletedAt: null },
      });
    } catch (error) {
      this.logger.error(`根据哈希查找节点失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 更新外部参照信息
   */
  async updateExternalReferenceInfo(
    nodeId: string,
    hasMissing: boolean,
    missingCount: number,
    references: any[],
  ): Promise<void> {
    try {
      await this.databaseService.fileSystemNode.update({
        where: { id: nodeId },
        data: { hasMissingExternalReferences: hasMissing },
      });
    } catch (error) {
      this.logger.error(`更新外部参照信息失败: ${error.message}`);
    }
  }

  /**
   * 根据文件扩展名获取 MIME 类型
   */
  getMimeType(extension: string): string {
    const mimeMap: Record<string, string> = {
      '.dwg': 'application/acad',
      '.dxf': 'application/dxf',
      '.mxweb': 'application/octet-stream',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip',
      '.rar': 'application/vnd.rar',
    };
    return mimeMap[extension.toLowerCase()] || 'application/octet-stream';
  }
}

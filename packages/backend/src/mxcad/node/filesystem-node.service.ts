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
import { DatabaseService } from '../../database/database.service';
import { NodeType, Prisma } from '@cloudcad/db';
import { TreeWalker } from '../../file-system/file-tree/tree-walker.service';

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
  /** 客户端 IP（游客转换频率限制按 IP 计数，ADR-0043） */
  ip?: string;
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

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly treeWalker: TreeWalker
  ) {}

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
  // ===== 数据库查询封装方法（从 MxCadService 迁移） =====

  /**
   * 根据 ID 查找文件系统节点（包含 deletedAt = null 过滤）
   */
  async findByIdWithDeletedAt(id: string, select?: Prisma.FileSystemNodeSelect) {
    return this.databaseService.fileSystemNode.findFirst({
      where: { id, deletedAt: null },
      ...(select ? { select } : {}),
    });
  }

  /**
   * 查找非文件夹文件节点（未删除）
   */
  async findFileByIdNotDeleted(id: string, select?: Prisma.FileSystemNodeSelect) {
    return this.databaseService.fileSystemNode.findFirst({
      where: { id, nodeType: NodeType.FILE, deletedAt: null },
      ...(select ? { select } : {}),
    });
  }

  /**
   * 根据 ID 查找用户
   */
  async findUserById(id: string, select?: Prisma.UserSelect) {
    return this.databaseService.user.findUnique({
      where: { id },
      ...(select ? { select } : {}),
    });
  }

  /**
   * 通过文件哈希值查找 FileSystemNode（支持项目范围过滤）
   */
  async findFileByHashInProject(
    fileHash: string,
    projectId?: string,
  ) {
    try {
      const where: Prisma.FileSystemNodeWhereInput = {
        fileHash,
        nodeType: NodeType.FILE,
        deletedAt: null,
      };

      if (projectId) {
        const allNodeIds = await this.treeWalker.getSubtreeIds(projectId, {
          includeRoot: true,
          includeDeleted: false,
        });
        where.id = { in: allNodeIds };
      }

      return this.databaseService.fileSystemNode.findFirst({
        where,
        select: {
          id: true,
          name: true,
          ownerId: true,
          parentId: true,
          fileHash: true,
        },
      });
    } catch (error) {
      this.logger.error(`查找文件节点失败: ${error.message}`, error);
      return null;
    }
  }

  /**
   * 根据 ID 查找节点（不过滤 deletedAt，用于兼容旧数据）
   */
  async findUniqueById(id: string, select?: Prisma.FileSystemNodeSelect) {
    return this.databaseService.fileSystemNode.findUnique({
      where: { id },
      ...(select ? { select } : {}),
    });
  }

  /**
   * 根据节点 ID 查找项目根目录
   */
  async getProjectRootByNodeId(
    nodeId: string,
  ) {
    try {
      const currentNode = await this.databaseService.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: { id: true, nodeType: true, parentId: true },
      });

      if (!currentNode) {
        return null;
      }

      if (currentNode.nodeType === NodeType.PROJECT) {
        return currentNode;
      }

      if (currentNode.parentId) {
        return this.getProjectRootByNodeId(currentNode.parentId);
      }

      return null;
    } catch (error) {
      this.logger.error(`查找项目根目录失败: ${error.message}`, error);
      return null;
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

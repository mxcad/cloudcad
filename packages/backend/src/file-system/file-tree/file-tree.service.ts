///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  FileStatus,
  FileSystemNode as PrismaFileSystemNode,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { StorageManager } from '../../common/services/storage-manager.service';
import { StorageService } from '../../storage/storage.service';
import { QueryChildrenDto } from '../dto/query-children.dto';
import { StorageInfoService } from '../storage-quota/storage-info.service';
import * as path from 'path';
import * as fsPromises from 'fs/promises';

@Injectable()
export class FileTreeService {
  private readonly logger = new Logger(FileTreeService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly storageManager: StorageManager,
    private readonly storageService: StorageService,
    private readonly storageInfoService: StorageInfoService
  ) {}

  async createFileNode(options: {
    name: string;
    fileHash: string;
    size: number;
    mimeType: string;
    extension: string;
    parentId: string;
    ownerId: string;
    sourceFilePath?: string;
    sourceDirectoryPath?: string;
    skipFileCopy?: boolean;
  }): Promise<PrismaFileSystemNode> {
    const {
      name,
      fileHash,
      size,
      mimeType,
      extension,
      parentId,
      ownerId,
      sourceFilePath,
      sourceDirectoryPath,
      skipFileCopy = false,
    } = options;

    this.logger.log(
      `[createFileNode] 开始创建文件节点: name=${name}, fileHash=${fileHash}, parentId=${parentId}, ownerId=${ownerId}, skipFileCopy=${skipFileCopy}`
    );

    const parent = await this.prisma.fileSystemNode.findUnique({
      where: { id: parentId, deletedAt: null },
      select: { id: true, isFolder: true, isRoot: true, projectId: true },
    });

    if (!parent) {
      throw new NotFoundException(`父节点不存在: ${parentId}`);
    }

    if (!parent.isFolder) {
      throw new BadRequestException('父节点必须是文件夹');
    }

    const createdNode = await this.prisma.$transaction(async (tx) => {
      // 检查是否已存在同名文件
      const existingNodes = await tx.fileSystemNode.findMany({
        where: {
          parentId,
          name: {
            equals: name,
            mode: 'insensitive',
          },
          deletedAt: null,
        },
        select: { name: true },
      });

      // 生成唯一文件名
      const existingNames = existingNodes.map((n) => n.name);
      let uniqueName = name;
      if (existingNames.includes(name)) {
        const lastDotIndex = name.lastIndexOf('.');
        if (lastDotIndex === -1) {
          let counter = 1;
          do {
            uniqueName = `${name} (${counter})`;
            counter++;
          } while (existingNames.includes(uniqueName));
        } else {
          const nameWithoutExt = name.substring(0, lastDotIndex);
          const fileExtension = name.substring(lastDotIndex);
          let counter = 1;
          do {
            uniqueName = `${nameWithoutExt} (${counter})${fileExtension}`;
            counter++;
          } while (existingNames.includes(uniqueName));
        }
      }

      // 获取正确的projectId
      const projectId = await this.getProjectId(parentId);

      const fileNode = await tx.fileSystemNode.create({
        data: {
          name: uniqueName,
          isFolder: false,
          isRoot: false,
          parentId,
          originalName: name,
          path: null,
          size,
          mimeType,
          extension,
          fileStatus: FileStatus.COMPLETED,
          fileHash,
          ownerId,
          projectId,
        },
      });

      this.logger.log(`[createFileNode] 数据库节点创建成功: ID=${fileNode.id}`);

      let storageInfo: any = null;

      if (!skipFileCopy) {
        storageInfo = await this.storageManager.allocateNodeStorage(
          fileNode.id,
          name
        );

        this.logger.log(
          `[createFileNode] 物理目录创建成功: ${storageInfo.nodeDirectoryRelativePath}`
        );
      } else {
        this.logger.log(`[createFileNode] skipFileCopy=true，跳过物理目录创建`);
      }

      if (!skipFileCopy) {
        if (sourceFilePath) {
          await this.storageService.copyFromFs(sourceFilePath, storageInfo.fileRelativePath);
          this.logger.log(
            `[createFileNode] 文件拷贝成功: ${sourceFilePath} -> ${storageInfo.fileRelativePath}`
          );
        } else if (sourceDirectoryPath) {
          const files = await fsPromises.readdir(sourceDirectoryPath);
          const matchingFiles = files.filter((file) =>
            file.startsWith(fileHash)
          );

          if (matchingFiles.length === 0) {
            this.logger.warn(`[createFileNode] 未找到匹配 ${fileHash} 的文件`);
          } else {
            for (const file of matchingFiles) {
              const sourcePath = path.join(sourceDirectoryPath, file);
              const targetFileName = file.replace(fileHash, fileNode.id);
              const targetRelativePath = `${storageInfo.nodeDirectoryRelativePath}/${targetFileName}`;
              await this.storageService.copyFromFs(sourcePath, targetRelativePath);
              this.logger.log(
                `[createFileNode] 文件拷贝成功: ${file} -> ${targetFileName}`
              );
            }
            this.logger.log(
              `[createFileNode] 目录文件拷贝成功: ${matchingFiles.length} 个文件`
            );
          }
        } else {
          this.logger.warn(`[createFileNode] 未提供源文件路径，跳过文件拷贝`);
        }

        await tx.fileSystemNode.update({
          where: { id: fileNode.id },
          data: { path: storageInfo.fileRelativePath },
        });

        this.logger.log(
          `[createFileNode] 节点 path 已更新: ${storageInfo.fileRelativePath}`
        );
      } else {
        this.logger.log(
          `[createFileNode] skipFileCopy=true，保持 path 为 null，等待后续更新`
        );
      }

      return (await tx.fileSystemNode.findUnique({
        where: { id: fileNode.id },
      })) as PrismaFileSystemNode;
    });

    // 在事务外清除配额缓存
    const projectId = await this.getProjectId(parentId);
    await this.storageInfoService.invalidateQuotaCache(
      ownerId,
      projectId || undefined
    );
    this.logger.debug(
      `[createFileNode] 配额缓存已清除: userId=${ownerId}, projectId=${projectId}`
    );

    return createdNode;
  }

  async getNode(nodeId: string) {
    try {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId, deletedAt: null },
      });

      if (!node) {
        throw new NotFoundException('节点不存在');
      }

      return node;
    } catch (error) {
      this.logger.error(`获取节点失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 获取节点详情（不包含子节点，用于判断库类型）
   */
  async getNodeWithLibraryKey(nodeId: string) {
    try {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId, deletedAt: null },
        select: { id: true, libraryKey: true, personalSpaceKey: true },
      });

      if (!node) {
        throw new NotFoundException('节点不存在');
      }

      return node;
    } catch (error) {
      this.logger.error(`获取节点失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async isLibraryNode(nodeId: string): Promise<boolean> {
    const libraryKey = await this.getLibraryKey(nodeId);
    return libraryKey !== null;
  }

  async getNodeTree(nodeId: string) {
    try {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        include: {
          owner: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
          children: {
            include: {
              owner: {
                select: {
                  id: true,
                  username: true,
                  nickname: true,
                },
              },
              _count: {
                select: {
                  children: {
                    where: { deletedAt: null },
                  },
                },
              },
            },
            orderBy: [{ isFolder: 'desc' }, { name: 'asc' }],
          },
        },
      });

      if (!node) {
        throw new NotFoundException('节点不存在');
      }

      // 确保返回的节点信息包含正确的projectId
      let projectId = node.projectId;
      if (!projectId && !node.isRoot) {
        // 如果projectId为null且不是根节点，尝试获取正确的projectId
        projectId = await this.getProjectId(nodeId);
      } else if (node.isRoot) {
        // 如果是根节点，projectId就是节点本身的ID
        projectId = node.id;
      }

      // 返回包含正确projectId的节点信息
      return {
        ...node,
        projectId,
      };
    } catch (error) {
      this.logger.error(`查询节点失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getChildren(nodeId: string, userId?: string, query?: QueryChildrenDto) {
    const {
      search,
      nodeType,
      extension,
      fileStatus,
      page = 1,
      limit = 50,
      sortBy,
      sortOrder,
      includeDeleted = false,
    } = query || {};
    const safePage = Number(page) || 1;
    const safeLimit = Number(limit) || 50;
    const skip = (safePage - 1) * safeLimit;

    const where: any = {
      parentId: nodeId,
      deletedAt: includeDeleted ? undefined : null,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (nodeType) {
      where.isFolder = nodeType === 'folder';
    }

    if (extension) {
      where.extension = extension;
    }

    if (fileStatus) {
      where.fileStatus = fileStatus;
    }

    try {
      const parentNode = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: { id: true, deletedAt: true },
      });

      if (!parentNode || parentNode.deletedAt) {
        return {
          nodes: [],
          total: 0,
          page,
          limit,
          totalPages: 0,
        };
      }

      const [nodes, total] = await Promise.all([
        this.prisma.fileSystemNode.findMany({
          where,
          skip,
          take: safeLimit,
          orderBy: sortBy
            ? { [sortBy]: sortOrder }
            : [{ isFolder: 'desc' }, { name: 'asc' }],
          include: {
            owner: {
              select: {
                id: true,
                username: true,
                nickname: true,
              },
            },
            _count: {
              select: {
                children: {
                  where: { deletedAt: null },
                },
              },
            },
          },
        }),
        this.prisma.fileSystemNode.count({ where }),
      ]);

      return {
        nodes,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / safeLimit),
      };

      return {
        nodes,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / safeLimit),
      };
    } catch (error) {
      this.logger.error(`查询子节点失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateNodePath(nodeId: string, path: string) {
    try {
      const node = await this.prisma.fileSystemNode.update({
        where: { id: nodeId },
        data: { path },
      });

      this.logger.log(`节点路径更新成功: ${nodeId} -> ${path}`);
      return node;
    } catch (error) {
      this.logger.error(`节点路径更新失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getRootNode(nodeId: string) {
    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId },
      select: { isRoot: true },
    });

    if (!node) {
      throw new NotFoundException('节点不存在');
    }

    if (node.isRoot) {
      return { id: nodeId };
    }

    // 使用统一的getProjectId方法获取项目ID
    const projectId = await this.getProjectId(nodeId);
    if (!projectId) {
      throw new NotFoundException('未找到根节点');
    }

    return { id: projectId };
  }

  async getProjectId(nodeId: string): Promise<string | null> {
    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId },
      select: { projectId: true, isRoot: true, parentId: true },
    });

    if (!node) {
      return null;
    }

    if (node.isRoot) {
      return nodeId;
    }

    if (node.projectId) {
      return node.projectId;
    }

    if (node.parentId) {
      return this.getProjectId(node.parentId);
    }

    return null;
  }

  async getLibraryKey(nodeId: string): Promise<'drawing' | 'block' | null> {
    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId },
      select: { projectId: true, isRoot: true, libraryKey: true },
    });

    if (!node) {
      return null;
    }

    if (node.isRoot) {
      return node.libraryKey as 'drawing' | 'block' | null;
    }

    const projectId = node.projectId;
    if (!projectId) {
      return null;
    }

    const rootNode = await this.prisma.fileSystemNode.findUnique({
      where: { id: projectId },
      select: { libraryKey: true },
    });

    return rootNode?.libraryKey as 'drawing' | 'block' | null;
  }

  async getTrashItems(userId: string) {
    try {
      const projects = await this.prisma.fileSystemNode.findMany({
        where: {
          isRoot: true,
          deletedAt: { not: null },
          libraryKey: null,
          OR: [
            { ownerId: userId },
            {
              projectMembers: {
                some: { userId },
              },
            },
          ],
        },
        include: {
          owner: {
            select: {
              id: true,
              email: true,
              username: true,
              nickname: true,
            },
          },
          projectMembers: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  username: true,
                  nickname: true,
                },
              },
            },
          },
        },
        orderBy: {
          deletedAt: 'desc',
        },
      });

      const nodes = await this.prisma.fileSystemNode.findMany({
        where: {
          deletedAt: { not: null },
          ownerId: userId,
          isRoot: false,
          deletedByCascade: false,
        },
        include: {
          owner: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
          _count: {
            select: {
              children: {
                where: { deletedAt: null },
              },
            },
          },
        },
        orderBy: {
          deletedAt: 'desc',
        },
      });

      const allItems = [
        ...projects.map((p) => ({ ...p, itemType: 'project' })),
        ...nodes.map((n) => ({ ...n, itemType: 'node' })),
      ];

      return {
        items: allItems,
        total: allItems.length,
      };
    } catch (error) {
      this.logger.error(`获取回收站列表失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 递归获取某个节点下的所有文件（包括子目录中的文件）
   * @param nodeId 节点 ID
   * @param userId 用户 ID
   * @param query 查询参数
   * @returns 文件列表（分页）
   */
  async getAllFilesUnderNode(
    nodeId: string,
    userId?: string,
    query?: QueryChildrenDto
  ) {
    const {
      search,
      extension,
      fileStatus,
      page = 1,
      limit = 50,
      sortBy,
      sortOrder,
      includeDeleted = false,
    } = query || {};
    const safePage = Number(page) || 1;
    const safeLimit = Number(limit) || 50;

    try {
      // 检查节点是否存在
      const parentNode = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: { id: true, deletedAt: true },
      });

      if (!parentNode || parentNode.deletedAt) {
        return {
          nodes: [],
          total: 0,
          page,
          limit,
          totalPages: 0,
        };
      }

      // 递归收集所有文件 ID
      const allFileIds: string[] = [];

      const collectFileIds = async (currentNodeId: string) => {
        // 获取当前节点下的所有子节点
        const children = await this.prisma.fileSystemNode.findMany({
          where: {
            parentId: currentNodeId,
            deletedAt: includeDeleted ? undefined : null,
          },
          select: { id: true, isFolder: true },
        });

        for (const child of children) {
          if (child.isFolder) {
            // 递归处理文件夹
            await collectFileIds(child.id);
          } else {
            // 收集文件 ID
            allFileIds.push(child.id);
          }
        }
      };

      // 从指定节点开始递归
      await collectFileIds(nodeId);

      // 如果没有文件，直接返回
      if (allFileIds.length === 0) {
        return {
          nodes: [],
          total: 0,
          page,
          limit,
          totalPages: 0,
        };
      }

      // 构建查询条件
      const skip = (safePage - 1) * safeLimit;
      const where: any = {
        id: { in: allFileIds },
        deletedAt: includeDeleted ? undefined : null,
        isFolder: false, // 只返回文件
      };

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }

      if (extension) {
        where.extension = extension;
      }

      if (fileStatus) {
        where.fileStatus = fileStatus;
      }

      // 查询文件列表和总数
      const [nodes, total] = await Promise.all([
        this.prisma.fileSystemNode.findMany({
          where,
          skip,
          take: safeLimit,
          orderBy: sortBy ? { [sortBy]: sortOrder } : [{ createdAt: 'desc' }],
          include: {
            owner: {
              select: {
                id: true,
                username: true,
                nickname: true,
              },
            },
          },
        }),
        this.prisma.fileSystemNode.count({ where }),
      ]);

      return {
        nodes,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / safeLimit),
      };
    } catch (error) {
      this.logger.error(`递归获取文件失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}

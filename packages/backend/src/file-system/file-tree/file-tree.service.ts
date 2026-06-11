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
  Prisma,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { StorageManager, NodeStorageInfo } from '../../common/services/storage-manager.service';
import { StorageService } from '../../storage/storage.service';
import { QueryChildrenDto } from '../dto/query-children.dto';
import { ProjectPermission } from '../../common/enums/permissions.enum';
import { StorageInfoService } from '../storage-quota/storage-info.service';
import type { FileSystemNodeDto } from '../dto/file-system-response.dto';
import * as path from 'path';
import * as fsPromises from 'fs/promises';
import { createHash } from 'crypto';

@Injectable()
export class FileTreeService {
  private readonly logger = new Logger(FileTreeService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly storageManager: StorageManager,
    private readonly storageService: StorageService,
    private readonly storageInfoService: StorageInfoService,
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
    fileStatus?: FileStatus;
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
      fileStatus = FileStatus.COMPLETED,
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
          fileStatus,
          fileHash,
          ownerId,
          projectId,
        },
      });

      this.logger.log(`[createFileNode] 数据库节点创建成功: ID=${fileNode.id}`);

      let storageInfo: NodeStorageInfo | null = null;

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

  async createDrawingFromTemplate(dto: {
    parentId: string;
    name?: string;
    ownerId: string;
  }): Promise<PrismaFileSystemNode> {
    const { parentId, name, ownerId } = dto;

    const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'assets', 'templates');
    const templatePath = path.join(TEMPLATES_DIR, 'blank.mxweb');

    this.logger.log(
      `[createDrawingFromTemplate] 从模板创建图纸: templatePath=${templatePath}, parentId=${parentId}`
    );

    const templateBuffer = await fsPromises.readFile(templatePath);
    const templateHash = createHash('md5').update(templateBuffer).digest('hex');
    const templateSize = templateBuffer.length;

    const drawingName = name ? `${name}.mxweb` : '新建图纸.mxweb';

    return this.createFileNode({
      name: drawingName,
      fileHash: templateHash,
      size: templateSize,
      mimeType: 'application/octet-stream',
      extension: '.mxweb',
      parentId,
      ownerId,
      sourceFilePath: templatePath,
      fileStatus: FileStatus.COMPLETED,
    });
  }

  /**
   * 更新文件节点状态
   *
   * 调用方应在调用前通过 FileStatusStateMachine.validateTransition() 校验转换合法性。
   * 此方法直接执行数据库更新，不做额外校验。
   *
   * @param nodeId     文件节点 ID
   * @param fileStatus 目标状态
   */
  async updateFileStatus(
    nodeId: string,
    fileStatus: FileStatus,
  ): Promise<void> {
    await this.prisma.fileSystemNode.update({
      where: { id: nodeId },
      data: { fileStatus },
    });
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

  async getNodeIgnoreDeleted(nodeId: string) {
    try {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
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
    const ALLOWED_SORT = ['name', 'createdAt', 'updatedAt', 'size'];
    if (sortBy && !ALLOWED_SORT.includes(sortBy)) {
      throw new BadRequestException(`不支持的排序字段: ${sortBy}`);
    }
    const safePage = Number(page) || 1;
    const safeLimit = Number(limit) || 50;
    const skip = (safePage - 1) * safeLimit;

    const where: Prisma.FileSystemNodeWhereInput = {
      parentId: nodeId,
      deletedAt: includeDeleted ? undefined : null,
    };

    if (search) {
      try {
        const ftsIds = await this.prisma.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "file_system_nodes"
          WHERE "searchVector" @@ plainto_tsquery('simple', ${search})
            AND "parentId" = ${nodeId}
          LIMIT 200
        `;
        if (ftsIds.length > 0) {
          where.id = { in: ftsIds.map((r) => r.id) };
        } else {
          where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ];
        }
      } catch {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }
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
    } catch (error) {
      this.logger.error(`查询子节点失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 获取分类树（递归 CTE，单次查询获取全部三级分类）
   *
   * 使用 PostgreSQL WITH RECURSIVE CTE 一次性获取 libraryRootId 下所有文件夹，
   * 深度最多 3 层（level 0/1/2），避免前端多次 API 调用造成的渐进加载延迟。
   *
   * @param libraryRootId 资源库根节点 ID
   * @returns 按层级组织的分类树
   */
  async getCategoryTree(libraryRootId: string): Promise<{
    categories: { level: number; items: { id: string; name: string; hasChildren: boolean }[] }[]
  }> {
    type CategoryRow = { id: string; name: string; parentId: string; level: number };

    const rows = await this.prisma.$queryRaw<CategoryRow[]>`
      WITH RECURSIVE category_tree AS (
        SELECT id, name, "parentId", 0::integer as level
        FROM "file_system_nodes"
        WHERE "parentId" = ${libraryRootId}
          AND "deletedAt" IS NULL
          AND "isFolder" = true

        UNION ALL

        SELECT fn.id, fn.name, fn."parentId", ct.level + 1
        FROM "file_system_nodes" fn
        INNER JOIN category_tree ct ON fn."parentId" = ct.id
        WHERE fn."deletedAt" IS NULL
          AND fn."isFolder" = true
          AND ct.level < 2
      )
      SELECT id, name, "parentId", level FROM category_tree
      ORDER BY level, name
    `;

    const level0Items: { id: string; name: string; parentId?: string; hasChildren: boolean }[] = [];
    const level1Items: { id: string; name: string; parentId?: string; hasChildren: boolean }[] = [];
    const level2Items: { id: string; name: string; parentId?: string; hasChildren: boolean }[] = [];

    for (const row of rows) {
      if (row.level === 0) {
        level0Items.push({ id: row.id, name: row.name, parentId: row.parentId, hasChildren: true });
      } else if (row.level === 1) {
        level1Items.push({ id: row.id, name: row.name, parentId: row.parentId, hasChildren: true });
      } else if (row.level === 2) {
        level2Items.push({ id: row.id, name: row.name, parentId: row.parentId, hasChildren: true });
      }
    }

    const categories: { level: number; items: typeof level0Items }[] = [
      { level: 0, items: level0Items },
    ];
    if (level1Items.length > 0) {
      categories.push({ level: 1, items: level1Items });
    }
    if (level2Items.length > 0) {
      categories.push({ level: 2, items: level2Items });
    }

    return { categories };
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

  async getTrashItems(
    userId: string,
    options?: {
      projectId?: string;
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      search?: string;
      extension?: string;
    }
  ) {
    try {
      const { projectId, page, limit, sortBy, sortOrder, search, extension } = options || {};

      // ── Project-scoped trash ─────────────────────────────────────
      if (projectId) {
        const safePage = Number(page) || 1;
        const safeLimit = Number(limit) || 50;
        const skip = (safePage - 1) * safeLimit;

        const where: Prisma.FileSystemNodeWhereInput = {
          deletedAt: { not: null },
        };

        const projectRoot = await this.prisma.fileSystemNode.findUnique({
          where: { id: projectId, isRoot: true },
          select: { id: true },
        });

        if (!projectRoot) {
          throw new NotFoundException('项目不存在');
        }

        const allProjectNodeIds = await this.getAllProjectNodeIds(projectId);
        where.id = { in: allProjectNodeIds };

        if (search) {
          try {
            const ftsIds = await this.prisma.$queryRaw<{ id: string }[]>`
              SELECT "id" FROM "file_system_nodes"
              WHERE "searchVector" @@ plainto_tsquery('simple', ${search})
                AND "id" = ANY(${allProjectNodeIds})
              LIMIT 200
            `;
            if (ftsIds.length > 0) {
              where.id = { in: ftsIds.map((r) => r.id) };
            } else {
              where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
              ];
            }
          } catch {
            where.OR = [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ];
          }
        }

        if (extension) {
          where.extension = extension;
        }

        const [nodes, total] = await Promise.all([
          this.prisma.fileSystemNode.findMany({
            where,
            skip,
            take: safeLimit,
            orderBy: sortBy ? { [sortBy]: sortOrder } : { deletedAt: 'desc' },
            include: {
              owner: {
                select: { id: true, username: true, nickname: true },
              },
            },
          }),
          this.prisma.fileSystemNode.count({ where }),
        ]);

        const parentIds = nodes
          .map((n) => n.parentId)
          .filter((id): id is string => !!id);
        if (parentIds.length > 0) {
          const pathMap = await this.buildAncestorPaths(parentIds);
          (nodes as FileSystemNodeDto[]).forEach((n) => {
            if (n.parentId) n.ancestorPath = pathMap.get(n.parentId);
          });
        }

        return { nodes, total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) };
      }

      // ── Global trash: all deleted items across accessible projects ──
      const safePage = Number(page) || 1;
      const safeLimit = Number(limit) || 50;
      const skip = (safePage - 1) * safeLimit;

      const accessibleProjectFilter: Prisma.FileSystemNodeWhereInput = {
        isRoot: true,
        deletedAt: null,
        libraryKey: null,
        OR: [
          { ownerId: userId },
          { projectMembers: { some: { userId } } },
        ],
      };

      const userAccessFilter = [
        { ownerId: userId },
        { projectMembers: { some: { userId } } },
      ];

      const where: Prisma.FileSystemNodeWhereInput = {
        deletedAt: { not: null },
        libraryKey: null,
        OR: [
          { project: accessibleProjectFilter },
          { isRoot: true, OR: userAccessFilter },
        ],
      };

      if (search) {
        where.AND = [
          {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          },
        ];
      }

      if (extension) {
        where.extension = extension;
      }

      const [nodes, total] = await Promise.all([
        this.prisma.fileSystemNode.findMany({
          where,
          skip,
          take: safeLimit,
          orderBy: sortBy ? { [sortBy]: sortOrder } : [{ isRoot: 'desc' }, { deletedAt: 'desc' }],
          include: {
            owner: { select: { id: true, username: true, nickname: true } },
          },
        }),
        this.prisma.fileSystemNode.count({ where }),
      ]);

      const parentIds = nodes
        .map((n) => n.parentId)
        .filter((id): id is string => !!id);
      if (parentIds.length > 0) {
        const pathMap = await this.buildAncestorPaths(parentIds);
        (nodes as FileSystemNodeDto[]).forEach((n) => {
          if (n.parentId) n.ancestorPath = pathMap.get(n.parentId);
        });
      }

      return { nodes, total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) };
    } catch (error) {
      this.logger.error(`获取回收站列表失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 递归获取项目内所有节点 ID
   */
  private async getAllProjectNodeIds(projectId: string): Promise<string[]> {
    const nodeIds: string[] = [];

    const traverse = async (parentId: string) => {
      const children = await this.prisma.fileSystemNode.findMany({
        where: { parentId },
        select: { id: true },
      });
      for (const child of children) {
        nodeIds.push(child.id);
        await traverse(child.id);
      }
    };

    await traverse(projectId);
    return nodeIds;
  }

  /**
   * 使用批量递归 CTE 构建多个 parentId 的祖先路径
   * 用于回收站节点注入 originalLocation 路径
   */
  private async buildAncestorPaths(parentIds: string[]): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(parentIds.filter(Boolean))];
    if (uniqueIds.length === 0) return new Map();

    const rows = await this.prisma.$queryRaw<{ id: string; path: string | null }[]>`
      WITH RECURSIVE ancestors AS (
        SELECT id, name, "parentId", id as start_id, 0 as depth
        FROM file_system_nodes
        WHERE id = ANY(${uniqueIds}::text[])
        UNION ALL
        SELECT p.id, p.name, p."parentId", a.start_id, a.depth + 1
        FROM file_system_nodes p
        INNER JOIN ancestors a ON p.id = a."parentId"
        WHERE a."parentId" IS NOT NULL AND a.depth < 50
      )
      SELECT start_id as id, string_agg(name, ' > ' ORDER BY depth DESC) as path
      FROM ancestors
      GROUP BY start_id
    `;

    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.path) map.set(row.id, row.path);
    }
    return map;
  }

  /**
   * 通过面包屑路径字符串解析目标节点
   * 例如 "项目A > 文件夹1 > 子文件夹" → 返回子文件夹节点
   * @param projectId 项目 ID（个人空间可不传）
   * @param pathStr   面包屑路径
   * @param userId    用户 ID（个人空间模式需要）
   */
  async resolvePath(
    projectId: string | undefined,
    pathStr: string,
    userId?: string,
  ): Promise<PrismaFileSystemNode> {
    const parts = pathStr.split(/\s*(?:>|\/)\s*/).filter(Boolean);
    if (parts.length === 0) {
      throw new BadRequestException('路径不能为空');
    }

    // 找到根节点：项目模式用 projectId，个人空间模式用 userId
    let rootNode: PrismaFileSystemNode | null = null;

    if (projectId) {
      rootNode = await this.prisma.fileSystemNode.findUnique({
        where: { id: projectId, isRoot: true },
      });
      if (!rootNode) {
        throw new NotFoundException('项目不存在');
      }
    } else if (userId) {
      rootNode = await this.prisma.fileSystemNode.findUnique({
        where: { personalSpaceKey: userId },
      });
      if (!rootNode) {
        throw new NotFoundException('个人空间不存在');
      }
    } else {
      throw new BadRequestException('请指定项目 ID 或用户 ID');
    }

    let currentId = rootNode.id;
    let offset = 0;

    // 如果第一段匹配根节点名称，跳过它
    if (parts[0] === rootNode.name) {
      offset = 1;
    }

    for (let i = offset; i < parts.length; i++) {
      const segment = parts[i];
      const children = await this.prisma.fileSystemNode.findMany({
        where: { parentId: currentId, deletedAt: null },
        select: { id: true, name: true },
        take: 100,
      });

      const child = children.find((c) => c.name === segment);
      if (!child) {
        throw new NotFoundException(
          `路径 "${pathStr}" 在 "${parts.slice(0, i).join(' > ')}" 处未找到 "${segment}"`,
        );
      }
      currentId = child.id;
    }

    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: currentId },
    });
    if (!node) {
      throw new NotFoundException('路径解析结果不存在');
    }
    return node;
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
    const ALLOWED_SORT = ['name', 'createdAt', 'updatedAt', 'size'];
    if (sortBy && !ALLOWED_SORT.includes(sortBy)) {
      throw new BadRequestException(`不支持的排序字段: ${sortBy}`);
    }
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
      const where: Prisma.FileSystemNodeWhereInput = {
        id: { in: allFileIds },
        deletedAt: includeDeleted ? undefined : null,
        isFolder: false, // 只返回文件
      };

      if (search) {
        try {
          const ftsIds = await this.prisma.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "file_system_nodes"
            WHERE "searchVector" @@ plainto_tsquery('simple', ${search})
              AND "id" = ANY(${allFileIds})
            LIMIT 200
          `;
          if (ftsIds.length > 0) {
            where.id = { in: ftsIds.map((r) => r.id) };
          } else {
            where.OR = [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ];
          }
        } catch {
          where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ];
        }
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

  /**
   * 获取目标节点在父目录中的分页上下文（用于搜索结果高亮定位）
   */
  async getParentContext(
    nodeId: string,
    pageSize: number = 50,
    sortBy?: string,
    sortOrder?: 'asc' | 'desc',
  ) {
    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId, deletedAt: null },
      select: { id: true, parentId: true, name: true, isFolder: true, updatedAt: true, size: true },
    });

    if (!node || !node.parentId) {
      throw new NotFoundException(`节点不存在或没有父节点: ${nodeId}`);
    }

    const safeSortBy = (sortBy && ['name', 'createdAt', 'updatedAt', 'size'].includes(sortBy))
      ? sortBy
      : 'updatedAt';
    const safeSortOrder = sortOrder === 'asc' ? 'asc' : 'desc';

    const orderColumn = safeSortBy === 'name' ? 'name'
      : safeSortBy === 'createdAt' ? 'createdAt'
      : safeSortBy === 'size' ? 'size'
      : 'updatedAt';

    const where = {
      parentId: node.parentId,
      deletedAt: null,
    };

    const total = await this.prisma.fileSystemNode.count({ where });

    const comparator = safeSortOrder === 'asc' ? '>' : '<';
    const orderExpr = orderColumn === 'name'
      ? Prisma.sql`${node.name}`
      : orderColumn === 'size'
        ? Prisma.sql`${node.size ?? 0}`
        : Prisma.sql`${node.updatedAt}`;

    const countBefore = await this.prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint as count
      FROM "file_system_nodes"
      WHERE "parentId" = ${node.parentId}
        AND "deletedAt" IS NULL
        AND (
          ${Prisma.raw(`"${orderColumn}"`)} ${Prisma.raw(comparator)} ${orderExpr}
          OR (
            ${Prisma.raw(`"${orderColumn}"`)} = ${orderExpr}
            AND id < ${nodeId}
          )
        )
    `;

    const count = Number(countBefore[0]?.count ?? 0);
    const pageNumber = Math.floor(count / pageSize) + 1;
    const positionInPage = (count % pageSize) + 1;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
      parentId: node.parentId,
      pageNumber,
      positionInPage,
      totalPages,
      total,
    };
  }

  /**
   * 递归计算文件夹的总大小
   */
  private async calculateTotalSize(folderId: string): Promise<number> {
    const result = await this.prisma.$queryRaw<[{ total: bigint | null }]>`
      WITH RECURSIVE descendants AS (
        SELECT id, size, "isFolder"
        FROM "file_system_nodes"
        WHERE "parentId" = ${folderId} AND "deletedAt" IS NULL
        UNION ALL
        SELECT fn.id, fn.size, fn."isFolder"
        FROM "file_system_nodes" fn
        INNER JOIN descendants d ON fn."parentId" = d.id AND d."isFolder" = true
        WHERE fn."deletedAt" IS NULL
      )
      SELECT COALESCE(SUM(size), 0)::bigint as total
      FROM descendants
      WHERE "isFolder" = false
    `;
    return Number(result[0]?.total ?? 0);
  }

  /**
   * 递归统计文件夹的总子节点数
   */
  private async countTotalChildren(folderId: string): Promise<{ fileCount: number; folderCount: number }> {
    const result = await this.prisma.$queryRaw<[{ fileCount: bigint; folderCount: bigint }]>`
      WITH RECURSIVE descendants AS (
        SELECT id, "isFolder"
        FROM "file_system_nodes"
        WHERE "parentId" = ${folderId} AND "deletedAt" IS NULL
        UNION ALL
        SELECT fn.id, fn."isFolder"
        FROM "file_system_nodes" fn
        INNER JOIN descendants d ON fn."parentId" = d.id AND d."isFolder" = true
        WHERE fn."deletedAt" IS NULL
      )
      SELECT
        COALESCE(SUM(CASE WHEN "isFolder" = false THEN 1 ELSE 0 END), 0)::bigint as "fileCount",
        COALESCE(SUM(CASE WHEN "isFolder" = true THEN 1 ELSE 0 END), 0)::bigint as "folderCount"
      FROM descendants
    `;
    return {
      fileCount: Number(result[0]?.fileCount ?? 0),
      folderCount: Number(result[0]?.folderCount ?? 0),
    };
  }

  /**
   * 获取节点属性信息
   */
  async getNodeProperties(nodeId: string, userId: string) {
    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId, deletedAt: null },
      include: {
        owner: {
          select: { id: true, username: true, nickname: true },
        },
        _count: {
          select: {
            children: {
              where: { deletedAt: null },
            },
          },
        },
      },
    });

    if (!node) {
      throw new NotFoundException(`节点不存在: ${nodeId}`);
    }

    let totalSize: number | undefined;
    let totalChildrenCount: number | undefined;
    let childrenFolderCount = 0;
    let childrenFileCount = 0;

    if (node.isFolder) {
      totalSize = await this.calculateTotalSize(nodeId);
      const totalChildren = await this.countTotalChildren(nodeId);
      totalChildrenCount = totalChildren.fileCount + totalChildren.folderCount;
    }

    if (node._count?.children) {
      const directChildren = await this.prisma.fileSystemNode.findMany({
        where: { parentId: nodeId, deletedAt: null },
        select: { id: true, isFolder: true },
      });
      childrenFolderCount = directChildren.filter(c => c.isFolder).length;
      childrenFileCount = directChildren.filter(c => !c.isFolder).length;
    }

    return {
      id: node.id,
      name: node.name,
      isFolder: node.isFolder,
      path: node.path,
      size: node.size,
      totalSize,
      childrenFolderCount,
      childrenFileCount,
      totalChildrenCount,
      ownerName: node.owner?.nickname || node.owner?.username,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      projectId: node.projectId,
      mimeType: node.mimeType,
      permissions: {
        canEdit: true,
        canDelete: false,
        canDownload: !node.isFolder,
      },
    };
  }
}

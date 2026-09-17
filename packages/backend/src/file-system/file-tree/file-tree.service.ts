///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  FileStatus,
  FileSystemNode as PrismaFileSystemNode,
  NodeType,
  Prisma,
} from '@cloudcad/db';
import { DatabaseService } from '../../database/database.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { AuditAction } from '../../common/enums/audit.enum';
import {
  StorageManager,
  NodeStorageInfo,
} from '../../storage-management/services/storage-manager.service';
import { IStorageService } from '../../storage/interfaces/storage-service.interface';
import { QueryChildrenDto } from '../dto/query-children.dto';
import { StorageInfoService } from '../storage-quota/storage-info.service';
import type { FileSystemNodeDto } from '../dto/file-system-response.dto';
import * as path from 'path';
import * as fsPromises from 'fs/promises';
import { createHash } from 'crypto';

import {
  isRootNode,
  getLibraryKeyFromNodeType,
  toDto,
} from '../utils/node-type';
import { I18nContext } from 'nestjs-i18n';
import { FtsQueryBuilder } from '../search/fts-query-builder';
import { AncestorQueryService } from '../../common/services/ancestor-query.service';
import { FileUtils } from '../../common/utils/file-utils';
import { TreeWalker } from './tree-walker.service';
@Injectable()
export class FileTreeService {
  private readonly logger = new Logger(FileTreeService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly storageManager: StorageManager,
    @Inject(IStorageService) private readonly storageService: IStorageService,
    private readonly storageInfoService: StorageInfoService,
    private readonly ftsQueryBuilder: FtsQueryBuilder,
    private readonly ancestorQueryService: AncestorQueryService,
    private readonly treeWalker: TreeWalker,
    private readonly auditLogService: AuditLogService
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
      name: rawName,
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
    // 落库前统一清洗文件名（basename 去路径段、去 .. 与危险字符 <>:"|?*、去首尾点/空格、
    // 拒空）：createFileNode 是所有文件节点创建的收敛点（图纸上传/秒传/资源库/另存为/
    // 外部参照/物化器），在此清洗一次覆盖全部入口，防路径遍历串进入 name/originalName
    //（进而影响展示、批量下载 zip 条目名、同名去重）。用 sanitizeFilename（非白名单）而非
    // validateFilename，避免误拒含括号/加号等合法字符的文件名。
    const name = FileUtils.sanitizeFilename(rawName);

    this.logger.log(
      `[createFileNode] 开始创建文件节点: name=${name}, fileHash=${fileHash}, parentId=${parentId}, ownerId=${ownerId}, skipFileCopy=${skipFileCopy}`
    );

    const parent = await this.prisma.fileSystemNode.findUnique({
      where: { id: parentId, deletedAt: null },
      select: { id: true, nodeType: true, projectId: true },
    });

    if (!parent) {
      throw new NotFoundException(
        I18nContext.current()?.t(
          'error.file_extra.node_not_exist_or_no_parent',
          { args: { id: parentId } }
        ) ?? `父节点不存在: ${parentId}`
      );
    }

    // 除文件(FILE)外，其他节点类型（文件夹、项目、个人空间、资源库等）
    // 本质上都是特殊的文件夹/根目录，均可作为父容器。
    if (parent.nodeType === NodeType.FILE) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.file.parent_must_not_be_file') ??
          '父节点不能是文件'
      );
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
      const projectId = await this.treeWalker.resolveProjectId(parentId);

      const fileNode = await tx.fileSystemNode.create({
        data: {
          name: uniqueName,
          nodeType: NodeType.FILE,
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
        const storageFileName = `${fileNode.id}${extension}`;
        storageInfo = await this.storageManager.allocateNodeStorage(
          fileNode.id,
          storageFileName
        );

        this.logger.log(
          `[createFileNode] 物理目录创建成功: ${storageInfo.nodeDirectoryRelativePath}`
        );
      } else {
        this.logger.log(`[createFileNode] skipFileCopy=true，跳过物理目录创建`);
      }

      if (!skipFileCopy) {
        if (sourceFilePath) {
          await this.storageService.copyFromFs(
            sourceFilePath,
            storageInfo.fileRelativePath
          );
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
              await this.storageService.copyFromFs(
                sourcePath,
                targetRelativePath
              );
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
    const projectId = await this.treeWalker.resolveProjectId(parentId);
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

    const TEMPLATES_DIR = path.join(
      __dirname,
      '..',
      '..',
      'assets',
      'templates'
    );
    const templatePath = path.join(TEMPLATES_DIR, 'blank.mxweb');

    this.logger.log(
      `[createDrawingFromTemplate] 从模板创建图纸: templatePath=${templatePath}, parentId=${parentId}`
    );

    const templateBuffer = await fsPromises.readFile(templatePath);
    const templateHash = createHash('md5').update(templateBuffer).digest('hex');
    const templateSize = templateBuffer.length;

    const drawingName = name ? `${name}.mxweb` : '新建图纸.mxweb';

    const node = await this.createFileNode({
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

    // 新建图纸审计（FILE_CREATE）：仅项目内节点记录（个人空间/公共资源库不记）
    await this.auditLogService.logProjectNodeAction(
      AuditAction.FILE_CREATE,
      node.id,
      ownerId
    );
    return node;
  }

  /**
   * 获取节点详情
   *
   * @param nodeId     文件节点 ID
   */
  async getNode(nodeId: string) {
    try {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId, deletedAt: null },
      });

      if (!node) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.node.not_found') ?? '节点不存在'
        );
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
        throw new NotFoundException(
          I18nContext.current()?.t('error.node.not_found') ?? '节点不存在'
        );
      }

      return node;
    } catch (error) {
      this.logger.error(`获取节点失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 获取节点 nodeType + ownerId（用于判断节点类型和所属空间）
   */
  async getNodeTypeAndOwner(nodeId: string) {
    try {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: { id: true, nodeType: true, ownerId: true },
      });

      if (!node) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.node.not_found') ?? '节点不存在'
        );
      }

      return node;
    } catch (error) {
      this.logger.error(`获取节点失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 判断节点是否属于公共资源库（图纸库/图块库）：
   * 库根节点（LIBRARY_DRAWING/LIBRARY_BLOCK）直接判定；
   * 库内文件/文件夹通过 TreeWalker.resolveProjectId 上溯到库根判定。
   */
  async isLibraryNode(nodeId: string): Promise<boolean> {
    const nodeType = await this.getNodeType(nodeId);
    if (
      nodeType === NodeType.LIBRARY_DRAWING ||
      nodeType === NodeType.LIBRARY_BLOCK
    ) {
      return true;
    }
    if (nodeType !== NodeType.FILE && nodeType !== NodeType.FOLDER) {
      return false;
    }
    const projectId = await this.treeWalker.resolveProjectId(nodeId);
    if (!projectId) return false;
    const rootType = await this.getNodeType(projectId);
    return (
      rootType === NodeType.LIBRARY_DRAWING ||
      rootType === NodeType.LIBRARY_BLOCK
    );
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
            orderBy: [{ nodeType: 'desc' }, { name: 'asc' }],
          },
        },
      });

      if (!node) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.node.not_found') ?? '节点不存在'
        );
      }

      // 确保返回的节点信息包含正确的projectId
      let projectId = node.projectId;
      if (
        !projectId &&
        node.nodeType !== NodeType.FILE &&
        node.nodeType !== NodeType.FOLDER
      ) {
        projectId = node.id;
      } else if (!projectId) {
        projectId = await this.treeWalker.resolveProjectId(nodeId);
      }

      // 获取祖先链（面包屑导航用，一次递归查询替代前端 N 次 HTTP 请求）
      const ancestors = await this.getAncestorChain(nodeId);

      return toDto({
        ...node,
        projectId,
        ancestors,
      });
    } catch (error) {
      this.logger.error(`查询节点失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 获取节点祖先链（从根到当前节点），一次递归查询替代前端 N 次 HTTP 请求。
   * 用于面包屑导航。
   */
  private async getAncestorChain(
    nodeId: string
  ): Promise<{ id: string; name: string; isRoot: boolean }[]> {
    const rows = await this.prisma.$queryRaw<
      { id: string; name: string; nodeType: string }[]
    >`
      WITH RECURSIVE ancestors AS (
        SELECT id, name, "nodeType", "parentId", 0 as depth
        FROM file_system_nodes
        WHERE id = ${nodeId}::text AND "deletedAt" IS NULL
        UNION ALL
        SELECT p.id, p.name, p."nodeType", p."parentId", a.depth + 1
        FROM file_system_nodes p
        INNER JOIN ancestors a ON p.id = a."parentId"
        WHERE a."parentId" IS NOT NULL AND a.depth < 50
      )
      SELECT id, name, "nodeType"
      FROM ancestors
      ORDER BY depth DESC
    `;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      isRoot:
        r.nodeType === 'PROJECT' ||
        r.nodeType === 'PERSONAL_SPACE' ||
        r.nodeType === 'LIBRARY_DRAWING' ||
        r.nodeType === 'LIBRARY_BLOCK',
    }));
  }

  async getChildren(nodeId: string, userId?: string, query?: QueryChildrenDto) {
    const {
      search,
      nodeType,
      extension,
      fileStatus,
      modifiedAtFrom,
      modifiedAtTo,
      createdAtFrom,
      createdAtTo,
      sizeMin,
      sizeMax,
      page = 1,
      limit = 50,
      sortBy,
      sortOrder,
      includeDeleted = false,
    } = query || {};
    const ALLOWED_SORT = ['name', 'createdAt', 'updatedAt', 'size'];
    if (sortBy && !ALLOWED_SORT.includes(sortBy)) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.file_extra.sort_unsupported', {
          args: { field: sortBy },
        }) ?? `不支持的排序字段: ${sortBy}`
      );
    }
    const safePage = Number(page) || 1;
    const safeLimit = Number(limit) || 50;
    const skip = (safePage - 1) * safeLimit;

    const where: Prisma.FileSystemNodeWhereInput = {
      parentId: nodeId,
      deletedAt: includeDeleted ? undefined : null,
    };

    // 搜索条件（OR 逻辑：名称/描述/FTS 任一匹配）
    if (search) {
      const ftsMatch = await this.ftsQueryBuilder.matchIds(
        search,
        200,
        Prisma.sql`"parentId" = ${nodeId}`
      );
      where.OR = this.ftsQueryBuilder.buildSearchOrConditions(search, ftsMatch);
    }

    // 节点类型筛选（独立条件）
    if (nodeType) {
      where.nodeType = nodeType === 'folder' ? NodeType.FOLDER : NodeType.FILE;
    }

    // 扩展名筛选：文件匹配扩展名 OR 始终显示文件夹
    if (extension) {
      const extensions = extension
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (extensions.length > 0) {
        if (where.OR) {
          // 有搜索条件时：用 AND 组合搜索和筛选
          where.AND = [
            { OR: where.OR },
            {
              OR: [
                { extension: { in: extensions } },
                { nodeType: NodeType.FOLDER },
              ],
            },
          ];
          delete where.OR;
        } else {
          where.OR = [
            { extension: { in: extensions } },
            { nodeType: NodeType.FOLDER },
          ];
        }
      }
    }

    if (fileStatus) {
      const statuses = fileStatus
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (statuses.length > 0) {
        where.fileStatus = { in: statuses as FileStatus[] };
      }
    }

    if (createdAtFrom || createdAtTo) {
      const filter: Prisma.DateTimeFilter = {};
      if (createdAtFrom) filter.gte = new Date(createdAtFrom);
      if (createdAtTo) filter.lte = new Date(createdAtTo);
      where.createdAt = filter;
    }

    if (modifiedAtFrom || modifiedAtTo) {
      const filter: Prisma.DateTimeFilter = {};
      if (modifiedAtFrom) filter.gte = new Date(modifiedAtFrom);
      if (modifiedAtTo) filter.lte = new Date(modifiedAtTo);
      where.updatedAt = filter;
    }

    if (sizeMin !== undefined || sizeMax !== undefined) {
      const filter: Prisma.IntFilter = {};
      if (sizeMin !== undefined) filter.gte = sizeMin;
      if (sizeMax !== undefined) filter.lte = sizeMax;
      where.size = filter;
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
            ? [{ nodeType: 'desc' }, { [sortBy]: sortOrder || 'desc' }]
            : [{ nodeType: 'desc' }, { name: 'asc' }],
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
        nodes: nodes.map((n) => ({
          ...n,
          isFolder: n.nodeType !== NodeType.FILE,
          isRoot: isRootNode(n),
          libraryKey: getLibraryKeyFromNodeType(n.nodeType),
        })),
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
    categories: {
      level: number;
      items: { id: string; name: string; hasChildren: boolean }[];
    }[];
  }> {
    type CategoryRow = {
      id: string;
      name: string;
      parentId: string;
      level: number;
    };

    const rows = await this.prisma.$queryRaw<CategoryRow[]>`
      WITH RECURSIVE category_tree AS (
        SELECT id, name, "parentId", 0::integer as level
        FROM "file_system_nodes"
        WHERE "parentId" = ${libraryRootId}
          AND "deletedAt" IS NULL
          AND "nodeType" != 'FILE'

        UNION ALL

        SELECT fn.id, fn.name, fn."parentId", ct.level + 1
        FROM "file_system_nodes" fn
        INNER JOIN category_tree ct ON fn."parentId" = ct.id
        WHERE fn."deletedAt" IS NULL
          AND fn."nodeType" != 'FILE'
          AND ct.level < 2
      )
      SELECT id, name, "parentId", level FROM category_tree
      ORDER BY level, name
    `;

    const level0Items: {
      id: string;
      name: string;
      parentId?: string;
      hasChildren: boolean;
    }[] = [];
    const level1Items: {
      id: string;
      name: string;
      parentId?: string;
      hasChildren: boolean;
    }[] = [];
    const level2Items: {
      id: string;
      name: string;
      parentId?: string;
      hasChildren: boolean;
    }[] = [];

    for (const row of rows) {
      if (row.level === 0) {
        level0Items.push({
          id: row.id,
          name: row.name,
          parentId: row.parentId,
          hasChildren: true,
        });
      } else if (row.level === 1) {
        level1Items.push({
          id: row.id,
          name: row.name,
          parentId: row.parentId,
          hasChildren: true,
        });
      } else if (row.level === 2) {
        level2Items.push({
          id: row.id,
          name: row.name,
          parentId: row.parentId,
          hasChildren: true,
        });
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
      select: { nodeType: true },
    });

    if (!node) {
      throw new NotFoundException(
        I18nContext.current()?.t('error.node.not_found') ?? '节点不存在'
      );
    }

    // 使用 TreeWalker 沿祖先链解析根节点（非 FILE/FOLDER 节点解析为自身）
    const projectId = await this.treeWalker.resolveProjectId(nodeId);
    if (!projectId) {
      throw new NotFoundException(
        I18nContext.current()?.t('error.file.root_not_found') ?? '未找到根节点'
      );
    }

    return { id: projectId };
  }

  /**
   * 按 ID 批量查询节点最小信息（id/parentId/name/nodeType）。
   * 供剪贴板剪切源父目录快照使用：不暴露归属与存储字段，无需逐节点权限校验。
   */
  async lookupNodes(ids: string[]) {
    if (!ids || ids.length === 0) return [];
    return this.prisma.fileSystemNode.findMany({
      where: { id: { in: ids } },
      select: { id: true, parentId: true, name: true, nodeType: true },
    });
  }

  async getNodeType(nodeId: string): Promise<NodeType | null> {
    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId },
      select: { nodeType: true },
    });

    return node?.nodeType ?? null;
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
      fileStatus?: string;
    }
  ) {
    try {
      const {
        projectId,
        page,
        limit,
        sortBy,
        sortOrder,
        search,
        extension,
        fileStatus,
      } = options || {};

      // ── Project-scoped trash ─────────────────────────────────────
      if (projectId) {
        const safePage = Number(page) || 1;
        const safeLimit = Number(limit) || 50;
        const skip = (safePage - 1) * safeLimit;

        const where: Prisma.FileSystemNodeWhereInput = {
          deletedAt: { not: null },
          deletedByCascade: false,
        };

        const projectRoot = await this.prisma.fileSystemNode.findFirst({
          where: {
            id: projectId,
            nodeType: { in: [NodeType.PROJECT, NodeType.PERSONAL_SPACE] },
          },
          select: { id: true },
        });

        if (!projectRoot) {
          throw new NotFoundException(
            I18nContext.current()?.t('error.project.not_found') ?? '项目不存在'
          );
        }

        const allProjectNodeIds = await this.treeWalker.getSubtreeIds(
          projectId,
          { includeRoot: true }
        );
        where.id = { in: allProjectNodeIds };

        if (search) {
          const ftsMatch = await this.ftsQueryBuilder.matchIds(
            search,
            200,
            Prisma.sql`"id" = ANY(${allProjectNodeIds}::text[])`
          );
          where.OR = this.ftsQueryBuilder.buildSearchOrConditions(
            search,
            ftsMatch
          );
        }

        if (extension) {
          const extensions = extension
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          if (extensions.length > 0) where.extension = { in: extensions };
        }
        if (fileStatus) {
          const statuses = fileStatus
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          if (statuses.length > 0)
            where.fileStatus = { in: statuses as FileStatus[] };
        }

        const [nodes, total] = await Promise.all([
          this.prisma.fileSystemNode.findMany({
            where,
            skip,
            take: safeLimit,
            orderBy: sortBy
              ? [{ nodeType: 'desc' }, { [sortBy]: sortOrder }]
              : [{ nodeType: 'desc' }, { deletedAt: 'desc' }],
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
        const dtoNodes = nodes.map((n) => ({
          ...n,
          isFolder: n.nodeType !== NodeType.FILE,
          isRoot: isRootNode(n),
          libraryKey: getLibraryKeyFromNodeType(n.nodeType),
        })) as FileSystemNodeDto[];
        if (parentIds.length > 0) {
          const pathMap = await this.buildAncestorPaths(parentIds);
          dtoNodes.forEach((n) => {
            if (n.parentId) n.ancestorPath = pathMap.get(n.parentId);
          });
        }

        await this.attachChildrenCountTrash(dtoNodes);

        return {
          nodes: dtoNodes,
          total,
          page: safePage,
          limit: safeLimit,
          totalPages: Math.ceil(total / safeLimit),
        };
      }

      // ── Global trash: all deleted items across accessible projects ──
      const safePage = Number(page) || 1;
      const safeLimit = Number(limit) || 50;
      const skip = (safePage - 1) * safeLimit;

      const accessibleProjectFilter: Prisma.FileSystemNodeWhereInput = {
        nodeType: NodeType.PROJECT,
        OR: [{ ownerId: userId }, { projectMembers: { some: { userId } } }],
      };

      const userAccessFilter = [
        { ownerId: userId },
        { projectMembers: { some: { userId } } },
      ];

      const where: Prisma.FileSystemNodeWhereInput = {
        deletedAt: { not: null },
        deletedByCascade: false,
        OR: [
          { project: accessibleProjectFilter },
          { nodeType: NodeType.PROJECT, ...accessibleProjectFilter },
          { nodeType: NodeType.PERSONAL_SPACE, OR: userAccessFilter },
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
        const extensions = extension
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (extensions.length > 0) where.extension = { in: extensions };
      }
      if (fileStatus) {
        const statuses = fileStatus
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (statuses.length > 0)
          where.fileStatus = { in: statuses as FileStatus[] };
      }

      const [nodes, total] = await Promise.all([
        this.prisma.fileSystemNode.findMany({
          where,
          skip,
          take: safeLimit,
          orderBy: sortBy
            ? [{ nodeType: 'desc' }, { [sortBy]: sortOrder }]
            : [{ nodeType: 'desc' }, { deletedAt: 'desc' }],
          include: {
            owner: { select: { id: true, username: true, nickname: true } },
          },
        }),
        this.prisma.fileSystemNode.count({ where }),
      ]);

      const parentIds = nodes
        .map((n) => n.parentId)
        .filter((id): id is string => !!id);
      const dtoNodes = nodes.map((n) => ({
        ...n,
        isFolder: n.nodeType !== NodeType.FILE,
        isRoot: isRootNode(n),
        libraryKey: getLibraryKeyFromNodeType(n.nodeType),
      })) as FileSystemNodeDto[];
      if (parentIds.length > 0) {
        const pathMap = await this.buildAncestorPaths(parentIds);
        dtoNodes.forEach((n) => {
          if (n.parentId) n.ancestorPath = pathMap.get(n.parentId);
        });
      }

      await this.attachChildrenCountTrash(dtoNodes);

      return {
        nodes: dtoNodes,
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      };
    } catch (error) {
      this.logger.error(`获取回收站列表失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 使用批量递归 CTE 构建多个 parentId 的祖先路径
   * 用于回收站节点注入 originalLocation 路径
   */
  private async buildAncestorPaths(
    parentIds: string[]
  ): Promise<Map<string, string>> {
    return this.ancestorQueryService.buildAncestorPaths(parentIds, true);
  }

  /**
   * 为回收站列表中的文件夹附加 childrenCountTrash（被级联删除的子节点数量）
   */
  private async attachChildrenCountTrash(
    nodes: FileSystemNodeDto[]
  ): Promise<void> {
    const folderIds = nodes
      .filter((n) => n.nodeType === NodeType.FOLDER)
      .map((n) => n.id);
    if (folderIds.length === 0) return;

    const counts = await this.prisma.fileSystemNode.groupBy({
      by: ['parentId'],
      where: {
        parentId: { in: folderIds },
        deletedAt: { not: null },
        deletedByCascade: true,
      },
      _count: { id: true },
    });
    const countMap = new Map(counts.map((c) => [c.parentId, c._count.id]));
    nodes.forEach((n) => {
      if (n.nodeType === NodeType.FOLDER)
        n.childrenCountTrash = countMap.get(n.id) || 0;
    });
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
    userId?: string
  ): Promise<PrismaFileSystemNode> {
    const parts = pathStr.split(/\s*(?:>|\/)\s*/).filter(Boolean);
    if (parts.length === 0) {
      throw new BadRequestException(
        I18nContext.current()?.t('error.file.path_empty') ?? '路径不能为空'
      );
    }

    // 找到根节点：项目模式用 projectId，个人空间模式用 userId
    let rootNode: PrismaFileSystemNode | null = null;

    if (projectId) {
      rootNode = await this.prisma.fileSystemNode.findFirst({
        where: {
          id: projectId,
          nodeType: { in: [NodeType.PROJECT, NodeType.PERSONAL_SPACE] },
          deletedAt: null,
        },
      });
      if (!rootNode) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.project.not_found') ?? '项目不存在'
        );
      }
    } else if (userId) {
      rootNode = await this.prisma.fileSystemNode.findFirst({
        where: { ownerId: userId, nodeType: NodeType.PERSONAL_SPACE },
      });
      if (!rootNode) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.personal_space.not_found') ??
            '个人空间不存在'
        );
      }
    } else {
      throw new BadRequestException(
        I18nContext.current()?.t(
          'error.personal_space.project_id_or_user_id_required'
        ) ?? '请指定项目 ID 或用户 ID'
      );
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
          `路径 "${pathStr}" 在 "${parts.slice(0, i).join(' > ')}" 处未找到 "${segment}"`
        );
      }
      currentId = child.id;
    }

    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: currentId },
    });
    if (!node) {
      throw new NotFoundException(
        I18nContext.current()?.t('error.personal_space.path_parse_not_found') ??
          '路径解析结果不存在'
      );
    }
    return node;
  }

  /**
   * 获取某个节点下的所有文件（包括子目录中的文件）。
   * 委托 TreeWalker 以 CTE 递归遍历（#259）：无过滤时 LIMIT/OFFSET 在递归结果上下推，
   * 消除 JS 递归 N+1 与 id 参数上限；过滤场景（search/extension/fileStatus）在全集上
   * 过滤后再分页，行为不变。
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
      throw new BadRequestException(
        I18nContext.current()?.t('error.file_extra.sort_unsupported', {
          args: { field: sortBy },
        }) ?? `不支持的排序字段: ${sortBy}`
      );
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

      // 过滤条件存在时（search/extension/fileStatus）需在全集上过滤后再分页。
      // #272：过滤全量下推 TreeWalker CTE（extension/fileStatus 列级过滤 + FTS 预匹配
      // 集 ANY 数组打包），findMany 仅按页内 id（≤ limit）取详情，消除
      // `id: { in: allFileIds }` 展开导致的 65535 参数上限残留。
      if (search || extension || fileStatus) {
        let ftsMatchIds: string[] | undefined;
        if (search) {
          const ftsMatch = await this.ftsQueryBuilder.matchIds(search, 200);
          if (ftsMatch.matched) ftsMatchIds = [...ftsMatch.ids];
        }

        const extensions =
          extension
            ?.split(',')
            .map((s) => s.trim())
            .filter(Boolean) ?? [];
        const statuses =
          fileStatus
            ?.split(',')
            .map((s) => s.trim())
            .filter(Boolean) ?? [];

        const { rows, total } =
          await this.treeWalker.getSubtreeFilesFilteredPaginated(nodeId, {
            includeDeleted,
            page: safePage,
            limit: safeLimit,
            sortBy:
              (sortBy as 'name' | 'createdAt' | 'updatedAt' | 'size') ??
              'createdAt',
            sortOrder: sortOrder ?? 'desc',
            extensions,
            statuses: statuses as FileStatus[],
            ftsMatchIds,
            keyword: search,
          });

        // 当前页无数据（真空子树或 page 越界）：total 来自 TreeWalker 独立 count，
        // 不得置 0 丢弃真实总数（回归 #259 同规约）
        if (rows.length === 0) {
          return {
            nodes: [],
            total,
            page,
            limit,
            totalPages: Math.ceil(total / safeLimit),
          };
        }

        const nodes = await this.prisma.fileSystemNode.findMany({
          where: {
            id: { in: rows.map((r) => r.id) },
            deletedAt: includeDeleted ? undefined : null,
            nodeType: NodeType.FILE,
          },
          orderBy: sortBy
            ? [{ [sortBy]: sortOrder || 'desc' }, { id: 'asc' }]
            : [{ createdAt: 'desc' }, { id: 'asc' }],
          include: {
            owner: {
              select: {
                id: true,
                username: true,
                nickname: true,
              },
            },
          },
        });

        return {
          nodes: nodes.map((n) => ({
            ...n,
            isFolder: n.nodeType !== NodeType.FILE,
            isRoot: isRootNode(n),
            libraryKey: getLibraryKeyFromNodeType(n.nodeType),
          })),
          total,
          page,
          limit,
          totalPages: Math.ceil(total / safeLimit),
        };
      }

      // 无过滤主路径：分页下推给 TreeWalker（LIMIT/OFFSET 在 CTE 递归结果上按稳定排序生效），
      // 当前页 id 至多 safeLimit 个，findMany 仅取页内详情，规避 id 参数上限（#259）。
      const { rows, total } = await this.treeWalker.getSubtreeFilesPaginated(
        nodeId,
        {
          includeDeleted,
          page: safePage,
          limit: safeLimit,
          sortBy:
            (sortBy as 'name' | 'createdAt' | 'updatedAt' | 'size') ??
            'createdAt',
          sortOrder: sortOrder ?? 'desc',
        }
      );

      // 当前页无数据（真空子树或 page 越界）：total 来自 TreeWalker 独立 count，
      // 不得置 0 丢弃真实总数（回归 #259）
      if (rows.length === 0) {
        return {
          nodes: [],
          total,
          page,
          limit,
          totalPages: Math.ceil(total / safeLimit),
        };
      }

      const nodes = await this.prisma.fileSystemNode.findMany({
        where: {
          id: { in: rows.map((r) => r.id) },
          deletedAt: includeDeleted ? undefined : null,
          nodeType: NodeType.FILE,
        },
        orderBy: sortBy
          ? [{ [sortBy]: sortOrder || 'desc' }, { id: 'asc' }]
          : [{ createdAt: 'desc' }, { id: 'asc' }],
        include: {
          owner: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
        },
      });

      return {
        nodes: nodes.map((n) => ({
          ...n,
          isFolder: n.nodeType !== NodeType.FILE,
          isRoot: isRootNode(n),
          libraryKey: getLibraryKeyFromNodeType(n.nodeType),
        })),
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
    sortOrder?: 'asc' | 'desc'
  ) {
    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId, deletedAt: null },
      select: {
        id: true,
        parentId: true,
        name: true,
        nodeType: true,
        updatedAt: true,
        size: true,
      },
    });

    if (!node || !node.parentId) {
      throw new NotFoundException(
        I18nContext.current()?.t(
          'error.file_extra.node_not_exist_or_no_parent',
          { args: { id: nodeId } }
        ) ?? `节点不存在或没有父节点: ${nodeId}`
      );
    }

    const safeSortBy =
      sortBy && ['name', 'createdAt', 'updatedAt', 'size'].includes(sortBy)
        ? sortBy
        : 'updatedAt';
    const safeSortOrder = sortOrder === 'asc' ? 'asc' : 'desc';

    const orderColumn =
      safeSortBy === 'name'
        ? 'name'
        : safeSortBy === 'createdAt'
          ? 'createdAt'
          : safeSortBy === 'size'
            ? 'size'
            : 'updatedAt';

    const where = {
      parentId: node.parentId,
      deletedAt: null,
    };

    const total = await this.prisma.fileSystemNode.count({ where });

    const comparator = safeSortOrder === 'asc' ? '>' : '<';
    const orderExpr =
      orderColumn === 'name'
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
}

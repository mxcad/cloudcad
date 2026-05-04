import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { SearchDto, SearchScope, SearchType } from '../dto/search.dto';
import { FileSystemPermissionService } from '../file-permission/file-system-permission.service';
import { PermissionService } from '../../common/services/permission.service';
import { ProjectPermission, SystemPermission } from '../../common/enums/permissions.enum';
import { Prisma, FileStatus } from '@prisma/client';
import {
  NodeListResponseDto,
  FileSystemNodeDto,
} from '../dto/file-system-response.dto';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly permissionService: FileSystemPermissionService,
    private readonly systemPermissionService: PermissionService
  ) {}

  async search(userId: string, dto: SearchDto): Promise<NodeListResponseDto> {
    const {
      keyword,
      scope = SearchScope.PROJECT_FILES,
      type = SearchType.ALL,
      filter = 'all',
      projectId,
      libraryKey,
      extension,
      fileStatus,
      page = 1,
      limit = 50,
      sortBy = 'updatedAt',
      sortOrder = 'desc',
    } = dto;

    const skip = (page - 1) * limit;

    switch (scope) {
      case SearchScope.PROJECT:
        return this.searchProjects(userId, {
          keyword,
          filter,
          page,
          limit,
          skip,
          sortBy,
          sortOrder,
        });
      case SearchScope.PROJECT_FILES:
        if (!projectId) {
          throw new BadRequestException('搜索项目文件时必须提供 projectId');
        }
        return this.searchProjectFiles(userId, projectId, {
          keyword,
          type,
          extension,
          fileStatus,
          page,
          limit,
          skip,
          sortBy,
          sortOrder,
        });
      case SearchScope.ALL_PROJECTS:
        return this.searchAllProjects(userId, {
          keyword,
          page,
          limit,
          skip,
          sortBy,
          sortOrder,
        });
      case SearchScope.LIBRARY:
        return this.searchLibrary(userId, {
          keyword,
          libraryKey,
          type,
          extension,
          page,
          limit,
          skip,
          sortBy,
          sortOrder,
        });
      default:
        throw new BadRequestException(`不支持的搜索范围: ${scope}`);
    }
  }

  private async searchProjects(
    userId: string,
    params: {
      keyword: string;
      filter: 'all' | 'owned' | 'joined';
      page: number;
      limit: number;
      skip: number;
      sortBy: string;
      sortOrder: 'asc' | 'desc';
    }
  ): Promise<NodeListResponseDto> {
    const { keyword, filter, skip, limit, sortBy, sortOrder } = params;
    const safeLimit = Number(limit) || 50;

    let ownerCondition: any;
    switch (filter) {
      case 'owned':
        ownerCondition = { ownerId: userId };
        break;
      case 'joined':
        ownerCondition = {
          projectMembers: {
            some: { userId },
          },
          ownerId: { not: userId },
        };
        break;
      case 'all':
      default:
        ownerCondition = {
          OR: [{ ownerId: userId }, { projectMembers: { some: { userId } } }],
        };
        break;
    }

    const where: Prisma.FileSystemNodeWhereInput = {
      isRoot: true,
      deletedAt: null,
      personalSpaceKey: null,
      libraryKey: null,
      ...ownerCondition,
      OR: [
        { name: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } },
      ],
    };

    const [nodes, total] = await Promise.all([
      this.prisma.fileSystemNode.findMany({
        where,
        skip,
        take: safeLimit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          _count: {
            select: {
              children: {
                where: { deletedAt: null },
              },
              projectMembers: true,
            },
          },
        },
      }),
      this.prisma.fileSystemNode.count({ where }),
    ]);

    const results: FileSystemNodeDto[] = nodes.map((node) => ({
      id: node.id,
      name: node.name,
      description: node.description,
      isFolder: node.isFolder,
      isRoot: node.isRoot,
      parentId: node.parentId,
      path: node.path,
      size: node.size,
      mimeType: node.mimeType,
      fileHash: node.fileHash,
      fileStatus: node.fileStatus,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      deletedAt: node.deletedAt,
      ownerId: node.ownerId,
      personalSpaceKey: node.personalSpaceKey,
      libraryKey: node.libraryKey,
      childrenCount: node._count?.children,
      projectId: node.projectId,
    }));

    return {
      nodes: results,
      total,
      page: params.page,
      limit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  private async searchProjectFiles(
    userId: string,
    projectId: string,
    params: {
      keyword: string;
      type: SearchType;
      extension?: string;
      fileStatus?: string;
      page: number;
      limit: number;
      skip: number;
      sortBy: string;
      sortOrder: 'asc' | 'desc';
    }
  ): Promise<NodeListResponseDto> {
    const {
      keyword,
      type,
      extension,
      fileStatus,
      skip,
      limit,
      sortBy,
      sortOrder,
    } = params;
    const safeLimit = Number(limit) || 50;

    const hasAccess = await this.permissionService.checkNodePermission(
      userId,
      projectId,
      ProjectPermission.FILE_OPEN
    );
    if (!hasAccess) {
      return { nodes: [], total: 0, page: params.page, limit, totalPages: 0 };
    }

    const projectNodeIds = await this.getAllProjectNodeIds(projectId);

    const where: Prisma.FileSystemNodeWhereInput = {
      id: { in: projectNodeIds },
      deletedAt: null,
      personalSpaceKey: null,
      isRoot: false,
      OR: [
        { name: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } },
      ],
    };

    if (type === SearchType.FILE) where.isFolder = false;
    else if (type === SearchType.FOLDER) where.isFolder = true;
    if (extension) where.extension = extension;
    if (fileStatus) where.fileStatus = fileStatus as FileStatus;

    const [nodes, total] = await Promise.all([
      this.prisma.fileSystemNode.findMany({
        where,
        skip,
        take: safeLimit,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          name: true,
          description: true,
          isFolder: true,
          isRoot: true,
          parentId: true,
          path: true,
          size: true,
          mimeType: true,
          fileHash: true,
          fileStatus: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          ownerId: true,
          personalSpaceKey: true,
          libraryKey: true,
          projectId: true,
        },
      }),
      this.prisma.fileSystemNode.count({ where }),
    ]);

    const results: FileSystemNodeDto[] = nodes.map((node) => ({
      id: node.id,
      name: node.name,
      description: node.description,
      isFolder: node.isFolder,
      isRoot: node.isRoot,
      parentId: node.parentId,
      path: node.path,
      size: node.size,
      mimeType: node.mimeType,
      fileHash: node.fileHash,
      fileStatus: node.fileStatus,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      deletedAt: node.deletedAt,
      ownerId: node.ownerId,
      personalSpaceKey: node.personalSpaceKey,
      libraryKey: node.libraryKey,
      projectId: node.projectId || projectId,
    }));

    return {
      nodes: results,
      total,
      page: params.page,
      limit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  private async searchAllProjects(
    userId: string,
    params: {
      keyword: string;
      page: number;
      limit: number;
      skip: number;
      sortBy: string;
      sortOrder: 'asc' | 'desc';
    }
  ): Promise<NodeListResponseDto> {
    const { keyword, skip, limit, sortBy, sortOrder } = params;
    const safeLimit = Number(limit) || 50;

    const userProjects = await this.prisma.fileSystemNode.findMany({
      where: {
        isRoot: true,
        deletedAt: null,
        libraryKey: null,
        OR: [{ ownerId: userId }, { projectMembers: { some: { userId } } }],
      },
      select: { id: true },
    });

    const projectIds = userProjects.map((p) => p.id);
    const where: Prisma.FileSystemNodeWhereInput = {
      projectId: { in: projectIds },
      deletedAt: null,
      OR: [
        { name: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } },
      ],
    };

    const [nodes, total] = await Promise.all([
      this.prisma.fileSystemNode.findMany({
        where,
        skip,
        take: safeLimit,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          name: true,
          description: true,
          isFolder: true,
          isRoot: true,
          parentId: true,
          path: true,
          size: true,
          mimeType: true,
          fileHash: true,
          fileStatus: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          ownerId: true,
          personalSpaceKey: true,
          libraryKey: true,
          projectId: true,
        },
      }),
      this.prisma.fileSystemNode.count({ where }),
    ]);

    const results: FileSystemNodeDto[] = nodes.map((node) => ({
      id: node.id,
      name: node.name,
      description: node.description,
      isFolder: node.isFolder,
      isRoot: node.isRoot,
      parentId: node.parentId,
      path: node.path,
      size: node.size,
      mimeType: node.mimeType,
      fileHash: node.fileHash,
      fileStatus: node.fileStatus,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      deletedAt: node.deletedAt,
      ownerId: node.ownerId,
      personalSpaceKey: node.personalSpaceKey,
      libraryKey: node.libraryKey,
      projectId: node.projectId,
    }));

    return {
      nodes: results,
      total,
      page: params.page,
      limit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  private async searchLibrary(
    userId: string,
    params: {
      keyword: string;
      libraryKey?: string;
      type: SearchType;
      extension?: string;
      page: number;
      limit: number;
      skip: number;
      sortBy: string;
      sortOrder: 'asc' | 'desc';
    }
  ): Promise<NodeListResponseDto> {
    const {
      keyword,
      libraryKey,
      type,
      extension,
      skip,
      limit,
      sortBy,
      sortOrder,
    } = params;
    const safeLimit = Number(limit) || 50;

    // ── 权限检查 ──
    // 如果指定了 libraryKey，检查对应资源库的系统权限
    // 如果未指定（搜索所有资源库），需要拥有两个权限中的一个
    if (libraryKey === 'drawing') {
      const hasPermission = await this.systemPermissionService.checkSystemPermission(
        userId, SystemPermission.LIBRARY_DRAWING_MANAGE as any,
      );
      if (!hasPermission) {
        this.logger.warn(`用户 ${userId} 无图纸库搜索权限`);
        return { nodes: [], total: 0, page: params.page, limit, totalPages: 0 };
      }
    } else if (libraryKey === 'block') {
      const hasPermission = await this.systemPermissionService.checkSystemPermission(
        userId, SystemPermission.LIBRARY_BLOCK_MANAGE as any,
      );
      if (!hasPermission) {
        this.logger.warn(`用户 ${userId} 无图块库搜索权限`);
        return { nodes: [], total: 0, page: params.page, limit, totalPages: 0 };
      }
    } else {
      // 未指定 libraryKey — 搜索所有资源库，需至少拥有一个权限
      const hasDrawingAccess = await this.systemPermissionService.checkSystemPermission(
        userId, SystemPermission.LIBRARY_DRAWING_MANAGE as any,
      );
      const hasBlockAccess = await this.systemPermissionService.checkSystemPermission(
        userId, SystemPermission.LIBRARY_BLOCK_MANAGE as any,
      );
      if (!hasDrawingAccess && !hasBlockAccess) {
        this.logger.warn(`用户 ${userId} 无任何资源库搜索权限`);
        return { nodes: [], total: 0, page: params.page, limit, totalPages: 0 };
      }
    }

    this.logger.log(
      `[资源库搜索] 用户ID: ${userId}, 关键词: ${keyword}, libraryKey: ${libraryKey}, type: ${type}`
    );

    const where: Prisma.FileSystemNodeWhereInput = {
      deletedAt: null,
      libraryKey: libraryKey ? { equals: libraryKey } : { not: null },
      isRoot: false,
      OR: [
        { name: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } },
      ],
    };

    this.logger.log(`[资源库搜索] 查询条件: ${JSON.stringify(where)}`);

    if (type === SearchType.FILE) where.isFolder = false;
    else if (type === SearchType.FOLDER) where.isFolder = true;
    if (extension) where.extension = extension;

    const [nodes, total] = await Promise.all([
      this.prisma.fileSystemNode.findMany({
        where,
        skip,
        take: safeLimit,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          name: true,
          description: true,
          isFolder: true,
          isRoot: true,
          parentId: true,
          path: true,
          size: true,
          mimeType: true,
          fileHash: true,
          fileStatus: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          ownerId: true,
          personalSpaceKey: true,
          libraryKey: true,
          projectId: true,
        },
      }),
      this.prisma.fileSystemNode.count({ where }),
    ]);

    const results: FileSystemNodeDto[] = nodes.map((node) => ({
      id: node.id,
      name: node.name,
      description: node.description,
      isFolder: node.isFolder,
      isRoot: node.isRoot,
      parentId: node.parentId,
      path: node.path,
      size: node.size,
      mimeType: node.mimeType,
      fileHash: node.fileHash,
      fileStatus: node.fileStatus,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      deletedAt: node.deletedAt,
      ownerId: node.ownerId,
      personalSpaceKey: node.personalSpaceKey,
      libraryKey: node.libraryKey,
      projectId: node.projectId,
    }));

    return {
      nodes: results,
      total,
      page: params.page,
      limit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  private async getAllProjectNodeIds(projectId: string): Promise<string[]> {
    const result = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE tree AS (
        SELECT id FROM file_system_nodes
        WHERE id = ${projectId} AND deleted_at IS NULL
        UNION ALL
        SELECT n.id FROM file_system_nodes n
        JOIN tree t ON n.parent_id = t.id
        WHERE n.deleted_at IS NULL
      )
      SELECT id FROM tree
    `;

    return result.map((row) => row.id);
  }
}
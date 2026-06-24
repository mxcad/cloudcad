import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { SearchDto, SearchScope, SearchType } from '../dto/search.dto';
import { FileSystemPermissionService } from '../file-permission/file-system-permission.service';
import { ProjectPermission } from '../../common/enums/permissions.enum';
import { Prisma } from '@prisma/client';
import { FileStatus } from '../../common/enums/file-status.enum';
import { FtsQueryBuilder } from './fts-query-builder';
import { parseSearchQuery, type ParsedSearchQuery } from './search-query.parser';
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
    private readonly ftsQueryBuilder: FtsQueryBuilder,
  ) {}

  async search(userId: string, dto: SearchDto, signal?: AbortSignal): Promise<NodeListResponseDto> {
    let {
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

    // Parse search syntax (ext:.dwg, type:file, modified:>2024-01-01, etc.)
    const parsed = parseSearchQuery(keyword);
    if (parsed.hasSyntax) {
      keyword = parsed.keyword;
      if (parsed.extension) extension = parsed.extension;
      if (parsed.type !== SearchType.ALL) type = parsed.type;
      if (parsed.fileStatus) fileStatus = parsed.fileStatus as any;
      if (parsed.sortBy) sortBy = parsed.sortBy;
      if (parsed.sortOrder) sortOrder = parsed.sortOrder;
    }

    const ALLOWED_SORT_FIELDS = ['name', 'createdAt', 'updatedAt', 'size'] as const;
    if (!(ALLOWED_SORT_FIELDS as readonly string[]).includes(sortBy)) {
      throw new BadRequestException(`不支持的排序字段: ${sortBy}`);
    }

    const skip = (page - 1) * limit;

    const extra = {
      exactPhrase: parsed.exactPhrase,
      excludeTerms: parsed.excludeTerms,
      dateRange: parsed.dateRange,
      sizeRange: parsed.sizeRange,
    };

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
          ...extra,
        }, signal);
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
          ...extra,
        }, signal);
      case SearchScope.ALL_PROJECTS:
        return this.searchAllProjects(userId, {
          keyword,
          page,
          limit,
          skip,
          sortBy,
          sortOrder,
          ...extra,
        }, signal);
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
          ...extra,
        }, signal);
      case SearchScope.GLOBAL:
        return this.searchGlobal(userId, {
          keyword,
          filter,
          type,
          extension,
          fileStatus,
          page,
          limit,
          skip,
          sortBy,
          sortOrder,
          ...extra,
        }, signal);
      case SearchScope.PERSONAL_SPACE:
        return this.searchPersonalSpace(userId, {
          keyword,
          type,
          extension,
          fileStatus,
          page,
          limit,
          skip,
          sortBy,
          sortOrder,
          ...extra,
        }, signal);
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
      exactPhrase?: string | null;
      excludeTerms?: string[];
      dateRange?: { field: 'createdAt' | 'updatedAt'; operator: '>' | '<' | '>='; value: Date } | null;
      sizeRange?: { operator: '>' | '<'; value: number } | null;
    },
    signal?: AbortSignal,
  ): Promise<NodeListResponseDto> {
    const { keyword, filter, skip, limit, sortBy, sortOrder, exactPhrase, excludeTerms, dateRange, sizeRange } = params;
    const safeLimit = Number(limit) || 50;

    const permissionAnd: Prisma.FileSystemNodeWhereInput[] = (() => {
      switch (filter) {
        case 'owned':
          return [{ ownerId: userId }];
        case 'joined':
          return [
            { projectMembers: { some: { userId } } },
            { ownerId: { not: userId } },
          ];
        case 'all':
        default:
          return [{
            OR: [{ ownerId: userId }, { projectMembers: { some: { userId } } }],
          }];
      }
    })();

    const where: Prisma.FileSystemNodeWhereInput = {
      isRoot: true,
      deletedAt: null,
      personalSpaceKey: null,
      libraryKey: null,
      AND: permissionAnd,
    };

    const ftsMatch = await this.ftsQueryBuilder.matchIds(keyword);
    if (ftsMatch.matched) {
      where.id = { in: [...ftsMatch.ids] };
    } else if (keyword) {
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    this.applyExtraFilters(where, { exactPhrase, excludeTerms });
    this.applyRangeFilters(where, { dateRange, sizeRange });

    this.checkAborted(signal);

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

    return this.toNodeListResponse(
      nodes as Record<string, unknown>[],
      total,
      params.page,
      limit,
      (node) => ({ childrenCount: (node._count as any)?.children, memberCount: (node._count as any)?.projectMembers }),
    );
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
      exactPhrase?: string | null;
      excludeTerms?: string[];
      dateRange?: { field: 'createdAt' | 'updatedAt'; operator: '>' | '<' | '>='; value: Date } | null;
      sizeRange?: { operator: '>' | '<'; value: number } | null;
    },
    signal?: AbortSignal,
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
      exactPhrase,
      excludeTerms,
      dateRange,
      sizeRange,
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

    const ftsMatch = await this.ftsQueryBuilder.matchIds(keyword);
    let effectiveIds: string[];
    if (ftsMatch.matched) {
      effectiveIds = projectNodeIds.filter((id) => ftsMatch.ids.has(id));
      if (effectiveIds.length === 0) {
        return { nodes: [], total: 0, page: params.page, limit, totalPages: 0 };
      }
    } else {
      effectiveIds = projectNodeIds;
    }

    const where: Prisma.FileSystemNodeWhereInput = {
      id: { in: effectiveIds },
      deletedAt: null,
      isRoot: false,
    };

    if (!ftsMatch.matched && keyword) {
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    if (type === SearchType.FILE) where.isFolder = false;
    else if (type === SearchType.FOLDER) where.isFolder = true;
    if (extension) where.extension = extension;
    if (fileStatus) {
      const validStatuses = Object.values(FileStatus) as string[];
      if (!validStatuses.includes(fileStatus)) {
        throw new BadRequestException(`无效的文件状态: ${fileStatus}`);
      }
      where.fileStatus = fileStatus as FileStatus;
    }

    this.applyExtraFilters(where, { exactPhrase, excludeTerms });
    this.applyRangeFilters(where, { dateRange, sizeRange });

    this.checkAborted(signal);

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

    const result = this.toNodeListResponse(
      nodes as Record<string, unknown>[],
      total,
      params.page,
      limit,
      (node) => ({ projectId: (node.projectId as string) || projectId }),
    );

    await this.injectAncestorPaths(result);
    return result;
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
      exactPhrase?: string | null;
      excludeTerms?: string[];
      dateRange?: { field: 'createdAt' | 'updatedAt'; operator: '>' | '<' | '>='; value: Date } | null;
      sizeRange?: { operator: '>' | '<'; value: number } | null;
    },
    signal?: AbortSignal,
  ): Promise<NodeListResponseDto> {
    const { keyword, skip, limit, sortBy, sortOrder, exactPhrase, excludeTerms, dateRange, sizeRange } = params;
    const safeLimit = Number(limit) || 50;

    // 使用 Prisma relation filter 合并两次查询为一次 JOIN
    const where: Prisma.FileSystemNodeWhereInput = {
      deletedAt: null,
      project: {
        isRoot: true,
        deletedAt: null,
        personalSpaceKey: null,
        libraryKey: null,
        OR: [
          { ownerId: userId },
          { projectMembers: { some: { userId } } },
        ],
      },
    };

    const ftsMatch = await this.ftsQueryBuilder.matchIds(keyword);
    if (ftsMatch.matched) {
      where.id = { in: [...ftsMatch.ids] };
    } else if (keyword) {
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    this.applyExtraFilters(where, { exactPhrase, excludeTerms });
    this.applyRangeFilters(where, { dateRange, sizeRange });

    this.checkAborted(signal);

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

    const result = this.toNodeListResponse(
      nodes as Record<string, unknown>[],
      total,
      params.page,
      limit,
    );

    await this.injectAncestorPaths(result);
    return result;
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
      exactPhrase?: string | null;
      excludeTerms?: string[];
      dateRange?: { field: 'createdAt' | 'updatedAt'; operator: '>' | '<' | '>='; value: Date } | null;
      sizeRange?: { operator: '>' | '<'; value: number } | null;
    },
    signal?: AbortSignal,
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
      exactPhrase,
      excludeTerms,
      dateRange,
      sizeRange,
    } = params;
    const safeLimit = Number(limit) || 50;

    this.logger.log(
      `[资源库搜索] 用户ID: ${userId}, 关键词: ${keyword}, libraryKey: ${libraryKey}, type: ${type}`
    );

    const where: Prisma.FileSystemNodeWhereInput = {
      deletedAt: null,
      libraryKey: libraryKey ? { equals: libraryKey } : { not: null },
      isRoot: false,
    };

    const ftsMatch = await this.ftsQueryBuilder.matchIds(keyword);
    if (ftsMatch.matched) {
      where.id = { in: [...ftsMatch.ids] };
    } else if (keyword) {
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    this.applyExtraFilters(where, { exactPhrase, excludeTerms });
    this.applyRangeFilters(where, { dateRange, sizeRange });

    this.logger.log(`[资源库搜索] 查询条件: ${JSON.stringify(where)}`);

    if (type === SearchType.FILE) where.isFolder = false;
    else if (type === SearchType.FOLDER) where.isFolder = true;
    if (extension) where.extension = extension;

    this.checkAborted(signal);

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

    const result = this.toNodeListResponse(
      nodes as Record<string, unknown>[],
      total,
      params.page,
      limit,
    );

    await this.injectAncestorPaths(result);
    return result;
  }

  /**
   * 搜索全部 — 合并项目和跨项目文件结果（用于项目列表页面）
   * 项目结果排在文件结果前面，统一分页
   */
  private async searchGlobal(
    userId: string,
    params: {
      keyword: string;
      filter: 'all' | 'owned' | 'joined';
      type: SearchType;
      extension?: string;
      fileStatus?: string;
      page: number;
      limit: number;
      skip: number;
      sortBy: string;
      sortOrder: 'asc' | 'desc';
      exactPhrase?: string | null;
      excludeTerms?: string[];
      dateRange?: { field: 'createdAt' | 'updatedAt'; operator: '>' | '<' | '>='; value: Date } | null;
      sizeRange?: { operator: '>' | '<'; value: number } | null;
    },
    signal?: AbortSignal,
  ): Promise<NodeListResponseDto> {
    const { skip, limit, page } = params;
    const safeLimit = Number(limit) || 50;

    const [projectResult, fileResult] = await Promise.all([
      this.searchProjects(userId, { ...params, skip: 0, limit: 1000 }, signal),
      this.searchAllProjects(userId, params, signal),
    ]);

    const projectNodes = projectResult.nodes.map((n) => ({
      ...n,
      sourceType: 'project' as const,
    }));
    const fileNodes = fileResult.nodes.map((n) => ({
      ...n,
      sourceType: 'file' as const,
    }));

    const projectCount = projectResult.total;
    const fileTotal = fileResult.total;
    const total = projectCount + fileTotal;

    const merged: FileSystemNodeDto[] = [];
    if (skip < projectCount) {
      const projSlice = projectNodes.slice(skip, skip + safeLimit);
      const remaining = safeLimit - projSlice.length;
      merged.push(...projSlice, ...fileNodes.slice(0, Math.max(0, remaining)));
    } else {
      const fileStart = skip - projectCount;
      merged.push(...fileNodes.slice(fileStart, fileStart + safeLimit));
    }

    return {
      nodes: merged,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  /**
   * 搜索个人空间 — 搜索用户个人空间内的文件
   */
  private async searchPersonalSpace(
    userId: string,
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
      exactPhrase?: string | null;
      excludeTerms?: string[];
      dateRange?: { field: 'createdAt' | 'updatedAt'; operator: '>' | '<' | '>='; value: Date } | null;
      sizeRange?: { operator: '>' | '<'; value: number } | null;
    },
    signal?: AbortSignal,
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
      exactPhrase,
      excludeTerms,
      dateRange,
      sizeRange,
    } = params;
    const safeLimit = Number(limit) || 50;

    const personalRoot = await this.prisma.fileSystemNode.findFirst({
      where: { personalSpaceKey: userId, isRoot: true, deletedAt: null },
      select: { id: true },
    });

    if (!personalRoot) {
      return { nodes: [], total: 0, page: params.page, limit, totalPages: 0 };
    }

    const allNodeIds = await this.getAllProjectNodeIds(personalRoot.id);

    const ftsMatch = await this.ftsQueryBuilder.matchIds(keyword);
    let effectiveIds: string[];
    if (ftsMatch.matched) {
      effectiveIds = allNodeIds.filter((id) => ftsMatch.ids.has(id));
      if (effectiveIds.length === 0) {
        return { nodes: [], total: 0, page: params.page, limit, totalPages: 0 };
      }
    } else {
      effectiveIds = allNodeIds;
    }

    const where: Prisma.FileSystemNodeWhereInput = {
      id: { in: effectiveIds.filter((id) => id !== personalRoot.id) },
      deletedAt: null,
      isRoot: false,
    };

    if (!ftsMatch.matched && keyword) {
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    if (type === SearchType.FILE) where.isFolder = false;
    else if (type === SearchType.FOLDER) where.isFolder = true;
    if (extension) where.extension = extension;
    if (fileStatus) {
      const validStatuses = Object.values(FileStatus) as string[];
      if (!validStatuses.includes(fileStatus)) {
        throw new BadRequestException(`无效的文件状态: ${fileStatus}`);
      }
      where.fileStatus = fileStatus as FileStatus;
    }

    this.applyExtraFilters(where, { exactPhrase, excludeTerms });
    this.applyRangeFilters(where, { dateRange, sizeRange });

    this.checkAborted(signal);

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

    const result = this.toNodeListResponse(
      nodes as Record<string, unknown>[],
      total,
      params.page,
      limit,
    );

    await this.injectAncestorPaths(result);
    return result;
  }

  /**
   * 向查询条件中注入 exactPhrase（精确短语匹配）和 excludeTerms（排除词）
   */
  private applyExtraFilters(
    where: Prisma.FileSystemNodeWhereInput,
    extra: { exactPhrase?: string | null; excludeTerms?: string[] },
  ): void {
    if (extra.exactPhrase) {
      const exactCond: Prisma.FileSystemNodeWhereInput = {
        name: { equals: extra.exactPhrase, mode: 'insensitive' },
      };
      if (where.OR) {
        (where.OR as Prisma.FileSystemNodeWhereInput[]).push(exactCond);
      } else {
        where.OR = [exactCond];
      }
    }

    if (extra.excludeTerms?.length) {
      where.NOT = {
        OR: extra.excludeTerms.map((term) => ({
          OR: [
            { name: { contains: term, mode: 'insensitive' as const } },
            { description: { contains: term, mode: 'insensitive' as const } },
          ],
        })),
      };
    }
  }

  /**
   * 注入 dateRange（modified:>/created:>）和 sizeRange（size:>）过滤条件
   */
  private applyRangeFilters(
    where: Prisma.FileSystemNodeWhereInput,
    extra: {
      dateRange?: { field: 'createdAt' | 'updatedAt'; operator: '>' | '<' | '>='; value: Date } | null;
      sizeRange?: { operator: '>' | '<'; value: number } | null;
    },
  ): void {
    if (extra.dateRange) {
      const opMap: Record<string, 'gt' | 'lt' | 'gte'> = { '>': 'gt', '<': 'lt', '>=': 'gte' };
      (where as any)[extra.dateRange.field] = { [opMap[extra.dateRange.operator]]: extra.dateRange.value };
    }
    if (extra.sizeRange) {
      const opMap: Record<string, 'gt' | 'lt'> = { '>': 'gt', '<': 'lt' };
      (where as any).size = { [opMap[extra.sizeRange.operator]]: extra.sizeRange.value };
    }
  }

  /**
   * 将 Prisma 查询结果映射为 NodeListResponseDto
   * 消除四个搜索方法中的重复映射逻辑
   */
  private toNodeListResponse(
    nodes: Record<string, unknown>[],
    total: number,
    page: number,
    limit: number,
    overrides?: (node: Record<string, unknown>) => Partial<FileSystemNodeDto>,
  ): NodeListResponseDto {
    const safeLimit = Number(limit) || 50;
    const results: FileSystemNodeDto[] = nodes.map((node) => ({
      id: node.id as string,
      name: node.name as string,
      description: node.description as string | null,
      isFolder: node.isFolder as boolean,
      isRoot: node.isRoot as boolean,
      parentId: node.parentId as string | null,
      path: node.path as string | null,
      size: node.size as number | null,
      mimeType: node.mimeType as string | null,
      fileHash: node.fileHash as string | null,
      fileStatus: node.fileStatus as FileStatus,
      createdAt: node.createdAt as Date,
      updatedAt: node.updatedAt as Date,
      deletedAt: node.deletedAt as Date | null,
      ownerId: node.ownerId as string,
      personalSpaceKey: node.personalSpaceKey as string | null,
      libraryKey: node.libraryKey as string | null,
      projectId: node.projectId as string | null,
      ...overrides?.(node),
    }));

    return {
      nodes: results,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  private async getAllProjectNodeIds(projectId: string): Promise<string[]> {
    const result = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE tree AS (
        SELECT id FROM file_system_nodes
        WHERE id = ${projectId} AND "deletedAt" IS NULL
        UNION ALL
        SELECT n.id FROM file_system_nodes n
        JOIN tree t ON n."parentId" = t.id
        WHERE n."deletedAt" IS NULL
      )
      SELECT id FROM tree
    `;

    return result.map((row) => row.id);
  }

  /**
   * 为搜索结果注入 ancestorPath（从根到父节点的面包屑路径）
   */
  private async injectAncestorPaths(result: NodeListResponseDto): Promise<void> {
    const parentIds = [
      ...new Set(
        result.nodes.map((n) => n.parentId).filter((id): id is string => !!id),
      ),
    ];
    if (parentIds.length === 0) return;

    const pathMap = await this.buildAncestorPaths(parentIds);
    result.nodes.forEach((n) => {
      if (n.parentId) {
        n.ancestorPath = pathMap.get(n.parentId);
      }
    });
  }

  /**
   * 使用批量递归 CTE 构建多个 parentId 的祖先路径
   * 返回 Map<nodeId, "根 > 父1 > 父2">
   */
  private async buildAncestorPaths(parentIds: string[]): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(parentIds.filter(Boolean))];
    if (uniqueIds.length === 0) return new Map();

    const rows = await this.prisma.$queryRaw<{ id: string; path: string | null }[]>`
      WITH RECURSIVE ancestors AS (
        SELECT id, name, "parentId", id as start_id, 0 as depth
        FROM file_system_nodes
        WHERE id = ANY(${uniqueIds}::text[])
        AND "deletedAt" IS NULL

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

  private checkAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      this.logger.log('搜索请求已通过 AbortSignal 取消');
      throw new Error('Request aborted');
    }
  }
}
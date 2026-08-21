import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { SearchDto, SearchScope, SearchType } from '../dto/search.dto';
import { FileSystemPermissionService } from '../file-permission/file-system-permission.service';
import { ProjectPermission } from '../../common/enums/permissions.enum';
import { Prisma, NodeType } from '@cloudcad/db';
import { FileStatus } from '../../common/enums/file-status.enum';
import { FtsQueryBuilder } from './fts-query-builder';
import { parseSearchQuery } from './search-query.parser';
import { AncestorQueryService } from '../../common/services/ancestor-query.service';
import { I18nContext } from 'nestjs-i18n';
import {
  NodeListResponseDto,
  FileSystemNodeDto,
} from '../dto/file-system-response.dto';
import { ISearchService } from '../interfaces/search.interface';

@Injectable()
export class SearchService implements ISearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly permissionService: FileSystemPermissionService,
    private readonly ftsQueryBuilder: FtsQueryBuilder,
    private readonly ancestorQueryService: AncestorQueryService,
  ) {}

  async search(userId: string, dto: SearchDto, signal?: AbortSignal): Promise<NodeListResponseDto> {
    let {
      keyword,
      type = SearchType.ALL,
      extension,
      fileStatus,
      sortBy = 'updatedAt',
      sortOrder = 'desc',
    } = dto;

    const {
      scope = SearchScope.PROJECT_FILES,
      filter = 'all',
      projectId,
      libraryKey,
      page = 1,
      limit = 50,
    } = dto;

    // Parse search syntax (ext:.dwg, type:file, modified:>2024-01-01, etc.)
    const parsed = parseSearchQuery(keyword);
    if (parsed.hasSyntax) {
      keyword = parsed.keyword;
      if (parsed.extension) extension = parsed.extension;
      if (parsed.type !== SearchType.ALL) type = parsed.type;
      if (parsed.fileStatus) fileStatus = parsed.fileStatus;
      if (parsed.sortBy) sortBy = parsed.sortBy;
      if (parsed.sortOrder) sortOrder = parsed.sortOrder;
    }

    const ALLOWED_SORT_FIELDS = ['name', 'createdAt', 'updatedAt', 'size'] as const;
    if (!(ALLOWED_SORT_FIELDS as readonly string[]).includes(sortBy)) {
      throw new BadRequestException(I18nContext.current()?.t('error.file_extra.sort_unsupported', { args: { field: sortBy } }) ?? `不支持的排序字段: ${sortBy}`);
    }

    const skip = (page - 1) * limit;

    // Explicit DTO fields override parsed syntax
    const dateRange =
      dto.modifiedAtFrom || dto.modifiedAtTo
        ? {
            field: 'updatedAt' as const,
            gte: dto.modifiedAtFrom ? new Date(dto.modifiedAtFrom) : undefined,
            lte: dto.modifiedAtTo ? new Date(dto.modifiedAtTo) : undefined,
          }
      : dto.createdAtFrom || dto.createdAtTo
        ? {
            field: 'createdAt' as const,
            gte: dto.createdAtFrom ? new Date(dto.createdAtFrom) : undefined,
            lte: dto.createdAtTo ? new Date(dto.createdAtTo) : undefined,
          }
      : parsed.dateRange;

    const sizeRange =
      dto.sizeMin !== undefined || dto.sizeMax !== undefined
        ? { gte: dto.sizeMin, lte: dto.sizeMax }
      : parsed.sizeRange;

    const extra = {
      exactPhrase: parsed.exactPhrase,
      excludeTerms: parsed.excludeTerms,
      dateRange,
      sizeRange,
      modifiedAtFrom: dto.modifiedAtFrom,
      modifiedAtTo: dto.modifiedAtTo,
      createdAtFrom: dto.createdAtFrom,
      createdAtTo: dto.createdAtTo,
      sizeMin: dto.sizeMin,
      sizeMax: dto.sizeMax,
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
          throw new BadRequestException(I18nContext.current()?.t('error.file.search_missing_project_id') ?? '搜索项目文件时必须提供 projectId');
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
        throw new BadRequestException(I18nContext.current()?.t('error.file_extra.search_scope_unsupported', { args: { scope } }) ?? `不支持的搜索范围: ${scope}`);
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
      dateRange?: { field: 'createdAt' | 'updatedAt'; operator: '>' | '<' | '>='; value: Date } | { field: 'createdAt' | 'updatedAt'; gte?: Date; lte?: Date } | null;
      sizeRange?: { operator: '>' | '<'; value: number } | { gte?: number; lte?: number } | null;
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
      nodeType: NodeType.PROJECT,
      deletedAt: null,
      AND: [
        { nodeType: { not: NodeType.PERSONAL_SPACE } },
        { nodeType: { notIn: [NodeType.LIBRARY_DRAWING, NodeType.LIBRARY_BLOCK] } },
      ],
    };

    const andFilters: Prisma.FileSystemNodeWhereInput[] = [...permissionAnd];

    if (keyword) {
      const ftsMatch = await this.ftsQueryBuilder.matchIds(keyword);
      where.OR = this.ftsQueryBuilder.buildSearchOrConditions(keyword, ftsMatch);
    }

    this.applyExtraFilters(where, { exactPhrase, excludeTerms });
    this.applyRangeFilters(where, andFilters, { dateRange, sizeRange });

    if (andFilters.length > 0) {
      where.AND = andFilters;
    }

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
      dateRange?: { field: 'createdAt' | 'updatedAt'; operator: '>' | '<' | '>='; value: Date } | { field: 'createdAt' | 'updatedAt'; gte?: Date; lte?: Date } | null;
      sizeRange?: { operator: '>' | '<'; value: number } | { gte?: number; lte?: number } | null;
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

    // 项目范围限定：子树内所有节点（FILE/FOLDER 的 projectId 字段均指向项目根，
    // 见 project-crud/file-tree 创建路径；relation filter 避免 `id IN (全子树 ID)` 参数展开，见 #225）
    const where: Prisma.FileSystemNodeWhereInput = {
      projectId,
      deletedAt: null,
      nodeType: { not: NodeType.PROJECT },
    };

    const andFilters: Prisma.FileSystemNodeWhereInput[] = [];

    if (keyword) {
      const ftsMatch = await this.ftsQueryBuilder.matchIds(keyword);
      where.OR = this.ftsQueryBuilder.buildSearchOrConditions(keyword, ftsMatch);
    }

    if (type === SearchType.FILE) where.nodeType = NodeType.FILE;
    else if (type === SearchType.FOLDER) where.nodeType = NodeType.FOLDER;
    if (extension) {
      const extensions = extension.split(',').map(s => s.trim()).filter(Boolean);
      if (extensions.length > 0) {
        andFilters.push({
          OR: [{ nodeType: NodeType.FOLDER }, { extension: { in: extensions } }],
        });
      }
    }
    if (fileStatus) {
      const statuses = fileStatus.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length > 0) where.fileStatus = { in: statuses as FileStatus[] };
    }

    this.applyExtraFilters(where, { exactPhrase, excludeTerms });
    this.applyRangeFilters(where, andFilters, { dateRange, sizeRange });

    if (andFilters.length > 0) {
      where.AND = andFilters;
    }

    this.checkAborted(signal);

    const [nodes, total] = await Promise.all([
      this.prisma.fileSystemNode.findMany({
        where,
        skip,
        take: safeLimit,
        orderBy: [{ nodeType: 'desc' }, { [sortBy]: sortOrder }],
        select: {
          id: true,
          name: true,
          description: true,
          nodeType: true,
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
      extension?: string;
      exactPhrase?: string | null;
      excludeTerms?: string[];
      dateRange?: { field: 'createdAt' | 'updatedAt'; operator: '>' | '<' | '>='; value: Date } | { field: 'createdAt' | 'updatedAt'; gte?: Date; lte?: Date } | null;
      sizeRange?: { operator: '>' | '<'; value: number } | { gte?: number; lte?: number } | null;
    },
    signal?: AbortSignal,
  ): Promise<NodeListResponseDto> {
    const { keyword, skip, limit, sortBy, sortOrder, extension, exactPhrase, excludeTerms, dateRange, sizeRange } = params;
    const safeLimit = Number(limit) || 50;

    // 使用 Prisma relation filter 合并两次查询为一次 JOIN
    const where: Prisma.FileSystemNodeWhereInput = {
      deletedAt: null,
      project: {
        nodeType: NodeType.PROJECT,
        deletedAt: null,
        AND: [
          { nodeType: { not: NodeType.PERSONAL_SPACE } },
          { nodeType: { notIn: [NodeType.LIBRARY_DRAWING, NodeType.LIBRARY_BLOCK] } },
        ],
        OR: [
          { ownerId: userId },
          { projectMembers: { some: { userId } } },
        ],
      },
    };

    const andFilters: Prisma.FileSystemNodeWhereInput[] = [];

    if (keyword) {
      const ftsMatch = await this.ftsQueryBuilder.matchIds(keyword);
      where.OR = this.ftsQueryBuilder.buildSearchOrConditions(keyword, ftsMatch);
    }

    if (extension) {
      const extensions = extension.split(',').map(s => s.trim()).filter(Boolean);
      if (extensions.length > 0) {
        andFilters.push({
          OR: [{ nodeType: NodeType.FOLDER }, { extension: { in: extensions } }],
        });
      }
    }

    this.applyExtraFilters(where, { exactPhrase, excludeTerms });
    this.applyRangeFilters(where, andFilters, { dateRange, sizeRange });

    if (andFilters.length > 0) {
      where.AND = andFilters;
    }

    this.checkAborted(signal);

    const [nodes, total] = await Promise.all([
      this.prisma.fileSystemNode.findMany({
        where,
        skip,
        take: safeLimit,
        orderBy: [{ nodeType: 'desc' }, { [sortBy]: sortOrder }],
        select: {
          id: true,
          name: true,
          description: true,
          nodeType: true,
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
      fileStatus?: string;
      page: number;
      limit: number;
      skip: number;
      sortBy: string;
      sortOrder: 'asc' | 'desc';
      exactPhrase?: string | null;
      excludeTerms?: string[];
      dateRange?: { field: 'createdAt' | 'updatedAt'; operator: '>' | '<' | '>='; value: Date } | { field: 'createdAt' | 'updatedAt'; gte?: Date; lte?: Date } | null;
      sizeRange?: { operator: '>' | '<'; value: number } | { gte?: number; lte?: number } | null;
    },
    signal?: AbortSignal,
  ): Promise<NodeListResponseDto> {
    const {
      keyword,
      libraryKey,
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

    this.logger.log(
      `[资源库搜索] 用户ID: ${userId}, 关键词: ${keyword}, libraryKey: ${libraryKey}, type: ${type}`
    );

    // 先找到资源库根节点，再按 projectId 搜索库内所有内容
    const libraryNodeType = libraryKey === 'drawing'
      ? NodeType.LIBRARY_DRAWING
      : libraryKey === 'block'
        ? NodeType.LIBRARY_BLOCK
        : undefined;
    const libraryRoots = await this.prisma.fileSystemNode.findMany({
      where: {
        ...(libraryNodeType ? { nodeType: libraryNodeType } : { nodeType: { in: [NodeType.LIBRARY_DRAWING, NodeType.LIBRARY_BLOCK] } }),
        deletedAt: null,
      },
      select: { id: true },
    });
    const libraryRootIds = libraryRoots.map(r => r.id);

    const libraryScope: Prisma.FileSystemNodeWhereInput = {
      OR: [
        { projectId: { in: libraryRootIds } },
        { id: { in: libraryRootIds } },
      ],
    };

    const where: Prisma.FileSystemNodeWhereInput = {
      deletedAt: null,
      AND: [libraryScope] as Prisma.FileSystemNodeWhereInput[],
    };

    const andFilters: Prisma.FileSystemNodeWhereInput[] = [];

    if (keyword) {
      const ftsMatch = await this.ftsQueryBuilder.matchIds(keyword);
      (where.AND as Prisma.FileSystemNodeWhereInput[]).push({
        OR: this.ftsQueryBuilder.buildSearchOrConditions(keyword, ftsMatch),
      });
    }

    this.applyExtraFilters(where, { exactPhrase, excludeTerms });
    this.applyRangeFilters(where, andFilters, { dateRange, sizeRange });

    if (andFilters.length > 0) {
      where.AND = andFilters;
    }

    this.logger.log(`[资源库搜索] 查询条件: ${JSON.stringify(where)}`);

    if (type === SearchType.FILE) where.nodeType = NodeType.FILE;
    else if (type === SearchType.FOLDER) where.nodeType = NodeType.FOLDER;
    if (extension) {
      const extensions = extension.split(',').map(s => s.trim()).filter(Boolean);
      if (extensions.length > 0) where.extension = { in: extensions };
    }

    this.checkAborted(signal);

    const [nodes, total] = await Promise.all([
      this.prisma.fileSystemNode.findMany({
        where,
        skip,
        take: safeLimit,
        orderBy: [{ nodeType: 'desc' }, { [sortBy]: sortOrder }],
        select: {
          id: true,
          name: true,
          description: true,
          nodeType: true,
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
      dateRange?: { field: 'createdAt' | 'updatedAt'; operator: '>' | '<' | '>='; value: Date } | { field: 'createdAt' | 'updatedAt'; gte?: Date; lte?: Date } | null;
      sizeRange?: { operator: '>' | '<'; value: number } | { gte?: number; lte?: number } | null;
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
      dateRange?: { field: 'createdAt' | 'updatedAt'; operator: '>' | '<' | '>='; value: Date } | { field: 'createdAt' | 'updatedAt'; gte?: Date; lte?: Date } | null;
      sizeRange?: { operator: '>' | '<'; value: number } | { gte?: number; lte?: number } | null;
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
      where: { ownerId: userId, nodeType: NodeType.PERSONAL_SPACE, deletedAt: null },
      select: { id: true },
    });

    if (!personalRoot) {
      return { nodes: [], total: 0, page: params.page, limit, totalPages: 0 };
    }

    // 个人空间范围限定：ps-root 全子树（各项目内容 + 顶层直挂节点），语义对齐
    // 旧实现（ps-root 全子树递归 CTE）沿 parentId 向下展开。注意与 searchProjectFiles 不同：
    // 个人空间内各项目成员的 projectId=各自项目根，PROJECT 根自身 projectId=null
    // （project-crud.service.ts 创建路径），不能用单一 projectId 过滤；
    // 改用 relation filter + parentId 组合（避免 `id IN (全子树 ID)` 参数展开，见 #225）。
    const andFilters: Prisma.FileSystemNodeWhereInput[] = [
      {
        OR: [
          // 各项目成员节点：projectId 指向个人空间下某项目根（project relation 过滤）
          { project: { nodeType: NodeType.PROJECT, parentId: personalRoot.id } },
          // 个人空间直挂区域节点（任意深度，projectId 均指向个人空间根）
          { projectId: personalRoot.id },
          // 顶层直挂节点：含 PROJECT 根自身（projectId=null，仅能经 parentId 匹配），
          // 同时兜底 projectId 缺失的历史数据
          { parentId: personalRoot.id },
        ],
      },
    ];

    const where: Prisma.FileSystemNodeWhereInput = {
      deletedAt: null,
      nodeType: { not: NodeType.PERSONAL_SPACE },
    };

    if (keyword) {
      const ftsMatch = await this.ftsQueryBuilder.matchIds(keyword);
      where.OR = this.ftsQueryBuilder.buildSearchOrConditions(keyword, ftsMatch);
    }

    if (type === SearchType.FILE) where.nodeType = NodeType.FILE;
    else if (type === SearchType.FOLDER) where.nodeType = NodeType.FOLDER;
    if (extension) {
      const extensions = extension.split(',').map(s => s.trim()).filter(Boolean);
      if (extensions.length > 0) {
        andFilters.push({
          OR: [{ nodeType: NodeType.FOLDER }, { extension: { in: extensions } }],
        });
      }
    }
    if (fileStatus) {
      const statuses = fileStatus.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length > 0) where.fileStatus = { in: statuses as FileStatus[] };
    }

    this.applyExtraFilters(where, { exactPhrase, excludeTerms });
    this.applyRangeFilters(where, andFilters, { dateRange, sizeRange });

    if (andFilters.length > 0) {
      where.AND = andFilters;
    }

    this.checkAborted(signal);

    const [nodes, total] = await Promise.all([
      this.prisma.fileSystemNode.findMany({
        where,
        skip,
        take: safeLimit,
        orderBy: [{ nodeType: 'desc' }, { [sortBy]: sortOrder }],
        select: {
          id: true,
          name: true,
          description: true,
          nodeType: true,
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
        const orArr = Array.isArray(where.OR) ? where.OR : [where.OR];
        orArr.push(exactCond);
        where.OR = orArr;
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
   * 支持新旧两种格式：
   *   - 旧: { field, operator, value }（来自搜索语法解析器）
   *   - 新: { field, gte?, lte? }（来自 DTO 字段）
   */
  private applyRangeFilters(
    where: Prisma.FileSystemNodeWhereInput,
    andFilters: Prisma.FileSystemNodeWhereInput[],
    extra: {
      dateRange?:
        | { field: 'createdAt' | 'updatedAt'; operator: '>' | '<' | '>='; value: Date }
        | { field: 'createdAt' | 'updatedAt'; gte?: Date; lte?: Date }
        | null;
      sizeRange?:
        | { operator: '>' | '<'; value: number }
        | { gte?: number; lte?: number }
        | null;
    },
  ): void {
    if (extra.dateRange) {
      const dtFilter: { gte?: Date; lte?: Date; gt?: Date; lt?: Date } = {};
      if ('gte' in extra.dateRange || 'lte' in extra.dateRange) {
        const dr = extra.dateRange as { field: 'createdAt' | 'updatedAt'; gte?: Date; lte?: Date };
        if (dr.gte) dtFilter.gte = dr.gte;
        if (dr.lte) dtFilter.lte = dr.lte;
      } else {
        const dr = extra.dateRange as { field: 'createdAt' | 'updatedAt'; operator: '>' | '<' | '>='; value: Date };
        if (dr.operator === '>') dtFilter.gt = dr.value;
        else if (dr.operator === '<') dtFilter.lt = dr.value;
        else if (dr.operator === '>=') dtFilter.gte = dr.value;
      }
      if (Object.keys(dtFilter).length > 0) {
        const field = extra.dateRange.field;
        if (field === 'updatedAt') {
          where.updatedAt = dtFilter;
        } else {
          where.createdAt = dtFilter;
        }
      }
    }
    if (extra.sizeRange) {
      const szFilter: { gte?: number; lte?: number; gt?: number; lt?: number } = {};
      if ('gte' in extra.sizeRange || 'lte' in extra.sizeRange) {
        const sr = extra.sizeRange as { gte?: number; lte?: number };
        if (sr.gte !== undefined) szFilter.gte = sr.gte;
        if (sr.lte !== undefined) szFilter.lte = sr.lte;
      } else {
        const sr = extra.sizeRange as { operator: string; value: number };
        if (sr.operator === '>') szFilter.gt = sr.value;
        else if (sr.operator === '<') szFilter.lt = sr.value;
      }
      if (Object.keys(szFilter).length > 0) {
        andFilters.push({
          OR: [{ nodeType: NodeType.FOLDER }, { size: szFilter }],
        });
      }
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
    const results: FileSystemNodeDto[] = nodes.map((node) => {
      const nodeType = node.nodeType as NodeType;
      const isFolder = nodeType !== NodeType.FILE;
      const isRoot = nodeType === NodeType.PROJECT || nodeType === NodeType.PERSONAL_SPACE || nodeType === NodeType.LIBRARY_DRAWING || nodeType === NodeType.LIBRARY_BLOCK;
      const personalSpaceKey = nodeType === NodeType.PERSONAL_SPACE ? (node.ownerId as string) : null;
      const libraryKey = nodeType === NodeType.LIBRARY_DRAWING ? 'drawing' : nodeType === NodeType.LIBRARY_BLOCK ? 'block' : null;

      return {
        id: node.id as string,
        name: node.name as string,
        description: node.description as string | null,
        nodeType,
        isFolder,
        isRoot,
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
        personalSpaceKey,
        libraryKey,
        projectId: node.projectId as string | null,
        ...overrides?.(node),
      };
    });

    return {
      nodes: results,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / safeLimit),
    };
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
    return this.ancestorQueryService.buildAncestorPaths(parentIds, false);
  }

  private checkAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      this.logger.log('搜索请求已通过 AbortSignal 取消');
      throw new Error('Request aborted');
    }
  }
}
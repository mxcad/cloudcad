///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable } from '@nestjs/common';
import { FileStatus, NodeType, Prisma } from '@cloudcad/db';
import { DatabaseService } from '../../database/database.service';

export interface SubtreeFileInfo {
  id: string;
  path: string | null;
  fileHash: string | null;
}

/** 子树节点行（getSubtreeRows 返回，复制计划等批量场景用） */
export type SubtreeRowInfo = {
  id: string;
  parentId: string | null;
  name: string;
  originalName: string | null;
  nodeType: NodeType;
  path: string | null;
  size: number | null;
  mimeType: string | null;
  extension: string | null;
  fileStatus: FileStatus | null;
  fileHash: string | null;
  description: string | null;
};

export interface GetSubtreeIdsOptions {
  includeRoot?: boolean;
  includeDeleted?: boolean;
}

export interface GetSubtreeFileIdsOptions {
  /** 默认 true：包含已删除节点（对齐 getSubtreeIds 语义） */
  includeDeleted?: boolean;
}

export interface GetSubtreeFilesPaginatedOptions {
  /** 默认 true：包含已删除节点（对齐 getSubtreeIds 语义） */
  includeDeleted?: boolean;
  /** 页码，默认 1 */
  page?: number;
  /** 每页数量，默认 50 */
  limit?: number;
  /** 排序字段（白名单：name/createdAt/updatedAt/size），默认 createdAt */
  sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'size';
  /** 排序方向，默认 desc */
  sortOrder?: 'asc' | 'desc';
}

export interface SubtreeFilesPage {
  rows: SubtreeFileInfo[];
  total: number;
}

export interface GetSubtreeFilesFilteredOptions extends GetSubtreeFilesPaginatedOptions {
  /** extension 过滤（ANY 数组打包下推，不展开 id 参数，规避 65535 上限，见 #272） */
  extensions?: string[];
  /** fileStatus 过滤（ANY 数组打包下推） */
  statuses?: string[];
  /** FTS 预匹配 id 集（≤200，来自 FtsQueryBuilder.matchIds），非空时按 `n."id" = ANY(...)` 数组打包 */
  ftsMatchIds?: string[];
  /** 搜索关键词：FTS 未命中时退化为 name/description ILIKE 子串匹配（对齐 buildSearchOrConditions 兜底语义） */
  keyword?: string;
}

/** 分页下推可排序字段白名单（列名经映射后拼接，防注入） */
const SORTABLE_COLUMNS: Record<string, string> = {
  name: '"name"',
  createdAt: '"createdAt"',
  updatedAt: '"updatedAt"',
  size: '"size"',
};

/**
 * 树遍历深 module（#225 重构实施）
 *
 * 职责: projectId 解析 + 子树遍历的单一入口，全部走 SQL CTE（无 JS 递归 N+1）。
 * 语义约定（grilling 决议 1/3/4/5）:
 * - 广义根: "项目根 = 非 FILE/FOLDER 节点（PROJECT / PERSONAL_SPACE / LIBRARY 根）"，
 *   resolveProjectId 沿祖先链找第一个非 FILE/FOLDER 节点（含自身），不读 projectId 字段短路，
 *   因此个人空间根（创建时 projectId 字段为 null）也能解析为自身。
 * - getSubtreeIds 默认 `{ includeRoot: false, includeDeleted: true }`（保持 trash/copy-move 语义）；
 *   includeDeleted: false 仅 findFileByHashInProject；includeRoot: true 用于 file-tree 项目范围检索
 *   与 trash 整树更新（search 已改走 relation filter，#256，不再使用 getSubtreeIds）。
 */
@Injectable()
export class TreeWalker {
  constructor(private readonly prisma: DatabaseService) {}

  /**
   * 沿祖先链（含自身）找第一个非 FILE/FOLDER 节点，返回其 id。
   * 节点缺失返回 null；个人空间根（projectId 字段为 null）返回自身 id。
   */
  async resolveProjectId(nodeId: string): Promise<string | null> {
    const result = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE ancestors AS (
        SELECT id, "parentId", "nodeType" FROM file_system_nodes WHERE id = ${nodeId}
        UNION ALL
        SELECT n.id, n."parentId", n."nodeType"
        FROM file_system_nodes n
        INNER JOIN ancestors a ON n.id = a."parentId"
      )
      SELECT id FROM ancestors
      WHERE "nodeType" NOT IN (${NodeType.FILE}, ${NodeType.FOLDER})
      LIMIT 1
    `;
    return result[0]?.id ?? null;
  }

  /**
   * 返回 rootId 子树的全部节点 id。
   * - includeRoot: true 时包含 rootId 自身（默认 false）
   * - includeDeleted: true 时包含已删除节点（默认 true）；false 时遍历中剪枝，
   *   已删除节点及其后代一并排除（对齐 getAllNodeIdsInProject 语义）
   */
  async getSubtreeIds(
    rootId: string,
    options: GetSubtreeIdsOptions = {}
  ): Promise<string[]> {
    const { includeRoot = false, includeDeleted = true } = options;
    const result = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE tree AS (
        SELECT id, "deletedAt", 0 AS depth FROM file_system_nodes WHERE id = ${rootId}
        UNION ALL
        SELECT n.id, n."deletedAt", t.depth + 1 FROM file_system_nodes n
        INNER JOIN tree t ON n."parentId" = t.id
        WHERE t.depth < 50 AND (${includeDeleted} OR n."deletedAt" IS NULL)
      )
      SELECT id FROM tree
      WHERE ${includeRoot} OR id != ${rootId}
    `;
    return result.map((row) => row.id);
  }

  /** 返回 rootId 子树中的全部 FILE 节点（不含 rootId 自身），形状 `{ id, path, fileHash }`。 */
  async getSubtreeFiles(rootId: string): Promise<SubtreeFileInfo[]> {
    const result = await this.prisma.$queryRaw<SubtreeFileInfo[]>`
      WITH RECURSIVE tree AS (
        SELECT id, 0 AS depth FROM file_system_nodes WHERE id = ${rootId}
        UNION ALL
        SELECT n.id, t.depth + 1 FROM file_system_nodes n
        INNER JOIN tree t ON n."parentId" = t.id
        WHERE t.depth < 50
      )
      SELECT n.id, n.path, n."fileHash"
      FROM file_system_nodes n
      INNER JOIN tree t ON n.id = t.id
      WHERE n."nodeType" = ${NodeType.FILE} AND n.id != ${rootId}
    `;
    return result;
  }

  /** 返回 rootId 子树中的全部 FOLDER 节点 id（不含 rootId 自身）。 */
  async getSubtreeFolderIds(rootId: string): Promise<string[]> {
    const result = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE tree AS (
        SELECT id, 0 AS depth FROM file_system_nodes WHERE id = ${rootId}
        UNION ALL
        SELECT n.id, t.depth + 1 FROM file_system_nodes n
        INNER JOIN tree t ON n."parentId" = t.id
        WHERE t.depth < 50
      )
      SELECT n.id FROM file_system_nodes n
      INNER JOIN tree t ON n.id = t.id
      WHERE n."nodeType" = ${NodeType.FOLDER} AND n.id != ${rootId}
    `;
    return result.map((row) => row.id);
  }

  /**
   * 判断 candidateDescendantId 是否位于 ancestorId 的子树中
   * （即把前者移动/复制到后者下方会形成父子环）。
   * 沿 candidate 的祖先链上溯查找 ancestor，深度保护 depth < 50。
   */
  async isDescendantOf(
    candidateDescendantId: string,
    ancestorId: string
  ): Promise<boolean> {
    const result = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE ancestors AS (
        SELECT id, "parentId", 0 AS depth FROM file_system_nodes WHERE id = ${candidateDescendantId}
        UNION ALL
        SELECT n.id, n."parentId", a.depth + 1
        FROM file_system_nodes n
        INNER JOIN ancestors a ON n.id = a."parentId"
        WHERE a.depth < 50
      )
      SELECT id FROM ancestors WHERE id = ${ancestorId} LIMIT 1
    `;
    return result.length > 0;
  }

  /**
   * 返回 rootId 子树的全部节点行（不含 rootId 自身，排除已删除），
   * 供复制计划等批量场景使用。深度保护 depth < 50（对齐 getSubtreeFileIds 先例）。
   */
  async getSubtreeRows(rootId: string): Promise<SubtreeRowInfo[]> {
    return this.prisma.$queryRaw<
      {
        id: string;
        parentId: string | null;
        name: string;
        originalName: string | null;
        nodeType: NodeType;
        path: string | null;
        size: number | null;
        mimeType: string | null;
        extension: string | null;
        fileStatus: FileStatus | null;
        fileHash: string | null;
        description: string | null;
      }[]
    >`
      WITH RECURSIVE tree AS (
        SELECT id, 0 AS depth FROM file_system_nodes WHERE id = ${rootId}
        UNION ALL
        SELECT n.id, t.depth + 1 FROM file_system_nodes n
        INNER JOIN tree t ON n."parentId" = t.id
        WHERE t.depth < 50
      )
      SELECT n.id, n."parentId", n.name, n."originalName", n."nodeType", n.path,
             n.size, n."mimeType", n.extension, n."fileStatus"::text AS "fileStatus",
             n."fileHash", n.description
      FROM file_system_nodes n
      INNER JOIN tree t ON n.id = t.id
      WHERE n."deletedAt" IS NULL AND n.id != ${rootId}
    `;
  }

  /**
   * 返回 rootId 子树中的全部 FILE 节点 id（不含 rootId 自身），单次 CTE 查询。
   * - includeDeleted: false 时遍历中剪枝已删除节点及其后代（对齐 getSubtreeIds 语义）
   * - 深度保护 depth < 50（对齐 file-tree.service getAncestorChain 先例），防循环引用死循环
   */
  async getSubtreeFileIds(
    rootId: string,
    options: GetSubtreeFileIdsOptions = {}
  ): Promise<string[]> {
    const { includeDeleted = true } = options;
    const result = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE tree AS (
        SELECT id, 0 AS depth FROM file_system_nodes WHERE id = ${rootId}
        UNION ALL
        SELECT n.id, t.depth + 1 FROM file_system_nodes n
        INNER JOIN tree t ON n."parentId" = t.id
        WHERE t.depth < 50 AND (${includeDeleted} OR n."deletedAt" IS NULL)
      )
      SELECT n.id FROM file_system_nodes n
      INNER JOIN tree t ON n.id = t.id
      WHERE n."nodeType" = ${NodeType.FILE} AND n.id != ${rootId}
    `;
    return result.map((row) => row.id);
  }

  /**
   * 分页下推版子树文件查询：LIMIT/OFFSET 在递归结果上按稳定排序（用户排序 + id 兜底）生效，
   * 避免"先全量收集、后分页"的无用功；total 经窗口函数同查询返回，无需二次 count。
   * - 返回形状兼容 { id, path, fileHash }，额外附带 total
   * - includeDeleted: false 时遍历中剪枝已删除节点及其后代
   * - 深度保护 depth < 50（对齐 file-tree.service getAncestorChain 先例）
   *
   * 无过滤即过滤版的特例（filterClause 退化为 true），委托实现避免 CTE 复制（code-review #271/#272）
   */
  async getSubtreeFilesPaginated(
    rootId: string,
    options: GetSubtreeFilesPaginatedOptions = {}
  ): Promise<SubtreeFilesPage> {
    return this.getSubtreeFilesFilteredPaginated(rootId, options);
  }

  /**
   * 过滤版子树文件分页查询（#272）：extension/fileStatus 列级过滤 + FTS 预匹配集
   * ANY 数组打包全部在 CTE 内完成，findMany 仅按页内 id（≤ limit）取详情，
   * 消除"先全量收集 id → `id: { in: allFileIds }` 展开"导致的 65535 参数上限。
   *
   * 过滤语义对齐 file-tree.service 原实现：
   * - extension AND fileStatus AND (FTS 命中集 OR name/description ILIKE)
   * - FTS 预匹配集为空时仅 ILIKE 兜底（对齐 buildSearchOrConditions 未命中分支）
   * - 分页/总数/深度保护/排序稳定与 getSubtreeFilesPaginated 一致
   */
  async getSubtreeFilesFilteredPaginated(
    rootId: string,
    options: GetSubtreeFilesFilteredOptions = {}
  ): Promise<SubtreeFilesPage> {
    const {
      includeDeleted = true,
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      extensions,
      statuses,
      ftsMatchIds,
      keyword,
    } = options;
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Number(limit) || 50);
    const offset = (safePage - 1) * safeLimit;
    const sortClause = Prisma.raw(
      `${SORTABLE_COLUMNS[sortBy] ?? SORTABLE_COLUMNS.createdAt} ${
        sortOrder === 'asc' ? 'ASC' : 'DESC'
      }`
    );
    const filterClause = this.buildFilterClause({
      extensions,
      statuses,
      ftsMatchIds,
      keyword,
    });

    const rows = await this.prisma.$queryRaw<
      (SubtreeFileInfo & { total: number })[]
    >`
      WITH RECURSIVE tree AS (
        SELECT id, 0 AS depth FROM file_system_nodes WHERE id = ${rootId}
        UNION ALL
        SELECT n.id, t.depth + 1 FROM file_system_nodes n
        INNER JOIN tree t ON n."parentId" = t.id
        WHERE t.depth < 50 AND (${includeDeleted} OR n."deletedAt" IS NULL)
      )
      SELECT n.id, n.path, n."fileHash", COUNT(*) OVER ()::int AS total
      FROM file_system_nodes n
      INNER JOIN tree t ON n.id = t.id
      WHERE n."nodeType" = ${NodeType.FILE} AND n.id != ${rootId}
        AND ${filterClause}
      ORDER BY ${sortClause}, n.id ASC
      LIMIT ${safeLimit} OFFSET ${offset}
    `;
    if (rows.length > 0) {
      return { rows, total: rows[0].total };
    }
    const countRows = await this.prisma.$queryRaw<{ count: number }[]>`
      WITH RECURSIVE tree AS (
        SELECT id, 0 AS depth FROM file_system_nodes WHERE id = ${rootId}
        UNION ALL
        SELECT n.id, t.depth + 1 FROM file_system_nodes n
        INNER JOIN tree t ON n."parentId" = t.id
        WHERE t.depth < 50 AND (${includeDeleted} OR n."deletedAt" IS NULL)
      )
      SELECT COUNT(*)::int AS count
      FROM file_system_nodes n
      INNER JOIN tree t ON n.id = t.id
      WHERE n."nodeType" = ${NodeType.FILE} AND n.id != ${rootId}
        AND ${filterClause}
    `;
    return { rows: [], total: countRows[0]?.count ?? 0 };
  }

  /**
   * 构建过滤 WHERE 子句（#272）：
   * extension / fileStatus 列级 ANY 数组打包（恒定参数个数，不随子树规模增长），
   * FTS 预匹配集 `n."id" = ANY(...)` 数组打包（≤200 条），keyword 退化为 ILIKE。
   * 条件间语义：extension AND fileStatus AND (FTS 集 OR ILIKE...)
   */
  private buildFilterClause(options: {
    extensions?: string[];
    statuses?: string[];
    ftsMatchIds?: string[];
    keyword?: string;
  }): Prisma.Sql {
    const andConditions: Prisma.Sql[] = [];
    const { extensions, statuses, ftsMatchIds, keyword } = options;

    if (extensions && extensions.length > 0) {
      andConditions.push(
        Prisma.sql`n."extension" = ANY(${extensions}::text[])`
      );
    }
    if (statuses && statuses.length > 0) {
      andConditions.push(
        Prisma.sql`n."fileStatus"::text = ANY(${statuses}::text[])`
      );
    }
    const searchOrConditions: Prisma.Sql[] = [];
    if (ftsMatchIds && ftsMatchIds.length > 0) {
      searchOrConditions.push(Prisma.sql`n."id" = ANY(${ftsMatchIds}::text[])`);
    }
    if (keyword) {
      const like = `%${keyword}%`;
      searchOrConditions.push(
        Prisma.sql`n."name" ILIKE ${like}`,
        Prisma.sql`n."description" ILIKE ${like}`
      );
    }
    if (searchOrConditions.length > 0) {
      andConditions.push(
        Prisma.sql`(${Prisma.join(searchOrConditions, ' OR ')})`
      );
    }

    if (andConditions.length === 0) {
      return Prisma.sql`true`;
    }
    return Prisma.sql`${Prisma.join(andConditions, ' AND ')}`;
  }
}

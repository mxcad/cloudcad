import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@cloudcad/db';
import { DatabaseService } from '../../database/database.service';

export interface FtsMatchResult {
  ids: Set<string>;
  matched: boolean;
}

@Injectable()
export class FtsQueryBuilder {
  private readonly logger = new Logger(FtsQueryBuilder.name);

  constructor(private readonly prisma: DatabaseService) {}

  /**
   * 使用 tsvector 全文索引预匹配 keyword，返回匹配的节点 ID 集合。
   * 命中时走 GIN 索引扫描，未命中返回 { matched: false }。
   *
   * 注意：FTS 使用词级分词（plainto_tsquery），对短关键词或子串匹配不充分，
   * 调用方应始终将 ILIKE 作为 OR 条件与 FTS 结果合并，而非互斥使用。
   *
   * @param scopeWhere 可选的附加 WHERE 条件 (Prisma.Sql)，如 Prisma.sql`"parentId" = ${id}`
   */
  async matchIds(keyword: string, maxResults = 200, scopeWhere?: Prisma.Sql): Promise<FtsMatchResult> {
    if (!keyword || !keyword.trim()) {
      return { ids: new Set(), matched: false };
    }

    try {
      const conditions: Prisma.Sql[] = [Prisma.sql`"searchVector" @@ plainto_tsquery('simple', ${keyword})`];
      if (scopeWhere) {
        conditions.push(scopeWhere);
      }
      const query = Prisma.sql`
        SELECT "id" FROM "file_system_nodes"
        WHERE ${Prisma.join(conditions, ' AND ')}
        LIMIT ${maxResults}
      `;
      const rows = await this.prisma.$queryRaw<{ id: string }[]>(query);

      if (rows.length > 0) {
        this.logger.debug(`FTS matched ${rows.length} nodes for "${keyword}"`);
        return { ids: new Set(rows.map((r) => r.id)), matched: true };
      }

      return { ids: new Set(), matched: false };
    } catch (err) {
      this.logger.warn(`FTS pre-filter error, falling back to ILIKE: ${(err as Error).message}`);
      return { ids: new Set(), matched: false };
    }
  }

  /**
   * 构建搜索 OR 条件：将 FTS 匹配结果与 ILIKE 子串匹配合并。
   * 确保 FTS 词级匹配不到的文件（如 "m" 搜不到 "mx.dwg"）仍能通过 ILIKE 找到。
   */
  buildSearchOrConditions(
    keyword: string,
    ftsMatch: FtsMatchResult,
  ): Prisma.FileSystemNodeWhereInput[] {
    const ilikeConditions: Prisma.FileSystemNodeWhereInput[] = [
      { name: { contains: keyword, mode: 'insensitive' } },
      { description: { contains: keyword, mode: 'insensitive' } },
    ];

    if (ftsMatch.matched) {
      return [
        { id: { in: [...ftsMatch.ids] } },
        ...ilikeConditions,
      ];
    }

    return ilikeConditions;
  }
}

import { Injectable, Logger } from '@nestjs/common';
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
   * 命中时走 GIN 索引扫描，未命中返回 { matched: false } 触发 ILIKE 回退。
   */
  async matchIds(keyword: string, maxResults = 200): Promise<FtsMatchResult> {
    if (!keyword || !keyword.trim()) {
      return { ids: new Set(), matched: false };
    }

    try {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "file_system_nodes"
        WHERE "searchVector" @@ plainto_tsquery('simple', ${keyword})
        LIMIT ${maxResults}
      `;

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
}

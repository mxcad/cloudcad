import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@cloudcad/db';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class AncestorQueryService {
  private readonly logger = new Logger(AncestorQueryService.name);

  constructor(private readonly prisma: DatabaseService) {}

  /**
   * 使用批量递归 CTE 构建多个 parentId 的祖先路径
   * 返回 Map<nodeId, "根 > 父1 > 父2">
   * @param parentIds 需要查找祖先路径的节点 ID 列表
   * @param includeDeleted 是否包含已删除节点（默认 true，为 false 时跳过已删除节点）
   */
  async buildAncestorPaths(parentIds: string[], includeDeleted = true): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(parentIds.filter(Boolean))];
    if (uniqueIds.length === 0) return new Map();

    const deletedFilter = includeDeleted ? Prisma.empty : Prisma.sql`AND "deletedAt" IS NULL`;

    const rows = await this.prisma.$queryRaw<{ id: string; path: string | null }[]>`
      WITH RECURSIVE ancestors AS (
        SELECT id, name, "parentId", id as start_id, 0 as depth
        FROM file_system_nodes
        WHERE id = ANY(${uniqueIds}::text[]) ${deletedFilter}
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
}

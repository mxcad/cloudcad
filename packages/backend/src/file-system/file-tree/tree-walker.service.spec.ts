///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Test, type TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { TreeWalker } from './tree-walker.service';

describe('TreeWalker', () => {
  let service: TreeWalker;
  const mockPrisma = { $queryRaw: jest.fn() };

  const sqlText = (callIndex = 0): string => {
    const [template, ...params] = mockPrisma.$queryRaw.mock.calls[callIndex];
    // 递归渲染：嵌套 _Sql（Prisma.join/嵌套 Prisma.sql）的 strings 就地拼接，
    // 其 values 按序回填为 '?' 占位（保持与原实现 template.join('?') 等价的展开）
    const render = (strings: string[], values: unknown[]): string => {
      let out = '';
      const rest = [...values];
      for (let idx = 0; idx < strings.length; idx++) {
        out += strings[idx];
        if (idx < strings.length - 1) {
          const v = rest.shift();
          if (isSql(v)) {
            out += render(v.strings, v.values ?? []);
          } else {
            out += '?';
          }
        }
      }
      return out;
    };
    return render(template as string[], params);
  };

  const sqlParams = (callIndex = 0): unknown[] => {
    const [, ...params] = mockPrisma.$queryRaw.mock.calls[callIndex];
    // 嵌套 _Sql 的参数展开到外层序列，非 _Sql 参数原样保留
    const flat: unknown[] = [];
    const walk = (values: unknown[]): void => {
      for (const v of values) {
        if (isSql(v)) walk(v.values ?? []);
        else flat.push(v);
      }
    };
    walk(params);
    return flat;
  };

  interface SqlLike {
    strings: string[];
    values?: unknown[];
  }
  const isSql = (p: unknown): p is SqlLike =>
    !!p &&
    typeof p === 'object' &&
    'strings' in p &&
    Array.isArray((p as SqlLike).strings);

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TreeWalker,
        { provide: DatabaseService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(TreeWalker);
  });

  describe('resolveProjectId', () => {
    it('when PROJECT 根节点：返回自身 id，且 CTE 不读 projectId 字段', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'proj-1' }]);

      await expect(service.resolveProjectId('proj-1')).resolves.toBe('proj-1');

      expect(sqlText()).toContain('WITH RECURSIVE ancestors');
      expect(sqlText()).toContain(
        'INNER JOIN ancestors a ON n.id = a."parentId"'
      );
      expect(sqlText()).toContain('NOT IN');
      expect(sqlText()).not.toContain('projectId');
      expect(sqlParams()).toEqual(['proj-1', 'FILE', 'FOLDER']);
    });

    it('when FILE 子节点：沿祖先链上溯找到 PROJECT 根', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'proj-1' }]);

      await expect(service.resolveProjectId('file-1')).resolves.toBe('proj-1');
      expect(sqlParams()).toEqual(['file-1', 'FILE', 'FOLDER']);
    });

    it('when 个人空间根（projectId 字段为 null）：必须返回自身 id', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'ps-1' }]);

      await expect(service.resolveProjectId('ps-1')).resolves.toBe('ps-1');
      expect(sqlText()).not.toContain('projectId');
      expect(sqlParams()).toEqual(['ps-1', 'FILE', 'FOLDER']);
    });

    it('when LIBRARY 根：返回自身 id', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'lib-1' }]);

      await expect(service.resolveProjectId('lib-1')).resolves.toBe('lib-1');
    });

    it('when 节点缺失：返回 null', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await expect(service.resolveProjectId('missing')).resolves.toBeNull();
    });
  });

  describe('getSubtreeIds', () => {
    it('when 默认 opts（includeRoot:false, includeDeleted:true）：不含 root、不过滤 deletedAt', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: 'child-1' },
        { id: 'child-2' },
      ]);

      await expect(service.getSubtreeIds('root-1')).resolves.toEqual([
        'child-1',
        'child-2',
      ]);

      const sql = sqlText();
      expect(sql).toContain('WHERE ? OR id != ?');
      expect(sql).toContain('"deletedAt" IS NULL');
      expect(sqlParams()).toEqual(['root-1', true, false, 'root-1']);
    });

    it('when includeRoot:true：结果包含 root 自身', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: 'root-1' },
        { id: 'child-1' },
      ]);

      await expect(
        service.getSubtreeIds('root-1', { includeRoot: true })
      ).resolves.toEqual(['root-1', 'child-1']);

      expect(sqlParams()).toEqual(['root-1', true, true, 'root-1']);
    });

    it('when includeDeleted:false：遍历中剪枝已删除节点', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'child-1' }]);

      await expect(
        service.getSubtreeIds('root-1', { includeDeleted: false })
      ).resolves.toEqual(['child-1']);

      expect(sqlParams()).toEqual(['root-1', false, false, 'root-1']);
    });
  });

  describe('getSubtreeFiles', () => {
    it('when 子树含 FILE 节点：返回 { id, path, fileHash } 形状，过滤非 FILE', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: 'file-1', path: '/proj/file.dwg', fileHash: 'hash-1' },
        { id: 'file-2', path: null, fileHash: null },
      ]);

      await expect(service.getSubtreeFiles('root-1')).resolves.toEqual([
        { id: 'file-1', path: '/proj/file.dwg', fileHash: 'hash-1' },
        { id: 'file-2', path: null, fileHash: null },
      ]);

      const sql = sqlText();
      expect(sql).toContain('WITH RECURSIVE tree');
      expect(sql).toContain('"nodeType" = ?');
      expect(sql).toContain('n.id != ?');
      expect(sqlParams()).toEqual(['root-1', 'FILE', 'root-1']);
    });

    it('when 子树无 FILE 节点：返回空数组', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await expect(service.getSubtreeFiles('root-1')).resolves.toEqual([]);
    });
  });

  describe('getSubtreeFolderIds', () => {
    it('when 子树含 FOLDER 节点：返回 FOLDER id 数组', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: 'folder-1' },
        { id: 'folder-2' },
      ]);

      await expect(service.getSubtreeFolderIds('root-1')).resolves.toEqual([
        'folder-1',
        'folder-2',
      ]);

      const sql = sqlText();
      expect(sql).toContain('"nodeType" = ?');
      expect(sqlParams()).toEqual(['root-1', 'FOLDER', 'root-1']);
    });

    it('when 子树无 FOLDER 节点：返回空数组', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await expect(service.getSubtreeFolderIds('root-1')).resolves.toEqual([]);
    });
  });

  describe('getSubtreeFileIds', () => {
    it('when includeDeleted:false：遍历中剪枝已删除节点，且带深度保护 depth < 50', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'file-1' }]);

      await expect(
        service.getSubtreeFileIds('root-1', { includeDeleted: false })
      ).resolves.toEqual(['file-1']);

      const sql = sqlText();
      expect(sql).toContain('WITH RECURSIVE tree');
      expect(sql).toContain('t.depth < 50');
      expect(sql).toContain('"deletedAt" IS NULL');
      expect(sql).toContain('"nodeType" = ?');
      expect(sql).toContain('n.id != ?');
      expect(sqlParams()).toEqual(['root-1', false, 'FILE', 'root-1']);
    });

    it('when includeDeleted 默认 true：不过滤 deletedAt，返回全部文件 id', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'file-1' }]);

      await expect(service.getSubtreeFileIds('root-1')).resolves.toEqual([
        'file-1',
      ]);
      expect(sqlParams()).toEqual(['root-1', true, 'FILE', 'root-1']);
    });

    it('when 子树无 FILE 节点：返回空数组', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await expect(service.getSubtreeFileIds('root-1')).resolves.toEqual([]);
    });
  });

  describe('getSubtreeFilesPaginated', () => {
    it('when 默认参数：稳定排序（createdAt desc + id 兜底）+ LIMIT/OFFSET + total 窗口函数', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: 'file-1', path: '/a.dwg', fileHash: 'h1', total: 2 },
        { id: 'file-2', path: '/b.dwg', fileHash: 'h2', total: 2 },
      ]);

      await expect(service.getSubtreeFilesPaginated('root-1')).resolves.toEqual(
        {
          rows: [
            { id: 'file-1', path: '/a.dwg', fileHash: 'h1', total: 2 },
            { id: 'file-2', path: '/b.dwg', fileHash: 'h2', total: 2 },
          ],
          total: 2,
        }
      );

      const sql = sqlText();
      expect(sql).toContain('WITH RECURSIVE tree');
      expect(sql).toContain('t.depth < 50');
      expect(sql).toContain('COUNT(*) OVER ()::int AS total');
      expect(sql).toContain('"createdAt" DESC');
      expect(sql).toContain('ORDER BY');
      expect(sql).toContain(', n.id ASC');
      expect(sql).toContain('LIMIT ? OFFSET ?');
      expect(sqlParams()).toEqual(['root-1', true, 'FILE', 'root-1', 50, 0]);
    });

    it('when 指定 page/limit：LIMIT/OFFSET 按页码换算下推', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await service.getSubtreeFilesPaginated('root-1', { page: 3, limit: 10 });
      expect(sqlParams()).toEqual(['root-1', true, 'FILE', 'root-1', 10, 20]);
    });

    it('when 指定 sortBy/sortOrder：排序列经白名单映射拼接，不直接插值', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await service.getSubtreeFilesPaginated('root-1', {
        sortBy: 'name',
        sortOrder: 'asc',
      });

      const sql = sqlText();
      expect(sql).toContain('"name" ASC');
      expect(sql).not.toContain('${');
    });

    it('when includeDeleted:false：遍历中剪枝已删除节点', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await service.getSubtreeFilesPaginated('root-1', {
        includeDeleted: false,
      });
      expect(sqlParams()).toEqual(['root-1', false, 'FILE', 'root-1', 50, 0]);
    });

    it('when 子树无 FILE 节点：total 为 0，rows 为空', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0 }]);

      await expect(service.getSubtreeFilesPaginated('root-1')).resolves.toEqual(
        { rows: [], total: 0 }
      );
    });

    it('when page 越界（非空子树）：rows 为空但 total 保真', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 41 }]);

      await expect(
        service.getSubtreeFilesPaginated('root-1', { page: 5, limit: 20 })
      ).resolves.toEqual({ rows: [], total: 41 });

      // 第二次调用为独立 count 查询，取真实总数
      const countSql = sqlText(1);
      expect(countSql).toContain('WITH RECURSIVE tree');
      expect(countSql).toContain('SELECT COUNT(*)::int AS count');
      expect(countSql).not.toContain('LIMIT');
      expect(sqlParams(1)).toEqual(['root-1', true, 'FILE', 'root-1']);
    });
  });

  describe('getSubtreeFilesFilteredPaginated (#272)', () => {
    it('when 无过滤条件：filter 子句退化为 true，分页下推与基础版一致', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: 'file-1', path: '/a.dwg', fileHash: 'h1', total: 1 },
      ]);

      await expect(
        service.getSubtreeFilesFilteredPaginated('root-1')
      ).resolves.toEqual({
        rows: [{ id: 'file-1', path: '/a.dwg', fileHash: 'h1', total: 1 }],
        total: 1,
      });

      const sql = sqlText();
      expect(sql).toContain('AND true');
      expect(sqlParams()).toEqual([
        'root-1',
        true,
        'FILE',
        'root-1',
        50,
        0,
      ]);
    });

    it('when extension/fileStatus 过滤：列级 ANY 数组打包下推，不展开 id 参数', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: 'file-1', path: '/a.dwg', fileHash: 'h1', total: 1 },
      ]);

      await service.getSubtreeFilesFilteredPaginated('root-1', {
        extensions: ['dwg', 'pdf'],
        statuses: ['CONVERTED'],
      });

      const sql = sqlText();
      expect(sql).toContain('n."extension" = ANY(');
      expect(sql).toContain('n."fileStatus"::text = ANY(');
      expect(sql).not.toContain('IN (');
      expect(sqlParams()).toEqual([
        'root-1',
        true,
        'FILE',
        'root-1',
        ['dwg', 'pdf'],
        ['CONVERTED'],
        50,
        0,
      ]);
    });

    it('when FTS 预匹配集 + keyword：`n."id" = ANY` 与 ILIKE 组成 OR 组（AND 分组）', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0 }]);

      await service.getSubtreeFilesFilteredPaginated('root-1', {
        ftsMatchIds: ['file-1', 'file-2'],
        keyword: 'match',
      });

      const sql = sqlText();
      expect(sql).toContain('n."id" = ANY(');
      expect(sql).toContain('ILIKE');
      expect(sql).toContain('AND (');
      expect(sqlParams()).toEqual([
        'root-1',
        true,
        'FILE',
        'root-1',
        ['file-1', 'file-2'],
        '%match%',
        '%match%',
        50,
        0,
      ]);
    });

    it('when FTS 未命中（无 ftsMatchIds）：仅 ILIKE 兜底', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: 'file-1', path: '/a.dwg', fileHash: 'h1', total: 1 },
      ]);

      await service.getSubtreeFilesFilteredPaginated('root-1', {
        keyword: 'm',
      });

      const sql = sqlText();
      expect(sql).not.toContain('n."id" = ANY');
      expect(sqlParams()).toEqual([
        'root-1',
        true,
        'FILE',
        'root-1',
        '%m%',
        '%m%',
        50,
        0,
      ]);
    });

    it('when 空结果：count 兜底带同样 filter 条件，total 保真', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 41 }]);

      await expect(
        service.getSubtreeFilesFilteredPaginated('root-1', {
          extensions: ['dwg'],
          page: 5,
          limit: 20,
        })
      ).resolves.toEqual({ rows: [], total: 41 });

      const countSql = sqlText(1);
      expect(countSql).toContain('SELECT COUNT(*)::int AS count');
      expect(countSql).toContain('n."extension" = ANY(');
      expect(sqlParams(1)).toEqual([
        'root-1',
        true,
        'FILE',
        'root-1',
        ['dwg'],
      ]);
    });
  });
});

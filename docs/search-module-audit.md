# 搜索模块实现细节审计

## 审计概述

- **审计日期**: 2026-05-02
- **审计范围**: 搜索模块的完整实现，包括后端、前端、数据库、权限等
- **审计目标**: 全面分析搜索服务的实现逻辑、查询类型、性能、权限检查和前后端一致性

---

## 一、模块架构分析

### 1.1 文件结构
```
apps/backend/src/file-system/search/
├── search.module.ts      # 搜索模块定义
├── search.service.ts     # 搜索服务核心逻辑
└── search.service.spec.ts # 搜索服务测试
```

### 1.2 依赖关系
```typescript
// search.module.ts
@Module({
  imports: [
    DatabaseModule,          // 数据库模块
    FilePermissionModule     // 文件权限模块
  ],
  providers: [SearchService],
  exports: [SearchService],
})
```

### 1.3 核心依赖注入
```typescript
// search.service.ts
constructor(
  private readonly prisma: DatabaseService,           // 数据库服务
  private readonly permissionService: FileSystemPermissionService  // 权限服务
) {}
```

---

## 二、搜索功能支持的查询类型和过滤条件

### 2.1 搜索范围 (SearchScope)

| 范围类型 | 说明 | 备注 |
|---------|------|------|
| `project` | 搜索项目列表 | 支持 `filter` 过滤 |
| `project_files` | 搜索指定项目内的文件 | 必须提供 `projectId` |
| `all_projects` | 搜索所有有权限的项目中的文件 | 不限制项目 |
| `library` | 搜索资源库文件 | 支持 `libraryKey` 指定 |

### 2.2 搜索类型 (SearchType)

| 类型 | 说明 |
|------|------|
| `all` | 搜索全部 |
| `file` | 仅搜索文件 |
| `folder` | 仅搜索文件夹 |

### 2.3 项目过滤 (filter)

| 过滤项 | 说明 |
|--------|------|
| `all` | 全部项目 |
| `owned` | 我创建的项目 |
| `joined` | 我参与的项目 |

### 2.4 其他过滤条件

| 参数 | 说明 |
|------|------|
| `keyword` | 搜索关键词（必填） |
| `libraryKey` | 资源库类型 |
| `extension` | 文件扩展名 |
| `fileStatus` | 文件状态 |
| `page` / `limit` | 分页 |
| `sortBy` / `sortOrder` | 排序 |

---

## 三、搜索性能分析

### 3.1 数据库索引情况

当前 `file_system_nodes` 表已有索引：

| 索引字段 | 用途 |
|---------|------|
| `parentId` | 父子关系查询 |
| `ownerId` | 所有者查询 |
| `isRoot` | 根节点查询（项目） |
| `isFolder` | 文件夹/文件区分 |
| `deletedAt` | 已删除文件过滤 |
| `personalSpaceKey` | 个人空间 |
| `libraryKey` | 资源库 |
| `projectId` | 项目关联 |
| `storageQuota` | 存储配额 |

### 3.2 性能问题分析

#### 问题 1: 文本搜索无索引
**位置**: `search.service.ts` 所有搜索方法
**问题**:
```typescript
OR: [
  { name: { contains: keyword, mode: 'insensitive' } },
  { description: { contains: keyword, mode: 'insensitive' } },
],
```
- 使用 `LIKE %keyword%` 模式匹配，无法使用索引
- 大量数据时会导致全表扫描
- 严重影响查询性能

#### 问题 2: 项目文件递归获取 (N+1 查询)
**位置**: `search.service.ts` 的 `getAllProjectNodeIds` 方法
```typescript
private async getAllProjectNodeIds(projectId: string): Promise<string[]> {
  const nodeIds: string[] = [];
  const collectIds = async (currentId: string) => {
    nodeIds.push(currentId);
    const children = await this.prisma.fileSystemNode.findMany({
      where: { parentId: currentId, deletedAt: null },
      select: { id: true },
    });
    for (const child of children) {
      await collectIds(child.id);  // 递归调用，每个子节点一次查询
    }
  };
  await collectIds(projectId);
  return nodeIds;
}
```
- **问题**: 存在严重的 N+1 查询问题
- **影响**: 深层文件树会导致大量数据库往返
- **风险**: 项目越大，性能越差

#### 问题 3: ALL_PROJECTS 先查项目再查文件
**位置**: `search.service.ts` 的 `searchAllProjects` 方法
```typescript
// 第一步: 查询用户的项目
const userProjects = await this.prisma.fileSystemNode.findMany({
  where: { isRoot: true, deletedAt: null, libraryKey: null, ... },
  select: { id: true },
});

// 第二步: 使用 IN 条件搜索文件
const projectIds = userProjects.map((p) => p.id);
const where: Prisma.FileSystemNodeWhereInput = {
  projectId: { in: projectIds },
  ...
};
```
- 虽然使用了 `in` 条件，但仍有两次独立查询
- 如果项目数量很大，`IN` 列表可能很长

### 3.3 性能优化建议

| 优先级 | 问题 | 建议 |
|-------|------|------|
| P0 | 文本搜索无索引 | 实现 PostgreSQL 全文搜索 (GIN/GIST 索引) |
| P0 | N+1 递归查询 | 使用递归 CTE 一次性获取所有节点 ID |
| P1 | 复合索引缺失 | 添加 `(projectId, deletedAt, isFolder, updatedAt)` 复合索引 |
| P2 | 可考虑缓存 | 热门搜索结果可考虑缓存 |

---

## 四、搜索权限检查分析

### 4.1 各搜索范围的权限检查

| 搜索范围 | 权限检查位置 | 说明 |
|---------|-------------|------|
| `project` | `searchProjects` | 通过 `ownerId` 和 `projectMembers` 过滤 |
| `project_files` | `searchProjectFiles` | 调用 `checkNodePermission(FILE_OPEN)` |
| `all_projects` | `searchAllProjects` | 先获取用户有权限的项目，再搜索文件 |
| `library` | `searchLibrary` | **无权限检查** ❌ |

### 4.2 权限检查发现的问题

#### 问题 1: 资源库搜索缺少权限检查
**位置**: `search.service.ts` 的 `searchLibrary` 方法
```typescript
private async searchLibrary(userId: string, params: ...) {
  // 没有任何权限检查!
  const where: Prisma.FileSystemNodeWhereInput = {
    deletedAt: null,
    libraryKey: ...,
    ...
  };
  // ...
}
```
- **问题**: 任何登录用户都可以搜索所有资源库文件
- **风险**: 可能导致未授权的文件信息泄露

#### 问题 2: all_projects 权限过滤粒度可能不够
- 只检查用户是否是项目所有者或成员
- 没有检查用户对具体文件的可见权限
- 如果项目内有复杂的权限结构，可能有问题

### 4.3 权限系统参考
从 `file-system.controller.ts` 可以看出，资源库应该有权限检查：
```typescript
// 资源库相关权限
const requiredPermission =
  libraryKey === 'drawing'
    ? SystemPermission.LIBRARY_DRAWING_MANAGE
    : SystemPermission.LIBRARY_BLOCK_MANAGE;
```

---

## 五、前后端接口一致性分析

### 5.1 后端接口
**位置**: `file-system.controller.ts` 的 `search` 方法
```typescript
@Get('search')
@UseGuards(JwtAuthGuard, RequireProjectPermissionGuard, PermissionsGuard)
async search(@Request() req, @Query() dto: SearchDto) {
  return this.searchService.search(req.user.id, dto);
}
```

### 5.2 前端 API 调用
**位置**: `apps/frontend/src/services/searchApi.ts`
```typescript
search: (
  keyword: string,
  params?: {
    scope?: SearchScope;
    type?: SearchType;
    filter?: 'all' | 'owned' | 'joined';
    projectId?: string;
    libraryKey?: string;
    extension?: string;
    fileStatus?: FileStatus;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  },
  config?: { signal?: AbortSignal }
) => {
  // ...
  return getApiClient().FileSystemController_search(baseParams, null, config);
};
```

### 5.3 一致性分析 ✅

| 方面 | 一致性 | 说明 |
|------|-------|------|
| 接口路径 | ✅ 一致 | 都是 `/v1/file-system/search` |
| 请求参数 | ✅ 一致 | 前端参数与后端 `SearchDto` 匹配 |
| 返回类型 | ✅ 一致 | 返回 `NodeListResponseDto` |
| HTTP 方法 | ✅ 一致 | 都是 GET 请求 |
| 认证方式 | ✅ 一致 | 都需要 JWT |

**结论**: 前后端接口完全一致，没有问题。

---

## 六、搜索业务逻辑流程

### 6.1 主要搜索流程
```
search(userId, dto)
  ├─ 解析参数 (scope, keyword, filter, projectId, ...)
  └─ 根据 scope 分发
      ├─ PROJECT → searchProjects(userId, params)
      ├─ PROJECT_FILES → searchProjectFiles(userId, projectId, params)
      ├─ ALL_PROJECTS → searchAllProjects(userId, params)
      └─ LIBRARY → searchLibrary(userId, params)
```

### 6.2 各搜索方法详细流程

#### PROJECT 搜索流程
1. 根据 `filter` 构造权限条件
2. 查询根节点（项目），匹配 `name` / `description`
3. 包含 children 数量和 project members 信息
4. 返回分页结果

#### PROJECT_FILES 搜索流程
1. 检查用户对项目的 `FILE_OPEN` 权限
2. **递归获取** 项目下所有节点 ID (N+1 问题)
3. 根据关键词、类型、扩展名等过滤
4. 返回分页结果

#### ALL_PROJECTS 搜索流程
1. 查询用户有权限的所有项目根节点
2. 提取项目 ID 列表
3. 使用 `projectId IN (...)` 条件搜索文件
4. 返回分页结果

#### LIBRARY 搜索流程
1. 根据 `libraryKey` 过滤（或搜索所有 libraryKey != null）
2. 根据关键词、类型、扩展名过滤
3. **无权限检查** ❌
4. 返回分页结果

---

## 七、测试覆盖情况

### 7.1 测试文件
`search.service.spec.ts` 包含以下测试：

| 测试类别 | 测试用例 |
|---------|---------|
| 搜索范围分发 | 未知 scope 抛出异常 |
| PROJECT 搜索 | 搜索全部项目、owned、joined、无匹配 |
| PROJECT_FILES 搜索 | 缺少 projectId 抛异常、无权限返回空、有权限正常搜索、过滤 folder |
| ALL_PROJECTS 搜索 | 跨项目搜索、无项目时返回空 |
| LIBRARY 搜索 | 特定 libraryKey、所有库、按扩展名过滤、分页 |
| 边界情况 | 空关键词、特殊字符、默认 scope |

### 7.2 测试覆盖分析
- ✅ 主要搜索路径有测试
- ✅ 边界情况有测试
- ⚠️ 缺少性能相关测试
- ⚠️ 缺少权限相关的集成测试

---

## 八、发现的问题汇总

| # | 问题 | 位置 | 严重级别 | 说明 |
|---|------|------|---------|------|
| 1 | 文本搜索无索引 | 所有搜索方法 | P0 | LIKE %keyword% 无法用索引 |
| 2 | N+1 递归查询 | getAllProjectNodeIds | P0 | 每次子节点单独查询 |
| 3 | 资源库搜索无权限检查 | searchLibrary | P0 | 任何登录用户可搜索所有资源库 |
| 4 | 缺少复合索引 | schema.prisma | P1 | 可添加 (projectId, deletedAt, isFolder, updatedAt) |
| 5 | all_projects 权限粒度可能不够 | searchAllProjects | P2 | 只检查项目级权限，不检查文件级 |

---

## 九、改进建议

### 9.1 立即修复 (P0)
1. **为资源库搜索添加权限检查**
   ```typescript
   // 在 searchLibrary 方法开头添加权限检查
   const hasLibraryPermission = await this.permissionService.checkLibraryPermission(
     userId,
     params.libraryKey
   );
   if (!hasLibraryPermission) {
     return { nodes: [], total: 0, page: params.page, limit: params.limit, totalPages: 0 };
   }
   ```

2. **修复 N+1 查询问题**，使用递归 CTE
   ```sql
   -- PostgreSQL 递归 CTE 示例
   WITH RECURSIVE tree AS (
     SELECT id FROM file_system_nodes WHERE id = $1 AND deletedAt IS NULL
     UNION ALL
     SELECT n.id FROM file_system_nodes n
     JOIN tree t ON n.parentId = t.id WHERE n.deletedAt IS NULL
   )
   SELECT id FROM tree;
   ```

### 9.2 短期优化 (P1)
1. **添加全文搜索支持**
   ```prisma
   // schema.prisma
   // 考虑添加 searchVector 字段并创建 GIN 索引
   ```

2. **添加复合索引**
   ```prisma
   @@index([projectId, deletedAt, isFolder, updatedAt])
   @@index([libraryKey, deletedAt, updatedAt])
   ```

### 9.3 长期规划 (P2)
1. 考虑使用 Elasticsearch 等搜索引擎
2. 实现搜索结果缓存机制
3. 添加搜索分析和用户行为追踪
4. 完善权限系统，支持更细粒度的文件可见性控制

---

## 十、总结

搜索模块整体架构清晰，前后端接口完全一致，测试覆盖良好。但存在以下关键问题需要立即修复：

1. **P0 - 资源库搜索缺少权限检查** - 安全风险
2. **P0 - N+1 查询问题** - 严重性能问题
3. **P0 - 文本搜索无索引** - 大量数据时性能问题

建议优先处理这些 P0 问题，然后逐步进行性能优化。

---

## 十一、P0 问题修复优先级评估

### 11.1 资源库搜索无权限检查（P0 - 安全漏洞）

**严重程度**: 🔴 极高

**问题根因分析**:
- [searchLibrary](file:///d:/project/cloudcad/apps/backend/src/file-system/search/search.service.ts#L395-L498) 方法完全没有权限检查逻辑
- 对比 [getThumbnail](file:///d:/project/cloudcad/apps/backend/src/file-system/file-system.controller.ts#L469-L483) 方法，资源库访问需要检查 `LIBRARY_DRAWING_MANAGE` 或 `LIBRARY_BLOCK_MANAGE` 权限
- [FileSystemPermissionService.isLibraryNode()](file:///d:/project/cloudcad/apps/backend/src/file-system/file-permission/file-system-permission.service.ts#L159-L162) 将所有 library 节点视为"公共资源库允许任何人访问"，但这是错误的假设

**修复优先级**: **P0 - 必须立即修复**

**修复方案**:
```typescript
private async searchLibrary(userId: string, params: { ... }): Promise<NodeListResponseDto> {
  // 添加权限检查 - 与 getThumbnail 方法一致
  if (params.libraryKey === 'drawing') {
    const hasPermission = await this.permissionService.checkSystemPermission(
      userId,
      SystemPermission.LIBRARY_DRAWING_MANAGE
    );
    if (!hasPermission) {
      this.logger.warn(`[资源库搜索] 用户 ${userId} 无权访问 drawing 库`);
      return { nodes: [], total: 0, page: params.page, limit: params.limit, totalPages: 0 };
    }
  } else if (params.libraryKey === 'block') {
    const hasPermission = await this.permissionService.checkSystemPermission(
      userId,
      SystemPermission.LIBRARY_BLOCK_MANAGE
    );
    if (!hasPermission) {
      this.logger.warn(`[资源库搜索] 用户 ${userId} 无权访问 block 库`);
      return { nodes: [], total: 0, page: params.page, limit: params.limit, totalPages: 0 };
    }
  } else {
    // 未指定 libraryKey，搜索所有资源库需要同时拥有两个权限
    const hasDrawing = await this.permissionService.checkSystemPermission(
      userId,
      SystemPermission.LIBRARY_DRAWING_MANAGE
    );
    const hasBlock = await this.permissionService.checkSystemPermission(
      userId,
      SystemPermission.LIBRARY_BLOCK_MANAGE
    );
    if (!hasDrawing && !hasBlock) {
      this.logger.warn(`[资源库搜索] 用户 ${userId} 无权访问任何资源库`);
      return { nodes: [], total: 0, page: params.page, limit: params.limit, totalPages: 0 };
    }
  }
  // ... 原有搜索逻辑
}
```

**风险评估**:
| 场景 | 风险等级 | 说明 |
|------|---------|------|
| 普通用户搜索资源库文件 | 🔴 极高 | 可能泄露机密图纸/图块数据 |
| 竞争对手获取设计信息 | 🔴 极高 | 商业机密泄露 |
| 内部恶意用户遍历资源 | 🔴 极高 | 权限控制失效 |

---

### 11.2 N+1 查询问题（P0 - 性能）

**严重程度**: 🟠 高

**问题根因分析**:
- [getAllProjectNodeIds](file:///d:/project/cloudcad/apps/backend/src/file-system/search/search.service.ts#L500-L514) 使用递归方式遍历文件树
- 每个节点都会触发一次 `findMany` 查询
- 假设一个项目有 1000 个文件，深度为 10 层，将执行约 1000+ 次数据库查询

**性能影响量化**:
| 项目规模 | 文件数量 | 查询次数（最坏情况）| 预估延迟 |
|---------|---------|-------------------|---------|
| 小型项目 | ~100 文件 | ~100 次 | 500ms - 1s |
| 中型项目 | ~1000 文件 | ~1000 次 | 5s - 10s |
| 大型项目 | ~10000 文件 | ~10000 次 | 50s - 100s+ |

**修复优先级**: **P0 - 必须立即修复**

**修复方案（使用 PostgreSQL 递归 CTE）**:
```typescript
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
  return result.map(r => r.id);
}
```

**预期改进**:
- 将 1000+ 次查询降低为 1 次查询
- 延迟从 5-10s 降低到 50-100ms
- 改进比例: **50-100倍性能提升**

---

## 十二、复合索引缺失对生产环境的影响

### 12.1 当前索引分析

从 [schema.prisma](file:///d:/project/cloudcad/apps/backend/prisma/schema.prisma#L109-L117) 可见，`file_system_nodes` 表有以下索引：

```
@@index([parentId])
@@index([ownerId])
@@index([isRoot])
@@index([isFolder])
@@index([deletedAt])
@@index([personalSpaceKey])
@@index([libraryKey])
@@index([projectId])
@@index([storageQuota])
```

### 12.2 缺失的关键复合索引

**缺失索引 1**: `(projectId, deletedAt, isFolder, updatedAt)`
- **用途**: `searchProjectFiles` 和 `searchAllProjects` 的查询
- **当前查询条件**: `id IN (...)`, `deletedAt = null`, `isRoot = false`
- **问题**: `IN` 子句使用 `id` 列表，但 `id` 是主键已有索引；如果 projectId 列表很大，`IN` 效率会下降

**缺失索引 2**: `(libraryKey, deletedAt, isFolder, updatedAt)`
- **用途**: `searchLibrary` 的查询
- **当前查询条件**: `libraryKey = ?`, `deletedAt = null`, `isRoot = false`
- **问题**: 只有 `libraryKey` 单列索引，范围扫描效率低

### 12.3 生产环境性能影响

**场景: 用户搜索 "CAD" 关键词**

```sql
-- 假设 file_system_nodes 有 100万 条记录
-- 其中 50万 是 deletedAt != null 的软删除记录
-- 其中 10万 属于某个 projectId

EXPLAIN ANALYZE
SELECT * FROM file_system_nodes
WHERE projectId IN ('proj-1', 'proj-2', ...)
  AND deletedAt IS NULL
  AND isRoot = false
  AND (
    name ILIKE '%CAD%' 
    OR description ILIKE '%CAD%'
  )
ORDER BY updatedAt DESC
LIMIT 50;
```

**预期执行计划（无复合索引）**:
```
Seq Scan on file_system_nodes  (cost=0.00..150000.00 rows=10000)
  Filter: (deletedAt IS NULL AND isRoot = false AND projectId IN (...))
```

**预期执行计划（有复合索引）**:
```
Index Scan using idx_project_search on file_system_nodes  (cost=0.00..5000.00 rows=10000)
  Index Cond: (projectId IN (...) AND deletedAt IS NULL)
```

**性能差距**: 约 **30-50倍**

### 12.4 建议添加的索引

```prisma
// schema.prisma FileSystemNode 模型中添加

// 复合索引1: 项目文件搜索
@@index([projectId, deletedAt, isFolder, updatedAt], name: "idx_project_search")

// 复合索引2: 资源库搜索
@@index([libraryKey, deletedAt, isFolder, updatedAt], name: "idx_library_search")

// 复合索引3: 全文搜索辅助（配合 GIN 索引使用）
@@index([name, description], name: "idx_name_description")
```

---

## 十三、搜索模块权限检查缺口分析

### 13.1 各搜索范围权限检查现状

| 搜索范围 | 权限检查 | 检查方法 | 风险等级 |
|---------|---------|---------|---------|
| `project` | ✅ 有 | 检查 ownerId 或 projectMembers | 🟢 低 |
| `project_files` | ✅ 有 | checkNodePermission(FILE_OPEN) | 🟢 低 |
| `all_projects` | ⚠️ 粒度粗 | 只检查项目级权限 | 🟡 中 |
| `library` | ❌ 无 | 无任何权限检查 | 🔴 极高 |

### 13.2 发现的权限缺口

#### 缺口 1: 资源库搜索 (searchLibrary)

**详见 11.1 节**

#### 缺口 2: all_projects 搜索粒度不足

**位置**: [searchAllProjects](file:///d:/project/cloudcad/apps/backend/src/file-system/search/search.service.ts#L302-L393)

**问题**:
- 只检查用户是否是项目 owner 或 member
- 不检查用户对具体文件的可见性权限
- 如果项目内有文件级别的权限差异（如某些文件只对特定成员可见），可能导致越权访问

**代码片段**:
```typescript
const userProjects = await this.prisma.fileSystemNode.findMany({
  where: {
    isRoot: true,
    deletedAt: null,
    libraryKey: null,
    OR: [{ ownerId: userId }, { projectMembers: { some: { userId } } }],
  },
  select: { id: true },
});
```

**风险评估**: 🟡 中

**说明**: 当前系统设计为项目级权限，文件继承项目权限，所以此问题风险较低。但如果未来扩展文件级权限，此处需要重构。

#### 缺口 3: searchProjects 可能泄露项目信息

**位置**: [searchProjects](file:///d:/project/cloudcad/apps/backend/src/file-system/search/search.service.ts#L91-L187)

**观察**:
- 搜索结果返回了 `childrenCount`（子节点数量）和 `projectMembers` 数量
- 可能泄露项目规模信息

**风险评估**: 🟢 低（信息价值有限）

---

## 十四、搜索功能完整调用链路

### 14.1 链路总览

```
HTTP Request (GET /v1/file-system/search?keyword=xxx&scope=xxx)
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ FileSystemController.search()                                   │
│ 位置: file-system.controller.ts:829-835                         │
│ 装饰器: @Get('search')                                           │
│         @UseGuards(JwtAuthGuard, RequireProjectPermissionGuard,  │
│                    PermissionsGuard)                            │
│                                                              │
│ 功能:                                                        │
│  - JWT 认证 (JwtAuthGuard)                                      │
│  - 项目权限检查 (RequireProjectPermissionGuard) - 但 search    │
│    接口未使用 @RequireProjectPermission，所以此 Guard 不生效    │
│  - 系统权限检查 (PermissionsGuard) - search 接口没有            │
│    @RequirePermissions 装饰器                                    │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ SearchService.search(userId, dto)                              │
│ 位置: search.service.ts:21-89                                   │
│                                                              │
│ 功能:                                                        │
│  - 解析 SearchDto 参数                                         │
│  - 根据 scope 分发到对应的私有方法                                │
└─────────────────────────────────────────────────────────────────┘
    │
    ├──► scope = PROJECT
    │         └─► searchProjects(userId, params)
    │              ├─ Prisma: findMany (获取项目列表)
    │              └─ Prisma: count (统计总数)
    │
    ├──► scope = PROJECT_FILES
    │         └─► searchProjectFiles(userId, projectId, params)
    │              ├─ permissionService.checkNodePermission()    │
    │              │   └─► projectPermissionService.checkPermission()
    │              ├─ getAllProjectNodeIds() ⚠️ N+1 问题
    │              ├─ Prisma: findMany (搜索文件)
    │              └─ Prisma: count (统计总数)
    │
    ├──► scope = ALL_PROJECTS
    │         └─► searchAllProjects(userId, params)
    │              ├─ Prisma: findMany (获取用户项目列表)
    │              ├─ Prisma: findMany (搜索所有项目文件)
    │              └─ Prisma: count (统计总数)
    │
    └──► scope = LIBRARY ❌ 无权限检查
              └─► searchLibrary(userId, params)
                   ├─ ⚠️ 无权限检查!!!
                   ├─ Prisma: findMany (搜索资源库)
                   └─ Prisma: count (统计总数)
```

### 14.2 各方法详细链路

#### PROJECT_FILES 搜索完整链路

```
1. Controller: search(@Request() req, @Query() dto: SearchDto)
   ↓
2. SearchService.search(userId, dto)
   ↓
3. SearchService.searchProjectFiles(userId, projectId, params)
   ├─ permissionService.checkNodePermission(userId, projectId, FILE_OPEN)
   │   ├─ prisma.fileSystemNode.findUnique({ where: { id: projectId } })
   │   ├─ fileTreeService.getProjectId(nodeId)
   │   └─ projectPermissionService.checkPermission(userId, projectId, FILE_OPEN)
   │       └─ prisma.projectMember.findMany({ where: { projectId, userId } })
   │
   ├─ getAllProjectNodeIds(projectId) ⚠️ N+1 查询
   │   └─ 递归: prisma.fileSystemNode.findMany({ where: { parentId } })
   │       └─ 重复 N 次
   │
   ├─ prisma.fileSystemNode.findMany({
   │     where: {
   │       id: { in: projectNodeIds },
   │       deletedAt: null,
   │       OR: [{ name: { contains: keyword } }, ...]
   │     },
   │     orderBy: { updatedAt: 'desc' },
   │     skip: (page-1)*limit,
   │     take: limit
   │   })
   │
   └─ prisma.fileSystemNode.count({ where: { id: { in: projectNodeIds }, ... } })
```

#### LIBRARY 搜索完整链路（存在问题）

```
1. Controller: search(@Request() req, @Query() dto: SearchDto)
   ↓
2. SearchService.search(userId, dto)
   ↓
3. SearchService.searchLibrary(userId, params)
   ├─ ⚠️ 无权限检查!!!
   │
   ├─ prisma.fileSystemNode.findMany({
   │     where: {
   │       deletedAt: null,
   │       libraryKey: libraryKey ?? { not: null },
   │       isRoot: false,
   │       OR: [{ name: { contains: keyword } }, ...]
   │     },
   │     orderBy: { updatedAt: 'desc' },
   │     skip: (page-1)*limit,
   │     take: limit
   │   })
   │
   └─ prisma.fileSystemNode.count({ where: { ... } })
```

### 14.3 数据库查询统计

| 搜索范围 | 查询数量 | 查询类型 |
|---------|---------|---------|
| `project` | 2 | findMany + count |
| `project_files` | N+2+2 | 1次权限检查 + N次递归获取节点 + findMany + count |
| `all_projects` | 3 | findMany(项目) + findMany(文件) + count |
| `library` | 2 | findMany + count |

---

## 十五、修复建议汇总

### 15.1 立即修复 (本周内)

| # | 问题 | 优先级 | 工作量 | 负责人 |
|---|------|--------|-------|--------|
| 1 | 资源库搜索添加权限检查 | P0 | 2h | 后端 |
| 2 | 修复 N+1 查询 (递归 CTE) | P0 | 4h | 后端 + DBA |
| 3 | 添加复合索引 | P1 | 1h | DBA |

### 15.2 短期优化 (2周内)

| # | 问题 | 优先级 | 工作量 | 负责人 |
|---|------|--------|-------|--------|
| 4 | 实现 PostgreSQL 全文搜索 | P1 | 8h | 后端 |
| 5 | 添加搜索性能监控 | P2 | 4h | 后端 |
| 6 | 完善 all_projects 权限粒度 | P2 | 4h | 后端 |

### 15.3 中期规划 (1个月内)

| # | 问题 | 优先级 | 工作量 | 负责人 |
|---|------|--------|-------|--------|
| 7 | 引入 Elasticsearch | P2 | 3d | 架构师 |
| 8 | 搜索结果缓存 | P2 | 2d | 后端 |
| 9 | 搜索分析/用户行为追踪 | P3 | 2d | 后端 |

---

## 十六、附录

### A. 相关文件列表

| 文件路径 | 说明 |
|---------|------|
| `apps/backend/src/file-system/search/search.service.ts` | 搜索服务核心实现 |
| `apps/backend/src/file-system/search/search.module.ts` | 搜索模块定义 |
| `apps/backend/src/file-system/file-system.controller.ts` | 文件系统控制器（含 search 接口）|
| `apps/backend/src/file-system/dto/search.dto.ts` | 搜索 DTO 定义 |
| `apps/backend/src/file-system/file-permission/file-system-permission.service.ts` | 文件权限服务 |
| `apps/backend/src/common/services/permission.service.ts` | 系统权限服务 |
| `apps/backend/prisma/schema.prisma` | 数据库 Schema |
| `apps/frontend/src/services/searchApi.ts` | 前端搜索 API 调用 |

### B. 相关权限枚举

```typescript
// SystemPermission (系统权限)
LIBRARY_DRAWING_MANAGE  // 图纸库管理
LIBRARY_BLOCK_MANAGE    // 图块库管理

// ProjectPermission (项目权限)
FILE_OPEN               // 打开文件
```

### C. 测试建议

1. **权限测试**: 验证未授权用户无法搜索资源库
2. **性能测试**: 使用 10000+ 文件的项目测试搜索响应时间
3. **集成测试**: 验证搜索结果与实际文件权限一致

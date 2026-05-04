# 冲刺四：后端深度性能审计报告

**审计日期**: 2026-05-03
**审计范围**: `packages/backend/src/` 下所有 Service

---

## 一、发现的性能瓶颈

### 1.1 高危瓶颈

#### 🔴 瓶颈 #1: `getAllFilesUnderNode` 递归收集文件 ID（N+1 问题）

**位置**: `file-system/file-tree/file-tree.service.ts` L598-723

**问题描述**:
递归遍历所有子目录时，对每个节点执行单独的数据库查询。深度递归场景下会产生大量数据库往返。

```typescript
// 问题代码 (L634-656)
const collectFileIds = async (currentNodeId: string) => {
  const children = await this.prisma.fileSystemNode.findMany({
    where: { parentId: currentNodeId, ... },
    select: { id: true, isFolder: true },
  });
  for (const child of children) {
    if (child.isFolder) {
      await collectFileIds(child.id);  // 递归调用
    } else {
      allFileIds.push(child.id);
    }
  }
};
```

**影响评估**:
- 对于 1000 个文件、10 层深的目录树，会产生 ~1000 次数据库查询
- 单次请求可能耗时 2-5 秒

**改进建议**:
```typescript
// 使用单次递归 CTE 查询替代多次单节点查询
const result = await this.prisma.$queryRaw`
  WITH RECURSIVE node_tree AS (
    SELECT id, "parentId", "isFolder" FROM "FileSystemNode"
    WHERE "parentId" = ${nodeId} AND "deletedAt" IS NULL
    UNION ALL
    SELECT f.id, f."parentId", f."isFolder" FROM "FileSystemNode" f
    INNER JOIN node_tree nt ON f."parentId" = nt.id
    WHERE f."deletedAt" IS NULL
  )
  SELECT id FROM node_tree WHERE "isFolder" = false
`;
```

---

#### 🔴 瓶颈 #2: `deleteNode` 循环内重复数据库查询

**位置**: `file-operations/file-operations.service.ts` L1178-1206

**问题描述**:
`collectFilesToDelete` 方法在循环中递归调用自身，且每次递归都执行 `findMany` 查询。

```typescript
// 问题代码 (L1187-1206)
for (const child of children) {
  await this.collectFilesToDelete(child.id, filesToDelete, nodesToDelete);
}
// 应改为一次性收集所有后代节点
```

**影响评估**:
- 删除深层目录时产生大量 DB 查询
- 事务时间延长，增加锁竞争风险

**改进建议**:
使用递归 CTE 在单次查询中获取所有后代节点。

---

#### 🔴 瓶颈 #3: `getAllProjectNodeIds` 递归查询

**位置**: `file-operations/file-operations.service.ts` L720-738

**问题描述**:
获取项目所有节点 ID 时递归调用 `findMany`，与瓶颈 #1 类似。

```typescript
// 问题代码 (L723-732)
const traverse = async (parentId: string) => {
  const children = await this.prisma.fileSystemNode.findMany({
    where: { parentId },
    select: { id: true },
  });
  for (const child of children) {
    nodeIds.push(child.id);
    await traverse(child.id);
  }
};
```

**改进建议**:
使用递归 CTE 替代递归函数调用。

---

#### 🔴 瓶颈 #4: `copyNodeRecursive` 循环内串行复制

**位置**: `file-operations/file-operations.service.ts` L989-1033

**问题描述**:
复制文件夹时串行递归复制每个子节点，效率低下。

```typescript
// 问题代码 (L1027-1032)
for (const child of sourceNode.children) {
  // 每次循环都等待前一个完成
  await this.copyNodeRecursive(child.id, newNode.id, childUniqueName, ownerId);
}
```

**影响评估**:
- 100 个子节点的文件夹复制需要串行等待 100 次
- 网络/IO 延迟累加

**改进建议**:
使用 `Promise.all` 并行复制独立的子节点（仅当子节点间无依赖时）。

---

#### 🔴 瓶颈 #5: `batchAddProjectMembers` 循环内顺序添加

**位置**: `file-system/project-member/project-member.service.ts` L583-599

**问题描述**:
批量添加成员时顺序调用 `addProjectMember`，每个操作都是独立事务。

```typescript
for (const member of members) {
  await this.addProjectMember(projectId, member.userId, member.projectRoleId, 'system');
}
```

**影响评估**:
- 100 个成员的批量添加需要 100+ 次 DB 往返
- 每次调用都触发权限检查（额外的 DB 查询）

**改进建议**:
合并为单个批量插入事务，减少 DB 往返次数。

---

### 1.2 中危瓶颈

#### 🟡 瓶颈 #6: `StorageInfoService` 内存缓存无上限

**位置**: `file-system/storage-quota/storage-info.service.ts` L39

**问题描述**:
```typescript
private readonly quotaCache = new Map<string, QuotaCacheItem>();
```
缓存 Map 无大小限制，可能导致内存泄漏。

**改进建议**:
使用 LRU Cache 限制缓存条目数量，或使用 Redis 替代内存缓存。

---

#### 🟡 瓶颈 #7: `batchUpdateProjectMembers` 循环内串行更新

**位置**: `file-system/project-member/project-member.service.ts` L646-662

**问题描述**:
与瓶颈 #5 类似，批量更新时串行执行。

**改进建议**:
合并为批量更新事务。

---

#### 🟡 瓶颈 #8: `clearTrash` 循环内顺序删除

**位置**: `file-operations/file-operations.service.ts` L1623-1642

**问题描述**:
清空回收站时对每个项目/节点顺序调用 `permanentlyDeleteProject/permanentlyDeleteNode`。

```typescript
for (const project of projects) {
  await this.permanentlyDeleteProject(project.id, false);
}
```

**改进建议**:
使用事务批量处理，减少 DB 往返。

---

### 1.3 低危瓶颈

#### 🟢 瓶颈 #9: `generateUniqueName` 查询全量名称列表

**位置**: `file-operations/file-operations.service.ts` L112-118

**问题描述**:
生成唯一名称时获取所有同级节点名称到内存。

```typescript
const existingNodes = await this.prisma.fileSystemNode.findMany({
  where: { parentId, deletedAt: null },
  select: { name: true },
});
```

**改进建议**:
使用 `count` 聚合查询替代全量返回，或使用数据库序列/雪花ID确保唯一性。

---

#### 🟢 瓶颈 #10: `getTrashItems` 两次独立查询

**位置**: `file-system/file-tree/file-tree.service.ts` L505-589

**问题描述**:
回收站列表分别查询项目和非根节点，未合并。

```typescript
const projects = await this.prisma.fileSystemNode.findMany({ ... });
const nodes = await this.prisma.fileSystemNode.findMany({ ... });
```

**改进建议**:
合并为单次查询。

---

## 二、数据库索引缺失问题

### 2.1 可能缺失的索引

| 表 | 字段 | 建议索引 | 位置使用 |
|---|---|---|---|
| `FileSystemNode` | `parentId` | `idx_parentId_deletedAt` | `getChildren`, `getAllFilesUnderNode` |
| `FileSystemNode` | `projectId` | `idx_projectId_deletedAt` | `getProjectTrash`, 配额计算 |
| `FileSystemNode` | `ownerId` | `idx_ownerId_deletedAt` | `getUserProjects`, 配额计算 |
| `FileSystemNode` | `deletedAt` | `idx_deletedAt` | 各类软删除查询 |
| `FileSystemNode` | `fileHash` | `idx_fileHash_deletedAt` | 删除时检查引用计数 |
| `ProjectMember` | `projectId_userId` | 复合唯一索引（已存在） | - |
| `ProjectMember` | `userId` | `idx_userId` | 批量操作 |

### 2.2 验证建议

```sql
-- 检查现有索引
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'filesystemnode';

-- 添加建议索引（需评估对写入性能的影响）
CREATE INDEX CONCURRENTLY idx_fsnode_parent_deleted ON "FileSystemNode"("parentId") WHERE "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY idx_fsnode_project_deleted ON "FileSystemNode"("projectId") WHERE "deletedAt" IS NULL;
```

---

## 三、事务与锁问题

### 3.1 长事务风险

**位置**: `file-operations/file-operations.service.ts` L241-272

**问题描述**:
永久删除操作在事务内执行文件收集和数据库更新，但超时设置仅 30 秒。

```typescript
await this.prisma.$transaction(async (tx) => {
  // ... 数据库操作
}, { timeout: 30000 });
```

**改进建议**:
- 将文件删除移出事务（已在代码中实现，但需确认）
- 监控事务耗时，设置告警

---

## 四、缓存使用情况

### 4.1 已实现缓存

| 缓存类型 | 服务 | TTL | 说明 |
|---|---|---|---|
| 配额缓存 | `StorageInfoService` | 5 分钟 | `quotaCache` Map |
| 权限缓存 | `PermissionCacheService` | 5-10 分钟 | 项目权限、所有者 |
| 节点缓存 | `FileSystemPermissionService` | - | 节点权限 |

### 4.2 缓存改进建议

1. **配额缓存**: 考虑使用 Redis 替代内存 Map，支持多实例共享
2. **权限缓存**: 确保 `clearNodeCache` 在所有权限变更路径被调用

---

## 五、性能改进优先级排序

| 优先级 | 瓶颈编号 | 改进措施 | 预估工作量 |
|---|---|---|---|
| P0 | #1, #2, #3 | 使用递归 CTE 替代递归查询 | 4 小时 |
| P1 | #4 | 并行化复制操作 | 2 小时 |
| P1 | #5, #7 | 批量操作合并事务 | 3 小时 |
| P2 | #8 | 清空回收站批量处理 | 2 小时 |
| P2 | #9 | uniqueName 优化 | 1 小时 |
| P3 | #6 | LRU 缓存 | 2 小时 |

---

## 六、总结

### 已识别瓶颈统计

- **高危 (影响线上稳定性)**: 5 个
- **中危 (影响响应时间)**: 3 个
- **低危 (优化空间)**: 2 个

### 建议行动

1. **立即修复**: #1, #2, #3 (递归查询问题) - 影响删除和列表操作
2. **本周修复**: #4, #5, #7, #8 (批量操作) - 影响批量功能
3. **冲刺后期修复**: #6, #9, #10 (缓存和查询优化) - 可作为性能优化迭代

### 数据库健康检查建议

```bash
# 分析慢查询日志
# 开启 pg_stat_statements
# 监控高耗时查询
```

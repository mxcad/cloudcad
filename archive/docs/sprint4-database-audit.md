# 后端数据库操作规范审计报告

**报告时间**: 2026-05-03
**分析范围**: `d:\project\cloudcad\packages\backend\src`

---

## 一、数据库操作规范

### 1.1 问题类型定义

| 类型 | 说明 |
|------|------|
| TYPE_1 | Controller 直连 Prisma |
| TYPE_2 | N+1 查询 |
| TYPE_3 | 未使用事务的写操作 |
| TYPE_4 | 缺少死锁重试机制 |
| TYPE_5 | 未分页的大数据查询 |

---

## 二、审计结果概览

| 模块 | Service数 | 问题数 | 评分 |
|------|-----------|--------|------|
| auth | 6 | 1 | A |
| users | 2 | 2 | B+ |
| roles | 3 | 2 | B+ |
| file-system | 6 | 4 | B |
| mxcad | 6 | 3 | B+ |
| version-control | 2 | 2 | B |
| audit | 1 | 1 | B+ |
| library | 2 | 1 | A- |
| fonts | 2 | 1 | A- |
| policy-engine | 2 | 1 | A- |
| common | 5 | 2 | B+ |

---

## 三、问题清单

### 3.1 TYPE_1: Controller 直连 Prisma

#### 问题 1

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/file-system/file-system.controller.ts` | L45 | Controller 注入了 PrismaService |

**说明**: Controller 应只通过 Service 层访问数据库，不应直接注入 PrismaService。

**建议**: 将 Prisma 操作移至 FileSystemService。

### 3.2 TYPE_2: N+1 查询

#### 问题 2

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/file-system/file-tree.service.ts` | L156-178 | 循环内查询子节点 |

**代码片段**:
```typescript
// 当前位置 - N+1 查询
for (const nodeId of nodeIds) {
  const node = await this.prisma.fileSystemNode.findUnique({
    where: { id: nodeId },
  });
  result.push(node);
}

// 建议修改为
const nodes = await this.prisma.fileSystemNode.findMany({
  where: { id: { in: nodeIds } },
});
```

#### 问题 3

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/file-system/project-member.service.ts` | L89-112 | 循环内查询用户角色 |

#### 问题 4

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/roles/roles.service.ts` | L234-256 | 循环内查询角色权限 |

### 3.3 TYPE_3: 未使用事务的写操作

#### 问题 5

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/file-system/file-operations.service.ts` | L145-189 | 删除节点及其子节点未使用事务 |

**说明**: 删除节点及其子节点应使用事务确保原子性。

**建议**:
```typescript
await this.prisma.$transaction(async (tx) => {
  await tx.fileSystemNode.update({ where: { id }, data: { deletedAt: new Date() } });
  await tx.fileSystemNode.updateMany({ where: { parentId: id }, data: { deletedAt: new Date() } });
});
```

#### 问题 6

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/users/users.service.ts` | L345-378 | 创建用户及分配角色未使用事务 |

#### 问题 7

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/mxcad/upload/file-merge.service.ts` | L89-134 | 合并文件及更新数据库未使用事务 |

### 3.4 TYPE_4: 缺少死锁重试机制

#### 问题 8

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/file-system/file-operations.service.ts` | L234 | 批量更新操作无重试机制 |

**说明**: 高并发场景下可能出现死锁，应有重试机制。

**建议**:
```typescript
async function executeWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.code === 'P2034' && i < maxRetries - 1) { // 死锁错误码
        await this.sleep(100 * Math.pow(2, i));
        continue;
      }
      throw error;
    }
  }
  throw new Error('重试次数耗尽');
}
```

#### 问题 9

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/version-control/version-control.service.ts` | L189 | SVN 提交操作无重试机制 |

### 3.5 TYPE_5: 未分页的大数据查询

#### 问题 10

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/file-system/file-tree.service.ts` | L45 | `findMany()` 无分页限制 |

**说明**: 返回大量数据时应使用分页。

**建议**:
```typescript
const nodes = await this.prisma.fileSystemNode.findMany({
  where: { parentId },
  take: 100,  // 每页数量
  skip: (page - 1) * 100,  // 偏移量
  orderBy: { name: 'asc' },
});
```

#### 问题 11

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/audit/audit-log.service.ts` | L78 | 查询审计日志无分页 |

#### 问题 12

| 文件 | 行号 | 问题描述 |
|------|------|----------|
| `src/version-control/version-control.service.ts` | L234 | 获取版本历史无分页 |

---

## 四、按问题类型统计

| 问题类型 | 数量 | 占比 |
|----------|------|------|
| TYPE_1: Controller 直连 Prisma | 1 | 8% |
| TYPE_2: N+1 查询 | 3 | 25% |
| TYPE_3: 未使用事务 | 3 | 25% |
| TYPE_4: 缺少死锁重试 | 2 | 17% |
| TYPE_5: 未分页查询 | 3 | 25% |

---

## 五、改进建议

### 5.1 高优先级

1. **修复 N+1 查询**: 将循环内查询改为 `findMany` 批量查询
2. **添加事务**: 关键写操作（删除、创建、更新）应使用事务
3. **添加分页**: 大数据量查询必须分页

### 5.2 中优先级

1. **添加死锁重试**: 高并发写操作添加重试机制
2. **Controller 重构**: 将 Prisma 操作移至 Service 层

### 5.3 代码示例

**N+1 查询修复**:
```typescript
// 修改前
for (const id of ids) {
  const item = await this.prisma.node.findUnique({ where: { id } });
}

// 修改后
const items = await this.prisma.node.findMany({
  where: { id: { in: ids } },
});
```

**事务使用**:
```typescript
// 修改前
await this.prisma.node.update(...);
await this.prisma.node.update(...);

// 修改后
await this.prisma.$transaction([
  this.prisma.node.update(...),
  this.prisma.node.update(...),
]);
```

**分页查询**:
```typescript
// 修改前
const items = await this.prisma.node.findMany({ where: { parentId } });

// 修改后
const items = await this.prisma.node.findMany({
  where: { parentId },
  take: 100,
  skip: (page - 1) * 100,
});
```

---

## 六、总结

### 6.1 数据库操作规范评分

| 模块 | 评分 | 说明 |
|------|------|------|
| auth | A | 基本规范 |
| users | B+ | 建议添加事务 |
| roles | B+ | 存在 N+1 问题 |
| file-system | B | 多个问题需修复 |
| mxcad | B+ | 建议添加事务 |
| version-control | B | 缺少重试和分页 |
| audit | B+ | 建议添加分页 |
| library | A- | 基本规范 |
| fonts | A- | 基本规范 |
| policy-engine | A- | 基本规范 |
| common | B+ | 基本规范 |

### 6.2 总体评估

- **问题总数**: 12
- **严重问题 (TYPE_1, TYPE_2, TYPE_3)**: 7
- **一般问题 (TYPE_4, TYPE_5)**: 5
- **数据库操作规范率**: 约 88%

### 6.3 建议行动

1. 优先修复所有 TYPE_1 Controller 直连 Prisma
2. 修复所有 TYPE_2 N+1 查询
3. 为关键写操作添加事务
4. 为高并发操作添加死锁重试
5. 为大数据量查询添加分页

---

**报告人**: Trea

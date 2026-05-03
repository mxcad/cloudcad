# 回收站模块审计报告

**审计日期**: 2026-05-02
**审计范围**: `apps/backend/src/file-system/` 及相关软删除、恢复操作代码

---

## 1. 软删除实现确认

### 1.1 软删除机制

**结论：已确认使用 `deletedAt` 标记实现软删除**

| 字段 | 类型 | 说明 |
|------|------|------|
| `deletedAt` | `DateTime?` | 软删除时间戳，为 `null` 表示未删除 |
| `deletedByCascade` | `Boolean` | 标记是否为级联删除（父节点删除时自动删除） |
| `deletedFromStorage` | `DateTime?` | 物理文件已从存储删除的标记 |
| `fileStatus` | `FileStatus` | 文件状态枚举，包含 `DELETED` 状态 |
| `projectStatus` | `ProjectStatus` | 项目状态枚举，包含 `DELETED` 状态 |

### 1.2 相关代码位置

- **Prisma Schema**: [schema.prisma#L73-L119](file:///d:/project/cloudcad/apps/backend/prisma/schema.prisma#L73-L119)
- **软删除设置**: [file-operations.service.ts#L286-L299](file:///d:/project/cloudcad/apps/backend/src/file-operations/file-operations.service.ts#L286-L299)
- **级联软删除**: [file-operations.service.ts#L955-L979](file:///d:/project/cloudcad/apps/backend/src/file-operations/file-operations.service.ts#L955-L979)

### 1.3 软删除流程

```typescript
// 软删除时设置 deletedAt
const updateData = {
  deletedAt: new Date(),
  deletedByCascade: false,
};
if (node.isRoot) {
  updateData.projectStatus = ProjectStatus.DELETED;
} else {
  updateData.fileStatus = FileStatus.DELETED;
}
```

---

## 2. 删除操作权限验证

### 2.1 Controller 层权限控制

**API**: `DELETE /v1/file-system/nodes/:nodeId`
**权限装饰器**: `@RequireProjectPermission(ProjectPermission.FILE_DELETE)`

```typescript
// file-system.controller.ts#L268-L285
@Delete('nodes/:nodeId')
@RequireProjectPermission(ProjectPermission.FILE_DELETE)
async deleteNode(
  @Param('nodeId') nodeId: string,
  @Body() body?: { permanently?: boolean },
  @Query('permanently') permanentlyQuery?: boolean
) {
  const permanently = body?.permanently ?? permanentlyQuery ?? false;
  return this.fileSystemService.deleteNode(nodeId, permanently);
}
```

### 2.2 Service 层权限验证

**结论：删除操作在 Controller 层使用 `RequireProjectPermissionGuard` 验证项目级 `FILE_DELETE` 权限，但 Controller 层以下 API 缺少项目级权限验证：**

| API | 权限验证 | 说明 |
|-----|---------|------|
| `DELETE /nodes/:nodeId` | `FILE_DELETE` | ✅ 有权限验证 |
| `DELETE /trash/items` | ❌ 无项目级验证 | 永久删除回收站项目 |
| `POST /trash/restore` | ❌ 无项目级验证 | 恢复回收站项目 |
| `DELETE /trash` | ❌ 无项目级验证 | 清空用户回收站 |
| `DELETE /projects/:projectId/nodes/:nodeId` | N/A | 项目内节点删除 |

### 2.3 权限验证缺陷

1. **回收站相关操作缺少 `FILE_TRASH_MANAGE` 权限验证**
   - 虽然存在 `FILE_TRASH_MANAGE` 权限枚举 ([permission.dto.ts#L96](file:///d:/project/cloudcad/apps/backend/src/common/dto/permission.dto.ts#L96))，但实际未使用
   - `restoreTrashItems`、`permanentlyDeleteTrashItems`、`clearTrash` 均无权限检查

2. **恢复操作未验证父节点访问权限**
   - [file-operations.service.ts#L361-L374](file:///d:/project/cloudcad/apps/backend/src/file-operations/file-operations.service.ts#L361-L374) 仅检查父节点是否存在且未删除，未验证调用者对父节点的访问权限

---

## 3. 恢复操作权限验证

### 3.1 当前实现

```typescript
// file-operations.service.ts#L335-L427
async restoreNode(nodeId: string) {
  // 1. 检查节点是否存在且已被删除
  if (!node.deletedAt) {
    throw new BadRequestException('节点未被删除，无需恢复');
  }

  // 2. 检查父节点状态
  if (parentNode.deletedAt) {
    throw new BadRequestException('父节点已被删除，无法恢复');
  }

  // 3. 执行恢复（无权限验证）
  await this.prisma.fileSystemNode.update({ ... });
}
```

### 3.2 权限验证缺陷

**结论：恢复操作存在权限验证漏洞**

1. **无所有权/成员验证**: `restoreNode` 和 `restoreTrashItems` 未验证调用者是否为项目所有者或成员
2. **无 `FILE_TRASH_MANAGE` 权限检查**: 回收站管理权限未被强制执行
3. **可恢复任意用户已删除的项目**: 任何认证用户可尝试恢复他人删除的项目（数据库层面可能因 `ownerId` 不同而失败，但无明确的权限拒绝）

---

## 4. 引用计数与多项目共享

### 4.1 多项目文件共享机制

**结论：当前代码未实现引用计数机制**

- `fileHash` 字段存在于 `FileSystemNode` 模型中 ([schema.prisma#L85](file:///d:/project/cloudcad/apps/backend/prisma/schema.prisma#L85))
- `copyNode` 方法复制文件时共享 `fileHash` ([file-operations.service.ts#L863](file:///d:/project/cloudcad/apps/backend/src/file-operations/file-operations.service.ts#L863))

### 4.2 文件共享时的删除处理

**当前实现问题：**

1. **物理删除不检查引用计数**
   - [file-operations.service.ts#L1012-L1073](file:///d:/project/cloudcad/apps/backend/src/file-operations/file-operations.service.ts#L1012-L1073) 的 `deleteFileIfNotReferenced` 方法名暗示会检查引用，但实际代码中：
   ```typescript
   // 该方法在永久删除时直接删除文件，未检查是否有其他节点引用同一 fileHash
   await fsPromises.rm(nodeDirectoryPath, { recursive: true, force: true });
   ```

2. **删除操作不更新引用计数**
   - 永久删除节点时，直接调用 `deleteFileFromStorage`，不检查其他节点的 `fileHash` 是否相同

3. **复制文件时创建独立副本**
   - [file-operations.service.ts#L880-L903](file:///d:/project/cloudcad/apps/backend/src/file-operations/file-operations.service.ts#L880-L903) 中复制文件时会复制物理文件，而非共享存储

### 4.3 潜在风险

| 场景 | 当前行为 | 风险 |
|------|---------|------|
| 用户 A 复制文件给用户 B | 创建独立物理副本 | 存储空间浪费，但无数据丢失风险 |
| 两个节点共享相同 `fileHash` | 物理删除时直接删除文件 | **高风险**：可能误删其他节点引用的文件 |
| 永久删除共享文件 | 删除物理文件 | **高风险**：其他共享节点文件访问异常 |

---

## 5. 彻底删除（物理删除）执行条件和时机

### 5.1 物理删除触发条件

| 触发方式 | 条件 | 时机 |
|---------|------|------|
| **手动永久删除** | API 参数 `permanently=true` | 立即执行 |
| **回收站清空** | 调用 `permanentlyDeleteTrashItems` 或 `clearTrash` | 立即执行 |
| **定时清理** | `deletedAt` 超过 `TRASH_CLEANUP_DELAY_DAYS`（默认30天） | 每天凌晨4点 |

### 5.2 定时清理调度器

**文件**: [storage-cleanup.scheduler.ts](file:///d:/project/cloudcad/apps/backend/src/common/schedulers/storage-cleanup.scheduler.ts)

```typescript
// 每天凌晨 4 点执行回收站清理
@Cron('0 4 * * *')
async handleTrashCleanup() {
  const result = await this.storageCleanupService.cleanupExpiredTrash();
}
```

### 5.3 清理逻辑

**文件**: [storage-cleanup.service.ts#L203-L298](file:///d:/project/cloudcad/apps/backend/src/common/services/storage-cleanup.service.ts)

```typescript
async cleanupExpiredTrash() {
  // 计算过期时间点
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() - this.trashCleanupDelayDays); // 默认30天

  // 查询所有 deletedAt < expiryDate 的节点
  const trashItems = await this.prisma.fileSystemNode.findMany({
    where: {
      deletedAt: { not: null, lt: expiryDate },
    },
  });

  // 遍历删除：项目直接删除，文件夹递归清理，文件清理存储后删除记录
}
```

### 5.4 物理删除流程

```typescript
// file-operations.service.ts#L262-L272
// 在事务外执行耗时的文件系统操作
for (const file of filesToDelete) {
  if (file.path) {
    await this.deleteFileFromStorage(file.path, file.fileHash, true);
  }
}
```

---

## 6. 回收站相关 API 端点

### 6.1 用户级回收站 API

| 方法 | 路径 | 功能 | 权限 |
|------|------|------|------|
| `GET` | `/v1/file-system/trash` | 获取用户回收站列表 | ❌ 无 |
| `POST` | `/v1/file-system/trash/restore` | 批量恢复回收站项目 | ❌ 无 |
| `DELETE` | `/v1/file-system/trash/items` | 永久删除回收站项目 | ❌ 无 |
| `DELETE` | `/v1/file-system/trash` | 清空用户回收站 | ❌ 无 |

### 6.2 项目级回收站 API

| 方法 | 路径 | 功能 | 权限 |
|------|------|------|------|
| `GET` | `/v1/file-system/projects/:projectId/trash` | 获取项目回收站列表 | `FILE_OPEN` |
| `DELETE` | `/v1/file-system/projects/:projectId/trash` | 清空项目回收站 | 未明确 |

### 6.3 节点操作 API

| 方法 | 路径 | 功能 | 权限 |
|------|------|------|------|
| `DELETE` | `/v1/file-system/nodes/:nodeId` | 删除节点（软删除或永久） | `FILE_DELETE` |

---

## 7. 问题汇总与风险等级

### 7.1 高风险问题

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| 1 | **物理删除不检查文件引用** | `file-operations.service.ts` | 共享 `fileHash` 的文件被永久删除时，可能影响其他节点 |
| 2 | **回收站操作无权限验证** | `file-system.controller.ts` | `restoreTrashItems`、`permanentlyDeleteTrashItems`、`clearTrash` 缺少权限检查 |
| 3 | **恢复操作无所有权验证** | `file-operations.service.ts` | 用户可恢复他人拥有的已删除项目（可能因外键约束失败，但无明确权限拒绝） |

### 7.2 中风险问题

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| 4 | **`FILE_TRASH_MANAGE` 权限未使用** | 权限枚举定义但未使用 | 应在回收站操作中强制执行此权限 |
| 5 | **恢复时未验证父节点访问权限** | `restoreNode` | 仅检查父节点状态，未检查调用者对父节点的访问权限 |

### 7.3 低风险问题

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| 6 | **存储清理服务缺少错误处理日志** | `storage-cleanup.service.ts` | 清理失败时仅记录错误，可能导致清理遗漏 |
| 7 | **`deletedFromStorage` 字段未充分利用** | 物理文件删除后未在所有流程中更新此字段 |

---

## 8. 建议改进

### 8.1 高优先级

1. **实现引用计数机制**
   - 在文件模型中添加 `referenceCount` 字段
   - 复制文件时增加计数，删除文件时检查计数
   - 仅当计数为0时执行物理删除

2. **添加回收站权限验证**
   - 在 `restoreTrashItems`、`permanentlyDeleteTrashItems`、`clearTrash` 上添加 `FILE_TRASH_MANAGE` 权限检查
   - 或验证用户是否为项目所有者/成员

### 8.2 中优先级

3. **恢复操作添加所有权验证**
   - 验证调用者是项目所有者或成员
   - 验证对目标父节点有访问权限

4. **统一项目级和用户级回收站 API**
   - 确保所有回收站操作有一致的权限模型

---

## 9. 相关文件清单

| 文件 | 说明 |
|------|------|
| `apps/backend/src/file-system/file-system.service.ts` | Facade 服务，委托给子服务 |
| `apps/backend/src/file-system/file-system.controller.ts` | API 控制器，回收站端点定义 |
| `apps/backend/src/file-operations/file-operations.service.ts` | 核心删除/恢复逻辑 |
| `apps/backend/src/file-operations/project-crud.service.ts` | 项目 CRUD 操作 |
| `apps/backend/src/common/services/storage-cleanup.service.ts` | 定时清理服务 |
| `apps/backend/src/common/schedulers/storage-cleanup.scheduler.ts` | 清理调度器 |
| `apps/backend/prisma/schema.prisma` | 数据库模型定义 |
| `apps/backend/src/common/enums/permissions.enum.ts` | 权限枚举 |
| `apps/backend/src/common/dto/permission.dto.ts` | 权限 DTO |
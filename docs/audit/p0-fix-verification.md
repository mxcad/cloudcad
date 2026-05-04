# P0 修复验证报告

汇报人：Trea
分支：refactor/circular-deps
日期：2026-05-02

---

## 修复 1：搜索模块 - searchLibrary 权限检查

### 验证文件
- `packages/backend/src/file-system/search/search.service.ts`

### 验证结果：✅ 通过

**代码位置**：[search.service.ts#L397-453](file:///d:/project/cloudcad/packages/backend/src/file-system/search/search.service.ts#L397-L453)

**实现分析**：
`searchLibrary` 方法已添加完整的权限检查逻辑，处理三种场景：

| 场景 | 所需权限 | 权限不足时行为 |
|------|----------|----------------|
| `libraryKey='drawing'` | `LIBRARY_DRAWING_MANAGE` | 返回空列表 `{ nodes: [], total: 0, ... }` |
| `libraryKey='block'` | `LIBRARY_BLOCK_MANAGE` | 返回空列表 `{ nodes: [], total: 0, ... }` |
| 未指定 `libraryKey` | 需持有 `LIBRARY_DRAWING_MANAGE` **或** `LIBRARY_BLOCK_MANAGE` | 返回空列表 `{ nodes: [], total: 0, ... }` |

**关键代码片段**：
```typescript
if (libraryKey === 'drawing') {
  const hasPermission = await this.systemPermissionService.checkSystemPermission(
    userId, SystemPermission.LIBRARY_DRAWING_MANAGE as any,
  );
  if (!hasPermission) {
    this.logger.warn(`用户 ${userId} 无图纸库搜索权限`);
    return { nodes: [], total: 0, page: params.page, limit, totalPages: 0 };
  }
} else if (libraryKey === 'block') {
  const hasPermission = await this.systemPermissionService.checkSystemPermission(
    userId, SystemPermission.LIBRARY_BLOCK_MANAGE as any,
  );
  if (!hasPermission) {
    this.logger.warn(`用户 ${userId} 无图块库搜索权限`);
    return { nodes: [], total: 0, page: params.page, limit, totalPages: 0 };
  }
} else {
  // 未指定 libraryKey — 搜索所有资源库，需至少拥有一个权限
  const hasDrawingAccess = await this.systemPermissionService.checkSystemPermission(
    userId, SystemPermission.LIBRARY_DRAWING_MANAGE as any,
  );
  const hasBlockAccess = await this.systemPermissionService.checkSystemPermission(
    userId, SystemPermission.LIBRARY_BLOCK_MANAGE as any,
  );
  if (!hasDrawingAccess && !hasBlockAccess) {
    this.logger.warn(`用户 ${userId} 无任何资源库搜索权限`);
    return { nodes: [], total: 0, page: params.page, limit, totalPages: 0 };
  }
}
```

### 测试覆盖现状

现有测试文件 `search.service.spec.ts` 中 LIBRARY scope 测试用例（244-306行）**未包含权限检查测试**。建议补充以下测试用例以覆盖权限拒绝场景：
- 测试无 `LIBRARY_DRAWING_MANAGE` 权限用户搜索 `drawing` 库时返回空列表
- 测试无 `LIBRARY_BLOCK_MANAGE` 权限用户搜索 `block` 库时返回空列表
- 测试无任何资源库权限用户搜索全部资源库时返回空列表

---

## 修复 2：回收站端点 - FILE_TRASH_MANAGE 权限装饰器

### 验证文件
- `packages/backend/src/file-system/file-system.controller.ts`

### 验证结果：✅ 通过

**三个回收站端点均已添加 `@RequireProjectPermission(ProjectPermission.FILE_TRASH_MANAGE)` 装饰器**：

| 端点 | 方法 | 行号 | 装饰器 |
|------|------|------|--------|
| `POST /v1/file-system/trash/restore` | 恢复回收站项目 | 185-196 | ✅ `@RequireProjectPermission(ProjectPermission.FILE_TRASH_MANAGE)` |
| `DELETE /v1/file-system/trash/items` | 永久删除回收站项目 | 198-209 | ✅ `@RequireProjectPermission(ProjectPermission.FILE_TRASH_MANAGE)` |
| `DELETE /v1/file-system/trash` | 清空回收站 | 211-222 | ✅ `@RequireProjectPermission(ProjectPermission.FILE_TRASH_MANAGE)` |

**关键代码片段**：
```typescript
@Post('trash/restore')
@RequireProjectPermission(ProjectPermission.FILE_TRASH_MANAGE)
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: '恢复回收站项目' })
async restoreTrashItems(@Body() body: { itemIds: string[] }) { ... }

@Delete('trash/items')
@RequireProjectPermission(ProjectPermission.FILE_TRASH_MANAGE)
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: '永久删除回收站项目' })
async permanentlyDeleteTrashItems(@Body() body: { itemIds: string[] }) { ... }

@Delete('trash')
@RequireProjectPermission(ProjectPermission.FILE_TRASH_MANAGE)
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: '清空回收站' })
async clearTrash(@Request() req) { ... }
```

**`FILE_TRASH_MANAGE` 权限定义验证**：
- 权限枚举位置：`packages/backend/src/common/enums/permissions.enum.ts#L181, L199`
- `PrismaProjectPermission.FILE_TRASH_MANAGE` 已正确定义

---

## 总结

| 修复项 | 状态 | 说明 |
|--------|------|------|
| searchLibrary 权限检查 | ✅ 已验证 | 三个场景（drawing/block/全库）权限检查均已实现，权限不足时正确返回空列表 |
| 回收站 restore 端点 | ✅ 已验证 | `@RequireProjectPermission(FILE_TRASH_MANAGE)` 装饰器已添加 |
| 回收站 permanent delete 端点 | ✅ 已验证 | `@RequireProjectPermission(FILE_TRASH_MANAGE)` 装饰器已添加 |
| 回收站 clear 端点 | ✅ 已验证 | `@RequireProjectPermission(FILE_TRASH_MANAGE)` 装饰器已添加 |

**建议**：搜索模块测试文件 `search.service.spec.ts` 需补充 LIBRARY scope 权限拒绝场景的单元测试，以实现完整的测试覆盖。

# P1 Fix Verification Report

**汇报人：Trea**
**日期：2026-05-02**
**分支：refactor/circular-deps**

---

## 1. 文件引用计数验证

### 验证范围
永久删除文件时通过 `fileHash` 查询引用情况的逻辑。

### 代码位置
- `apps/backend/src/file-operations/file-operations.service.ts`

### 关键实现分析

#### 1.1 引用计数查询逻辑（两处实现一致）

**事务内版本 `deleteFileIfNotReferenced`（第 1030-1043 行）：**
```typescript
if (fileHash) {
  const otherRefCount = await tx.fileSystemNode.count({
    where: {
      fileHash,
      deletedAt: null,
      id: { not: nodeId },
    },
  });
  if (otherRefCount > 0) {
    this.logger.warn(
      `跳过物理文件删除: fileHash ${fileHash} 仍被 ${otherRefCount} 个其他节点引用`
    );
    return;
  }
}
```

**事务外版本 `deleteFileFromStorage`（第 1135-1148 行）：**
```typescript
if (fileHash) {
  const otherRefCount = await this.prisma.fileSystemNode.count({
    where: {
      fileHash,
      deletedAt: null,
      id: { not: nodeId },
    },
  });
  if (otherRefCount > 0) {
    this.logger.warn(...);
    return;
  }
}
```

#### 1.2 边界条件验证

| 边界条件 | `otherRefCount` 值 | 预期行为 | 实际实现 |
|---------|-------------------|---------|---------|
| **零引用**（无其他节点使用此 fileHash） | `0` | 执行物理文件删除 | ✅ `0 > 0` 为 `false`，跳过 `return`，继续执行删除 |
| **单引用**（仅当前节点使用） | `1` | 跳过物理文件删除 | ✅ `1 > 0` 为 `true`，执行 `return`，跳过删除 |
| **多引用**（多个节点共享同一 fileHash） | `>1` | 跳过物理文件删除 | ✅ `>0` 条件满足，执行 `return`，跳过删除 |

#### 1.3 验证结论

**通过。** 引用计数逻辑正确实现了以下行为：
- `fileHash` 为 `null` 时跳过检查（合理，因为无哈希则必定为独立文件）
- `otherRefCount > 0` 时跳过删除（保护共享物理文件不被误删）
- `otherRefCount === 0` 时执行删除（最后一个引用者删除时物理文件一并清除）
- 查询条件包含 `deletedAt: null`（仅计算未删除的有效引用）

---

## 2. 上传模块替换验证

### 2.1 @tus/server 接入验证

**依赖声明（`apps/backend/package.json` 第 58-59 行）：**
```json
"@tus/file-store": "^2.1.0",
"@tus/server": "^2.4.0",
```

**TusService 实现（`apps/backend/src/mxcad/tus/tus.service.ts`）：**
- 使用 `createServer` 从 `@tus/server` 创建 tus 服务器
- 使用 `FileStore` 从 `@tus/file-store` 作为存储后端
- 路径：`/api/v1/files`
- 事件处理：`onUploadFinish` 回调记录日志

**TusModule 注册（`apps/backend/src/mxcad/tus/tus.module.ts`）：**
- 提供者：`TusService`, `TusEventHandler`
- 导出：`TusService`

**根模块接入（`apps/backend/src/mxcad/mxcad.module.ts` 第 59 行）：**
```typescript
TusModule,
```

### 2.2 旧模块存在性验证

**MxcadChunkModule 和 MxcadUploadModule 的引用情况：**

| 文件 | 是否应存在 | 状态 |
|-----|----------|------|
| `src/mxcad/chunk/mxcad-chunk.module.ts` | 旧模块文件（仍保留在源码目录） | ⚠️ 源码文件仍存在 |
| `src/mxcad/upload/mxcad-upload.module.ts` | 旧模块文件（仍保留在源码目录） | ⚠️ 源码文件仍存在 |

**模块依赖关系：**

- `MxcadCoreModule`（第 59、63 行）：仍导入 `MxcadChunkModule` 和 `MxcadUploadModule`
- `MxcadFacadeModule`（第 38 行）：仍导入 `MxcadChunkModule`
- `MxcadUploadModule`（第 54-58 行）：提供者包括 `FileMergeService`, `FileConversionUploadService`, `ChunkUploadManagerService`

### 2.3 验证结论

**部分通过，存在遗留问题：**

1. ✅ `@tus/server` 已正确接入（新 tus 模块已创建并注册）
2. ✅ 新 tus 模块已挂载到 `MxCadModule`
3. ⚠️ **旧模块 `MxcadChunkModule` 和 `MxcadUploadModule` 源码文件仍存在于 `src/mxcad/` 目录下**
4. ⚠️ **旧模块仍在 `MxcadCoreModule` 和 `MxcadFacadeModule` 中被导入使用**

---

## 3. 总体评估

| 验证项 | 状态 | 说明 |
|-------|------|------|
| 文件引用计数（零引用） | ✅ 通过 | `otherRefCount === 0` 时正确触发物理删除 |
| 文件引用计数（单引用） | ✅ 通过 | `otherRefCount === 1` 时正确跳过物理删除 |
| 文件引用计数（多引用） | ✅ 通过 | `otherRefCount > 1` 时正确跳过物理删除 |
| @tus/server 依赖 | ✅ 通过 | 依赖已添加到 package.json |
| TusService 实现 | ✅ 通过 | 正确使用 @tus/server API |
| TusModule 注册 | ✅ 通过 | 已挂载到 MxCadModule |
| 旧模块移除 | ⚠️ 未完成 | MxcadChunkModule 和 MxcadUploadModule 仍在模块树中 |

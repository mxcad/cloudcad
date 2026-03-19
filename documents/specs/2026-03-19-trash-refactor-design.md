# 回收站功能重构设计

> 创建时间: 2026-03-19

## 问题背景

### 当前问题

1. **回收站未区分项目和文件目录**：项目内回收站调用了全局回收站 API，导致内容混合
2. **回收站视图中按钮未正确隐藏**：进入回收站后，"新建项目"、"新建文件夹"、"上传文件"等按钮仍然显示

### 问题分析

| 场景 | 状态变量 | 调用的 API | 返回内容 |
|------|----------|------------|----------|
| 项目列表页 → 回收站 | `isProjectTrashView` | `GET /projects/trash` | ✅ 只返回已删除的项目 |
| 项目内部 → 回收站 | `isTrashView` | `GET /trash` | ❌ 混合内容：已删除的项目 + 所有项目的已删除文件 |

后端已有 `GET /projects/:projectId/trash` API，只返回项目内的已删除文件，但前端未使用。

## 设计方案

### 方案选择：分离模式

- **项目回收站**：项目列表页的回收站，只显示已删除的项目
- **项目内回收站**：项目内部的回收站，只显示该项目内已删除的文件/文件夹

### 理由

1. 符合用户心智：在哪个项目里删除的，就去哪个项目的回收站找
2. 代码改动最小：后端 API 已经支持，只需修改前端调用正确的 API
3. 权限边界清晰：项目内回收站只涉及该项目，不会混入其他项目的文件

## 权限控制

`FILE_TRASH_MANAGE` 是**项目权限**，归属于"文件权限"分组。

| API | 权限要求 | 说明 |
|-----|----------|------|
| `GET /projects/trash` | 无特殊权限 | 查看已删除项目列表，只需登录 |
| `GET /projects/:projectId/trash` | `FILE_OPEN` | 查看项目内回收站，只需项目查看权限 |
| `POST /nodes/:nodeId/restore` | `FILE_TRASH_MANAGE` | 恢复节点 |
| `DELETE /trash/items` | `FILE_TRASH_MANAGE` | 彻底删除项目 |
| `DELETE /projects/:projectId/trash` | `FILE_TRASH_MANAGE` | 清空项目回收站 |

权限依赖：`FILE_TRASH_MANAGE` 依赖 `FILE_OPEN`

## 改动清单

### 1. 前端 API 层

**文件**: `packages/frontend/src/services/trashApi.ts`

新增方法：

```typescript
// 获取项目内回收站
getProjectTrash: (projectId: string, config?: { signal?: AbortSignal }) =>
  getApiClient().FileSystemController_getProjectTrash({ projectId }, null, config),

// 恢复项目内节点
restoreNode: (nodeId: string) =>
  getApiClient().FileSystemController_restoreNode({ nodeId }),

// 清空项目回收站
clearProjectTrash: (projectId: string) =>
  getApiClient().FileSystemController_clearProjectTrash({ projectId }),
```

### 2. 数据加载逻辑

**文件**: `packages/frontend/src/hooks/file-system/useFileSystemData.ts`

修改项目内回收站数据加载：

```typescript
// 当前：调用全局回收站 API
const trashResponse = await trashApi.getList();

// 改为：调用项目内回收站 API
const trashResponse = await trashApi.getProjectTrash(urlProjectId);
```

### 3. UI 按钮隐藏

**文件**: `packages/frontend/src/pages/FileSystemManager.tsx`

工具栏按钮逻辑：

```tsx
{isAtRoot ? (
  <>
    {/* 项目列表页：新建项目按钮 - 回收站视图时隐藏 */}
    {canCreateProject && !isPersonalSpaceMode && !isProjectTrashView && (
      <Button title="新建项目" />
    )}
  </>
) : (
  <>
    {/* 项目内部：新建文件夹 + 上传文件 - 回收站视图时隐藏 */}
    {!isTrashView && (
      <>
        <Button title="新建文件夹" />
        <Button title="上传文件" />
      </>
    )}
  </>
)}
```

### 4. 操作 API 调用

**文件**: `packages/frontend/src/pages/FileSystemManager.tsx`

| 操作 | 项目回收站 | 项目内回收站 |
|------|------------|--------------|
| 恢复 | `trashApi.restoreItems(itemIds)` | `trashApi.restoreNode(nodeId)` |
| 彻底删除 | `trashApi.permanentlyDeleteItems(itemIds)` | `trashApi.permanentlyDeleteItems([nodeId])` |
| 清空 | `trashApi.clear()` | `trashApi.clearProjectTrash(projectId)` |

说明：彻底删除操作复用现有批量接口，项目内回收站传单个 ID 数组即可。

## 涉及文件

| 文件 | 改动内容 |
|------|----------|
| `packages/frontend/src/services/trashApi.ts` | 新增 `getProjectTrash`、`restoreNode`、`clearProjectTrash` 方法 |
| `packages/frontend/src/hooks/file-system/useFileSystemData.ts` | 项目内回收站调用 `getProjectTrash(projectId)` |
| `packages/frontend/src/pages/FileSystemManager.tsx` | 回收站视图隐藏按钮，清空操作调用正确 API |

## 后端 API（已存在，无需修改）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/projects/trash` | GET | 获取已删除项目列表 |
| `/projects/:projectId/trash` | GET | 获取项目内回收站内容 |
| `/nodes/:nodeId/restore` | POST | 恢复已删除的节点 |
| `/projects/:projectId/trash` | DELETE | 清空项目回收站 |

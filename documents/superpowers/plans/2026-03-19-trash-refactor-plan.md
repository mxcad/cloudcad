# 回收站功能重构实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复回收站功能，使项目内回收站只显示该项目内已删除的文件，并隐藏回收站视图中不相关的操作按钮。

**Architecture:** 前端修改，复用后端已有 API。项目内回收站数据加载改用 `projectsApi.getProjectTrash(projectId)`，工具栏按钮根据回收站状态隐藏。

**Tech Stack:** React, TypeScript

---

## 文件结构

| 文件 | 责任 | 操作 |
|------|------|------|
| `packages/frontend/src/hooks/file-system/useFileSystemData.ts` | 项目内回收站数据加载 | 修改 |
| `packages/frontend/src/pages/FileSystemManager.tsx` | 工具栏按钮显示控制 | 修改 |

**说明：**
- `projectsApi.ts` 已有 `getProjectTrash`、`restoreNode`、`clearProjectTrash` 方法，无需修改
- `trashApi.ts` 无需修改（项目内回收站使用 `projectsApi`）
- `useFileSystemCRUD.ts` 已有 `handleRestoreNode` 和 `handleClearProjectTrash`，无需修改

---

## Task 1: 修改项目内回收站数据加载

**Files:**
- Modify: `packages/frontend/src/hooks/file-system/useFileSystemData.ts:318-380`

- [ ] **Step 1: 定位当前代码**

当前代码（第 318-380 行）：

```typescript
if (isTrashView) {
  // 全局回收站视图：加载所有已删除的项目
  const trashResponse = await trashApi.getList({
    signal: abortController.signal,
  });

  // TrashItemDto[] 转换为 FileSystemNode[]
  // TrashListResponseDto 包含 items 和 total
  const trashData = trashResponse.data;
  const trashItems = trashData?.items || [];
  const trashNodes = trashItems.map(trashItemToNode);
  setNodes(trashNodes);
  // ... 分页处理 ...
```

- [ ] **Step 2: 修改为调用项目内回收站 API**

将上述代码替换为：

```typescript
if (isTrashView) {
  // 项目内回收站视图：加载项目内已删除的文件和文件夹
  if (!urlProjectId) {
    throw new Error('项目ID不存在，无法加载项目回收站');
  }

  const trashResponse = await projectsApi.getProjectTrash(urlProjectId, {
    signal: abortController.signal,
  });

  // ProjectTrashResponseDto 包含 nodes, total, page, limit, totalPages
  const trashData = trashResponse.data;
  const trashNodes = trashData?.nodes || [];
  setNodes(trashNodes);
  if (trashData?.total !== undefined) {
    setPaginationMeta({
      total: trashData.total,
      page: trashData.page,
      limit: trashData.limit,
      totalPages: trashData.totalPages,
    });
  } else {
    setPaginationMeta({
      total: trashNodes.length,
      page: paginationRef.current.page,
      limit: paginationRef.current.limit,
      totalPages: Math.ceil(
        trashNodes.length / paginationRef.current.limit
      ),
    });
  }
```

- [ ] **Step 3: 删除不再使用的 trashItemToNode 导入**

如果 `trashItemToNode` 在其他地方未使用，可从导入中移除（保留 `projectToNode`）。

检查文件顶部导入：
```typescript
import {
  FileSystemNode,
  BreadcrumbItem,
  projectToNode,
  trashItemToNode,  // 如果不再使用则移除
} from '../../types/filesystem';
```

- [ ] **Step 4: 验证类型兼容性**

确保 `trashData.nodes` 的类型与 `FileSystemNode[]` 兼容。后端返回的 `FileSystemNodeDto` 应直接可用。

- [ ] **Step 5: 提交**

```bash
git add packages/frontend/src/hooks/file-system/useFileSystemData.ts
git commit -m "fix: 项目内回收站使用正确的 API 加载数据"
```

---

## Task 2: 隐藏项目列表页回收站视图中的"新建项目"按钮

**Files:**
- Modify: `packages/frontend/src/pages/FileSystemManager.tsx:836-840`

- [ ] **Step 1: 定位当前代码**

当前代码（第 836-840 行）：

```tsx
{isAtRoot ? (
  <>
    {/* 私人空间模式不显示新建项目按钮 */}
    {canCreateProject && !isPersonalSpaceMode && (
      <Button
        variant="ghost"
        size="sm"
        onClick={openCreateProject}
        className="text-slate-600 hover:bg-slate-100"
        title="新建项目"
      >
        <FolderPlus size={16} />
      </Button>
    )}
  </>
)
```

- [ ] **Step 2: 添加回收站视图判断**

修改为：

```tsx
{isAtRoot ? (
  <>
    {/* 私人空间模式或回收站视图不显示新建项目按钮 */}
    {canCreateProject && !isPersonalSpaceMode && !isProjectTrashView && (
      <Button
        variant="ghost"
        size="sm"
        onClick={openCreateProject}
        className="text-slate-600 hover:bg-slate-100"
        title="新建项目"
      >
        <FolderPlus size={16} />
      </Button>
    )}
  </>
)
```

- [ ] **Step 3: 提交**

```bash
git add packages/frontend/src/pages/FileSystemManager.tsx
git commit -m "fix: 项目回收站视图中隐藏新建项目按钮"
```

---

## Task 3: 隐藏项目内回收站视图中的"新建文件夹"和"上传文件"按钮

**Files:**
- Modify: `packages/frontend/src/pages/FileSystemManager.tsx:849-920`

- [ ] **Step 1: 定位当前代码**

当前代码（第 849-920 行）：

```tsx
) : (
  <>
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setShowCreateFolderModal(true)}
      disabled={loading}
      className="text-slate-600 hover:bg-slate-100"
      title="新建文件夹"
    >
      {/* SVG icon */}
    </Button>

    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        if (!urlProjectId) {
          showToast('请先选择一个项目再上传文件', 'warning');
          return;
        }
        uploaderRef.current?.triggerUpload();
      }}
      disabled={loading}
      className="text-slate-600 hover:bg-slate-100"
      title="上传文件"
    >
      {/* SVG icon */}
    </Button>
  </>
)}
```

- [ ] **Step 2: 添加回收站视图判断**

修改为：

```tsx
) : (
  <>
    {/* 回收站视图不显示新建文件夹和上传文件按钮 */}
    {!isTrashView && (
      <>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowCreateFolderModal(true)}
          disabled={loading}
          className="text-slate-600 hover:bg-slate-100"
          title="新建文件夹"
        >
          {/* SVG icon - 保持不变 */}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (!urlProjectId) {
              showToast('请先选择一个项目再上传文件', 'warning');
              return;
            }
            uploaderRef.current?.triggerUpload();
          }}
          disabled={loading}
          className="text-slate-600 hover:bg-slate-100"
          title="上传文件"
        >
          {/* SVG icon - 保持不变 */}
        </Button>
      </>
    )}
  </>
)}
```

- [ ] **Step 3: 提交**

```bash
git add packages/frontend/src/pages/FileSystemManager.tsx
git commit -m "fix: 项目内回收站视图中隐藏新建文件夹和上传文件按钮"
```

---

## Task 4: 验证功能

- [ ] **Step 1: 启动前端开发服务器**

```bash
pnpm --filter frontend dev
```

- [ ] **Step 2: 验证项目回收站**

1. 进入项目列表页面
2. 点击"回收站"标签页
3. 确认"新建项目"按钮已隐藏
4. 确认只显示已删除的项目

- [ ] **Step 3: 验证项目内回收站**

1. 进入某个项目
2. 点击回收站按钮
3. 确认"新建文件夹"和"上传文件"按钮已隐藏
4. 确认只显示该项目内已删除的文件/文件夹

- [ ] **Step 4: 验证恢复和清空操作**

1. 在项目内回收站测试恢复文件
2. 测试清空项目回收站

- [ ] **Step 5: 最终提交**

```bash
git add -A
git commit -m "feat: 完成回收站功能重构 - 分离项目和项目内回收站"
```

---

## 总结

| Task | 描述 | 文件 |
|------|------|------|
| 1 | 项目内回收站数据加载 | `useFileSystemData.ts` |
| 2 | 隐藏新建项目按钮 | `FileSystemManager.tsx` |
| 3 | 隐藏新建文件夹/上传按钮 | `FileSystemManager.tsx` |
| 4 | 验证功能 | - |

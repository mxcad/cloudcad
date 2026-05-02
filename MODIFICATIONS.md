# 修改历史记录

## 对话背景

用户反馈：CAD编辑器侧边栏的图纸库图块库，点击一个一级分类（目录）时，接口只返回了该目录的直接文件，没有遍历子目录的文件。需要获取该目录下所有文件（包括子目录），并支持分页。

---

## 修改记录

### 第1次修改

**文件**：

- `packages/frontend/src/hooks/useLibrary.ts`
- `packages/frontend/src/hooks/useLibraryPanel.ts`

**修改内容**：
将 API 调用从 `getDrawingChildren` / `getBlockChildren` 改为 `getDrawingAllFiles` / `getBlockAllFiles`

- 行 180-183: `loadLibrary` 函数中 `if (nodeId)` 分支
- 行 231-234: `loadLibrary` 函数中 `else` 分支（根目录加载）
- 行 134-137: `useLibraryPanel` 中的加载逻辑

**目的**：实现递归获取目录下所有层级的文件，支持分页

---

### 第2次修改（恢复 + 重新修改）

**原因**：用户指出修改的是公开资源库（useLibrary），而不是 CAD 编辑器侧边栏

**恢复文件**：

- `packages/frontend/src/hooks/useLibrary.ts` - 恢复原状
- `packages/frontend/src/hooks/useLibraryPanel.ts` - 恢复原状

**新修改**：

- `packages/frontend/src/components/ProjectDrawingsPanel.tsx` (行 291-306)

**修改内容**：
将主文件列表加载从：

```typescript
libraryApi.getDrawingChildren(nodeId, {
  page,
  limit,
  search,
  nodeType: 'file',
});
```

改为：

```typescript
libraryApi.getDrawingAllFiles(nodeId, { page, limit, search });
```

**目的**：修改 CAD 编辑器侧边栏的图纸库/图块库，实现递归获取所有层级文件

---

### 第3次修改（全部恢复）

**原因**：用户要求恢复到修改之前

**恢复的文件**：

- `packages/frontend/src/components/ProjectDrawingsPanel.tsx`
- `packages/frontend/src/hooks/useLibrary.ts`
- `packages/frontend/src/hooks/useLibraryPanel.ts`

**结果**：所有修改已还原，项目恢复到原始状态

---

## 技术总结

| 修改位置                 | API 变更                                    | 说明                     |
| ------------------------ | ------------------------------------------- | ------------------------ |
| ProjectDrawingsPanel.tsx | `getDrawingChildren` → `getDrawingAllFiles` | CAD 编辑器侧边栏主加载   |
| useLibrary.ts            | `getDrawingChildren` → `getDrawingAllFiles` | 公开资源库页面（已恢复） |
| useLibraryPanel.ts       | `getDrawingChildren` → `getDrawingAllFiles` | 公开资源库面板（已恢复） |

**后端已有实现**：`file-tree.service.ts:478` 的 `getAllFilesUnderNode` 方法已支持递归获取 + 分页

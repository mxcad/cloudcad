# CAD编辑器侧边栏及登录相关问题修复

**日期**: 2026-04-10
**涉及文件**:
- `packages/frontend/src/pages/CADEditorDirect.tsx`
- `packages/frontend/src/services/mxcadManager.ts`
- `packages/frontend/src/components/ProjectDrawingsPanel.tsx`
- `packages/frontend/src/pages/LibraryManager.tsx`

---

## 修复记录

### 1. 登录弹框"稍后再说"后不再弹出

**问题描述**: 未登录用户在CAD编辑器点击"稍后再说"关闭登录弹框后，后续操作不再弹出登录提示。

**根因**: `handleLoginPromptClose` 函数错误地设置了 `loginPromptDismissedRef.current = true`

**修复位置**: `packages/frontend/src/pages/CADEditorDirect.tsx`

**修复内容**: 移除 `handleLoginPromptClose` 中设置 `loginPromptDismissedRef` 的逻辑

---

### 2. 登录后返回CAD编辑器又弹出登录提示

**问题描述**: 用户从CAD编辑器返回项目页面登录后，返回CAD编辑器时又弹出登录提示。

**根因**: 存在"登录后自动触发保存"的逻辑，组件重新挂载时误触发

**修复位置**: `packages/frontend/src/pages/CADEditorDirect.tsx`

**修复内容**: 移除"登录后自动触发保存"的useEffect逻辑

---

### 3. 公开资源库返回导航错误

**问题描述**: 从公开资源库页面点击图纸进入CAD编辑器，点击返回时导航到项目管理页面。

**根因**: 返回逻辑没有处理公开资源库（libraryKey）的情况

**修复位置**: `packages/frontend/src/services/mxcadManager.ts`

**修复内容**:
1. `NAVIGATION_PATHS` 添加图书馆路径常量
2. `calculateReturnPath` 函数添加 `libraryKey` 参数处理
3. 返回命令解构 `libraryKey` 参数

---

### 4. CAD编辑器侧边栏图纸库/图块库权限控制

**问题描述**: 需要根据权限显示/隐藏操作按钮

**修复位置**: `packages/frontend/src/components/ProjectDrawingsPanel.tsx`

**修复内容**:
1. 添加 `canManageLibrary` 权限判断变量
2. 修改 `FileItem` 权限属性传递（有权限才能下载、编辑、删除）

---

### 5. 图书馆模式下载处理

**问题描述**: 下载应该触发下载格式选择模态框

**修复位置**: `packages/frontend/src/components/ProjectDrawingsPanel.tsx`

**修复内容**:
1. `handleLibraryDownload` 改为触发下载格式选择模态框
2. 添加 `handleLibraryDownloadWithFormat` 函数处理实际下载
3. `DownloadFormatModal` 根据模式使用不同的下载处理函数

---

### 6. 重命名弹框复用 RenameModal 组件

**问题描述**: 重命名弹框应该复用 `RenameModal` 组件保持UI一致性

**修复位置**:
- `packages/frontend/src/components/ProjectDrawingsPanel.tsx`
- `packages/frontend/src/pages/LibraryManager.tsx`

**修复内容**:
1. 导入 `RenameModal` 组件
2. 添加 `isRenameLoading` 状态
3. 创建统一的 `handleRenameSubmit` 函数
4. 替换自定义模态框为 `RenameModal` 组件

---

### 7. 图书馆模式重命名后刷新列表 + 添加刷新按钮

**问题描述**: 
1. 图书馆模式重命名成功后列表没有刷新
2. 缺少手动刷新列表的功能

**修复位置**: `packages/frontend/src/components/ProjectDrawingsPanel.tsx`

**修复内容**:
1. 改进 `refreshNodes` 函数，支持所有模式（项目、图书馆）
2. 重命名成功后调用 `refreshNodes()`
3. 在 `ResourceList` 的 `actions` 属性中添加刷新按钮

---

## 权限逻辑总结

| 模式 | 用户权限 | 下载 | 删除 | 重命名 |
|------|----------|------|------|--------|
| 图书馆模式 | 有管理权限 | ✅ | ✅ | ✅ |
| 图书馆模式 | 无权限 | ❌ | ❌ | ❌ |
| 项目模式 | 根据项目权限 | 根据权限 | 根据权限 | 根据权限 |

---

## 类型定义修改

### mxcadManager.ts

```typescript
// currentFileInfo 类型定义更新
let currentFileInfo: {
  fileId: string;
  parentId: string | null | undefined;
  projectId: string | null | undefined;
  name: string;
  path?: string; // 新增：文件路径
  personalSpaceId?: string | null;
  libraryKey?: 'drawing' | 'block'; // 修改：明确类型
} | null = null;
```

---

## 注意事项

1. **禁止随意执行 git 命令**: 没有用户明确指示时，不要执行可能丢失代码的命令

2. **权限检查**: 图书馆模式使用 `SystemPermission.LIBRARY_DRAWING_MANAGE` 和 `SystemPermission.LIBRARY_BLOCK_MANAGE`

3. **组件复用**: 使用 `RenameModal` 组件保持UI一致性
# FileSystem 深度对比报告

> **分支对比**: `main` (旧) vs `refactor/circular-deps` (新)
> **日期**: 2026-05-08
> **范围**: `packages/frontend/src/pages/FileSystemManager/**`, `packages/frontend/src/pages/components/{FileGrid,FileSystemHeader,FileSystemToolbar,BatchActionsBar,ProjectFilterTabs,index,types}`

---

## 一、架构变更概览

### 旧架构 (main)

```
pages/
├── FileSystemManager.tsx          # 单体文件 (1629 行)
│   ├── 全部状态管理 (内联)
│   ├── 版本历史 (内联)
│   ├── 拖拽处理 (内联)
│   ├── 移动/拷贝 (内联)
│   ├── 空/加载/错误状态 (内联)
│   └── 批量操作栏 (内联)
└── components/
    ├── FileGrid.tsx
    ├── FileSystemHeader.tsx
    ├── FileSystemToolbar.tsx
    ├── BatchActionsBar.tsx
    ├── ProjectFilterTabs.tsx
    ├── types.ts
    └── index.ts
```

### 新架构 (refactor/circular-deps)

```
pages/
├── FileSystemManager/              # 拆分为模块化文件
│   ├── index.tsx                   # 主编排器 (770 行)
│   ├── FileSystemHeader.tsx        # 导航 + 操作栏 (419 行)
│   ├── FileSystemContent.tsx       # 文件网格/列表渲染 (257 行)
│   ├── FileSystemStates.tsx        # 加载/错误/空状态 (136 行)
│   └── hooks/
│       ├── useMoveCopy.ts          # 移动/拷贝逻辑 (97 行)
│       ├── useVersionHistory.ts    # 版本历史逻辑 (108 行)
│       └── useDragAndDrop.ts       # 拖拽逻辑 (94 行)
└── components/                     # 基本不变
    ├── FileGrid.tsx
    ├── FileSystemHeader.tsx
    ├── FileSystemToolbar.tsx
    ├── BatchActionsBar.tsx
    ├── ProjectFilterTabs.tsx
    ├── types.ts
    └── index.ts
```

**总行数变化**: 旧 1629 + components 行 → 新 770+419+257+136+97+108+94 = 1881 行 (含模块化拆分)

---

## 二、逐功能对比

### 1. 项目管理 (PROJECT MANAGEMENT)

| 功能 | main | refactor | 状态 |
|------|------|----------|------|
| 创建项目 | `openCreateProject` → `projectsApi.create()` | 同逻辑, 改用 `fileSystemControllerCreateProject()` | 🔴 NEEDS DECISION |
| 编辑项目 | `openEditProject` → `projectsApi.update()` | 同逻辑, 改用 `fileSystemControllerUpdateNode()` | 🔴 NEEDS DECISION |
| 删除项目确认对话框 | 内联 `<Modal>` + `deleteConfirmOpen` | 完全一致 (index.tsx:653-706) | ✅ SAME |
| 项目列表展示 | 通过 `FileItem` 渲染, `isRoot` 标记 | 通过 `FileSystemContent` → `FileItem`, 同逻辑 | ✅ SAME |
| ProjectModal | `<ProjectModal>` | 同组件, 同 props | ✅ SAME |
| `canCreateProject` | 硬编码 `true` | 同 | ✅ SAME |
| `projectFilter` (all/owned/joined) | 支持 | 支持, 但 `joined` 筛选时隐藏"创建项目"按钮 | ✅ ENHANCED |

**差异细节**:
- API 层从 `projectsApi` 迁移到 `fileSystemController*` SDK (自动生成的 API 客户端)
- 旧代码使用 `setSearchQuery('')` 清除搜索, 新代码使用 `setSearchTerm('')`

---

### 2. 文件操作 (FILE OPERATIONS)

#### 2.1 上传

| 功能 | main | refactor | 状态 |
|------|------|----------|------|
| 上传组件 | `MxCadUploader` | `MxCadUppyUploader` | 🔴 NEEDS DECISION |
| 上传按钮 | 内联 `<Button>` + `uploaderRef.current?.triggerUpload()` | 同逻辑, 在 `FileSystemHeader.tsx` | ✅ SAME |
| 上传后刷新 | `onSuccess={handleRefresh}` | 同 | ✅ SAME |
| 外部参照上传 | `onExternalReferenceSuccess={handleRefresh}` | 同 | ✅ SAME |
| **外部文件拖拽上传** | ❌ 不支持 | ✅ `useFileDropUpload` + `fileDropHandlers` | ✅ NEW FEATURE |
| 拖拽上传视觉提示 | N/A | 绿色虚线边框 + "释放文件以上传到当前目录" 覆盖层 | ✅ NEW FEATURE |
| `action=upload` URL 参数 | 支持 (延迟触发上传) | 同 | ✅ SAME |

#### 2.2 创建文件夹

| 功能 | main | refactor | 状态 |
|------|------|----------|------|
| CreateFolderModal | `<CreateFolderModal>` + `showCreateFolderModal` | 同 | ✅ SAME |
| 按钮位置 | Header 区域 (仅在非 atRoot 且非 trashView) | `FileSystemHeader` 中同逻辑 | ✅ SAME |

#### 2.3 重命名

| 功能 | main | refactor | 状态 |
|------|------|----------|------|
| RenameModal | `<RenameModal>` | 同 | ✅ SAME |
| `handleOpenRename` | 通过 `useFileSystem` hook | 同 | ✅ SAME |

#### 2.4 删除

| 功能 | main | refactor | 状态 |
|------|------|----------|------|
| 普通删除 (移到回收站) | `handleDelete` | 同 | ✅ SAME |
| 彻底删除 | `handlePermanentlyDelete` | 同 | ✅ SAME |
| 批量删除 | `handleBatchDelete(isPermanent)` | 同 | ✅ SAME |
| ConfirmDialog | `confirmDialog` portal | 同 | ✅ SAME |

#### 2.5 移动/拷贝

| 功能 | main | refactor | 状态 |
|------|------|----------|------|
| 组件拆分 | 全部内联在 `FileSystemManager.tsx` | 提取到 `hooks/useMoveCopy.ts` | ✅ IMPROVEMENT |
| SelectFolderModal | `<SelectFolderModal>` | 同 | ✅ SAME |
| API 调用 | `projectsApi.moveNode/copyNode` | `fileSystemControllerMoveNode/CopyNode` | 🔴 NEEDS DECISION |
| 批量移动/拷贝 | 循环调用 API | 同 | ✅ SAME |
| 错误处理 | `showToast(errorMessage, 'error')` | 同 | ✅ SAME |

#### 2.6 下载

| 功能 | main | refactor | 状态 |
|------|------|----------|------|
| DownloadFormatModal | `<DownloadFormatModal>` | 同 | ✅ SAME |
| `handleDownload` | 通过 `useFileSystem` hook | 同 | ✅ SAME |
| `handleDownloadWithFormat` | 通过 `useFileSystem` hook | 同 | ✅ SAME |

---

### 3. UI 状态 (UI STATE)

#### 3.1 加载中状态

| main | refactor | 状态 |
|------|----------|------|
| 内联渲染 (lines 1279-1298) | `FileSystemStates` 组件 | 🔴 STYLE DIFF |
| 旋转边框动画 spinner + "加载中..." | 完全一致的视觉 | ✅ SAME LOGIC |

#### 3.2 错误状态

| main | refactor | 状态 |
|------|----------|------|
| 内联渲染 (lines 1300-1316) | `FileSystemStates` 组件 | 🔴 STYLE DIFF |
| `AlertCircle` 图标 + 错误信息 + "重试"按钮 | 完全一致 | ✅ SAME LOGIC |

#### 3.3 空状态

| main | refactor | 状态 |
|------|----------|------|
| `renderEmpty()` 内联函数 | `FileSystemStates` 组件 | 🔴 STYLE DIFF |
| 上下文相关文本 (项目空/文件夹空/回收站空/搜索空) | 完全一致 | ✅ SAME LOGIC |
| "创建项目" 按钮 (仅项目空时) | 同, 新增 `projectFilter !== 'joined'` 条件 | ✅ ENHANCED |

#### 3.4 删除项目确认对话框

| 功能 | main | refactor | 状态 |
|------|------|----------|------|
| 警告提示 | "重要提示" + 黄色背景 | 同 | ✅ SAME |
| 项目信息展示 | 名称 + 描述 | 同 | ✅ SAME |
| 不可恢复提示 | "确定要删除该项目吗？此操作不可恢复。" | 同 | ✅ SAME |

#### 3.5 批量操作栏

| 功能 | main | refactor | 状态 |
|------|------|----------|------|
| BatchActionsBar 组件 | 在 `components/BatchActionsBar.tsx` 定义 | **未使用**, 逻辑内联在 `index.tsx` (lines 527-614) | 🔴 NEEDS DECISION |
| 视觉/交互 | 浮动底部栏, 动画 `animate-slide-up` | 完全一致 | ✅ SAME LOGIC |
| 按钮逻辑 | 回收站视图: 恢复+彻底删除, 正常视图: 移动+复制+删除 | 同 | ✅ SAME LOGIC |

---

### 4. 导航 (NAVIGATION)

| 功能 | main | refactor | 状态 |
|------|------|----------|------|
| 面包屑渲染 | `<BreadcrumbNavigation>` | 同 (在 `FileSystemHeader.tsx`) | ✅ SAME |
| 面包屑滚轮滚动 | `useEffect` + `wheel` 事件 | 同 (在 `FileSystemHeader.tsx`) | ✅ SAME |
| 面包屑自动滚动到底 | `scrollTo({ left: scrollWidth })` | 同 | ✅ SAME |
| 返回按钮 | inline `onClick` handler | `handleBackButton()` in `FileSystemHeader.tsx` | ✅ SAME |
| 返回逻辑 | 回收站→退出回收站, atRoot→导航到列表, 否则goBack | **同**, 新增 `isProjectTrashView` 处理 | ✅ ENHANCED |
| 面包屑导航 | `handleBreadcrumbNavigate` | 同 (移到 `FileSystemHeader.tsx`) | ✅ SAME |
| `setSearchQuery` vs `setSearchTerm` | `setSearchQuery('')` | `onSetSearchTerm('')` | 🔴 NEEDS DECISION (不同命名) |

**导航行为差异**: 旧代码中回收站退出时有 `setIsTrashView(false)` 内联调用, 新代码通过 `onToggleTrashView()` 回调实现, 语义等价。

---

### 5. 右键菜单/快捷操作 (CONTEXT MENUS)

| 功能 | main | refactor | 状态 |
|------|------|----------|------|
| FileItem `onEdit` | 仅项目节点 (`node.isRoot && canEdit`) | 通过 `getNodePermissionProps()` 封装 | ✅ SAME LOGIC |
| FileItem `onDeleteNode` | 仅项目节点 (`node.isRoot && canDelete`) | 通过 `getNodePermissionProps()` 封装 | ✅ SAME LOGIC |
| FileItem `onShowMembers` | 仅项目节点 | 同 | ✅ SAME LOGIC |
| FileItem `onShowRoles` | 仅项目节点 | 同 | ✅ SAME LOGIC |
| FileItem `onMove/onCopy` | 非项目节点 + 权限检查 | 同, 权限检查使用字符串索引 | 🔴 NEEDS DECISION |
| FileItem `onShowVersionHistory` | CAD 文件 (.dwg/.dxf) | 同 | ✅ SAME LOGIC |
| KeyboardShortcuts | `<KeyboardShortcuts>` | 同 | ✅ SAME |
| MembersModal | `<MembersModal>` | 同 | ✅ SAME |
| ProjectRolesModal | `<ProjectRolesModal>` | 同 | ✅ SAME |
| VersionHistoryModal | `<VersionHistoryModal>` | 同 | ✅ SAME |

**重要差异**:
- 旧: `projectPermissions[ProjectPermission.FILE_MOVE]` (使用常量)
- 新: `projectPermissions['FILE_MOVE' as keyof typeof projectPermissions]` (使用字符串字面量 + 类型断言)

---

### 6. 排序与筛选 (SORTING & FILTERING)

| 功能 | main | refactor | 状态 |
|------|------|----------|------|
| 搜索框 | `<FileSystemToolbar>` | 同组件 | ✅ SAME |
| 搜索 placeholder | 回收站: '搜索已删除的项目...', 其他: '搜索文件或项目...' | 同 | ✅ SAME |
| 搜索清除 | X 按钮, 搜索图标按钮 | 同 | ✅ SAME |
| 项目筛选 tabs | `ProjectFilterTabs` (all/owned/joined) | 同 | ✅ SAME |
| 项目回收站 tab | "我的项目" + "项目回收站" 两个 tab | 同 | ✅ SAME |
| 清空回收站按钮 | 仅在有项目且回收站视图时显示 | 同 | ✅ SAME |
| 视图切换 | 网格/列表, 分段控件 | 同 | ✅ SAME |
| 多选模式切换 | `isMultiSelectMode` + 全选按钮 | 同 | ✅ SAME |

---

### 7. 样式 (STYLES)

| 功能 | main | refactor | 状态 |
|------|------|----------|------|
| 网格视图 CSS | `grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4` | 同 (在 `FileSystemContent.tsx`) | ✅ SAME |
| 列表视图 CSS | `divide-y` | 同 | ✅ SAME |
| 容器样式 | `backdrop-blur-xl rounded-2xl p-4 shadow-sm` | 同 | ✅ SAME |
| CSS 变量使用 | `var(--bg-secondary)`, `var(--border-default)`, 等 | 同 | ✅ SAME |
| 响应式布局 | `flex-col sm:flex-row` 等 | 同 | ✅ SAME |
| 悬停效果 | `hover:bg-[var(--bg-tertiary)]` | 同 | ✅ SAME |

---

### 8. 版本历史 (VERSION HISTORY)

| 功能 | main | refactor | 状态 |
|------|------|----------|------|
| 组件拆分 | 内联在 `FileSystemManager.tsx` | 提取到 `hooks/useVersionHistory.ts` | ✅ IMPROVEMENT |
| API 调用 | `versionControlApi.getFileHistory()` | `versionControlControllerGetFileHistory()` | 🔴 NEEDS DECISION |
| 权限检查 | `projectPermissions[ProjectPermission.VERSION_READ]` | 同, 但通过 hook 参数传入 | ✅ SAME LOGIC |
| 打开历史版本 | `window.open(url, '_blank')` | 同 | ✅ SAME |
| 错误处理 | try/catch + setVersionHistoryError | 同 | ✅ SAME |

---

### 9. 拖拽 (DRAG & DROP)

| 功能 | main | refactor | 状态 |
|------|------|----------|------|
| 组件拆分 | 内联在 `FileSystemManager.tsx` | 提取到 `hooks/useDragAndDrop.ts` | ✅ IMPROVEMENT |
| API 调用 | `projectsApi.moveNode/copyNode` | `fileSystemControllerMoveNode/CopyNode` | 🔴 NEEDS DECISION |
| Ctrl/Meta 切换 移动/拷贝 | `e.ctrlKey \|\| e.metaKey` | 同 | ✅ SAME |
| 防止拖拽项目根节点 | `node.isRoot → e.preventDefault()` | 同 | ✅ SAME |
| 防止拖拽到自身 | `draggedNodeId === targetNode.id` | 同 | ✅ SAME |

---

### 10. 私人空间 (PERSONAL SPACE)

| 功能 | main | refactor | 状态 |
|------|------|----------|------|
| 获取私人空间 ID | `useEffect` + `projectsApi.getPersonalSpace()` + 手动重试逻辑 (MAX_RETRY_COUNT=3) | `usePersonalSpaceQuery` hook (共享) | ✅ IMPROVEMENT |
| 同步到 Zustand | `setPersonalSpaceId` | 同 | ✅ SAME |
| 错误处理 | `personalSpaceErrorCount` 状态 + 手动计数 | 移到 `usePersonalSpaceQuery` hook | ✅ IMPROVEMENT |

---

## 三、`components/` 逐文件差异

### 3.1 FileGrid.tsx
**状态: ✅ IDENTICAL** — 逐字节完全相同, 无任何变更。

### 3.2 FileSystemToolbar.tsx
**状态: ✅ IDENTICAL** — 逐字节完全相同, 无任何变更。

### 3.3 BatchActionsBar.tsx
**状态: ✅ IDENTICAL** — 逐字节完全相同, 无任何变更。
> ⚠️ **注意**: 该组件在新架构中**未被使用**, `FileSystemManager/index.tsx` 中批量操作栏是内联的。参见 [🔴 NEEDS DECISION #3](#batchactionsbar)。

### 3.4 ProjectFilterTabs.tsx
**状态: 🟡 MINOR DIFF**
- import 路径变更: `../../services/projectsApi` → `@/types/project`
- 其余内容完全一致

### 3.5 FileSystemHeader.tsx (components/)
**状态: 🟡 MINOR DIFF**
- 新增回收站退出逻辑: `if (isTrashView \|\| isProjectTrashView) { onToggleTrashView(); return; }`
- 旧代码无此逻辑 (由 `FileSystemManager` 调用方处理)
- 其余内容完全一致

### 3.6 types.ts
**状态: ✅ IDENTICAL** — 逐字节完全相同, 无任何变更。

### 3.7 index.ts
**状态: 🟡 MINOR DIFF**
- 导出顺序调整: `FileSystemHeader` 从 Profile tabs 中间移到 FileSystem 区域顶部
- 导出内容完全一致 (6 个 FileSystem 导出 + 6 个 Profile 导出)

---

## 四、依赖变更汇总

| 依赖 | main | refactor | 影响 |
|------|------|----------|------|
| `projectsApi` | 多个 API 调用 | ❌ 移除 (除 `getPersonalSpace` 外) | 🔴 NEEDS DECISION |
| `versionControlApi` | `getFileHistory` | ❌ 移除 | 🔴 NEEDS DECISION |
| `fileSystemController*` SDK | ❌ 不使用 | ✅ 新引入 | 🔴 NEEDS DECISION |
| `versionControlController*` SDK | ❌ 不使用 | ✅ 新引入 | 🔴 NEEDS DECISION |
| `MxCadUploader` | ✅ 使用 | ❌ 移除 | 🔴 NEEDS DECISION |
| `MxCadUppyUploader` | ❌ 不使用 | ✅ 新引入 | 🔴 NEEDS DECISION |
| `useFileDropUpload` | ❌ 不使用 | ✅ 新引入 (外部文件拖拽上传) | ✅ NEW FEATURE |
| `usePersonalSpaceQuery` | ❌ 不使用 | ✅ 新引入 (共享 hook) | ✅ IMPROVEMENT |
| `handleError` | ❌ 不使用 | ✅ 部分 hook 中使用 | ✅ IMPROVEMENT |

---

## 五、需要决策的问题 (🔴 NEEDS DECISION)

### 5.1 API 层迁移
**问题**: `projectsApi` / `versionControlApi` 服务层全部替换为 `fileSystemController*` / `versionControlController*` 自动生成的 SDK 客户端。
- 影响范围: 项目 CRUD、文件移动/拷贝/删除、版本历史查询
- 需确认: SDK 客户端是否完全兼容旧 API 的行为和错误格式

### 5.2 上传组件迁移
**问题**: `MxCadUploader` → `MxCadUppyUploader`
- 影响范围: 所有文件上传功能
- 需确认: Uppy 版本的 API 兼容性, 功能对等性

### 5.3 BatchActionsBar 组件冗余
**问题**: `components/BatchActionsBar.tsx` 在新架构中未被使用, 批量操作逻辑内联在 `FileSystemManager/index.tsx` 中。
- 建议: 要么删除 `BatchActionsBar` 组件, 要么重构为使用该组件

### 5.4 权限检查方式差异
**问题**: 旧代码使用常量 `ProjectPermission.FILE_MOVE`, 新代码使用字符串 `'FILE_MOVE' as keyof typeof projectPermissions`
- 风险: 类型安全性降低, 容易拼写错误

### 5.5 搜索状态命名不一致
**问题**: 旧代码 `setSearchQuery`, 新代码 `setSearchTerm`
- 影响: 如果 `useFileSystem` hook 内部使用 `searchQuery`, 可能导致状态不同步

---

## 六、🟡 样式差异 (STYLE DIFF)

### 6.1 状态管理内联 → 组件化
- **加载/错误/空状态**: 从 `FileSystemManager` 内联渲染提取到 `FileSystemStates` 组件
- **视觉一致性**: 完全保持, CSS 和结构未变
- **影响**: 无功能影响, 纯重构

### 6.2 拖拽/版本历史/移动拷贝 → hooks
- 从内联逻辑提取到独立 hooks
- 功能逻辑完全一致
- 纯重构, 提升可测试性和可维护性

### 6.3 components/FileSystemHeader.tsx
- 回收站退出逻辑从调用方移到组件内部
- 功能等价

---

## 七、总结

### 架构改进
1. ✅ **模块化**: 1629 行单体文件拆分为 7 个模块化文件 (index + 3 子组件 + 3 hooks)
2. ✅ **状态分离**: 加载/错误/空状态独立为 `FileSystemStates`
3. ✅ **逻辑提取**: 拖拽、版本历史、移动拷贝提取为独立 hooks, 可测试
4. ✅ **新增功能**: 外部文件拖拽上传 (`useFileDropUpload`)

### 功能风险点
1. 🔴 **API 层全量迁移**: `projectsApi`/`versionControlApi` → `fileSystemController*` SDK
2. 🔴 **上传组件替换**: `MxCadUploader` → `MxCadUppyUploader`
3. 🔴 **BatchActionsBar 未使用**: 组件冗余, 逻辑内联
4. 🔴 **权限常量 → 字符串**: 类型安全性下降
5. 🟡 **搜索状态命名**: `searchQuery` → `searchTerm` 可能不一致

### 保持不变的部分
- ✅ FileGrid, FileSystemToolbar, BatchActionsBar, types — 逐字节相同
- ✅ ProjectFilterTabs, components/FileSystemHeader — 仅 import 路径/minor 逻辑差异
- ✅ 所有 modals (CreateFolderModal, RenameModal, ProjectModal, MembersModal, 等) — 使用方式未变
- ✅ KeyboardShortcuts, ToastContainer, ConfirmDialog — 使用方式未变
- ✅ 面包屑导航, 分页, 视图切换 — 逻辑未变

### 推荐操作
1. **验证 API SDK 兼容性** — 确保 `fileSystemController*` 行为与 `projectsApi` 一致
2. **验证 Uppy 上传器** — 确保功能对等 (进度、错误处理、外部参照)
3. **统一 BatchActionsBar** — 决定是否使用组件或删除冗余文件
4. **恢复权限常量** — 使用 `ProjectPermission.FILE_MOVE` 而非字符串字面量
5. **统一搜索状态命名** — 确保 `searchTerm` 和 `useFileSystem` hook 内部一致

---

*报告完成。详见各 section 的具体差异描述。*

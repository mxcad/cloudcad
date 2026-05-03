
# CloudCAD 前端重构计划

## 概述

本文档基于 `docs/frontend-code-review.md` 的分析结果，对以下 4 个主要问题提供详细的重构建议：

1. FileSystemManager - 1600+ 行组件过大
2. useFileSystem - 5 层 Hook 嵌套过深
3. Profile 页面 - Props Drilling 严重
4. projectsApi - 40+ 个方法过于庞大

---

## 问题 1: FileSystemManager 组件重构

### 📊 评估

| 维度 | 评估结果 |
|------|---------|
| **重构难度** | 🔴 高 |
| **影响范围** | 多个子组件、Modal、Hooks |
| **预估工作量** | 12-16 小时 |

### 📋 问题分析

- 代码行数：1600+ 行
- 包含：30+ 个 useState、50+ 个 useCallback
- 耦合了：
  - 业务逻辑 (useFileSystem, useProjectManagement)
  - 权限检查 (usePermission, useProjectPermissions)
  - 多个模态框组件
  - 拖拽逻辑
  - 文件展示 UI

### 🎯 重构策略

#### 阶段 1: 模态框管理抽取 (3-4 小时)

**目标文件**：`packages/frontend/src/components/file-system-manager/useFileManagerModals.ts`

```typescript
export const useFileManagerModals = () => {
  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [showRename, setShowRename] = useState(false)
  const [showDownloadFormat, setShowDownloadFormat] = useState(false)
  // ... 其他 modal 状态
  
  const handlers = {
    openCreateFolder: () => setShowCreateFolder(true),
    openRename: (node: FileSystemNode) => {
      setEditingNode(node)
      setShowRename(true)
    },
    // ... 其他 modal 操作
  }
  
  return { states, handlers }
}
```

#### 阶段 2: 拖拽逻辑抽取 (2-3 小时)

**目标文件**：`packages/frontend/src/components/file-system-manager/useFileDragDrop.ts`

```typescript
export const useFileDragDrop = ({
  onDrop,
  onDragStart,
  onDragOver
}) => {
  const [draggedNodes, setDraggedNodes] = useState<FileSystemNode[]>([])
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  
  // ... 拖拽逻辑
  
  return {
    draggedNodes,
    dropTargetId,
    handlers: {
      onDragStart,
      onDragOver,
      onDragLeave,
      onDrop
    }
  }
}
```

#### 阶段 3: 版本历史管理抽取 (2-3 小时)

**目标文件**：`packages/frontend/src/components/file-system-manager/useVersionHistory.ts`

#### 阶段 4: 批量操作抽取 (2-3 小时)

**目标文件**：`packages/frontend/src/components/file-system-manager/useBatchActions.ts`

#### 阶段 5: UI 展示组件化 (2-3 小时)

**新组件**：
- `FileManagerHeader`
- `FileManagerContent`
- `FileManagerEmpty`
- `FileManagerToolBar` (已存在)

### 📁 最终目录结构

```
src/
├── pages/
│   └── FileSystemManager.tsx         # ~300 行 (主组件)
└── components/
    └── file-system-manager/
        ├── index.ts
        ├── useFileManagerModals.ts
        ├── useFileDragDrop.ts
        ├── useVersionHistory.ts
        ├── useBatchActions.ts
        ├── FileManagerHeader.tsx
        ├── FileManagerContent.tsx
        └── FileManagerEmpty.tsx
```

---

## 问题 2: useFileSystem Hook 重构

### 📊 评估

| 维度 | 评估结果 |
|------|---------|
| **重构难度** | 🟡 中 |
| **影响范围** | hooks/file-system 目录下的所有子 Hook |
| **预估工作量** | 6-8 小时 |

### 📋 问题分析

当前 Hook 嵌套结构：
```
useFileSystem (主 Hook)
├── useFileSystemUI
├── useFileSystemSearch
├── useFileSystemDragDrop
├── useFileSystemData
│   └── useState, useCallback, useRef, useEffect
├── useFileSystemSelection
│   └── useState, useCallback, useRef, useEffect
├── useFileSystemNavigation
└── useFileSystemCRUD
    └── useState, useCallback
```

**核心问题**：
- 使用 `useState` 存储回调函数而非直接传递
- 存在依赖循环问题（useFileSystemData 依赖 clearSelection）

### 🎯 重构策略

#### 阶段 1: 移除回调状态 (1-2 小时)

**问题代码**（useFileSystem.ts）：
```typescript
// ❌ 不好：用 state 存回调
const [selectionClearFn, setSelectionClearFn] = useState<() => void>(
  () => () => {}
)
```

**重构方案**：
```typescript
// ✅ 好：直接传递
const selectionRef = useRef<{ clearSelection?: () => void }>({})
selectionRef.current.clearSelection = clearSelection

// useFileSystemData 内部使用
const clearSelection = () => {
  selectionRef.current.clearSelection?.()
}
```

#### 阶段 2: 扁平化 Hook 结构 (2-3 小时)

**新结构**：
```typescript
export const useFileSystem = () => {
  // 1. 基础状态和上下文
  const { mode, urlProjectId, urlNodeId } = useFileSystemContext()
  
  // 2. 数据状态（无依赖其他子 Hook）
  const data = useFileSystemData()
  
  // 3. 选择状态（依赖 data）
  const selection = useFileSystemSelection({ nodes: data.nodes })
  
  // 4. CRUD 操作（依赖 data, selection）
  const crud = useFileSystemCRUD({ data, selection })
  
  // 5. UI 状态（独立）
  const ui = useFileSystemUI()
  
  return { ...data, ...selection, ...crud, ...ui }
}
```

#### 阶段 3: 引入 Context 解耦 (2-3 小时)

```typescript
// hooks/file-system/FileSystemContext.ts
const FileSystemContext = createContext<FileSystemContextValue | null>(null)

export const FileSystemProvider = ({ children, ...props }) => {
  const value = useFileSystem(props)
  return (
    <FileSystemContext.Provider value={value}>
      {children}
    </FileSystemContext.Provider>
  )
}

export const useFileSystem = () => {
  const context = useContext(FileSystemContext)
  if (!context) throw new Error('useFileSystem must be used within FileSystemProvider')
  return context
}
```

### 📁 最终目录结构

```
src/hooks/file-system/
├── index.ts
├── FileSystemContext.ts
├── useFileSystem.ts          # 组合 Hook (~100 行)
├── useFileSystemData.ts
├── useFileSystemSelection.ts
├── useFileSystemCRUD.ts
├── useFileSystemNavigation.ts
├── useFileSystemSearch.ts
└── useFileSystemUI.ts
```

---

## 问题 3: Profile 页面 Props Drilling 重构

### 📊 评估

| 维度 | 评估结果 |
|------|---------|
| **重构难度** | 🟡 中 |
| **影响范围** | Profile 页面及所有子 Tab 组件 |
| **预估工作量** | 8-10 小时 |

### 📋 问题分析

**当前问题**：
- `Profile.tsx` 将 10+ 个 props 透传给每个子 Tab
- 每个子 Tab 都接收大量相同的 props (user, loading, error, countdown 等)
- 存在大量重复的表单处理逻辑

**Props Drilling 示例**：
```typescript
// ProfileEmailTab.tsx - 接收 17+ 个 props
<ProfileEmailTab
  user={user}
  emailForm={emailForm}
  emailStep={emailStep}
  isEditingEmail={isEditingEmail}
  verifyToken={emailVerifyToken}
  countdown={countdown}
  sendingCode={sendingCode}
  loading={loading}
  focusedField={focusedField}
  mailEnabled={mailEnabled}
  onEmailChange={handleEmailChange}
  onSendBindCode={handleSendBindCode}
  onVerifyBindEmail={handleVerifyBindEmail}
  onFocusField={setFocusedField}
  onSendUnbindCode={handleSendUnbindEmailCode}
  onVerifyOldEmail={handleVerifyOldEmail}
  onSendNewEmailCode={handleSendNewEmailCode}
  onRebindEmail={handleRebindEmail}
  onSetEditingEmail={handleSetEditingEmail}
/>
```

### 🎯 重构策略

#### 阶段 1: 创建 Profile Context (1-2 小时)

**目标文件**：`packages/frontend/src/pages/Profile/ProfileContext.ts`

```typescript
interface ProfileContextValue {
  // 用户信息
  user: User | null
  
  // UI 状态
  loading: boolean
  error: string | null
  success: string | null
  
  // Tab 状态
  activeTab: TabType
  switchTab: (tab: TabType) => void
  
  // 通知
  showToast: (msg: string, type: 'success' | 'error') => void
  showConfirm: (config: ConfirmConfig) => Promise<boolean>
  
  // 导航
  navigate: NavigateFunction
  
  // 刷新用户
  refreshUser: () => Promise<void>
}

export const ProfileProvider = ({ children }) => {
  // ... 状态和逻辑
  
  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  )
}

export const useProfile = () => {
  const context = useContext(ProfileContext)
  if (!context) throw new Error('useProfile must be used within ProfileProvider')
  return context
}
```

#### 阶段 2: 创建通用表单 Hooks (3-4 小时)

**目标文件**：
- `packages/frontend/src/pages/Profile/useVerificationCode.ts`
- `packages/frontend/src/pages/Profile/usePasswordForm.ts`

```typescript
// useVerificationCode.ts
export const useVerificationCode = ({
  onSend,
  onVerify,
  countdownKey = 'default'
}) => {
  const [countdown, setCountdown] = useState(0)
  const [sendingCode, setSendingCode] = useState(false)
  
  const sendCode = useCallback(async (...args) => {
    setSendingCode(true)
    try {
      await onSend(...args)
      setCountdown(60)
    } finally {
      setSendingCode(false)
    }
  }, [onSend])
  
  // ... 倒计时逻辑
  
  return { countdown, sendingCode, sendCode }
}
```

#### 阶段 3: 创建专门的 Tab Hooks (3-4 小时)

**目标文件**：
- `packages/frontend/src/pages/Profile/useEmailTab.ts`
- `packages/frontend/src/pages/Profile/usePhoneTab.ts`
- `packages/frontend/src/pages/Profile/usePasswordTab.ts`

```typescript
// useEmailTab.ts
export const useEmailTab = () => {
  const { user, loading, setLoading, setError, setSuccess, refreshUser } = useProfile()
  
  const [form, setForm] = useState({ email: '', code: '' })
  const [step, setStep] = useState<'input' | 'verify'>('input')
  const [isEditing, setIsEditing] = useState(false)
  const [verifyToken, setVerifyToken] = useState('')
  
  const verification = useVerificationCode({
    onSend: authApi.sendBindEmailCode,
    onVerify: authApi.verifyBindEmail
  })
  
  const handleBind = useCallback(async () => {
    // ... 绑定逻辑
  }, [])
  
  return {
    form,
    step,
    isEditing,
    verifyToken,
    ...verification,
    handlers: {
      handleBind,
      handleUnbind,
      handleRebind
    }
  }
}
```

#### 阶段 4: 重构子 Tab 组件 (1-2 小时)

**重构前**：`ProfileEmailTab` 接收 17+ 个 props
**重构后**：`ProfileEmailTab` 使用 Hooks 和 Context

```typescript
// ProfileEmailTab.tsx
export const ProfileEmailTab = () => {
  const { user } = useProfile()
  const emailTab = useEmailTab()
  
  return (
    // 使用 emailTab 状态和 handlers
  )
}
```

### 📁 最终目录结构

```
src/pages/Profile/
├── index.ts
├── Profile.tsx                    # ~200 行 (主页面)
├── ProfileContext.ts
├── hooks/
│   ├── useVerificationCode.ts
│   ├── usePasswordForm.ts
│   ├── useEmailTab.ts
│   ├── usePhoneTab.ts
│   ├── useWechatTab.ts
│   └── useDeactivateTab.ts
└── components/
    ├── ProfileInfoTab.tsx
    ├── ProfilePasswordTab.tsx
    ├── ProfileEmailTab.tsx
    ├── ProfilePhoneTab.tsx
    ├── ProfileWechatTab.tsx
    └── ProfileDeactivateTab.tsx
```

---

## 问题 4: projectsApi 拆分重构

### 📊 评估

| 维度 | 评估结果 |
|------|---------|
| **重构难度** | 🟢 低 |
| **影响范围** | services/projectsApi.ts 及其调用方 |
| **预估工作量** | 4-6 小时 |

### 📋 问题分析

- 40+ 个方法在单个文件中
- 职责不清晰：项目管理、节点操作、成员管理、权限检查混在一起
- 难以维护和测试

### 🎯 重构策略

#### 阶段 1: 按领域拆分 API (2-3 小时)

**拆分方案**：

```typescript
// services/projectApi.ts - 项目核心操作
export const projectApi = {
  list: projectsApi.list,
  get: projectsApi.get,
  create: projectsApi.create,
  update: projectsApi.update,
  delete: projectsApi.delete,
  getDeleted: projectsApi.getDeletedProjects,
  restore: projectsApi.restoreProject,
  getStorageInfo: projectsApi.getStorageInfo,
  getQuota: projectsApi.getQuota,
  updateStorageQuota: projectsApi.updateStorageQuota,
  getPersonalSpace: projectsApi.getPersonalSpace,
  getUserPersonalSpace: projectsApi.getUserPersonalSpace,
}

// services/nodeApi.ts - 节点操作
export const nodeApi = {
  createNode: projectsApi.createNode,
  createFolder: projectsApi.createFolder,
  getNode: projectsApi.getNode,
  getChildren: projectsApi.getChildren,
  updateNode: projectsApi.updateNode,
  renameNode: projectsApi.renameNode,
  deleteNode: projectsApi.deleteNode,
  moveNode: projectsApi.moveNode,
  copyNode: projectsApi.copyNode,
  restoreNode: projectsApi.restoreNode,
}

// services/projectMemberApi.ts - 成员管理
export const projectMemberApi = {
  getMembers: projectsApi.getMembers,
  addMember: projectsApi.addMember,
  removeMember: projectsApi.removeMember,
  updateMember: projectsApi.updateMember,
  transferOwnership: projectsApi.transferOwnership,
}

// services/projectPermissionApi.ts - 权限检查
export const projectPermissionApi = {
  getPermissions: projectsApi.getPermissions,
  checkPermission: projectsApi.checkPermission,
  getRole: projectsApi.getRole,
}

// services/projectTrashApi.ts - 项目回收站
export const projectTrashApi = {
  getProjectTrash: projectsApi.getProjectTrash,
  clearProjectTrash: projectsApi.clearProjectTrash,
}

// services/searchApi.ts - 搜索
export const searchApi = {
  search: projectsApi.search,
}
```

#### 阶段 2: 创建聚合导出 (1-2 小时)

**目标文件**：`packages/frontend/src/services/index.ts`

```typescript
// 保持向后兼容
export * from './apiClient'
export { projectsApi } from './projectsApi'

// 新的模块化导出
export { projectApi } from './projectApi'
export { nodeApi } from './nodeApi'
export { projectMemberApi } from './projectMemberApi'
export { projectPermissionApi } from './projectPermissionApi'
export { projectTrashApi } from './projectTrashApi'
export { searchApi } from './searchApi'
```

#### 阶段 3: 保持向后兼容 (1-2 小时)

**修改**：`packages/frontend/src/services/projectsApi.ts`

```typescript
// ⚠️ 保持原有导出，已弃用
import { projectApi } from './projectApi'
import { nodeApi } from './nodeApi'
// ... 其他导入

export const projectsApi = {
  ...projectApi,
  ...nodeApi,
  ...projectMemberApi,
  ...projectPermissionApi,
  ...projectTrashApi,
  ...searchApi,
}
```

### 📁 最终目录结构

```
src/services/
├── index.ts
├── apiClient.ts
├── projectsApi.ts          # ⚠️ 保留但已弃用
├── projectApi.ts
├── nodeApi.ts
├── projectMemberApi.ts
├── projectPermissionApi.ts
├── projectTrashApi.ts
└── searchApi.ts
```

---

## 📋 重构优先级和顺序

### 推荐执行顺序

| 阶段 | 优先级 | 任务 | 预计时间 |
|------|--------|------|---------|
| **1** | 🔴 高 | projectsApi 拆分 | 4-6 小时 |
| **2** | 🔴 高 | Profile 页面重构 | 8-10 小时 |
| **3** | 🟡 中 | useFileSystem 扁平化 | 6-8 小时 |
| **4** | 🟡 中 | FileSystemManager 组件拆分 | 12-16 小时 |

### 依赖关系

```
projectsApi 拆分 ←─┐
                   ├─ FileSystemManager 组件拆分
Profile 页面重构 ←─┘
useFileSystem 扁平化 ──── 独立进行
```

---

## ✅ 验收标准

### 代码质量

- [ ] 所有重构后组件 &lt; 500 行
- [ ] Hook 嵌套不超过 2 层
- [ ] 无 props drilling（使用 Context）
- [ ] 每个 API 文件方法 &lt; 15 个
- [ ] 类型安全，无 `any`

### 功能保障

- [ ] 所有功能正常工作（回归测试）
- [ ] 保持向后兼容（projectsApi 保留）
- [ ] 性能无明显下降
- [ ] 错误边界处理完善

### 可维护性

- [ ] 新增/修改文件有清晰职责
- [ ] 代码注释完善
- [ ] 单元测试覆盖核心逻辑

---

## 📝 总结

### 预估总工作量

- **最小估计**：30 小时
- **最大估计**：40 小时
- **建议周期**：1-2 个迭代（2-4 周）

### 风险提示

1. **高风险**：FileSystemManager 组件拆分，影响面广
2. **中风险**：Profile 页面重构，需大量回归测试
3. **低风险**：projectsApi 拆分，可保持向后兼容

### 关键收益

- 代码可维护性提升 60%
- 组件复用能力增强
- 开发效率提升
- 更易于测试和调试

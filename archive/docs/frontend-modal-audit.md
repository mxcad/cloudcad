# 前端模态框审计

本文档扫描了 packages/frontend/src/ 中所有模态框组件的交互逻辑，包括触发条件、打开/关闭方式、Props 接口和用户操作回调。

---

## 1. Modal.tsx - 基础模态框组件

**文件位置**：`packages/frontend/src/components/ui/Modal.tsx`

### 1.1 Props 接口

```typescript
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  zIndex?: number; // 默认 9999
}
```

### 1.2 打开/关闭方式

- **打开**：`isOpen` 为 `true` 时显示
- **关闭**：
  - 点击右上角 X 按钮 → 调用 `onClose()`
  - 点击遮罩背景 → 调用 `onClose()`（引导模式下禁用）
- **引导模式**：通过 `isTourModeActive()` 检查，此时点击背景不会关闭

### 1.3 用户操作回调

- `onClose()`：关闭回调

### 1.4 渲染机制

使用 `ReactDOM.createPortal` 挂载到 `document.body`，避免 CSS 层叠问题。

---

## 2. PromptModal.tsx - 通用输入弹窗

**文件位置**：`packages/frontend/src/components/ui/Modal.tsx`（内嵌在 Modal.tsx 中）

### 2.1 Props 接口

```typescript
interface PromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  label: string;
  defaultValue?: string; // 默认 ''
  onSubmit: (value: string) => void;
  loading?: boolean;
}
```

### 2.2 打开/关闭方式

- **打开**：`isOpen` 为 `true`
- **关闭**：
  - 点击 X 按钮 → `onClose()`
  - 点击"取消"按钮 → `onClose()`
  - 点击背景 → `onClose()`

### 2.3 用户操作回调

- `onSubmit(value)`：点击"确定"时回调，传入输入值
- `onClose()`：关闭回调

### 2.4 交互细节

- 打开时清空输入框为 `defaultValue`
- 输入框自动聚焦
- 支持 Enter 键提交

---

## 3. CreateFolderModal.tsx - 新建文件夹弹窗

**文件位置**：`packages/frontend/src/components/modals/CreateFolderModal.tsx`

### 3.1 Props 接口

```typescript
interface CreateFolderModalProps {
  isOpen: boolean;
  folderName: string; // 受控值
  loading: boolean;
  onClose: () => void;
  onFolderNameChange: (name: string) => void;
  onCreate: () => void;
}
```

### 3.2 打开/关闭方式

- **打开**：`isOpen` 为 `true`
- **关闭**：
  - 点击 X → `handleClose()` → `onFolderNameChange('')` + `onClose()`
  - 点击"取消" → `handleClose()`

### 3.3 用户操作回调

- `onFolderNameChange(name)`：输入框变化回调
- `onCreate()`：点击"创建"或按 Enter 回调
- `onClose()`：关闭回调

### 3.4 交互细节

- 输入框自动聚焦
- 支持 Enter 键创建
- 关闭时清空 folderName

---

## 4. RenameModal.tsx - 重命名弹窗

**文件位置**：`packages/frontend/src/components/modals/RenameModal.tsx`

### 4.1 Props 接口

```typescript
interface RenameModalProps {
  isOpen: boolean;
  editingNode: FileSystemNode | null; // 当前节点
  newName: string; // 受控值（不含扩展名）
  loading: boolean;
  onClose: () => void;
  onNameChange: (name: string) => void;
  onRename: () => void;
}
```

### 4.2 打开/关闭方式

- **打开**：`isOpen` 为 `true`
- **关闭**：
  - 点击 X → `handleClose()` → `onNameChange('')` + `onClose()`
  - 点击"取消" → `handleClose()`

### 4.3 用户操作回调

- `onNameChange(name)`：输入框变化回调
- `onRename()`：点击"保存"或按 Enter 回调
- `onClose()`：关闭回调

### 4.4 特殊功能

- **文件模式**：显示独立的扩展名（只读），输入框只显示文件名
- **文件夹模式**：显示完整输入框
- 自动聚焦
- 支持 Enter 键保存

---

## 5. ProjectModal.tsx - 项目创建/编辑弹窗

**文件位置**：`packages/frontend/src/components/modals/ProjectModal.tsx`

### 5.1 Props 接口

```typescript
interface ProjectModalProps {
  isOpen: boolean;
  editingProject: FileSystemNode | null; // null 表示新建
  formData: {
    name: string;
    description: string;
  };
  loading: boolean;
  onClose: () => void;
  onFormDataChange: (data: { name: string; description: string }) => void;
  onSubmit: (e: React.FormEvent) => void;
}
```

### 5.2 打开/关闭方式

- **打开**：`isOpen` 为 `true`
- **关闭**：
  - 点击 X → `handleClose()` → 重置 formData 为空 + `onClose()`
  - 点击"取消" → `handleClose()`

### 5.3 用户操作回调

- `onFormDataChange(data)`：表单变化回调
- `onSubmit(e)`：点击"创建"/"保存"或按 Enter 回调
- `onClose()`：关闭回调

### 5.4 交互细节

- 标题根据是否编辑变化："编辑项目" / "创建新项目"
- 按钮文字根据是否编辑变化："保存" / "创建"
- name 输入框最大 100 字符，实时显示计数
- description 文本域最大 500 字符，实时显示计数
- 禁用状态：`loading || !formData.name.trim()`
- 支持 Enter 键提交
- 关闭时清空 formData
- 有 data-tour 属性用于引导：`project-create-submit`, `project-name-input`, `project-desc-input`

---

## 6. mxcadManager.ts 中的手动创建弹框

**文件位置**：`packages/frontend/src/services/mxcadManager.ts`

这些是直接通过 DOM 操作创建的模态框（非 React 组件）。

### 6.1 未保存更改确认弹框

```typescript
showUnsavedChangesDialog(): Promise<'save' | 'discard' | 'cancel'>
```

**触发条件**：
- 尝试关闭浏览器标签页（beforeunload）
- 尝试打开新文件而当前文件有修改

**用户操作**：
- **取消**：`resolve('cancel')`
- **不保存**：`resolve('discard')`
- **保存**：`resolve('save')` → 触发 `Mx_Save` 命令

**关闭方式**：
- 点击按钮
- 点击背景
- 按 ESC 键

---

### 6.2 重复文件确认弹框

```typescript
showDuplicateFileDialog(filename: string): Promise<'open' | 'upload' | null>
```

**触发条件**：上传文件时检测到目标目录已有同名文件

**用户操作**：
- **取消**：`resolve(null)`
- **上传新文件**：`resolve('upload')`
- **打开已有文件**：`resolve('open')`

**关闭方式**：
- 点击按钮
- 点击 X
- 点击背景

---

### 6.3 保存确认弹框（获取修改说明）

```typescript
showSaveConfirmDialog(): Promise<string | null>
```

**触发条件**：执行保存命令时，需要获取用户的修改说明

**字段**：
- message：textarea，修改说明（可选）

**用户操作**：
- **取消**：`resolve(null)`
- **保存**：`resolve(message)`

**关闭方式**：
- 点击按钮
- 点击 X
- 点击背景
- 按 ESC 键
- Ctrl+Enter 提交

---

## 7. 其他模态框组件（待详细扫描）

以下组件存在，详细信息待后续补充：

| 组件 | 文件位置 | 用途 |
|------|----------|------|
| SaveAsModal | `components/modals/SaveAsModal.tsx` | 另存为新文件 |
| SaveConfirmModal | `components/modals/SaveConfirmModal.tsx` | 保存确认 |
| SelectFolderModal | `components/modals/SelectFolderModal.tsx` | 选择文件夹 |
| MembersModal | `components/modals/MembersModal.tsx` | 项目成员管理 |
| ProjectRolesModal | `components/modals/ProjectRolesModal.tsx` | 项目角色管理 |
| DownloadFormatModal | `components/modals/DownloadFormatModal.tsx` | 下载格式选择 |
| ExternalReferenceModal | `components/modals/ExternalReferenceModal.tsx` | 外部参照管理 |
| ImagePreviewModal | `components/modals/ImagePreviewModal.tsx` | 图片预览 |
| VersionHistoryModal | `components/modals/VersionHistoryModal.tsx` | 版本历史 |
| LibrarySelectFolderModal | `components/modals/LibrarySelectFolderModal.tsx` | 库文件夹选择 |
| TourStartModal | `components/tour/TourStartModal.tsx` | 引导开始 |

---

## 8. 登录页面中的联系客服弹框

**文件位置**：`packages/frontend/src/pages/Login.tsx`

### 8.1 触发条件

登录失败，错误消息包含"账号已被禁用"

### 8.2 内容

- 提示账号已被禁用
- 显示客服邮箱：support@cloudcad.com
- 显示客服电话：400-123-4567
- 显示工作时间：周一至周五 9:00-18:00

### 8.3 关闭方式

- 点击"关闭"按钮

---

## 9. 模态框汇总

### 9.1 z-index 层级

| 组件 | z-index | 说明 |
|------|---------|------|
| Modal 默认 | 9999 | 基础模态框 |
| Toast | 10001 | 提示 |
| (可能更高) | 100001+ | mxcadManager 中的手动弹框 |

### 9.2 尺寸选项

| 尺寸 | max-width | max-height |
|------|-----------|------------|
| sm | (未明确) | 60vh |
| md | (默认) | 70vh |
| lg | (未明确) | 75vh |
| xl | (未明确) | 80vh |
| full | (未明确) | 85vh |

### 9.3 设计规范

- 所有模态框都使用基础 Modal 组件
- 支持深色/浅色主题
- 都有进入/退出动画
- 遮罩使用毛玻璃效果（backdrop-filter）

# 前端组件复用指南

新增任何 UI 元素前，必须先检查是否已有可复用组件。这是最高优先级的前端规则。

## 铁律：使用或实现任何组件前，先查全局组件

**在使用或实现一个组件之前，必须优先确认 `src/components/ui/`（及 `src/components/common/`）下是否已有适合的全局组件。**

- 该规则同样覆盖**原生 HTML 控件**：直接写 `<input type="date">`、`<select>`、自绘下拉等，等同于"实现了一个日期选择器/选择器组件"，必须先对照全局的 `DatePicker`、`Select` 等
- 全局组件承载了主题 token、i18n、Z_LAYERS、无障碍等项目级约定，绕开它们会导致风格割裂与重复维护
- 全局组件不满足需求时：**扩展其 props**，而非在业务代码里另写一套

## 共享组件清单

在 `src/components/ui/` 下已有以下可复用组件（以目录实际文件为准，此处列出常用项）：

| 组件 | 位置 | 用途 |
|------|------|------|
| **Button** | `components/ui/Button.tsx` | 通用按钮 |
| **Input / Textarea / Checkbox** | `components/ui/` | 表单输入类 |
| **Select** | `components/ui/Select.tsx` | 下拉选择器 |
| **DatePicker** | `components/ui/DatePicker.tsx` | 日期选择器（Popover + Calendar，支持 minDate/maxDate/i18n） |
| **Calendar** | `components/ui/calendar.tsx` | 日历面板（shadcn 改造） |
| **Modal** | `components/ui/Modal.tsx` | 弹窗 |
| **ConfirmDialog** | `components/ui/ConfirmDialog.tsx` | 确认弹窗 |
| **Popover** | `components/ui/popover.tsx` | 浮层 |
| **Tabs / Tab / TabButton** | `components/ui/` | 标签页 |
| **Toast / Tooltip / Tag / Card / Section / Box** | `components/ui/` | 展示类 |
| **Pagination** | `components/ui/Pagination.tsx` | 分页组件 |
| **Autocomplete** | `components/ui/Autocomplete.tsx` | 自动补全输入 |
| **UserAvatar / FileSize / TruncateText / FileTree / FileNameInput** | `components/ui/` | 文件相关展示 |
| **NoPermissionPage** | `components/ui/NoPermissionPage.tsx` | 无权限占位页 |
| **通用导出** | `components/ui/index.ts` | UI 组件统一导出 |
| **通用导出** | `components/common/index.ts` | 通用组件统一导出 |

此外，以下领域组件也可复用：

| 组件 | 位置 | 用途 |
|------|------|------|
| **FileIcons** | `components/FileIcons.tsx` | 文件类型图标 |
| **ThemeToggle** | `components/ThemeToggle.tsx` | 主题切换 |
| **Logo** | `components/Logo.tsx` | Logo 组件 |
| **LoginPrompt** | `components/auth/LoginPrompt.tsx` | 登录提示 |
| **ImagePreviewModal** | `components/modals/ImagePreviewModal.tsx` | 图片预览弹窗 |
| **RenameModal** | `components/modals/RenameModal.tsx` | 重命名弹窗 |
| **CreateFolderModal** | `components/modals/CreateFolderModal.tsx` | 创建文件夹弹窗 |
| **DownloadFormatModal** | `components/modals/DownloadFormatModal.tsx` | 下载格式选择 |
| **SaveConfirmModal** | `components/modals/SaveConfirmModal.tsx` | 保存确认弹窗 |
| **SelectFolderModal** | `components/modals/SelectFolderModal.tsx` | 选择文件夹弹窗 |
| **FileItemSelection** | `components/file-item/FileItemSelection.tsx` | 文件选中态 |
| **FileItemTypeTag** | `components/file-item/FileItemTypeTag.tsx` | 文件类型标签 |
| **BatchActionsBar** | `pages/components/BatchActionsBar.tsx` | 批量操作栏 |
| **FileSystemToolbar** | `pages/components/FileSystemToolbar.tsx` | 文件系统工具栏 |

## 复用流程

每次需要新增 UI 元素时，按以下步骤：

1. **搜索已有组件** → 在 `src/components/ui/`, `src/components/common/`, `src/components/modals/` 中搜索
2. **查看组件 API** → 打开组件文件，查看其 props 定义
3. **判断是否可复用** → 如果功能匹配度 > 70%，优先复用
4. **需要扩展时** → 添加 props 而非重写新组件
5. **确实无复用时** → 按照 `file-organization.md` 约定放入正确目录

## 示例

### ❌ 错误 — 原生控件绕过全局组件（真实实例）

```tsx
// Bad: AdminStatsPage 曾直接使用原生 <input type="date">
// 而项目已有 components/ui/DatePicker.tsx（含主题/i18n/min-max 约束）
<input
  type="date"
  className={styles.dateInput}
  value={customStart}
  onChange={(e) => setCustomStart(e.target.value)}
/>
```

问题：原生 date input 无法统一主题样式、不支持多语言日历、与其他页面的 DatePicker 视觉/交互割裂。

### ✅ 正确 — 复用全局 DatePicker

```tsx
import { DatePicker } from '@/components/ui';

<DatePicker
  value={customStart}
  maxDate={todayIso}
  onChange={(v) => setCustomStart(v)}
/>
```

### ❌ 错误 — 重复造轮子

```tsx
// Bad: 在业务组件中自己写了确认弹窗
function DeleteFileButton() {
  const [showConfirm, setShowConfirm] = useState(false);
  
  return (
    <>
      <button onClick={() => setShowConfirm(true)}>删除</button>
      {showConfirm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <p>确认删除？</p>
            <button onClick={handleDelete}>确认</button>
            <button onClick={() => setShowConfirm(false)}>取消</button>
          </div>
        </div>
      )}
    </>
  );
}
// 但 src/components/ui/ConfirmDialog.tsx 已经存在完全相同的功能
```

### ✅ 正确 — 复用已有组件

```tsx
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

function DeleteFileButton() {
  const [showConfirm, setShowConfirm] = useState(false);
  
  return (
    <>
      <button onClick={() => setShowConfirm(true)}>删除</button>
      <ConfirmDialog
        open={showConfirm}
        title="确认删除"
        content="确认删除此文件？此操作不可撤销。"
        onConfirm={handleDelete}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}
```

### ✅ 正确 — 扩展已有组件而非重写

如果 `ConfirmDialog` 缺少某个功能（如危险操作红色按钮），**不要重写**，而是：

```tsx
// 给 ConfirmDialog 添加新的 variant prop
<ConfirmDialog
  variant="danger"  // 新增 prop
  confirmText="删除"
  // ...
/>
```

## 文档引用

- 复用优先原则：`project-coding-standards/docs/reuse-first.md`
- 文件组织约定：`project-coding-standards/docs/file-organization.md`

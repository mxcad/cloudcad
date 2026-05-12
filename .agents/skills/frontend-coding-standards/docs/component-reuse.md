# 前端组件复用指南

新增任何 UI 元素前，必须先检查是否已有可复用组件。这是最高优先级的前端规则。

## 共享组件清单

在 `src/components/ui/` 和 `src/components/common/` 下已有以下可复用组件：

| 组件 | 位置 | 用途 |
|------|------|------|
| **Button** | `components/ui/Button.tsx` | 通用按钮 |
| **ConfirmDialog** | `components/ui/ConfirmDialog.tsx` | 确认弹窗 |
| **Pagination** | `components/ui/Pagination.tsx` | 分页组件 |
| **TruncateText** | `components/ui/TruncateText.example.tsx` | 文字截断 |
| **Tooltip** | `components/ui/Tooltip.example.tsx` | 提示框 |
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

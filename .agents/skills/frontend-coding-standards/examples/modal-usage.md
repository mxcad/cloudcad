# Modal 使用示例

## ❌ 错误 — 自己写弹窗

```tsx
function DeleteFileButton() {
  const [showConfirm, setShowConfirm] = useState(false);
  
  return (
    <>
      <button onClick={() => setShowConfirm(true)}>删除</button>
      {showConfirm && (
        <div style={{ 
          position: 'fixed', inset: 0, 
          background: 'rgba(0,0,0,0.5)', 
          zIndex: 9999,  // ❌ 硬编码 z-index
          display: 'flex', alignItems: 'center', justifyContent: 'center' 
        }}>
          <div style={{ 
            background: 'white',  // ❌ 硬编码颜色
            padding: '24px', 
            borderRadius: '8px' 
          }}>
            <h3>确认删除</h3>
            <p>此操作不可撤销</p>
            <button onClick={handleDelete}>确认删除</button>
            <button onClick={() => setShowConfirm(false)}>取消</button>
          </div>
        </div>
      )}
    </>
  );
}
```

## ✅ 正确 — 复用 ConfirmDialog

```tsx
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Z_LAYERS } from '@/constants/layers';

function DeleteFileButton() {
  const [showConfirm, setShowConfirm] = useState(false);
  
  return (
    <>
      <button onClick={() => setShowConfirm(true)}>删除</button>
      <ConfirmDialog
        open={showConfirm}
        title="确认删除"
        content="确认删除此文件？此操作不可撤销。"
        confirmText="删除"
        variant="danger"  // ConfirmDialog 已有 variant prop
        onConfirm={handleDelete}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}
```

## ✅ 正确 — 扩展已有 Modal 而非重写

如果 ConfirmDialog 缺少某个功能，添加 prop 而非重写：

```tsx
// 在 ConfirmDialog.tsx 中添加新 prop
interface ConfirmDialogProps {
  // ... 已有 props
  variant?: 'default' | 'danger';   // ✅ 扩展
  loading?: boolean;                // ✅ 扩展
  footerExtra?: ReactNode;          // ✅ 扩展
}

// 使用
<ConfirmDialog
  variant="danger"
  loading={isDeleting}
  footerExtra={<Checkbox>同时删除版本历史</Checkbox>}
/>
```

## ❌ 错误 — Modal 中硬编码 z-index

```tsx
<div style={{ zIndex: 9999 }}>  // ❌
<div style={{ zIndex: 10000 }}> // ❌
```

## ✅ 正确 — 使用 Z_LAYERS

```tsx
import { Z_LAYERS } from '@/constants/layers';

<div style={{ zIndex: Z_LAYERS.MODAL }}>   // ✅
<div style={{ zIndex: Z_LAYERS.OVERLAY }}> // ✅
```

## 可复用的 Modal/弹窗组件清单

| 组件 | 路径 | 用途 |
|------|------|------|
| ConfirmDialog | `components/ui/ConfirmDialog.tsx` | 确认弹窗 |
| ImagePreviewModal | `components/modals/ImagePreviewModal.tsx` | 图片预览 |
| RenameModal | `components/modals/RenameModal.tsx` | 重命名 |
| CreateFolderModal | `components/modals/CreateFolderModal.tsx` | 创建文件夹 |
| DownloadFormatModal | `components/modals/DownloadFormatModal.tsx` | 下载格式选择 |
| SaveConfirmModal | `components/modals/SaveConfirmModal.tsx` | 保存确认 |
| SelectFolderModal | `components/modals/SelectFolderModal.tsx` | 选择文件夹 |
| LibrarySelectFolderModal | `components/modals/LibrarySelectFolderModal.tsx` | 资源库选择文件夹 |

新增任何弹窗前，先搜索以上组件是否可复用。

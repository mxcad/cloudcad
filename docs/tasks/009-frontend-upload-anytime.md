# 任务 009：前端 - 随时上传外部参照功能

## 任务描述

实现用户可以随时为任何文件上传外部参照的功能，不仅限于刚上传的文件。

## 任务目标

- ✅ 在文件操作菜单中添加"上传外部参照"选项
- ✅ 实现通用的外部参照上传功能
- ✅ 支持从文件列表直接触发
- ✅ 支持从文件详情页触发
- ✅ 添加快捷键支持（可选）

## 技术细节

### 1. 修改 FileItem 组件（增强版）

**文件位置**：`packages/frontend/components/FileItem.tsx`

```typescript
import React, { useState } from 'react';
import { MoreVertical, Upload, AlertTriangle } from 'lucide-react';
import { Button } from './ui/Button';
import { useExternalReferenceUpload } from '../hooks/useExternalReferenceUpload';
import { ExternalReferenceModal } from './modals/ExternalReferenceModal';
import { FileSystemNode } from '../types/filesystem';

interface FileItemProps {
  node: FileSystemNode;
  isSelected: boolean;
  viewMode: 'grid' | 'list';
  isMultiSelectMode: boolean;
  onSelect: (node: FileSystemNode) => void;
  onEnter: (node: FileSystemNode) => void;
  onDownload: (node: FileSystemNode) => void;
  onDelete: (node: FileSystemNode) => void;
  onRename: (node: FileSystemNode) => void;
  onEdit?: (node: FileSystemNode, e: React.MouseEvent) => void;
  onDeleteNode?: (node: FileSystemNode, e: React.MouseEvent) => void;
  onShowMembers?: (node: FileSystemNode, e: React.MouseEvent) => void;
  onUploadExternalReference?: (node: FileSystemNode) => void;
}

export const FileItem: React.FC<FileItemProps> = ({
  node,
  isSelected,
  viewMode,
  isMultiSelectMode,
  onSelect,
  onEnter,
  onDownload,
  onDelete,
  onRename,
  onEdit,
  onDeleteNode,
  onShowMembers,
  onUploadExternalReference,
}) => {
  const [showMenu, setShowMenu] = useState(false);

  // 外部参照上传 Hook
  const externalReferenceUpload = useExternalReferenceUpload({
    fileHash: node.fileHash || '',
    onSuccess: () => {
      console.log('[FileItem] 外部参照上传成功');
      // 刷新文件列表
      window.location.reload();
    },
    onError: (error) => {
      console.error('[FileItem] 外部参照上传失败:', error);
    },
    onSkip: () => {
      console.log('[FileItem] 用户跳过外部参照上传');
    },
  });

  /**
   * 处理上传外部参照
   */
  const handleUploadExternalReference = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);

    if (!node.fileHash) {
      console.error('[FileItem] 文件哈希不存在');
      return;
    }

    console.log('[FileItem] 开始检查外部参照');
    const hasMissing = await externalReferenceUpload.checkMissingReferences();

    if (!hasMissing) {
      console.log('[FileItem] 无缺失的外部参照');
      // 显示提示：所有外部参照已存在
      alert('该文件的所有外部参照已存在，无需上传。');
    }
  };

  const isGrid = viewMode === 'grid';

  return (
    <div
      className={`
        ${isGrid ? 'flex flex-col' : 'flex items-center'}
        p-3 rounded-lg cursor-pointer transition-all relative
        ${isSelected ? 'bg-indigo-50 border-2 border-indigo-500' : 'hover:bg-slate-50 border-2 border-transparent'}
        ${node.isFolder ? '' : 'group'}
      `}
      onClick={() => onSelect(node)}
      onDoubleClick={() => !node.isFolder && onEnter(node)}
    >
      {/* 文件图标 */}
      <div className={`${isGrid ? 'flex justify-center mb-2' : 'mr-3'}`}>
        {/* ... 现有图标代码 ... */}
      </div>

      {/* 文件信息 */}
      <div className={`${isGrid ? 'text-center' : 'flex-1 min-w-0'}`}>
        <div className="text-sm font-medium text-slate-900 truncate">
          {node.name}
        </div>

        {/* 缺失外部参照警告 */}
        {node.hasMissingExternalReferences && (
          <div className="flex items-center justify-center gap-1 mt-1">
            <AlertTriangle size={12} className="text-amber-500" />
            <span className="text-xs text-amber-600">
              缺失 {node.missingExternalReferencesCount || 0} 个外部参照
            </span>
          </div>
        )}
      </div>

      {/* 操作按钮（悬浮显示） */}
      {!node.isFolder && (
        <div className={`
          ${isGrid ? 'absolute top-2 right-2' : 'ml-auto'}
          opacity-0 group-hover:opacity-100 transition-opacity
          flex items-center gap-1
        `}>
          {/* 缺失外部参照时显示上传按钮 */}
          {node.hasMissingExternalReferences && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleUploadExternalReference}
              className="p-1"
              title="上传外部参照"
            >
              <Upload size={14} className="text-amber-600" />
            </Button>
          )}

          {/* 更多操作菜单按钮 */}
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1"
              title="更多操作"
            >
              <MoreVertical size={14} className="text-slate-500" />
            </Button>

            {/* 下拉菜单 */}
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-10">
                {/* 上传外部参照选项（始终显示） */}
                <button
                  onClick={handleUploadExternalReference}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2"
                >
                  <Upload size={14} />
                  <span>上传外部参照</span>
                </button>

                {/* 其他操作选项 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onDownload(node);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2"
                >
                  {/* 下载图标 */}
                  <span>下载</span>
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onRename(node);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2"
                >
                  {/* 重命名图标 */}
                  <span>重命名</span>
                </button>

                <hr className="my-1" />

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onDelete(node);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                >
                  {/* 删除图标 */}
                  <span>删除</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 外部参照上传模态框 */}
      <ExternalReferenceModal
        isOpen={externalReferenceUpload.isOpen}
        files={externalReferenceUpload.files}
        loading={externalReferenceUpload.loading}
        onSelectFiles={externalReferenceUpload.selectFiles}
        onUpload={externalReferenceUpload.uploadFiles}
        onComplete={externalReferenceUpload.complete}
        onSkip={externalReferenceUpload.skip}
        onClose={externalReferenceUpload.close}
      />
    </div>
  );
};

export default FileItem;
```

### 2. 添加全局快捷键支持（可选）

**文件位置**：`packages/frontend/components/KeyboardShortcuts.tsx`（新建）

```typescript
import { useEffect } from 'react';
import { useFileSystem } from '../hooks/useFileSystem';

interface KeyboardShortcutsProps {
  onUploadExternalReference?: () => void;
}

/**
 * 键盘快捷键组件
 *
 * 支持的快捷键：
 * - Ctrl/Cmd + U: 上传外部参照
 */
export const KeyboardShortcuts: React.FC<KeyboardShortcutsProps> = ({
  onUploadExternalReference,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + U: 上传外部参照
      if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
        e.preventDefault();
        onUploadExternalReference?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onUploadExternalReference]);

  return null;
};

export default KeyboardShortcuts;
```

### 3. 在 FileSystemManager 中集成快捷键

**文件位置**：`packages/frontend/pages/FileSystemManager.tsx`

```typescript
import { KeyboardShortcuts } from '../components/KeyboardShortcuts';

// 在 FileSystemManager 组件中添加
const handleUploadExternalReference = () => {
  const selectedNode = Array.from(selectedNodes)[0];
  if (selectedNode && !selectedNode.isFolder) {
    // 触发上传外部参照
    console.log('上传外部参照:', selectedNode.name);
  }
};

// 在返回的 JSX 中添加
<KeyboardShortcuts onUploadExternalReference={handleUploadExternalReference} />
```

## 验收标准

- [ ] 文件操作菜单中包含"上传外部参照"选项
- [ ] 点击选项正确打开上传模态框
- [ ] 支持从文件列表直接触发
- [ ] 支持从更多操作菜单触发
- [ ] 无缺失外部参照时显示提示
- [ ] 上传成功后自动刷新
- [ ] 快捷键功能正常（可选）

## 测试方法

### 1. 手动测试

1. 打开文件列表
2. 找到一个 CAD 文件
3. 点击"更多操作"按钮
4. 选择"上传外部参照"
5. 验证模态框正确打开
6. 上传外部参照文件
7. 验证上传成功后警告标识消失

### 2. 测试场景

- 场景 1：从缺失警告图标触发上传
- 场景 2：从操作菜单触发上传
- 场景 3：无缺失外部参照时显示提示
- 场景 4：快捷键触发上传（可选）

## 注意事项

1. **用户体验**：提供清晰的视觉反馈
2. **错误处理**：妥善处理各种异常情况
3. **性能优化**：避免不必要的重新渲染
4. **可访问性**：支持键盘操作
5. **国际化**：支持多语言（可选）

## 依赖任务

- ✅ 任务 005：前端 - useExternalReferenceUpload Hook（必须）
- ✅ 任务 006：前端 - ExternalReferenceModal 组件（必须）
- ✅ 任务 008：前端 - 文件列表缺失外部参照提醒（必须）

## 后续任务

- 任务 010：集成测试

---

**任务状态**：⬜ 待开始  
**预计工时**：2 小时  
**负责人**：待分配  
**创建日期**：2025-12-29

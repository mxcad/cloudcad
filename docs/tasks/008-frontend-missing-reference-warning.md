# 任务 008：前端 - 文件列表缺失外部参照提醒

## 任务描述

在文件列表中为缺失外部参照的文件显示警告标识，并允许用户随时点击上传外部参照。

## 任务目标

- ✅ 修改 `FileSystemNode` 类型定义，添加缺失外部参照标识
- ✅ 修改 `FileItem` 组件，显示警告标识
- ✅ 添加"上传外部参照"按钮
- ✅ 实现"上传外部参照"功能
- ✅ 添加样式和动画

## 技术细节

### 1. 更新类型定义

**文件位置**：`packages/frontend/types/filesystem.ts`

```typescript
export interface FileSystemNode {
  id: string;
  name: string;
  isFolder: boolean;
  isRoot: boolean;
  parentId: string | null;
  originalName: string | null;
  path: string | null;
  size: number | null;
  mimeType: string | null;
  extension: string | null;
  fileStatus: FileStatus | null;
  fileHash: string | null;
  description: string | null;
  projectStatus: ProjectStatus | null;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  
  // 新增：缺失外部参照标识
  hasMissingExternalReferences?: boolean;
  missingExternalReferencesCount?: number;
}
```

### 2. 修改 FileItem 组件

**文件位置**：`packages/frontend/components/FileItem.tsx`

```typescript
import React from 'react';
import { AlertTriangle, Upload } from 'lucide-react';
import { Button } from './ui/Button';
import { useExternalReferenceUpload } from '../hooks/useExternalReferenceUpload';
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
  // 新增：上传外部参照回调
  onUploadExternalReference?: (node: FileSystemNode) => void;
}

/**
 * 文件项组件（增强版本）
 * 
 * 新增功能：
 * - 显示缺失外部参照警告标识
 * - 提供"上传外部参照"按钮
 */
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
    
    if (!node.fileHash) {
      console.error('[FileItem] 文件哈希不存在');
      return;
    }

    console.log('[FileItem] 开始检查外部参照');
    const hasMissing = await externalReferenceUpload.checkMissingReferences();
    
    if (!hasMissing) {
      console.log('[FileItem] 无缺失的外部参照');
    }
  };

  const isGrid = viewMode === 'grid';

  // ... 现有代码 ...

  return (
    <div
      className={`
        ${isGrid ? 'flex flex-col' : 'flex items-center'}
        p-3 rounded-lg cursor-pointer transition-all
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
          {/* 上传外部参照按钮 */}
          {node.hasMissingExternalReferences && onUploadExternalReference && (
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

          {/* ... 现有操作按钮 ... */}
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

### 3. 修改 useFileSystem Hook

**文件位置**：`packages/frontend/hooks/useFileSystem.ts`

```typescript
import { useState, useCallback, useEffect } from 'react';
import { projectsApi, mxcadApi } from '../services/apiService';
import type { FileSystemNode } from '../types/filesystem';

/**
 * 检查文件是否缺失外部参照
 */
const checkMissingExternalReferences = async (
  node: FileSystemNode
): Promise<{ hasMissing: boolean; count: number }> => {
  if (!node.fileHash || node.isFolder) {
    return { hasMissing: false, count: 0 };
  }

  try {
    const response = await mxcadApi.getPreloadingData(node.fileHash);
    const preloadingData = response.data;

    if (!preloadingData) {
      return { hasMissing: false, count: 0 };
    }

    // 过滤掉 http/https 开头的 URL
    const missingImages = preloadingData.images.filter(
      (name) => !name.startsWith('http:') && !name.startsWith('https:')
    );
    const missingRefs = preloadingData.externalReference;

    if (missingImages.length === 0 && missingRefs.length === 0) {
      return { hasMissing: false, count: 0 };
    }

    // 检查哪些文件缺失
    let missingCount = 0;

    for (const name of missingRefs) {
      const existsResponse = await mxcadApi.checkExternalReferenceExists(
        node.fileHash!,
        name
      );
      if (!existsResponse.data.exists) {
        missingCount++;
      }
    }

    for (const name of missingImages) {
      const existsResponse = await mxcadApi.checkExternalReferenceExists(
        node.fileHash!,
        name
      );
      if (!existsResponse.data.exists) {
        missingCount++;
      }
    }

    return { hasMissing: missingCount > 0, count: missingCount };
  } catch (error) {
    console.error('[useFileSystem] 检查外部参照失败:', error);
    return { hasMissing: false, count: 0 };
  }
};

/**
 * 加载节点列表（增强版本）
 */
const loadNodes = useCallback(async () => {
  setLoading(true);
  setError(null);

  try {
    let response;
    if (currentNodeId) {
      response = await projectsApi.getChildren(currentNodeId);
    } else if (urlProjectId) {
      response = await projectsApi.getChildren(urlProjectId);
    } else {
      response = await projectsApi.list();
    }

    const nodes = response.data;

    // 检查每个文件是否缺失外部参照
    const nodesWithExternalReferenceCheck = await Promise.all(
      nodes.map(async (node) => {
        if (node.isFolder) {
          return node;
        }

        const { hasMissing, count } = await checkMissingExternalReferences(node);
        
        return {
          ...node,
          hasMissingExternalReferences: hasMissing,
          missingExternalReferencesCount: count,
        };
      })
    );

    setNodes(nodesWithExternalReferenceCheck);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : '加载失败';
    setError(errorMessage);
  } finally {
    setLoading(false);
  }
}, [currentNodeId, urlProjectId]);
```

## 验收标准

- [ ] 缺失外部参照的文件显示警告标识
- [ ] 警告标识显示缺失数量
- [ ] "上传外部参照"按钮正确显示
- [ ] 点击按钮正确打开上传模态框
- [ ] 上传成功后警告标识消失
- [ ] 样式美观一致
- [ ] 不影响原有功能

## 测试方法

### 1. 手动测试

1. 上传一个有外部参照的 CAD 文件
2. 跳过外部参照上传
3. 刷新文件列表
4. 检查文件是否显示警告标识
5. 点击"上传外部参照"按钮
6. 上传外部参照文件
7. 刷新文件列表
8. 检查警告标识是否消失

### 2. 测试场景

- 场景 1：文件有缺失外部参照，显示警告
- 场景 2：文件无缺失外部参照，不显示警告
- 场景 3：文件夹不显示警告
- 场景 4：上传成功后警告消失

## 注意事项

1. **性能优化**：避免在每次渲染时都检查外部参照
2. **用户体验**：提供清晰的视觉提示
3. **错误处理**：妥善处理检查失败的情况
4. **缓存机制**：可以考虑缓存检查结果
5. **批量检查**：可以使用 Promise.all 并行检查多个文件

## 依赖任务

- ✅ 任务 005：前端 - useExternalReferenceUpload Hook（必须）
- ✅ 任务 006：前端 - ExternalReferenceModal 组件（必须）
- ✅ 任务 007：前端 - 集成到 MxCadUploader（必须）

## 后续任务

- 任务 009：前端 - 随时上传外部参照功能
- 任务 010：集成测试

---

**任务状态**：⬜ 待开始  
**预计工时**：2.5 小时  
**负责人**：待分配  
**创建日期**：2025-12-29
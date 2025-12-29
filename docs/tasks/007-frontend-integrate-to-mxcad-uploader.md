# 任务 007：前端 - 集成到 MxCadUploader

## 任务描述

将外部参照上传功能集成到现有的 `MxCadUploader` 组件中，在图纸上传成功后自动检测外部参照，并显示上传模态框。

## 任务目标

- ✅ 修改 `MxCadUploader.tsx` 组件
- ✅ 集成 `useExternalReferenceUpload` Hook
- ✅ 集成 `ExternalReferenceModal` 组件
- ✅ 在上传成功后自动检测外部参照
- ✅ 传递正确的 fileHash 参数
- ✅ 处理跳过上传的情况
- ✅ 更新类型定义

## 技术细节

### 1. 修改 MxCadUploader 组件

**文件位置**：`packages/frontend/components/MxCadUploader.tsx`

```typescript
import React, { useState, forwardRef, useImperativeHandle, useCallback, useRef } from 'react';
import { useMxCadUploadNative, LoadFileParam } from '../hooks/useMxCadUploadNative';
import { useAuth } from '../contexts/AuthContext';
import { useExternalReferenceUpload } from '../hooks/useExternalReferenceUpload';
import { ExternalReferenceModal } from './modals/ExternalReferenceModal';

interface MxCadUploaderProps {
  /** 节点ID（项目根目录或文件夹的 FileSystemNode ID） */
  nodeId?: string | (() => string);
  /** 上传成功回调 */
  onSuccess?: (param: LoadFileParam) => void;
  /** 上传失败回调 */
  onError?: (error: string) => void;
  /** 是否显示进度条 */
  showProgress?: boolean;
  /** 按钮文本 */
  buttonText?: string;
  /** 按钮样式类名 */
  buttonClassName?: string;
  /** 外部参照上传成功回调 */
  onExternalReferenceSuccess?: () => void;
  /** 外部参照跳过上传回调 */
  onExternalReferenceSkip?: () => void;
}

export interface MxCadUploaderRef {
  triggerUpload: () => void;
}

/**
 * MxCAD 文件上传组件（增强版本）
 * 
 * 新增功能：
 * - 自动检测外部参照
 * - 支持外部参照上传
 * - 支持跳过外部参照上传（可选）
 */
export const MxCadUploader = forwardRef<MxCadUploaderRef, MxCadUploaderProps>(({
  nodeId,
  onSuccess,
  onError,
  showProgress = true,
  buttonText = '上传 CAD 文件',
  buttonClassName = '',
  onExternalReferenceSuccess,
  onExternalReferenceSkip,
}, ref) => {
  const { isAuthenticated } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [currentFileHash, setCurrentFileHash] = useState('');

  const { selectFiles } = useMxCadUploadNative();

  // 外部参照上传 Hook
  const externalReferenceUpload = useExternalReferenceUpload({
    fileHash: currentFileHash,
    onSuccess: () => {
      console.log('[MxCadUploader] 外部参照上传成功');
      onExternalReferenceSuccess?.();
    },
    onError: (error) => {
      console.error('[MxCadUploader] 外部参照上传失败:', error);
      setMessage(`外部参照上传失败: ${error}`);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 5000);
    },
    onSkip: () => {
      console.log('[MxCadUploader] 用户跳过外部参照上传');
      onExternalReferenceSkip?.();
    },
  });

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    triggerUpload: () => handleSelectFiles(),
  }), []);

  const handleSelectFiles = () => {
    // 每次上传前都获取最新的 nodeId
    const currentNodeId = typeof nodeId === 'function' ? nodeId() : nodeId;
    console.log('[MxCadUploader] 当前 nodeId:', currentNodeId);

    // 检查用户是否已登录
    if (!isAuthenticated) {
      setMessage('请先登录后再上传文件');
      setShowToast(true);
      onError?.('用户未登录');

      // 5秒后隐藏提示
      setTimeout(() => setShowToast(false), 5000);
      return;
    }

    selectFiles({
      nodeId: currentNodeId || undefined,
      onSuccess: async (param: LoadFileParam) => {
        setUploading(false);
        setProgress(0);
        setMessage('文件上传成功！');
        setShowToast(true);
        onSuccess?.(param);

        // 保存文件哈希值
        setCurrentFileHash(param.hash);

        // 检查外部参照
        console.log('[MxCadUploader] 开始检查外部参照');
        const hasMissingReferences = await externalReferenceUpload.checkMissingReferences();
        
        if (hasMissingReferences) {
          console.log('[MxCadUploader] 检测到缺失的外部参照，显示上传模态框');
          setMessage('检测到缺失的外部参照');
        } else {
          console.log('[MxCadUploader] 无缺失的外部参照');
        }

        // 3秒后隐藏提示
        setTimeout(() => setShowToast(false), 3000);
      },
      onError: (error: string) => {
        setUploading(false);
        setProgress(0);
        setMessage(`上传失败: ${error}`);
        setShowToast(true);
        onError?.(error);

        // 5秒后隐藏提示
        setTimeout(() => setShowToast(false), 5000);
      },
      onProgress: (percentage: number) => {
        setProgress(percentage);
      },
      onFileQueued: (file: any) => {
        setUploading(true);
        setMessage(`文件 ${file.name} 已加入队列`);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 2000);
      },
      onBeginUpload: () => {
        setMessage('开始上传...');
        setShowToast(true);
      },
    });
  };

  return (
    <div className="mxcad-uploader">
      <button
        onClick={handleSelectFiles}
        disabled={uploading || !isAuthenticated}
        className={`px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 ${buttonClassName}`}
        title={!isAuthenticated ? '请先登录后再上传文件' : ''}
      >
        {uploading ? '上传中...' : !isAuthenticated ? '请先登录' : buttonText}
      </button>

      {showProgress && uploading && (
        <div className="mt-4">
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            上传进度: {progress.toFixed(1)}%
          </p>
        </div>
      )}

      {showToast && (
        <div className="fixed top-4 right-4 bg-gray-800 text-white px-4 py-2 rounded shadow-lg z-50">
          {message}
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
});

MxCadUploader.displayName = 'MxCadUploader';

export default MxCadUploader;
```

### 2. 更新类型定义（如果需要）

**文件位置**：`packages/frontend/types/filesystem.ts`

```typescript
// 如果需要，可以添加外部参照相关的类型定义
export interface ExternalReferenceInfo {
  fileHash: string;
  missingReferences: string[];
  hasMissingReferences: boolean;
}
```

## 验收标准

- [ ] 外部参照检测自动触发
- [ ] 模态框正确显示
- [ ] fileHash 正确传递
- [ ] 跳过上传功能正常
- [ ] 成功回调正确触发
- [ ] 失败回调正确触发
- [ ] 不影响原有上传功能
- [ ] TypeScript 类型检查通过

## 测试方法

### 1. 手动测试

```typescript
// 在 FileSystemManager 中使用
<MxCadUploader
  ref={uploaderRef}
  nodeId={() => getCurrentParentId()}
  buttonText="上传 CAD 文件"
  onSuccess={handleRefresh}
  onError={(err: string) => console.error('Upload error:', err)}
  onExternalReferenceSuccess={() => {
    console.log('外部参照上传成功');
    handleRefresh();
  }}
  onExternalReferenceSkip={() => {
    console.log('用户跳过外部参照上传');
    // 不做任何操作，允许用户稍后上传
  }}
/>
```

### 2. 测试流程

1. 登录系统
2. 上传一个有外部参照的 CAD 文件
3. 等待上传完成
4. 检查是否自动显示外部参照上传模态框
5. 测试上传外部参照文件
6. 测试跳过上传功能
7. 验证图纸是否正常显示

## 注意事项

1. **状态管理**：确保 currentFileHash 在上传成功后正确更新
2. **用户体验**：提供清晰的状态提示和操作指引
3. **错误处理**：妥善处理各种异常情况
4. **向后兼容**：不影响原有上传功能
5. **性能优化**：避免不必要的重新渲染

## 依赖任务

- ✅ 任务 005：前端 - useExternalReferenceUpload Hook（必须）
- ✅ 任务 006：前端 - ExternalReferenceModal 组件（必须）

## 后续任务

- 任务 008：前端 - 文件列表缺失外部参照提醒
- 任务 009：前端 - 随时上传外部参照功能
- 任务 010：集成测试

---

**任务状态**：⬜ 待开始  
**预计工时**：1.5 小时  
**负责人**：待分配  
**创建日期**：2025-12-29
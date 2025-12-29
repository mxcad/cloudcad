# 任务 006：前端 - ExternalReferenceModal 组件

## 任务描述

创建 `ExternalReferenceModal` 组件，提供友好的用户界面，用于显示缺失的外部参照列表、上传文件、显示进度等。

## 任务目标

- ✅ 创建 `ExternalReferenceModal.tsx` 组件文件
- ✅ 实现文件列表展示
- ✅ 实现上传进度显示
- ✅ 实现状态图标（成功/失败/上传中）
- ✅ 实现操作按钮（选择文件、上传、完成、稍后上传）
- ✅ 添加样式和动画
- ✅ 编写单元测试

## 技术细节

### 1. 组件实现

**文件位置**：`packages/frontend/components/modals/ExternalReferenceModal.tsx`

```typescript
import React from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { ExternalReferenceFile, UploadState } from '../../types/api';
import { CheckCircle, XCircle, Loader2, Upload, AlertTriangle } from 'lucide-react';

interface ExternalReferenceModalProps {
  /** 模态框是否打开 */
  isOpen: boolean;
  /** 外部参照文件列表 */
  files: ExternalReferenceFile[];
  /** 是否正在上传 */
  loading: boolean;
  /** 选择文件回调 */
  onSelectFiles: () => void;
  /** 上传文件回调 */
  onUpload: () => void;
  /** 完成上传回调 */
  onComplete: () => void;
  /** 跳过上传回调 */
  onSkip: () => void;
  /** 关闭模态框回调 */
  onClose: () => void;
}

/**
 * 外部参照上传模态框组件
 * 
 * 功能：
 * - 显示缺失的外部参照列表
 * - 显示上传进度和状态
 * - 提供文件选择和上传操作
 * - 支持跳过上传（可选功能）
 */
export const ExternalReferenceModal: React.FC<ExternalReferenceModalProps> = ({
  isOpen,
  files,
  loading,
  onSelectFiles,
  onUpload,
  onComplete,
  onSkip,
  onClose,
}) => {
  // 计算状态
  const allSuccess = files.length > 0 && files.every((f) => f.uploadState === 'success');
  const allNotSelected = files.every((f) => f.uploadState === 'notSelected');
  const hasUploading = files.some((f) => f.uploadState === 'uploading');
  const hasFailures = files.some((f) => f.uploadState === 'fail');

  /**
   * 获取状态图标
   */
  const getStatusIcon = (file: ExternalReferenceFile) => {
    switch (file.uploadState) {
      case 'success':
        return <CheckCircle size={16} className="text-green-500" />;
      case 'fail':
        return <XCircle size={16} className="text-red-500" />;
      case 'uploading':
        return <Loader2 size={16} className="text-blue-500 animate-spin" />;
      default:
        return null;
    }
  };

  /**
   * 获取状态颜色
   */
  const getStatusColor = (file: ExternalReferenceFile) => {
    switch (file.uploadState) {
      case 'success':
        return 'text-green-500';
      case 'fail':
        return 'text-red-500';
      case 'uploading':
        return 'text-blue-500';
      default:
        return 'text-slate-400';
    }
  };

  /**
   * 获取状态文本
   */
  const getStatusText = (file: ExternalReferenceFile) => {
    switch (file.uploadState) {
      case 'success':
        return '上传成功';
      case 'fail':
        return '上传失败';
      case 'uploading':
        return '上传中';
      default:
        return '待上传';
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <AlertTriangle size={20} className="text-amber-500" />
          <span>上传外部参照文件</span>
        </div>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            取消
          </Button>
          <Button
            variant="outline"
            onClick={onSkip}
            disabled={loading}
          >
            稍后上传
          </Button>
          <Button
            onClick={onSelectFiles}
            disabled={allSuccess || hasUploading}
          >
            <Upload size={16} className="mr-2" />
            选择文件
          </Button>
          <Button
            onClick={onUpload}
            disabled={allNotSelected || hasUploading || allSuccess}
          >
            上传
          </Button>
          <Button
            onClick={onComplete}
            disabled={!allSuccess || loading}
            variant="primary"
          >
            完成
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* 提示信息 */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-medium mb-1">检测到 {files.length} 个缺失的外部参照文件</p>
              <p className="text-amber-700">
                这些文件是图纸正常显示所必需的。您可以选择立即上传，也可以稍后上传。
                稍后上传时，文件列表中会显示警告标识。
              </p>
            </div>
          </div>
        </div>

        {/* 文件列表 */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium text-slate-700 w-20">
                  状态
                </th>
                <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">
                  文件名
                </th>
                <th className="px-4 py-2 text-right text-sm font-medium text-slate-700 w-24">
                  类型
                </th>
                <th className="px-4 py-2 text-right text-sm font-medium text-slate-700 w-28">
                  进度
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {files.map((file, index) => (
                <tr key={index} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-center">
                      {getStatusIcon(file)}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm text-slate-900 truncate">
                        {file.name}
                      </span>
                      <span className={`text-xs ${getStatusColor(file)}`}>
                        {getStatusText(file)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600">
                      {file.type === 'img' ? '图片' : 'DWG'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {file.uploadState === 'uploading' ? (
                      <span className="text-xs text-slate-600">
                        {Math.round(file.progress)}%
                      </span>
                    ) : file.uploadState === 'success' ? (
                      <span className="text-xs text-green-600">100%</span>
                    ) : file.uploadState === 'fail' ? (
                      <span className="text-xs text-red-600">失败</span>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 上传进度条 */}
        {hasUploading && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">正在上传...</span>
              <span className="text-slate-600">
                {files.filter((f) => f.uploadState === 'success').length} / {files.length}
              </span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 animate-pulse" />
            </div>
          </div>
        )}

        {/* 失败提示 */}
        {hasFailures && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <XCircle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-red-800">
                <p className="font-medium mb-1">部分文件上传失败</p>
                <p className="text-red-700">
                  请检查文件是否正确，然后重新选择文件上传。
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 成功提示 */}
        {allSuccess && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <CheckCircle size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-green-800">
                <p className="font-medium">所有外部参照文件上传成功</p>
                <p className="text-green-700">
                  图纸现在可以正常显示了。
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ExternalReferenceModal;
```

### 2. 单元测试

**文件位置**：`packages/frontend/components/modals/ExternalReferenceModal.spec.ts`（需新建）

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExternalReferenceModal } from './ExternalReferenceModal';
import type { ExternalReferenceFile } from '../../types/api';

describe('ExternalReferenceModal', () => {
  const mockFiles: ExternalReferenceFile[] = [
    {
      name: 'ref1.dwg',
      type: 'ref',
      uploadState: 'notSelected',
      progress: 0,
    },
    {
      name: 'image1.png',
      type: 'img',
      uploadState: 'notSelected',
      progress: 0,
    },
  ];

  const defaultProps = {
    isOpen: true,
    files: mockFiles,
    loading: false,
    onSelectFiles: vi.fn(),
    onUpload: vi.fn(),
    onComplete: vi.fn(),
    onSkip: vi.fn(),
    onClose: vi.fn(),
  };

  it('应该在 isOpen 为 true 时渲染模态框', () => {
    render(<ExternalReferenceModal {...defaultProps} />);

    expect(screen.getByText('上传外部参照文件')).toBeInTheDocument();
    expect(screen.getByText(/检测到 2 个缺失的外部参照文件/)).toBeInTheDocument();
  });

  it('应该在 isOpen 为 false 时不渲染模态框', () => {
    render(<ExternalReferenceModal {...defaultProps} isOpen={false} />);

    expect(screen.queryByText('上传外部参照文件')).not.toBeInTheDocument();
  });

  it('应该显示所有文件', () => {
    render(<ExternalReferenceModal {...defaultProps} />);

    expect(screen.getByText('ref1.dwg')).toBeInTheDocument();
    expect(screen.getByText('image1.png')).toBeInTheDocument();
  });

  it('应该显示正确的文件类型', () => {
    render(<ExternalReferenceModal {...defaultProps} />);

    expect(screen.getByText('DWG')).toBeInTheDocument();
    expect(screen.getByText('图片')).toBeInTheDocument();
  });

  it('应该在点击选择文件时调用 onSelectFiles', () => {
    render(<ExternalReferenceModal {...defaultProps} />);

    const selectButton = screen.getByText('选择文件');
    fireEvent.click(selectButton);

    expect(defaultProps.onSelectFiles).toHaveBeenCalledTimes(1);
  });

  it('应该在点击上传时调用 onUpload', () => {
    render(<ExternalReferenceModal {...defaultProps} />);

    const uploadButton = screen.getByText('上传');
    fireEvent.click(uploadButton);

    expect(defaultProps.onUpload).toHaveBeenCalledTimes(1);
  });

  it('应该在点击稍后上传时调用 onSkip', () => {
    render(<ExternalReferenceModal {...defaultProps} />);

    const skipButton = screen.getByText('稍后上传');
    fireEvent.click(skipButton);

    expect(defaultProps.onSkip).toHaveBeenCalledTimes(1);
  });

  it('应该在点击完成时调用 onComplete', () => {
    const successFiles: ExternalReferenceFile[] = [
      {
        ...mockFiles[0],
        uploadState: 'success',
        progress: 100,
      },
      {
        ...mockFiles[1],
        uploadState: 'success',
        progress: 100,
      },
    ];

    render(
      <ExternalReferenceModal
        {...defaultProps}
        files={successFiles}
      />
    );

    const completeButton = screen.getByText('完成');
    fireEvent.click(completeButton);

    expect(defaultProps.onComplete).toHaveBeenCalledTimes(1);
  });

  it('应该在所有文件上传成功时显示成功提示', () => {
    const successFiles: ExternalReferenceFile[] = [
      {
        ...mockFiles[0],
        uploadState: 'success',
        progress: 100,
      },
      {
        ...mockFiles[1],
        uploadState: 'success',
        progress: 100,
      },
    ];

    render(
      <ExternalReferenceModal
        {...defaultProps}
        files={successFiles}
      />
    );

    expect(screen.getByText('所有外部参照文件上传成功')).toBeInTheDocument();
  });

  it('应该在文件上传失败时显示失败提示', () => {
    const failFiles: ExternalReferenceFile[] = [
      {
        ...mockFiles[0],
        uploadState: 'fail',
        progress: 0,
      },
    ];

    render(
      <ExternalReferenceModal
        {...defaultProps}
        files={failFiles}
      />
    );

    expect(screen.getByText(/部分文件上传失败/)).toBeInTheDocument();
  });

  it('应该在 loading 时禁用按钮', () => {
    render(
      <ExternalReferenceModal
        {...defaultProps}
        loading={true}
      />
    );

    expect(screen.getByText('选择文件')).toBeDisabled();
    expect(screen.getByText('上传')).toBeDisabled();
    expect(screen.getByText('稍后上传')).toBeDisabled();
  });
});
```

## 验收标准

- [ ] 组件正确渲染
- [ ] 文件列表正确显示
- [ ] 状态图标正确显示
- [ ] 上传进度正确显示
- [ ] 操作按钮正确响应
- [ ] 跳过上传功能正常
- [ ] 样式美观一致
- [ ] 单元测试全部通过

## 测试方法

### 1. 手动测试

```typescript
// 在组件中使用
import { ExternalReferenceModal } from '../components/modals/ExternalReferenceModal';
import { useState } from 'react';

function TestComponent() {
  const [isOpen, setIsOpen] = useState(true);
  const [files, setFiles] = useState([
    {
      name: 'ref1.dwg',
      type: 'ref' as const,
      uploadState: 'notSelected' as const,
      progress: 0,
    },
  ]);

  return (
    <ExternalReferenceModal
      isOpen={isOpen}
      files={files}
      loading={false}
      onSelectFiles={() => console.log('选择文件')}
      onUpload={() => console.log('上传')}
      onComplete={() => console.log('完成')}
      onSkip={() => console.log('跳过')}
      onClose={() => setIsOpen(false)}
    />
  );
}
```

### 2. 单元测试

```bash
cd packages/frontend
pnpm test ExternalReferenceModal.spec.ts
```

## 注意事项

1. **样式一致性**：使用 Tailwind CSS 保持与项目其他组件一致
2. **用户体验**：提供清晰的状态提示和操作指引
3. **响应式设计**：确保在不同屏幕尺寸下正常显示
4. **无障碍访问**：使用语义化 HTML 和适当的 ARIA 属性
5. **性能优化**：避免不必要的重新渲染

## 依赖任务

- ✅ 任务 005：前端 - useExternalReferenceUpload Hook（必须）

## 后续任务

- 任务 007：前端 - 集成到 MxCadUploader
- 任务 008：前端 - 文件列表缺失外部参照提醒
- 任务 009：前端 - 随时上传外部参照功能
- 任务 010：集成测试

---

**任务状态**：⬜ 待开始  
**预计工时**：2.5 小时  
**负责人**：待分配  
**创建日期**：2025-12-29
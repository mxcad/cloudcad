# 任务 005：前端 - useExternalReferenceUpload Hook

## 任务描述

实现 `useExternalReferenceUpload` Hook，封装外部参照上传的核心业务逻辑，包括检测缺失的外部参照、上传文件、管理状态等。

## 任务目标

- ✅ 创建 `useExternalReferenceUpload.ts` Hook 文件
- ✅ 实现获取预加载数据逻辑
- ✅ 实现检测缺失外部参照逻辑
- ✅ 实现文件选择和上传逻辑
- ✅ 实现状态管理（上传状态、进度等）
- ✅ 添加 TypeScript 类型定义
- ✅ 编写单元测试

## 技术细节

### 1. 类型定义

**文件位置**：`packages/frontend/types/api.ts`

```typescript
/**
 * 外部参照文件上传状态
 */
export type UploadState = 'notSelected' | 'uploading' | 'success' | 'fail';

/**
 * 外部参照文件信息
 */
export interface ExternalReferenceFile {
  /** 文件名 */
  name: string;
  /** 文件类型 */
  type: 'img' | 'ref';
  /** 上传状态 */
  uploadState: UploadState;
  /** 上传进度（0-100） */
  progress: number;
  /** 选中的文件对象 */
  source?: File;
  /** 文件是否已存在 */
  exists?: boolean;
}

/**
 * useExternalReferenceUpload 配置
 */
export interface UseExternalReferenceUploadConfig {
  /** 文件哈希值 */
  fileHash: string;
  /** 上传成功回调 */
  onSuccess?: () => void;
  /** 上传失败回调 */
  onError?: (error: string) => void;
  /** 跳过上传回调 */
  onSkip?: () => void;
}

/**
 * useExternalReferenceUpload 返回值
 */
export interface UseExternalReferenceUploadReturn {
  /** 模态框是否打开 */
  isOpen: boolean;
  /** 外部参照文件列表 */
  files: ExternalReferenceFile[];
  /** 是否正在上传 */
  loading: boolean;
  /** 检查缺失的外部参照 */
  checkMissingReferences: () => Promise<boolean>;
  /** 选择文件 */
  selectFiles: () => void;
  /** 上传文件 */
  uploadFiles: () => Promise<void>;
  /** 关闭模态框 */
  close: () => void;
  /** 完成上传 */
  complete: () => void;
  /** 跳过上传 */
  skip: () => void;
}
```

### 2. Hook 实现

**文件位置**：`packages/frontend/hooks/useExternalReferenceUpload.ts`

```typescript
import { useState, useCallback } from 'react';
import { apiService, mxcadApi } from '../services/apiService';
import type {
  PreloadingData,
  ExternalReferenceFile,
  UploadState,
  UseExternalReferenceUploadConfig,
  UseExternalReferenceUploadReturn,
} from '../types/api';

/**
 * MxCAD 外部参照上传 Hook
 * 
 * 功能：
 * - 检测缺失的外部参照
 * - 上传外部参照文件
 * - 管理上传状态和进度
 * - 支持跳过上传（可选功能）
 */
export const useExternalReferenceUpload = (
  config: UseExternalReferenceUploadConfig
): UseExternalReferenceUploadReturn => {
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<ExternalReferenceFile[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  /**
   * 获取预加载数据
   */
  const fetchPreloadingData = useCallback(async (): Promise<PreloadingData | null> => {
    try {
      const response = await mxcadApi.getPreloadingData(config.fileHash);
      return response.data;
    } catch (error) {
      console.error('[useExternalReferenceUpload] 获取预加载数据失败:', error);
      return null;
    }
  }, [config.fileHash]);

  /**
   * 检查外部参照是否存在
   */
  const checkReferenceExists = useCallback(
    async (fileName: string): Promise<boolean> => {
      try {
        const response = await mxcadApi.checkExternalReferenceExists(
          config.fileHash,
          fileName
        );
        return response.data.exists;
      } catch (error) {
        console.error('[useExternalReferenceUpload] 检查外部参照失败:', error);
        return false;
      }
    },
    [config.fileHash]
  );

  /**
   * 检查缺失的外部参照
   * @returns 是否有缺失的外部参照
   */
  const checkMissingReferences = useCallback(async (): Promise<boolean> => {
    const preloadingData = await fetchPreloadingData();

    if (!preloadingData) {
      console.log('[useExternalReferenceUpload] 未找到预加载数据');
      return false;
    }

    // 过滤掉 http/https 开头的 URL（已有外部参照）
    const missingImages = preloadingData.images.filter(
      (name) => !name.startsWith('http:') && !name.startsWith('https:')
    );
    const missingRefs = preloadingData.externalReference;

    if (missingImages.length === 0 && missingRefs.length === 0) {
      console.log('[useExternalReferenceUpload] 无缺失的外部参照');
      return false;
    }

    console.log(
      `[useExternalReferenceUpload] 检测到外部参照: 图片 ${missingImages.length} 个, DWG ${missingRefs.length} 个`
    );

    // 检查哪些文件缺失
    const missingFiles: ExternalReferenceFile[] = [];

    // 检查 DWG 外部参照
    for (const name of missingRefs) {
      const exists = await checkReferenceExists(name);
      missingFiles.push({
        name,
        type: 'ref',
        uploadState: 'notSelected',
        progress: 0,
        exists,
      });
    }

    // 检查图片外部参照
    for (const name of missingImages) {
      const exists = await checkReferenceExists(name);
      missingFiles.push({
        name,
        type: 'img',
        uploadState: 'notSelected',
        progress: 0,
        exists,
      });
    }

    // 过滤掉已存在的文件
    const trulyMissingFiles = missingFiles.filter((f) => !f.exists);

    if (trulyMissingFiles.length === 0) {
      console.log('[useExternalReferenceUpload] 所有外部参照已存在');
      return false;
    }

    console.log(
      `[useExternalReferenceUpload] 缺失的外部参照: ${trulyMissingFiles.length} 个`
    );

    setFiles(trulyMissingFiles);
    setIsOpen(true);
    return true;
  }, [fetchPreloadingData, checkReferenceExists]);

  /**
   * 选择文件
   */
  const selectFiles = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.dwg,image/*';
    input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = () => {
      if (!input.files) return;

      const selectedFiles = Array.from(input.files);

      setFiles((prevFiles) => {
        const newFiles = [...prevFiles];

        selectedFiles.forEach((file) => {
          const existingFile = newFiles.find((f) => f.name === file.name);
          if (existingFile) {
            existingFile.source = file;
          }
        });

        return newFiles;
      });

      input.remove();
    };

    input.click();
  }, []);

  /**
   * 上传文件
   */
  const uploadFiles = useCallback(async () => {
    const filesToUpload = files.filter(
      (f) => f.source && f.uploadState === 'notSelected'
    );

    if (filesToUpload.length === 0) {
      console.log('[useExternalReferenceUpload] 没有需要上传的文件');
      return;
    }

    console.log(
      `[useExternalReferenceUpload] 开始上传 ${filesToUpload.length} 个文件`
    );
    setLoading(true);

    for (const fileInfo of filesToUpload) {
      if (!fileInfo.source) continue;

      // 更新状态为上传中
      setFiles((prevFiles) =>
        prevFiles.map((f) =>
          f.name === fileInfo.name
            ? { ...f, uploadState: 'uploading' as UploadState, progress: 0 }
            : f
        )
      );

      try {
        const endpoint =
          fileInfo.type === 'img'
            ? mxcadApi.uploadExtReferenceImage
            : mxcadApi.uploadExtReferenceDwg;

        await endpoint(
          fileInfo.source,
          config.fileHash,
          fileInfo.name,
          (progressEvent) => {
            if (progressEvent.total) {
              const progress = (progressEvent.loaded / progressEvent.total) * 100;
              setFiles((prevFiles) =>
                prevFiles.map((f) =>
                  f.name === fileInfo.name ? { ...f, progress } : f
                )
              );
            }
          }
        );

        // 更新状态为成功
        setFiles((prevFiles) =>
          prevFiles.map((f) =>
            f.name === fileInfo.name
              ? { ...f, uploadState: 'success' as UploadState, progress: 100 }
              : f
          )
        );

        console.log(`[useExternalReferenceUpload] 上传成功: ${fileInfo.name}`);
      } catch (error) {
        console.error(`[useExternalReferenceUpload] 上传失败: ${fileInfo.name}`, error);
        config.onError?.(`上传 ${fileInfo.name} 失败`);

        // 更新状态为失败
        setFiles((prevFiles) =>
          prevFiles.map((f) =>
            f.name === fileInfo.name
              ? { ...f, uploadState: 'fail' as UploadState }
              : f
          )
        );
      }
    }

    setLoading(false);
    console.log('[useExternalReferenceUpload] 所有文件上传完成');
  }, [files, config.fileHash, config.onError]);

  /**
   * 关闭模态框
   */
  const close = useCallback(() => {
    setIsOpen(false);
    setFiles([]);
  }, []);

  /**
   * 完成上传
   */
  const complete = useCallback(() => {
    const allSuccess = files.every((f) => f.uploadState === 'success');

    if (allSuccess) {
      console.log('[useExternalReferenceUpload] 所有文件上传成功');
      config.onSuccess?.();
    } else {
      console.warn('[useExternalReferenceUpload] 部分文件上传失败');
    }

    close();
  }, [files, config.onSuccess, close]);

  /**
   * 跳过上传
   */
  const skip = useCallback(() => {
    console.log('[useExternalReferenceUpload] 用户跳过上传');
    config.onSkip?.();
    close();
  }, [config.onSkip, close]);

  return {
    isOpen,
    files,
    loading,
    checkMissingReferences,
    selectFiles,
    uploadFiles,
    close,
    complete,
    skip,
  };
};
```

### 3. 单元测试

**文件位置**：`packages/frontend/hooks/useExternalReferenceUpload.spec.ts`（需新建）

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useExternalReferenceUpload } from './useExternalReferenceUpload';
import * as apiService from '../services/apiService';

// Mock API 服务
vi.mock('../services/apiService', () => ({
  apiService: {},
  mxcadApi: {
    getPreloadingData: vi.fn(),
    checkExternalReferenceExists: vi.fn(),
    uploadExtReferenceDwg: vi.fn(),
    uploadExtReferenceImage: vi.fn(),
  },
}));

describe('useExternalReferenceUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该初始化正确的状态', () => {
    const { result } = renderHook(() =>
      useExternalReferenceUpload({
        fileHash: 'testhash123',
      })
    );

    expect(result.current.isOpen).toBe(false);
    expect(result.current.files).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('应该检测到缺失的外部参照', async () => {
    const mockPreloadingData = {
      tz: false,
      src_file_md5: 'testhash123',
      images: ['image1.png'],
      externalReference: ['ref1.dwg'],
    };

    vi.mocked(apiService.mxcadApi.getPreloadingData).mockResolvedValue({
      data: mockPreloadingData,
    } as any);

    vi.mocked(apiService.mxcadApi.checkExternalReferenceExists).mockResolvedValue({
      data: { exists: false },
    } as any);

    const { result } = renderHook(() =>
      useExternalReferenceUpload({
        fileHash: 'testhash123',
      })
    );

    let hasMissing = false;
    await act(async () => {
      hasMissing = await result.current.checkMissingReferences();
    });

    expect(hasMissing).toBe(true);
    expect(result.current.isOpen).toBe(true);
    expect(result.current.files.length).toBe(2);
  });

  it('应该在没有缺失外部参照时不打开模态框', async () => {
    const mockPreloadingData = {
      tz: false,
      src_file_md5: 'testhash123',
      images: [],
      externalReference: [],
    };

    vi.mocked(apiService.mxcadApi.getPreloadingData).mockResolvedValue({
      data: mockPreloadingData,
    } as any);

    const { result } = renderHook(() =>
      useExternalReferenceUpload({
        fileHash: 'testhash123',
      })
    );

    let hasMissing = false;
    await act(async () => {
      hasMissing = await result.current.checkMissingReferences();
    });

    expect(hasMissing).toBe(false);
    expect(result.current.isOpen).toBe(false);
  });

  it('应该正确处理文件选择', () => {
    const { result } = renderHook(() =>
      useExternalReferenceUpload({
        fileHash: 'testhash123',
      })
    );

    // 模拟文件选择
    const mockFile = new File(['content'], 'ref1.dwg', { type: 'application/octet-stream' });
    const mockFiles = [mockFile];

    // Mock input 元素
    const mockInput = {
      click: vi.fn(),
      files: mockFiles as any,
      onchange: null as any,
    };

    global.document.createElement = vi.fn().mockReturnValue(mockInput);

    act(() => {
      result.current.selectFiles();
    });

    expect(mockInput.click).toHaveBeenCalled();
  });

  it('应该正确跳过上传', () => {
    const onSkip = vi.fn();

    const { result } = renderHook(() =>
      useExternalReferenceUpload({
        fileHash: 'testhash123',
        onSkip,
      })
    );

    act(() => {
      result.current.skip();
    });

    expect(onSkip).toHaveBeenCalled();
    expect(result.current.isOpen).toBe(false);
  });
});
```

## 验收标准

- [ ] 类型定义完整准确
- [ ] `checkMissingReferences` 方法实现正确
- [ ] `selectFiles` 方法实现正确
- [ ] `uploadFiles` 方法实现正确
- [ ] 状态管理正确
- [ ] 支持跳过上传功能
- [ ] 单元测试全部通过
- [ ] TypeScript 类型检查通过

## 测试方法

### 1. 手动测试

```typescript
// 在组件中使用
import { useExternalReferenceUpload } from '../hooks/useExternalReferenceUpload';

function TestComponent() {
  const externalReferenceUpload = useExternalReferenceUpload({
    fileHash: '25e89b5adf19984330f4e68b0f99db64',
    onSuccess: () => console.log('上传成功'),
    onError: (error) => console.error('上传失败:', error),
    onSkip: () => console.log('用户跳过上传'),
  });

  return (
    <div>
      <button onClick={() => externalReferenceUpload.checkMissingReferences()}>
        检查外部参照
      </button>

      {externalReferenceUpload.isOpen && (
        <div>
          <h3>缺失的外部参照</h3>
          <ul>
            {externalReferenceUpload.files.map((file, index) => (
              <li key={index}>
                {file.name} - {file.uploadState}
              </li>
            ))}
          </ul>
          <button onClick={externalReferenceUpload.selectFiles}>
            选择文件
          </button>
          <button onClick={externalReferenceUpload.uploadFiles}>
            上传
          </button>
          <button onClick={externalReferenceUpload.complete}>
            完成
          </button>
          <button onClick={externalReferenceUpload.skip}>
            稍后上传
          </button>
        </div>
      )}
    </div>
  );
}
```

### 2. 单元测试

```bash
cd packages/frontend
pnpm test useExternalReferenceUpload.spec.ts
```

## 注意事项

1. **异步操作**：所有异步操作都应该使用 `act` 包装
2. **状态更新**：状态更新应该使用函数式更新，避免闭包问题
3. **错误处理**：所有 API 调用都应该有错误处理
4. **日志记录**：记录关键操作，便于调试
5. **性能优化**：使用 `useCallback` 避免不必要的重新渲染

## 依赖任务

- ✅ 任务 004：前端 - 获取预加载数据 API 方法（必须）

## 后续任务

- 任务 006：前端 - ExternalReferenceModal 组件
- 任务 007：前端 - 集成到 MxCadUploader
- 任务 008：前端 - 文件列表缺失外部参照提醒
- 任务 009：前端 - 随时上传外部参照功能
- 任务 010：集成测试

---

**任务状态**：✅ 已完成  
**完成日期**：2025-12-29  
**负责人**：iFlow CLI
# 任务 004：前端 - 获取预加载数据 API 方法

## 任务描述

在前端 API 服务中添加获取预加载数据和检查外部参照存在性的方法。

## 任务目标

- ✅ 在 `apiService.ts` 中添加获取预加载数据方法
- ✅ 在 `apiService.ts` 中添加检查外部参照存在性方法
- ✅ 添加 TypeScript 类型定义
- ✅ 编写单元测试

## 技术细节

### 1. 添加类型定义

**文件位置**：`packages/frontend/types/api.ts`

```typescript
/**
 * 外部参照预加载数据
 */
export interface PreloadingData {
  /** 是否为图纸 */
  tz: boolean;
  /** 源文件哈希值 */
  src_file_md5: string;
  /** 图片列表 */
  images: string[];
  /** 外部参照列表 */
  externalReference: string[];
}

/**
 * 外部参照文件存在性检查结果
 */
export interface CheckReferenceExistsResult {
  /** 文件是否存在 */
  exists: boolean;
}
```

### 2. 添加 API 方法

**文件位置**：`packages/frontend/services/apiService.ts`

在 `ApiService` 类中添加以下方法：

```typescript
/**
 * 获取外部参照预加载数据
 * @param fileHash 文件哈希值
 * @returns 预加载数据
 */
async getPreloadingData(fileHash: string): Promise<AxiosResponse<PreloadingData>> {
  return this.get(`/mxcad/file/${fileHash}/preloading`);
}

/**
 * 检查外部参照文件是否存在
 * @param fileHash 源图纸文件的哈希值
 * @param fileName 外部参照文件名
 * @returns 检查结果
 */
async checkExternalReferenceExists(
  fileHash: string,
  fileName: string
): Promise<AxiosResponse<CheckReferenceExistsResult>> {
  return this.post(`/mxcad/file/${fileHash}/check-reference`, { fileName });
}
```

### 3. 导出便捷方法

**文件位置**：`packages/frontend/services/apiService.ts`

在文件末尾添加便捷方法导出：

```typescript
// MxCAD 相关的 API 方法
export const mxcadApi = {
  // 获取预加载数据
  getPreloadingData: (fileHash: string) =>
    apiService.get<PreloadingData>(`/mxcad/file/${fileHash}/preloading`),

  // 检查外部参照是否存在
  checkExternalReferenceExists: (fileHash: string, fileName: string) =>
    apiService.post<CheckReferenceExistsResult>(
      `/mxcad/file/${fileHash}/check-reference`,
      { fileName }
    ),

  // 上传外部参照 DWG
  uploadExtReferenceDwg: (
    file: File,
    srcDwgFileHash: string,
    extRefFile: string,
    onProgress?: (progressEvent: any) => void
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('src_dwgfile_hash', srcDwgFileHash);
    formData.append('ext_ref_file', extRefFile);

    return apiService.post('/mxcad/up_ext_reference_dwg', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress,
    });
  },

  // 上传外部参照图片
  uploadExtReferenceImage: (
    file: File,
    srcDwgFileHash: string,
    extRefFile: string,
    onProgress?: (progressEvent: any) => void
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('src_dwgfile_hash', srcDwgFileHash);
    formData.append('ext_ref_file', extRefFile);

    return apiService.post('/mxcad/up_ext_reference_image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress,
    });
  },
};
```

### 4. 单元测试

**文件位置**：`packages/frontend/services/apiService.spec.ts`（需新建）

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiService } from './apiService';
import { PreloadingData } from '../types/api';

// Mock axios
vi.mock('axios', () => ({
  create: vi.fn(() => ({
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  })),
}));

describe('MxCAD API Methods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPreloadingData', () => {
    it('应该成功获取预加载数据', async () => {
      const mockData: PreloadingData = {
        tz: false,
        src_file_md5: 'testhash123',
        images: ['image1.png', 'image2.jpg'],
        externalReference: ['ref1.dwg', 'ref2.dwg'],
      };

      const mockResponse = {
        data: mockData,
        status: 200,
      };

      // Mock axios get 方法
      apiService['client'].get = vi.fn().mockResolvedValue(mockResponse);

      const result = await apiService.getPreloadingData('testhash123');

      expect(apiService['client'].get).toHaveBeenCalledWith(
        '/mxcad/file/testhash123/preloading'
      );
      expect(result.data).toEqual(mockData);
    });

    it('应该在文件不存在时返回 404', async () => {
      const mockResponse = {
        response: {
          status: 404,
          data: { code: -1, message: '预加载数据不存在' },
        },
      };

      apiService['client'].get = vi.fn().mockRejectedValue(mockResponse);

      await expect(
        apiService.getPreloadingData('nonexistent')
      ).rejects.toThrow();
    });
  });

  describe('checkExternalReferenceExists', () => {
    it('应该成功检查文件存在性', async () => {
      const mockResponse = {
        data: { exists: true },
        status: 200,
      };

      apiService['client'].post = vi.fn().mockResolvedValue(mockResponse);

      const result = await apiService.checkExternalReferenceExists(
        'testhash123',
        'ref1.dwg'
      );

      expect(apiService['client'].post).toHaveBeenCalledWith(
        '/mxcad/file/testhash123/check-reference',
        { fileName: 'ref1.dwg' }
      );
      expect(result.data.exists).toBe(true);
    });

    it('应该返回文件不存在', async () => {
      const mockResponse = {
        data: { exists: false },
        status: 200,
      };

      apiService['client'].post = vi.fn().mockResolvedValue(mockResponse);

      const result = await apiService.checkExternalReferenceExists(
        'testhash123',
        'nonexistent.dwg'
      );

      expect(result.data.exists).toBe(false);
    });
  });
});
```

## 验收标准

- [x] 类型定义完整准确
- [x] `getPreloadingData` 方法实现正确
- [x] `checkExternalReferenceExists` 方法实现正确
- [x] 便捷方法导出完整
- [x] 单元测试全部通过
- [x] TypeScript 类型检查通过

## 测试方法

### 1. 手动测试

```typescript
// 在浏览器控制台中测试

import { apiService } from './services/apiService';

// 测试获取预加载数据
async function testGetPreloadingData() {
  try {
    const response = await apiService.getPreloadingData(
      '25e89b5adf19984330f4e68b0f99db64'
    );
    console.log('预加载数据:', response.data);
  } catch (error) {
    console.error('获取失败:', error);
  }
}

// 测试检查外部参照存在性
async function testCheckExternalReferenceExists() {
  try {
    const response = await apiService.checkExternalReferenceExists(
      '25e89b5adf19984330f4e68b0f99db64',
      'ref1.dwg'
    );
    console.log('文件存在:', response.data.exists);
  } catch (error) {
    console.error('检查失败:', error);
  }
}

// 执行测试
testGetPreloadingData();
testCheckExternalReferenceExists();
```

### 2. 单元测试

```bash
cd packages/frontend
pnpm test apiService.spec.ts
```

## 注意事项

1. **类型安全**：确保所有方法都有正确的 TypeScript 类型定义
2. **错误处理**：API 方法应该抛出错误，由调用方处理
3. **拦截器**：确保请求拦截器正确添加 JWT token
4. **响应格式**：MxCAD 接口绕过自动解包，保持原始格式

## 依赖任务

- ✅ 任务 001：后端 - 获取外部参照预加载数据接口（必须）
- ✅ 任务 002：后端 - 检查外部参照文件是否存在接口（必须）

## 后续任务

- 任务 005：前端 - useExternalReferenceUpload Hook
- 任务 006：前端 - ExternalReferenceModal 组件
- 任务 007：前端 - 集成到 MxCadUploader
- 任务 008：前端 - 文件列表缺失外部参照提醒
- 任务 009：前端 - 随时上传外部参照功能
- 任务 010：集成测试

---

**任务状态**：✅ 已完成  
**完成日期**：2025-12-29  
**负责人**：iFlow CLI

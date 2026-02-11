# 外部参照上传功能技术方案

## 一、功能概述

### 1.1 需求背景

CAD 图纸转换完成后，会生成一个 `*.mxweb_preloading.json` 文件，该文件包含图纸的外部参照信息（外部参照 DWG 文件和图片文件）。当图纸存在缺失的外部参照时，需要允许用户上传这些缺失的参照文件，以确保图纸能够正常显示和编辑。

### 1.2 核心功能

- **检测外部参照**：在图纸转换完成后，解析 `*_preloading.json` 文件，识别缺失的外部参照
- **上传外部参照**：提供 UI 界面，允许用户选择并上传缺失的外部参照文件
- **文件转换**：上传的 DWG 外部参照需要转换为 mxweb 格式
- **文件存储**：将转换后的文件存储到正确的目录（`uploads/{hash}/`）
- **进度显示**：显示上传和转换进度
- **错误处理**：处理上传失败、转换失败等异常情况

**技术栈**：
- **后端**：NestJS + Express + MxCAD 转换服务
- **前端**：React + TypeScript + Tailwind CSS
- **文件存储**：本地文件系统
- **上传方式**：分片上传 + 秒传支持

---

## 二、当前项目架构分析

### 2.1 后端现有实现

#### 2.1.1 MxCAD 控制器（`mxcad.controller.ts`）

已实现的三个外部参照上传接口：

| 接口                            | 方法 | 功能             | 状态      |
| ------------------------------- | ---- | ---------------- | --------- |
| `/mxcad/up_ext_reference_dwg`   | POST | 上传外部参照 DWG | ✅ 已实现 |
| `/mxcad/up_ext_reference_image` | POST | 上传外部参照图片 | ✅ 已实现 |
| `/mxcad/up_image`               | POST | 上传图片         | ✅ 已实现 |

**接口参数**：

- `file`: 文件（FormData）
- `src_dwgfile_hash`: 原始图纸文件的哈希值
- `ext_ref_file`: 外部参照文件名

**返回格式**（绕过全局响应包装）：

```json
{ "code": 0, "message": "ok" }
```

#### 2.1.2 文件转换服务（`file-conversion.service.ts`）

- **转换工具**：`mxcadassembly.exe`（Windows 平台）
- **转换参数**：
  - `srcpath`: 源文件路径
  - `src_file_md5`: 文件哈希值
  - `create_preloading_data`: 是否创建预加载数据
  - `compression`: 是否压缩

#### 2.1.3 文件上传管理器（`file-upload-manager.service.ts`）

- **分片上传**：支持 5MB 分片大小
- **秒传支持**：通过哈希值检测文件是否已存在
- **文件节点创建**：自动创建 FileSystemNode 记录
- **文件存储**：自动存储到本地文件系统

#### 2.1.4 文件系统服务（`file-system.service.ts`）

- **临时目录**：`temp/chunk_{hash}/`（分片临时存储）
- **上传目录**：`uploads/`（转换后文件存储）
- **文件合并**：支持分片文件合并

### 2.2 前端现有实现

#### 2.2.1 MxCAD 上传组件（`MxCadUploader.tsx`）

- **Hook**：`useMxCadUploadNative`
- **上传流程**：
  1. 文件选择和验证（类型、大小）
  2. 计算文件哈希（简单哈希函数）
  3. 分片上传（5MB 每片）
  4. 秒传检测（`fileisExist` 接口）
  5. 进度显示

#### 2.2.2 API 服务（`apiService.ts`）

- **基础 URL**：`http://localhost:3001/api`
- **拦截器**：自动添加 JWT token 和 nodeId
- **MxCAD 接口**：跳过自动解包，保持原始格式

#### 2.2.3 模态框体系

- **基础组件**：`Modal.tsx`（通用模态框）
- **业务组件**：
  - `CreateFolderModal.tsx`（创建文件夹）
  - `RenameModal.tsx`（重命名）
  - `ProjectModal.tsx`（项目管理）
  - `MembersModal.tsx`（成员管理）

#### 2.2.4 UI 组件库

- **Button**：按钮组件
- **Toast**：消息提示
- **ConfirmDialog**：确认对话框
- **FileIcons**：图标系统

---

## 三、技术方案设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                         前端（React）                        │
├─────────────────────────────────────────────────────────────┤
│  MxCadUploader  →  上传成功回调  →  检测外部参照  →  显示模态框 │
│                      ↓                                       │
│              ExternalReferenceModal                          │
│                      ↓                                       │
│              上传外部参照文件（DWG/图片）                     │
│                      ↓                                       │
│              显示上传进度和状态                               │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                         后端（NestJS）                        │
├─────────────────────────────────────────────────────────────┤
│  /mxcad/up_ext_reference_dwg  →  转换 DWG  →  存储到 uploads  │
│  /mxcad/up_ext_reference_image →  直接存储  →  存储到 uploads  │
│                      ↓                                       │
│              MxCadAssembly 转换服务                          │
│                      ↓                                       │
│              生成 *.mxweb 文件                               │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 数据流程

#### 3.2.1 外部参照检测流程

```
1. 图纸上传完成
   ↓
2. 读取 *_preloading.json 文件
   ↓
3. 解析 JSON，提取 externalReference 和 images 数组
   ↓
4. 过滤掉 http/https 开头的 URL（已有外部参照）
   ↓
5. 检查本地文件是否存在（uploads/{hash}/）
   ↓
6. 识别缺失的外部参照
   ↓
7. 显示上传模态框
```

#### 3.2.2 外部参照上传流程

```
1. 用户点击"选择文件"按钮
   ↓
2. 创建隐藏的 input[type="file"]
   ↓
3. 用户选择文件
   ↓
4. 验证文件类型和名称匹配
   ↓
5. 根据 type 调用不同的上传接口：
   - DWG 文件 → /mxcad/up_ext_reference_dwg
   - 图片文件 → /mxcad/up_ext_reference_image
   ↓
6. 显示上传进度
   ↓
7. 上传成功后更新状态
   ↓
8. 用户点击"继续打开文件"
```

### 3.3 关键技术点

#### 3.3.1 后端增强

**1. 新增获取外部参照信息接口**

```typescript
// GET /mxcad/file/:hash/preloading
async getPreloadingData(@Param('hash') fileHash: string): Promise<{
  tz: boolean;
  src_file_md5: string;
  images: string[];
  externalReference: string[];
}> {
  // 从 uploads 目录读取 *_preloading.json 文件
  // 返回外部参照信息
}
```

**2. 增强上传接口验证**

- 验证 `src_dwgfile_hash` 对应的图纸是否存在
- 验证用户是否有权限访问该图纸
- 验证 `ext_ref_file` 是否在 `*_preloading.json` 列表中

**3. 文件存储路径规范**

```
uploads/
└── {src_dwgfile_hash}/
    ├── {src_dwgfile_hash}.dwg.mxweb
    ├── {src_dwgfile_hash}.dwg.mxweb_preloading.json
    ├── {external_ref_1}.dwg.mxweb
    ├── {external_ref_2}.png
    └── ...
```

#### 3.3.2 前端实现

**1. 新增 Hook：useExternalReferenceUpload**

```typescript
interface ExternalReferenceUploadConfig {
  fileHash: string;
  preloadingData: PreloadingData;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

interface PreloadingData {
  tz: boolean;
  src_file_md5: string;
  images: string[];
  externalReference: string[];
}
```

**2. 新增组件：ExternalReferenceModal**

```typescript
interface ExternalReferenceModalProps {
  isOpen: boolean;
  fileHash: string;
  preloadingData: PreloadingData;
  onClose: () => void;
  onComplete: () => void;
  onSkip: () => void; // 新增：跳过上传回调
}
```

**3. 文件上传逻辑**

```typescript
// DWG 外部参照上传
const uploadDwgReference = async (
  file: File,
  fileName: string,
  fileHash: string
) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('src_dwgfile_hash', fileHash);
  formData.append('ext_ref_file', fileName);

  await apiService.post('/mxcad/up_ext_reference_dwg', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

// 图片外部参照上传
const uploadImageReference = async (
  file: File,
  fileName: string,
  fileHash: string
) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('src_dwgfile_hash', fileHash);
  formData.append('ext_ref_file', fileName);

  await apiService.post('/mxcad/up_ext_reference_image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
```

### 3.4 用户交互流程

```
┌─────────────────────────────────────────────────────────────┐
│  1. 用户上传 CAD 图纸（.dwg/.dxf）                           │
│     ↓                                                        │
│  2. 后端转换图纸为 .mxweb 格式                                │
│     ↓                                                        │
│  3. 生成 *_preloading.json 文件                             │
│     ↓                                                        │
│  4. 前端检测到缺失的外部参照                                 │
│     ↓                                                        │
│  5. 显示"外部参照上传"模态框（可选）                          │
│     ↓                                                        │
│  6. 用户查看缺失的外部参照列表                               │
│     ↓                                                        │
│  7. 用户选择：                                               │
│     ├─ 选项A：立即上传外部参照                               │
│     │   ↓                                                    │
│     │   8. 用户点击"选择文件"按钮                            │
│     │   ↓                                                    │
│     │   9. 用户选择对应的外部参照文件                        │
│     │   ↓                                                    │
│     │   10. 系统自动上传并转换（DWG）                        │
│     │   ↓                                                    │
│     │   11. 显示上传进度和状态                               │
│     │   ↓                                                    │
│     │   12. 用户点击"完成"                                   │
│     │   ↓                                                    │
│     │   13. 图纸正常显示（包含外部参照）                     │
│     │                                                         │
│     └─ 选项B：稍后上传（跳过）                               │
│         ↓                                                    │
│         8. 用户点击"稍后上传"                                │
│         ↓                                                    │
│         9. 图纸正常显示（外部参照缺失）                      │
│         ↓                                                    │
│         10. 文件列表中显示"缺失外部参照"警告标识              │
│         ↓                                                    │
│         11. 用户可随时点击文件上的"上传外部参照"按钮         │
│         ↓                                                    │
│         12. 打开外部参照上传模态框                           │
│         ↓                                                    │
│         13. 上传外部参照文件                                 │
│         ↓                                                    │
│         14. 警告标识自动消失                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 四、实现方案

### 4.0 后端增强 - 文件系统外部参照跟踪（新增）

在文件系统中记录图纸的外部参照信息，包括缺失的外部参照列表和状态。

#### 4.0.1 更新 Prisma Schema

```prisma
model FileSystemNode {
  // ... 现有字段 ...

  // 新增：外部参照相关字段
  hasMissingExternalReferences  Boolean @default(false)
  missingExternalReferencesCount Int    @default(0)
  externalReferencesJson        String? // 存储完整的外部参照信息（JSON 格式）
}
```

#### 4.0.2 外部参照信息类型定义

```typescript
export interface ExternalReferenceInfo {
  name: string;
  type: 'dwg' | 'image';
  exists: boolean;
  required: boolean;
}

export interface ExternalReferenceStats {
  hasMissing: boolean;
  missingCount: number;
  totalCount: number;
  references: ExternalReferenceInfo[];
}
```

#### 4.0.3 文件转换服务增强

在文件转换完成后，自动解析 `*_preloading.json` 文件，统计外部参照信息，并更新到文件系统节点中。

```typescript
async convertFile(options: ConversionOptions): Promise<ConversionResult> {
  // ... 现有转换逻辑 ...

  // 转换成功后，更新外部参照信息
  if (isOk && ret.code === 0) {
    const stats = await this.getExternalReferenceStats(options.fileHash);
    await this.updateExternalReferenceInfo(options.fileHash, stats);
  }

  return { isOk, ret };
}
```

#### 4.0.4 新增 API 接口

- `GET /mxcad/file/:hash/external-references` - 获取外部参照统计信息
- `POST /mxcad/file/:hash/refresh-external-references` - 手动刷新外部参照信息

### 4.1 后端实现

#### 4.1.1 新增 DTO

```typescript
// packages/backend/src/mxcad/dto/preloading-data.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, IsArray } from 'class-validator';

export class PreloadingDataDto {
  @ApiProperty({ description: '是否为图纸' })
  @IsBoolean()
  tz: boolean;

  @ApiProperty({ description: '源文件哈希值' })
  @IsString()
  src_file_md5: string;

  @ApiProperty({ description: '图片列表', type: [String] })
  @IsArray()
  @IsString({ each: true })
  images: string[];

  @ApiProperty({ description: '外部参照列表', type: [String] })
  @IsArray()
  @IsString({ each: true })
  externalReference: string[];
}
```

#### 4.1.2 新增 Service 方法

```typescript
// packages/backend/src/mxcad/mxcad.service.ts

/**
 * 获取外部参照预加载数据
 */
async getPreloadingData(fileHash: string): Promise<PreloadingDataDto | null> {
  try {
    const fs = require('fs');
    const path = require('path');
    const uploadPath = this.configService.get('MXCAD_UPLOAD_PATH') || path.join(process.cwd(), 'uploads');

    // 查找所有以 fileHash 开头的文件
    const files = await fs.promises.readdir(uploadPath);
    const preloadingFile = files.find(file =>
      file.startsWith(fileHash) && file.endsWith('_preloading.json')
    );

    if (!preloadingFile) {
      return null;
    }

    const filePath = path.join(uploadPath, preloadingFile);
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    this.logger.error(`获取预加载数据失败: ${error.message}`);
    return null;
  }
}

/**
 * 检查外部参照文件是否存在
 */
async checkExternalReferenceExists(
  fileHash: string,
  fileName: string
): Promise<boolean> {
  try {
    const fs = require('fs');
    const path = require('path');
    const uploadPath = this.configService.get('MXCAD_UPLOAD_PATH') || path.join(process.cwd(), 'uploads');
    const hashDir = path.join(uploadPath, fileHash);

    if (!fs.existsSync(hashDir)) {
      return false;
    }

    const files = await fs.promises.readdir(hashDir);

    // 检查文件是否存在（不考虑扩展名，因为 DWG 会被转换为 mxweb）
    const baseName = path.basename(fileName, path.extname(fileName));
    const exists = files.some(file => file.startsWith(baseName));

    return exists;
  } catch (error) {
    this.logger.error(`检查外部参照文件失败: ${error.message}`);
    return false;
  }
}
```

#### 4.1.3 新增 Controller 接口

```typescript
// packages/backend/src/mxcad/mxcad.controller.ts

/**
 * 获取外部参照预加载数据
 */
@Get('file/:hash/preloading')
@ApiResponse({ status: 200, description: '获取预加载数据' })
async getPreloadingData(@Param('hash') fileHash: string, @Res() res: Response) {
  const data = await this.mxCadService.getPreloadingData(fileHash);

  if (!data) {
    return res.status(404).json({ code: -1, message: '预加载数据不存在' });
  }

  return res.json(data);
}

/**
 * 检查外部参照文件是否存在
 */
@Post('file/:hash/check-reference')
@ApiResponse({ status: 200, description: '检查外部参照文件' })
async checkExternalReference(
  @Param('hash') fileHash: string,
  @Body() body: { fileName: string },
  @Res() res: Response
) {
  const exists = await this.mxCadService.checkExternalReferenceExists(
    fileHash,
    body.fileName
  );

  return res.json({ exists });
}
```

#### 4.1.4 增强上传接口验证

```typescript
// packages/backend/src/mxcad/mxcad.controller.ts

/**
 * 上传外部参照 DWG（增强版本）
 */
@Post('up_ext_reference_dwg')
@UseInterceptors(FileInterceptor('file'))
@ApiConsumes('multipart/form-data')
async uploadExtReferenceDwg(
  @UploadedFile() file: Express.Multer.File,
  @Body() body: { src_dwgfile_hash: string; ext_ref_file: string },
  @Req() request: any,
  @Res() res: Response
) {
  // 验证文件
  if (!file) {
    return res.json({ code: -1, message: '缺少文件' });
  }

  // 验证参数
  if (!body.src_dwgfile_hash || !body.ext_ref_file) {
    return res.json({ code: -1, message: '缺少必要参数' });
  }

  // 验证图纸文件是否存在
  const preloadingData = await this.mxCadService.getPreloadingData(body.src_dwgfile_hash);
  if (!preloadingData) {
    return res.json({ code: -1, message: '图纸文件不存在' });
  }

  // 验证外部参照文件是否在列表中
  const isValidReference =
    preloadingData.externalReference.includes(body.ext_ref_file) ||
    preloadingData.images.includes(body.ext_ref_file);

  if (!isValidReference) {
    return res.json({ code: -1, message: '无效的外部参照文件' });
  }

  // 验证用户权限（可选）
  // const userId = await this.validateTokenAndGetUserId(request);
  // const hasPermission = await this.checkFileAccessPermission(...);

  const inputFile = file.path.replace(/\\/g, '/');
  const param = {
    srcpath: inputFile,
  };

  const result = await this.mxCadService.convertServerFile(param);

  // 复制转换后的文件到指定目录
  try {
    const fs = require('fs');
    const path = require('path');
    const uploadPath = process.env.MXCAD_UPLOAD_PATH || path.join(process.cwd(), 'uploads');
    const hashDir = path.join(uploadPath, body.src_dwgfile_hash);

    if (!fs.existsSync(hashDir)) {
      fs.mkdirSync(hashDir, { recursive: true });
    }

    const sourceFile = inputFile + (process.env.MXCAD_FILE_EXT || '.mxweb');
    const targetFile = path.join(hashDir, body.ext_ref_file + (process.env.MXCAD_FILE_EXT || '.mxweb'));

    if (fs.existsSync(sourceFile)) {
      fs.copyFileSync(sourceFile, targetFile);
    }
  } catch (error) {
    return res.json({ code: -1, message: 'catch error' });
  }

  return res.json(result);
}
```

### 4.2 前端实现

#### 4.2.1 新增 Hook

```typescript
// packages/frontend/hooks/useExternalReferenceUpload.ts
import { useState, useCallback } from 'react';
import { apiService } from '../services/apiService';

export interface PreloadingData {
  tz: boolean;
  src_file_md5: string;
  images: string[];
  externalReference: string[];
}

export interface ExternalReferenceFile {
  name: string;
  type: 'img' | 'ref';
  uploadState: 'notSelected' | 'uploading' | 'success' | 'fail';
  progress: number;
  source?: File;
  exists?: boolean; // 新增：文件是否已存在
}

export interface UseExternalReferenceUploadConfig {
  fileHash: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export const useExternalReferenceUpload = (
  config: UseExternalReferenceUploadConfig
) => {
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<ExternalReferenceFile[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  /**
   * 获取预加载数据
   */
  const fetchPreloadingData =
    useCallback(async (): Promise<PreloadingData | null> => {
      try {
        const response = await apiService.get(
          `/mxcad/file/${config.fileHash}/preloading`
        );
        return response.data;
      } catch (error) {
        console.error('获取预加载数据失败:', error);
        return null;
      }
    }, [config.fileHash]);

  /**
   * 检查缺失的外部参照
   */
  const checkMissingReferences = useCallback(async (): Promise<boolean> => {
    const preloadingData = await fetchPreloadingData();

    if (!preloadingData) {
      return false;
    }

    // 过滤掉 http/https 开头的 URL
    const missingImages = preloadingData.images.filter(
      (name) => !name.startsWith('http:') && !name.startsWith('https:')
    );
    const missingRefs = preloadingData.externalReference;

    if (missingImages.length === 0 && missingRefs.length === 0) {
      return false;
    }

    // 检查哪些文件缺失
    const missingFiles: ExternalReferenceFile[] = [];

    for (const name of missingRefs) {
      const exists = await checkReferenceExists(name);
      if (!exists) {
        missingFiles.push({
          name,
          type: 'ref',
          uploadState: 'notSelected',
          progress: 0,
        });
      }
    }

    for (const name of missingImages) {
      const exists = await checkReferenceExists(name);
      if (!exists) {
        missingFiles.push({
          name,
          type: 'img',
          uploadState: 'notSelected',
          progress: 0,
        });
      }
    }

    if (missingFiles.length === 0) {
      return false;
    }

    setFiles(missingFiles);
    setIsOpen(true);
    return true;
  }, [fetchPreloadingData]);

  /**
   * 检查外部参照是否存在
   */
  const checkReferenceExists = async (fileName: string): Promise<boolean> => {
    try {
      const response = await apiService.post(
        `/mxcad/file/${config.fileHash}/check-reference`,
        {
          fileName,
        }
      );
      return response.data.exists;
    } catch (error) {
      return false;
    }
  };

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
      return;
    }

    setLoading(true);

    for (const fileInfo of filesToUpload) {
      if (!fileInfo.source) continue;

      setFiles((prevFiles) =>
        prevFiles.map((f) =>
          f.name === fileInfo.name
            ? { ...f, uploadState: 'uploading' as const, progress: 0 }
            : f
        )
      );

      try {
        const formData = new FormData();
        formData.append('file', fileInfo.source);
        formData.append('src_dwgfile_hash', config.fileHash);
        formData.append('ext_ref_file', fileInfo.name);

        const endpoint =
          fileInfo.type === 'img'
            ? '/mxcad/up_ext_reference_image'
            : '/mxcad/up_ext_reference_dwg';

        await apiService.post(endpoint, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const progress =
                (progressEvent.loaded / progressEvent.total) * 100;
              setFiles((prevFiles) =>
                prevFiles.map((f) =>
                  f.name === fileInfo.name ? { ...f, progress } : f
                )
              );
            }
          },
        });

        setFiles((prevFiles) =>
          prevFiles.map((f) =>
            f.name === fileInfo.name
              ? { ...f, uploadState: 'success' as const, progress: 100 }
              : f
          )
        );
      } catch (error) {
        console.error(`上传 ${fileInfo.name} 失败:`, error);
        config.onError?.(`上传 ${fileInfo.name} 失败`);
        setFiles((prevFiles) =>
          prevFiles.map((f) =>
            f.name === fileInfo.name
              ? { ...f, uploadState: 'fail' as const }
              : f
          )
        );
      }
    }

    setLoading(false);
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
      config.onSuccess?.();
    }

    close();
  }, [files, config.onSuccess, close]);

  return {
    isOpen,
    files,
    loading,
    checkMissingReferences,
    selectFiles,
    uploadFiles,
    close,
    complete,
  };
};
```

#### 4.2.2 新增组件

```typescript
// packages/frontend/components/modals/ExternalReferenceModal.tsx
import React from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { ExternalReferenceFile } from '../../hooks/useExternalReferenceUpload';
import { CheckCircle, XCircle, Loader2, Upload } from 'lucide-react';

interface ExternalReferenceModalProps {
  isOpen: boolean;
  files: ExternalReferenceFile[];
  loading: boolean;
  onSelectFiles: () => void;
  onUpload: () => void;
  onComplete: () => void;
  onSkip: () => void; // 新增：跳过上传回调
  onClose: () => void;
}

export const ExternalReferenceModal: React.FC<ExternalReferenceModalProps> = ({
  isOpen,
  files,
  loading,
  onSelectFiles,
  onUpload,
  onComplete,
  onClose,
}) => {
  const allSuccess = files.length > 0 && files.every(f => f.uploadState === 'success');
  const allNotSelected = files.every(f => f.uploadState === 'notSelected');
  const hasUploading = files.some(f => f.uploadState === 'uploading');

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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="上传外部参照文件"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={loading}
          >
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
            onClick={onComplete}
            disabled={!allSuccess || loading}
          >
            完成
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="text-sm text-slate-600">
          检测到 {files.length} 个缺失的外部参照文件，请选择对应的文件进行上传。
        </div>

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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {files.map((file, index) => (
                <tr key={index}>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-center">
                      {getStatusIcon(file)}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-900 truncate">
                        {file.name}
                      </span>
                      {file.uploadState === 'uploading' && (
                        <span className="text-xs text-slate-500">
                          {Math.round(file.progress)}%
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600">
                      {file.type === 'img' ? '图片' : 'DWG'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {hasUploading && (
          <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 animate-pulse" />
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ExternalReferenceModal;
```

#### 4.2.3 集成到 MxCadUploader

```typescript
// packages/frontend/components/MxCadUploader.tsx
import { useExternalReferenceUpload } from '../hooks/useExternalReferenceUpload';
import { ExternalReferenceModal } from './modals/ExternalReferenceModal';

export const MxCadUploader = forwardRef<MxCadUploaderRef, MxCadUploaderProps>(({
  nodeId,
  onSuccess,
  onError,
  showProgress = true,
  buttonText = '上传 CAD 文件',
  buttonClassName = '',
}, ref) => {
  // ... 现有代码 ...

  const externalReferenceUpload = useExternalReferenceUpload({
    fileHash: '', // 在上传成功后设置
    onSuccess: () => {
      // 外部参照上传成功后的回调
      console.log('外部参照上传完成');
    },
    onError: (error) => {
      console.error('外部参照上传失败:', error);
    },
  });

  const handleSelectFiles = () => {
    // ... 现有代码 ...

    selectFiles({
      nodeId: currentNodeId || undefined,
      onSuccess: async (param: LoadFileParam) => {
        setUploading(false);
        setProgress(0);
        setMessage('文件上传成功！');
        setShowToast(true);
        onSuccess?.(param);

        // 检查外部参照
        const hasMissingReferences = await externalReferenceUpload.checkMissingReferences();
        if (hasMissingReferences) {
          console.log('检测到缺失的外部参照');
        }

        setTimeout(() => setShowToast(false), 3000);
      },
      onError: (error: string) => {
        // ... 现有代码 ...
      },
    });
  };

  return (
    <div className="mxcad-uploader">
      {/* ... 现有代码 ... */}

      <ExternalReferenceModal
        isOpen={externalReferenceUpload.isOpen}
        files={externalReferenceUpload.files}
        loading={externalReferenceUpload.loading}
        onSelectFiles={externalReferenceUpload.selectFiles}
        onUpload={externalReferenceUpload.uploadFiles}
        onComplete={externalReferenceUpload.complete}
        onClose={externalReferenceUpload.close}
      />
    </div>
  );
});
```

---

## 五、技术要点总结

### 5.1 后端关键点

1. **接口复用**：充分利用现有的 `/mxcad/up_ext_reference_dwg` 和 `/mxcad/up_ext_reference_image` 接口
2. **参数验证**：验证 `src_dwgfile_hash` 和 `ext_ref_file` 的有效性
3. **文件存储**：确保文件存储到正确的目录（`uploads/{hash}/`）
4. **权限控制**：可选的用户权限验证（JWT token 验证）
5. **错误处理**：统一的错误返回格式

### 5.2 前端关键点

1. **组件复用**：复用现有的 `Modal`、`Button` 等 UI 组件
2. **Hook 封装**：使用 `useExternalReferenceUpload` Hook 封装业务逻辑
3. **状态管理**：使用 React State 管理上传状态和进度
4. **用户体验**：
   - 清晰的文件列表展示
   - 实时的上传进度显示
   - 友好的错误提示
   - 直观的状态图标（成功/失败/上传中）
5. **类型安全**：完整的 TypeScript 类型定义

### 5.3 数据一致性

1. **文件命名规范**：
   - DWG 外部参照：`{ext_ref_file}.mxweb`
   - 图片外部参照：`{ext_ref_file}`
2. **目录结构**：所有外部参照文件存储在 `uploads/{src_dwgfile_hash}/` 目录下
3. **预加载数据**：`*_preloading.json` 文件包含所有外部参照信息

### 5.4 性能优化

1. **秒传支持**：通过哈希值检测文件是否已存在
2. **并发上传**：支持同时上传多个外部参照文件
3. **进度显示**：实时显示上传进度
4. **缓存机制**：前端缓存预加载数据，避免重复请求

---

## 六、测试计划

### 6.1 单元测试

- **后端**：
  - `getPreloadingData` 方法测试
  - `checkExternalReferenceExists` 方法测试
  - 上传接口参数验证测试
- **前端**：
  - `useExternalReferenceUpload` Hook 测试
  - `ExternalReferenceModal` 组件测试

### 6.2 集成测试

- **完整流程测试**：
  1. 上传 CAD 图纸
  2. 检测外部参照
  3. 上传外部参照文件
  4. 验证文件存储位置
  5. 验证图纸正常显示

### 6.3 边界测试

- 无外部参照的图纸
- 所有外部参照都已存在的图纸
- 上传失败的场景（网络错误、文件格式错误）
- 并发上传多个外部参照

---

## 七、部署注意事项

### 7.1 环境变量

确保以下环境变量已正确配置：

```env
# MxCAD 转换服务配置
MXCAD_ASSEMBLY_PATH=D:\web\MxCADOnline\cloudcad\packages\mxcadassembly\windows\release\mxcadassembly.exe
MXCAD_UPLOAD_PATH=D:\web\MxCADOnline\cloudcad\uploads
MXCAD_FILE_EXT=.mxweb
MXCAD_COMPRESSION=true
```

### 7.2 文件权限

确保 `uploads/` 目录具有读写权限：

```bash
# Windows
icacls uploads /grant Users:F

# Linux
chmod -R 755 uploads
```

### 7.3 防火墙配置

确保以下端口可访问：

- `3001`：后端 API 端口
- `9000`：MinIO 端口（如果使用）

---

## 八、后续优化建议

### 8.1 功能增强

1. **批量上传**：支持拖拽上传多个文件
2. **自动匹配**：根据文件名自动匹配外部参照
3. **下载模板**：提供外部参照文件列表下载
4. **历史记录**：记录已上传的外部参照文件

### 8.2 性能优化

1. **断点续传**：支持外部参照文件的断点续传
2. **压缩传输**：对大文件进行压缩传输
3. **CDN 加速**：使用 CDN 加速文件下载

### 8.3 用户体验

1. **拖拽上传**：支持拖拽文件到模态框
2. **预览功能**：预览图片外部参照
3. **批量操作**：支持批量选择和上传

---

## 九、附录

### 9.1 数据库架构变更

#### 新增字段说明

| 字段                             | 类型    | 说明                       | 默认值 |
| -------------------------------- | ------- | -------------------------- | ------ |
| `hasMissingExternalReferences`   | Boolean | 是否有缺失的外部参照       | false  |
| `missingExternalReferencesCount` | Int     | 缺失的外部参照数量         | 0      |
| `externalReferencesJson`         | String? | 完整的外部参照信息（JSON） | null   |

#### 数据迁移

```bash
cd packages/backend
pnpm db:push
```

### 9.2 参考文档

- [MxCAD 上传服务集成方案](./MXCAD_UPLOAD_INTEGRATION.md)
- [MxCAD 文件上传 API 文档](./API_UPLOAD_DOCUMENTATION.md)
- [文件系统统一架构方案](./MXCAD_FILE_SYSTEM_UNIFICATION_PLAN.md)

### 9.2 相关文件

**后端文件**：

- `packages/backend/src/mxcad/mxcad.controller.ts`
- `packages/backend/src/mxcad/mxcad.service.ts`
- `packages/backend/src/mxcad/dto/preloading-data.dto.ts`

**前端文件**：

- `packages/frontend/hooks/useExternalReferenceUpload.ts`
- `packages/frontend/components/modals/ExternalReferenceModal.tsx`
- `packages/frontend/components/MxCadUploader.tsx`

### 9.3 API 接口清单

| 接口                                            | 方法 | 功能                 | 状态      |
| ----------------------------------------------- | ---- | -------------------- | --------- |
| `/mxcad/file/:hash/preloading`                  | GET  | 获取预加载数据       | 🆕 新增   |
| `/mxcad/file/:hash/check-reference`             | POST | 检查外部参照是否存在 | 🆕 新增   |
| `/mxcad/file/:hash/external-references`         | GET  | 获取外部参照统计信息 | 🆕 新增   |
| `/mxcad/file/:hash/refresh-external-references` | POST | 手动刷新外部参照信息 | 🆕 新增   |
| `/mxcad/up_ext_reference_dwg`                   | POST | 上传外部参照 DWG     | ✅ 已实现 |
| `/mxcad/up_ext_reference_image`                 | POST | 上传外部参照图片     | ✅ 已实现 |

---

**文档版本**：v1.0  
**创建日期**：2025-12-29  
**作者**：CloudCAD 团队  
**状态**：待审核

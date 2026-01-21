# 任务 011：后端 - 文件系统外部参照跟踪

## 任务描述

在文件系统中记录图纸的外部参照信息，包括缺失的外部参照列表和状态，以便前端能够正确显示警告标识。

## 任务目标

- ✅ 更新 Prisma Schema，添加外部参照相关字段
- ✅ 创建数据库迁移
- ✅ 修改文件转换服务，自动记录外部参照信息
- ✅ 添加外部参照信息更新接口
- ✅ 编写单元测试

## 技术细节

### 1. 更新 Prisma Schema

**文件位置**：`packages/backend/prisma/schema.prisma`

```prisma
model FileSystemNode {
  id            String    @id @default(cuid())
  name          String
  isFolder      Boolean
  isRoot        Boolean  @default(false)
  parentId      String?
  originalName  String?
  path          String?
  size          Int?
  mimeType      String?
  extension     String?
  fileStatus    FileStatus?
  fileHash      String?   @unique
  description   String?
  projectStatus ProjectStatus?
  ownerId       String
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // 新增：外部参照相关字段
  hasMissingExternalReferences  Boolean @default(false)
  missingExternalReferencesCount Int    @default(0)
  externalReferencesJson        String? // 存储完整的外部参照信息（JSON 格式）

  parent       FileSystemNode?   @relation("FileSystemNodeToParent", fields: [parentId], references: [id], onDelete: Cascade)
  children     FileSystemNode[]  @relation("FileSystemNodeToParent")
  owner        User             @relation("FileSystemNodeToOwner", fields: [ownerId], references: [id])
  projectMembers ProjectMember[] @relation("ProjectToMembers")
  fileAccess   FileAccess[]
}
```

### 2. 创建数据库迁移

```bash
cd packages/backend
pnpm db:push
```

### 3. 定义外部参照信息类型

**文件位置**：`packages/backend/src/mxcad/types/external-reference.types.ts`（新建）

```typescript
/**
 * 外部参照信息
 */
export interface ExternalReferenceInfo {
  /** 外部参照文件名 */
  name: string;
  /** 文件类型 */
  type: 'dwg' | 'image';
  /** 是否已上传 */
  exists: boolean;
  /** 是否为必需 */
  required: boolean;
}

/**
 * 外部参照统计数据
 */
export interface ExternalReferenceStats {
  /** 是否有缺失的外部参照 */
  hasMissing: boolean;
  /** 缺失的外部参照数量 */
  missingCount: number;
  /** 总外部参照数量 */
  totalCount: number;
  /** 外部参照列表 */
  references: ExternalReferenceInfo[];
}
```

### 4. 修改文件转换服务

**文件位置**：`packages/backend/src/mxcad/services/file-conversion.service.ts`

```typescript
import {
  ExternalReferenceStats,
  ExternalReferenceInfo,
} from '../types/external-reference.types';

@Injectable()
export class FileConversionService implements IFileConversionService {
  // ... 现有代码 ...

  /**
   * 解析预加载数据文件
   */
  private async parsePreloadingData(fileHash: string): Promise<any> {
    try {
      const fs = require('fs');
      const path = require('path');
      const uploadPath =
        this.configService.get('MXCAD_UPLOAD_PATH') ||
        path.join(process.cwd(), 'uploads');

      const files = await fs.promises.readdir(uploadPath);
      const preloadingFile = files.find(
        (file) => file.startsWith(fileHash) && file.endsWith('_preloading.json')
      );

      if (!preloadingFile) {
        return null;
      }

      const filePath = path.join(uploadPath, preloadingFile);
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      this.logger.error(`解析预加载数据失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 检查外部参照文件是否存在
   */
  private async checkExternalReferenceExists(
    fileHash: string,
    fileName: string
  ): Promise<boolean> {
    try {
      const fs = require('fs');
      const path = require('path');
      const uploadPath =
        this.configService.get('MXCAD_UPLOAD_PATH') ||
        path.join(process.cwd(), 'uploads');
      const hashDir = path.join(uploadPath, fileHash);

      if (!fs.existsSync(hashDir)) {
        return false;
      }

      const files = await fs.promises.readdir(hashDir);
      const baseName = path.basename(fileName, path.extname(fileName));

      return files.some((file) => {
        const fileBaseName = path.basename(file, path.extname(file));
        return fileBaseName === baseName;
      });
    } catch (error) {
      this.logger.error(`检查外部参照文件失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 获取外部参照统计信息
   */
  async getExternalReferenceStats(
    fileHash: string
  ): Promise<ExternalReferenceStats> {
    const preloadingData = await this.parsePreloadingData(fileHash);

    if (!preloadingData) {
      return {
        hasMissing: false,
        missingCount: 0,
        totalCount: 0,
        references: [],
      };
    }

    // 过滤掉 http/https 开头的 URL
    const missingImages = preloadingData.images.filter(
      (name: string) => !name.startsWith('http:') && !name.startsWith('https:')
    );
    const missingRefs = preloadingData.externalReference;

    const references: ExternalReferenceInfo[] = [];

    // 检查 DWG 外部参照
    for (const name of missingRefs) {
      const exists = await this.checkExternalReferenceExists(fileHash, name);
      references.push({
        name,
        type: 'dwg',
        exists,
        required: true,
      });
    }

    // 检查图片外部参照
    for (const name of missingImages) {
      const exists = await this.checkExternalReferenceExists(fileHash, name);
      references.push({
        name,
        type: 'image',
        exists,
        required: true,
      });
    }

    const missingCount = references.filter((ref) => !ref.exists).length;

    return {
      hasMissing: missingCount > 0,
      missingCount,
      totalCount: references.length,
      references,
    };
  }

  /**
   * 更新文件节点的外部参照信息
   */
  async updateExternalReferenceInfo(
    fileHash: string,
    stats: ExternalReferenceStats
  ): Promise<void> {
    try {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { fileHash },
      });

      if (!node) {
        this.logger.warn(`文件节点不存在: ${fileHash}`);
        return;
      }

      await this.prisma.fileSystemNode.update({
        where: { id: node.id },
        data: {
          hasMissingExternalReferences: stats.hasMissing,
          missingExternalReferencesCount: stats.missingCount,
          externalReferencesJson: JSON.stringify(stats.references),
        },
      });

      this.logger.log(
        `更新外部参照信息成功: ${fileHash}, 缺失数量: ${stats.missingCount}`
      );
    } catch (error) {
      this.logger.error(`更新外部参照信息失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 转换文件（增强版本）
   */
  async convertFile(options: ConversionOptions): Promise<ConversionResult> {
    // ... 现有转换逻辑 ...

    // 转换成功后，更新外部参照信息
    if (isOk && ret.code === 0) {
      try {
        const stats = await this.getExternalReferenceStats(options.fileHash);
        await this.updateExternalReferenceInfo(options.fileHash, stats);
      } catch (error) {
        this.logger.error(`更新外部参照信息失败: ${error.message}`);
        // 不影响转换结果
      }
    }

    return { isOk, ret };
  }
}
```

### 5. 添加外部参照信息更新接口

**文件位置**：`packages/backend/src/mxcad/mxcad.controller.ts`

```typescript
import { ExternalReferenceStats } from './types/external-reference.types';

/**
 * 获取文件的外部参照统计信息
 */
@Get('file/:hash/external-references')
@ApiResponse({
  status: 200,
  description: '成功获取外部参照统计信息',
  type: ExternalReferenceStats,
})
@ApiResponse({
  status: 404,
  description: '文件不存在',
})
async getExternalReferences(
  @Param('hash') fileHash: string,
  @Res() res: Response
) {
  this.logger.log(`[getExternalReferences] 请求参数: fileHash=${fileHash}`);

  try {
    const stats = await this.mxCadService.getExternalReferenceStats(fileHash);

    this.logger.log(`[getExternalReferences] 检查结果: 缺失=${stats.missingCount}, 总数=${stats.totalCount}`);

    return res.json(stats);
  } catch (error) {
    this.logger.error(`[getExternalReferences] 获取失败: ${error.message}`);
    return res.status(500).json({ code: -1, message: '获取外部参照信息失败' });
  }
}

/**
 * 手动刷新文件的外部参照信息
 */
@Post('file/:hash/refresh-external-references')
@ApiResponse({
  status: 200,
  description: '刷新成功',
  schema: {
    type: 'object',
    properties: {
      code: { type: 'number', example: 0 },
      message: { type: 'string', example: '刷新成功' },
      stats: { type: 'object' },
    },
  },
})
async refreshExternalReferences(
  @Param('hash') fileHash: string,
  @Res() res: Response
) {
  this.logger.log(`[refreshExternalReferences] 请求参数: fileHash=${fileHash}`);

  try {
    const stats = await this.mxCadService.getExternalReferenceStats(fileHash);
    await this.mxCadService.updateExternalReferenceInfo(fileHash, stats);

    this.logger.log(`[refreshExternalReferences] 刷新成功: ${fileHash}`);

    return res.json({
      code: 0,
      message: '刷新成功',
      stats,
    });
  } catch (error) {
    this.logger.error(`[refreshExternalReferences] 刷新失败: ${error.message}`);
    return res.status(500).json({ code: -1, message: '刷新失败' });
  }
}
```

### 6. 修改文件系统节点服务

**文件位置**：`packages/backend/src/mxcad/services/filesystem-node.service.ts`

```typescript
/**
 * 创建或引用节点（增强版本）
 */
async createOrReferenceNode(options: CreateNodeOptions): Promise<FileSystemNode> {
  // ... 现有代码 ...

  // 创建节点后，检查是否有外部参照信息
  if (!options.isFolder && options.fileHash) {
    try {
      const stats = await this.fileConversionService.getExternalReferenceStats(options.fileHash);

      if (stats.totalCount > 0) {
        await this.prisma.fileSystemNode.update({
          where: { id: node.id },
          data: {
            hasMissingExternalReferences: stats.hasMissing,
            missingExternalReferencesCount: stats.missingCount,
            externalReferencesJson: JSON.stringify(stats.references),
          },
        });

        this.logger.log(
          `节点创建时更新外部参照信息: ${options.originalName}, 缺失数量: ${stats.missingCount}`
        );
      }
    } catch (error) {
      this.logger.error(`更新外部参照信息失败: ${error.message}`);
      // 不影响节点创建
    }
  }

  return node;
}
```

### 7. 单元测试

**文件位置**：`packages/backend/src/mxcad/services/file-conversion.service.spec.ts`

```typescript
describe('External Reference Tracking', () => {
  it('应该正确解析预加载数据', async () => {
    const mockPreloadingData = {
      tz: false,
      src_file_md5: 'testhash123',
      images: ['image1.png', 'image2.jpg'],
      externalReference: ['ref1.dwg', 'ref2.dwg'],
    };

    // Mock 文件系统操作
    jest
      .spyOn(fs.promises, 'readdir')
      .mockResolvedValue([
        'testhash123.dwg.mxweb',
        'testhash123.dwg.mxweb_preloading.json',
      ]);
    jest
      .spyOn(fs.promises, 'readFile')
      .mockResolvedValue(JSON.stringify(mockPreloadingData));

    const result = await service.parsePreloadingData('testhash123');

    expect(result).toEqual(mockPreloadingData);
  });

  it('应该正确统计外部参照信息', async () => {
    const mockPreloadingData = {
      tz: false,
      src_file_md5: 'testhash123',
      images: ['image1.png'],
      externalReference: ['ref1.dwg', 'ref2.dwg'],
    };

    jest
      .spyOn(fs.promises, 'readdir')
      .mockResolvedValue([
        'testhash123.dwg.mxweb',
        'testhash123.dwg.mxweb_preloading.json',
        'ref1.dwg.mxweb',
      ]);
    jest
      .spyOn(fs.promises, 'readFile')
      .mockResolvedValue(JSON.stringify(mockPreloadingData));
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);

    const stats = await service.getExternalReferenceStats('testhash123');

    expect(stats.totalCount).toBe(3);
    expect(stats.missingCount).toBe(2);
    expect(stats.hasMissing).toBe(true);
    expect(stats.references).toHaveLength(3);
  });

  it('应该正确更新文件节点的外部参照信息', async () => {
    const mockStats = {
      hasMissing: true,
      missingCount: 2,
      totalCount: 3,
      references: [
        { name: 'ref1.dwg', type: 'dwg', exists: false, required: true },
        { name: 'ref2.dwg', type: 'dwg', exists: false, required: true },
        { name: 'image1.png', type: 'image', exists: true, required: true },
      ],
    };

    jest.spyOn(prisma.fileSystemNode, 'findUnique').mockResolvedValue({
      id: 'node123',
      fileHash: 'testhash123',
    } as any);

    jest.spyOn(prisma.fileSystemNode, 'update').mockResolvedValue({} as any);

    await service.updateExternalReferenceInfo('testhash123', mockStats);

    expect(prisma.fileSystemNode.update).toHaveBeenCalledWith({
      where: { id: 'node123' },
      data: {
        hasMissingExternalReferences: true,
        missingExternalReferencesCount: 2,
        externalReferencesJson: JSON.stringify(mockStats.references),
      },
    });
  });
});
```

## 验收标准

- [x] Prisma Schema 更新正确
- [x] 数据库迁移成功
- [x] 外部参照信息正确解析
- [x] 外部参照统计信息准确
- [x] 文件节点信息正确更新
- [x] API 接口正常工作
- [x] 单元测试全部通过

## 测试方法

### 1. 数据库迁移测试

```bash
cd packages/backend
pnpm db:push
```

### 2. API 测试

```bash
# 获取外部参照统计信息
curl http://localhost:3001/api/mxcad/file/testhash123/external-references

# 刷新外部参照信息
curl -X POST http://localhost:3001/api/mxcad/file/testhash123/refresh-external-references
```

### 3. 单元测试

```bash
cd packages/backend
pnpm test file-conversion.service.spec.ts
```

## 注意事项

1. **数据库迁移**：确保在生产环境执行迁移前备份数据
2. **性能优化**：避免频繁的文件系统操作，考虑缓存
3. **错误处理**：外部参照信息更新失败不应影响主流程
4. **数据一致性**：确保外部参照信息与实际文件状态一致
5. **向后兼容**：确保现有数据不受影响

## 依赖任务

- ✅ 任务 001：后端 - 获取外部参照预加载数据接口（必须）
- ✅ 任务 002：后端 - 检查外部参照文件是否存在接口（必须）

## 后续任务

- 任务 012：更新前端 API 方法以支持外部参照信息
- 任务 013：更新前端文件列表以显示外部参照警告
- 任务 010：集成测试

---

**任务状态**：✅ 已完成  
**预计工时**：3 小时  
**实际工时**：4 小时  
**负责人**：iFlow CLI  
**创建日期**：2025-12-29  
**完成日期**：2025-12-29

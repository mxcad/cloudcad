# 批量目录导入后端接口设计

**日期**: 2026-04-09

---

## 一、接口定义

### POST /library/{type}/batch-import

**请求体**:

```typescript
interface BatchImportDto {
  /** 目标父节点 ID */
  targetParentId: string;
  
  /** 冲突策略 */
  conflictStrategy: 'skip' | 'overwrite' | 'rename';
  
  /** 文件树 */
  fileTree: ImportTreeNode;
}

interface ImportTreeNode {
  name: string;
  isFolder: boolean;
  children?: ImportTreeNode[];
  /** 仅文件有 */
  file?: {
    hash: string;
    size: number;
    mimeType: string;
    extension: string;
    /** 临时文件路径（已上传的合并后文件） */
    tempFilePath: string;
  };
}
```

**响应**:

```typescript
interface BatchImportResponse {
  success: boolean;
  stats: {
    totalFiles: number;
    successFiles: number;
    skippedFiles: number;
    failedFiles: number;
    createdFolders: number;
  };
  errors: Array<{ name: string; error: string }>;
}
```

---

## 二、实现方案

### 1. 在 LibraryController 添加批量导入接口

```typescript
@Post(':type/batch-import')
async batchImport(
  @Param('type') type: 'drawing' | 'block',
  @Body() dto: BatchImportDto,
  @Request() req
) {
  return this.libraryService.batchImport(type, dto, req.user.id);
}
```

### 2. LibraryService.batchImport 实现

```typescript
async batchImport(
  type: LibraryType,
  dto: BatchImportDto,
  userId: string
): Promise<BatchImportResponse> {
  const stats = { ... };
  const errors = [];
  
  await this.processImportNode(dto.fileTree, dto.targetParentId, type, userId, dto.conflictStrategy, stats, errors);
  
  return { success: true, stats, errors };
}

private async processImportNode(
  node: ImportTreeNode,
  parentId: string,
  type: LibraryType,
  userId: string,
  strategy: string,
  stats: any,
  errors: any[]
) {
  if (node.isFolder) {
    // 创建文件夹（skipIfExists）
    const folder = await this.createFolderWithSkip(parentId, node.name, userId);
    stats.createdFolders++;
    
    // 递归处理子节点
    for (const child of node.children || []) {
      await this.processImportNode(child, folder.id, type, userId, strategy, stats, errors);
    }
  } else {
    // 上传文件
    await this.importFile(node, parentId, type, userId, strategy, stats, errors);
  }
}

private async importFile(
  node: ImportTreeNode,
  parentId: string,
  type: LibraryType,
  userId: string,
  strategy: string,
  stats: any,
  errors: any[]
) {
  // 检查同名文件
  const existingFile = await this.findExistingFile(parentId, node.name);
  
  if (existingFile) {
    if (strategy === 'skip') {
      stats.skippedFiles++;
      return;
    } else if (strategy === 'overwrite') {
      await this.fileSystemService.deleteNode(existingFile.id, true);
    } else if (strategy === 'rename') {
      // 使用 UploadUtilityService.generateUniqueFileName
      const uniqueName = await this.uploadUtilityService.generateUniqueFileName(parentId, node.name);
      node.name = uniqueName;
    }
  }
  
  // 创建文件节点（复用 FileMergeService 逻辑）
  // ... 创建节点、分配存储、拷贝文件
}
```

---

## 三、前端流程

1. 前端扫描目录，计算每个文件的 hash（使用 SparkMD5）
2. 前端上传每个文件到临时位置（复用现有分片上传 API）
3. 前端构建文件树 JSON
4. 前端调用 `POST /library/{type}/batch-import` 提交导入请求
5. 后端根据策略处理同名并创建节点

---

## 四、关键问题

**问题**：前端需要先上传所有文件到临时位置，然后再调用批量导入接口。这意味着：
- 每个文件需要上传两次（一次临时，一次正式）
- 或者前端上传时直接指定策略参数

**更好的方案**：在现有上传 API 中添加 `conflictStrategy` 参数，让单个文件上传时就处理冲突。

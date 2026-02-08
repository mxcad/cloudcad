# 存储管理（Storage）

**文件位置**：`packages/backend/src/common/services/storage*.ts`, `packages/backend/src/storage/`

## 概述

统一的存储资源管理系统，基于文件系统存储，支持智能目录分配、磁盘监控、文件锁和自动清理。

## 核心组件

- **StorageManagerService**: 统一存储资源管理，分配节点存储空间
- **DirectoryAllocatorService**: 智能目录分配，自动创建和管理目录
- **LocalStorageProvider**: 本地存储提供者，处理文件读写操作
- **StorageService**: 存储服务
- **DiskMonitorService**: 磁盘使用监控
- **FileLockService**: 并发文件操作锁
- **FileCopyService**: 高效文件复制
- **StorageCleanupService**: 定期清理过期文件

## 存储目录结构

```
filesData/
├── 202602/              # 2026年2月主目录（最多30万个节点）
│   ├── {nodeId}/        # 节点ID目录
│   │   ├── file.dwg
│   │   ├── file.dwg.mxweb
│   │   └── file.dwg.mxweb_preloading.json
│   └── {nodeId}/
├── 202602_1/            # 子目录（主目录满时自动创建）
├── 202602_2/
└── 202603/              # 2026年3月目录
```

**目录命名规则**：
- 主目录：`YYYYMM`（年月）
- 子目录：`YYYYMM_N`（年月+序号，最多100个）
- 节点目录：`{nodeId}`（CUID格式）

## 存储分配策略

**目录分配流程**：
1. 获取当前年月（YYYYMM）
2. 检查主目录节点数量
3. 如果节点数 < 300,000，分配主目录
4. 如果主目录已满，尝试分配子目录（YYYYMM_1, YYYYMM_2...）
5. 创建节点目录（{nodeId}）
6. 返回存储路径

**存储路径格式**：
- 数据库存储：`YYYYMM[/N]/nodeId/fileName`
- 绝对路径：`{FILES_DATA_PATH}/YYYYMM[/N]/nodeId/fileName`

## 存储接口

```typescript
interface StorageProvider {
  // 基础操作
  uploadFile(key: string, data: Buffer): Promise<UploadResult>;
  downloadFile(key: string): Promise<Buffer>;
  deleteFile(key: string): Promise<void>;
  fileExists(key: string): Promise<boolean>;
  
  // 文件流操作
  getFileStream(key: string): Promise<NodeJS.ReadableStream>;
  
  // 预签名 URL（本地存储不支持）
  getPresignedPutUrl(key: string, expiry?: number): Promise<string>;
  
  // 目录操作
  createDirectory(dirKey: string): Promise<void>;
  deleteDirectory(dirKey: string): Promise<void>;
  directoryExists(dirKey: string): Promise<boolean>;
  getSubdirectoryCount(dirKey: string): Promise<number>;
  
  // 高级操作
  listFiles(prefix: string, startsWith?: string): Promise<string[]>;
  copyFile(sourceKey: string, destKey: string): Promise<boolean>;
}
```

## 存储清理机制

**软删除流程**：
1. 用户删除文件 → 设置 deletedAt 字段
2. 文件标记为软删除 → 设置 deletedFromStorage = null
3. 定期清理任务 → 检查 deletedFromStorage 为 null 且 deletedAt 超过30天的文件
4. 设置 deletedFromStorage = 当前时间
5. 延迟删除 → deletedFromStorage 超过30天后删除物理文件

**清理配置**：
- `STORAGE_CLEANUP_DELAY_DAYS`: 30天（软删除后延迟删除天数）
- `FILES_NODE_LIMIT`: 300,000（单目录最大节点数）
- `DISK_WARNING_THRESHOLD`: 20GB（磁盘警告阈值）
- `DISK_CRITICAL_THRESHOLD`: 10GB（磁盘严重阈值）

## 存储安全验证

**路径安全验证**（LocalStorageProvider）：
- 检查路径遍历攻击（.., ~）
- 检查绝对路径（仅允许 MxCAD-App 访问路径）
- 检查 Windows 路径分隔符（\）
- 检查非法字符（<>:"|?*）
- 检查控制字符
- 限制路径长度（最大1024字符）
- 验证路径在允许的目录内

## 定时任务

- **StorageCleanupScheduler**: 定时清理过期存储文件

## 相关服务

- FileSystemService: 文件系统服务
- ChunkUploadService: 分片上传服务
- NodeCreationService: 节点创建服务
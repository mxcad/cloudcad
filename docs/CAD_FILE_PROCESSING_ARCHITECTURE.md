# CloudCAD CAD 文件处理技术规划文档

> **重要说明**：本文档描述的是 CloudCAD 平台**未来规划**的 CAD 文件处理高级功能，不是当前的实现状态。当前系统仅实现了基础的文件管理功能。

## 文档定位

本文档是 CloudCAD 平台的技术规划蓝图，描述了从当前简单文件管理系统演进为完整 CAD 文件处理平台的技术路线图。内容包括：

- ✅ **当前实现状态**：基于 FileSystemNode 的统一文件管理
- 📋 **未来技术规划**：MXWeb 转换、高级存储、性能优化
- 🚧 **实施路线图**：分阶段开发计划和优先级

## 当前实现状态

CloudCAD 当前已实现基础文件管理系统：

- **统一文件模型**：基于 `FileSystemNode` 的树形结构
- **基础操作**：文件上传、下载、文件夹管理
- **权限系统**：三层权限控制（用户角色、项目成员、文件访问）
- **存储后端**：本地文件存储
- **API 接口**：RESTful API，路径为 `/file-system/*`

## 未来技术规划

为支持专业的 CAD 文件处理，规划实现以下高级功能：

1. **格式转换系统**：DWG/DXF → MXWeb 格式转换
2. **高级存储功能**：文件去重、分片上传、断点续传
3. **预览生成**：缩略图、Web 预览、性能优化
4. **智能缓存**：多级缓存策略，提升响应速度
5. **多存储后端**：支持本地文件系统、AWS S3、阿里云 OSS 等

## 实施原则

- **渐进增强**：在现有基础上逐步扩展，不破坏现有功能
- **模块化设计**：各功能模块独立开发，便于测试和维护
- **性能优先**：确保大文件处理和高并发场景的性能表现
- **可扩展性**：为未来功能扩展预留接口和架构空间

---

## 1. 当前实现详细说明

### 1.1 FileSystemNode 统一模型

CloudCAD 采用统一的树形文件系统模型，所有项目、文件夹、文件都使用同一个 `FileSystemNode` 表：

```typescript
// 核心模型特点
model FileSystemNode {
  id          String   @id @default(cuid())
  name        String
  isFolder    Boolean  @default(false)  // true=文件夹, false=文件
  isRoot      Boolean  @default(false)  // true=项目根目录

  // 树形结构（自引用）
  parentId    String?
  parent      FileSystemNode?  @relation("NodeHierarchy", fields: [parentId])
  children    FileSystemNode[] @relation("NodeHierarchy")

  // 文件专属字段
  originalName String?   // 原始文件名
  path         String?   // MinIO存储路径
  size         Int?      // 文件大小
  mimeType     String?   // MIME类型
  extension    String?   // 文件扩展名
  fileStatus   FileStatus? // 文件状态

  // 权限与审计
  ownerId     String
  owner       User     @relation("NodeOwner", fields: [ownerId])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### 1.2 当前 API 接口

基于 `/file-system/*` 路径的 RESTful API：

```typescript
// 项目管理
POST   /file-system/projects          // 创建项目
GET    /file-system/projects          // 获取项目列表
GET    /file-system/projects/:id      // 获取项目详情
PATCH  /file-system/projects/:id      // 更新项目
DELETE /file-system/projects/:id      // 删除项目

// 节点管理
POST   /file-system/nodes/:id/folders // 创建文件夹
GET    /file-system/nodes/:id         // 获取节点详情
GET    /file-system/nodes/:id/children // 获取子节点
PATCH  /file-system/nodes/:id         // 更新节点
DELETE /file-system/nodes/:id         // 删除节点
POST   /file-system/nodes/:id/move    // 移动节点

// 文件操作
POST   /file-system/files/upload      // 文件上传
GET    /file-system/storage           // 存储空间信息
```

### 1.3 三层权限系统

1. **用户角色**：ADMIN, USER
2. **项目成员**：OWNER, ADMIN, MEMBER, VIEWER
3. **文件访问**：OWNER, EDITOR, VIEWER

### 1.4 当前限制

- 仅支持 base64 编码的小文件上传
- 无格式转换功能
- 无预览生成
- 无文件去重机制
- 存储仅支持本地文件系统

---

## 2. 未来技术规划

### 2.1 格式转换系统 📋

#### 目标

支持 DWG/DXF 文件转换为 MXWeb 格式，实现 Web 端 CAD 图纸渲染。

#### 技术方案

```typescript
// 转换服务架构
@Injectable()
export class CADConverterService {
  async convertToMXWeb(inputBuffer: Buffer): Promise<Buffer> {
    // 1. 写入临时文件
    // 2. 调用转换程序
    // 3. 读取转换结果
    // 4. 清理临时文件
  }
}
```

#### 实施要点

- 独立的转换服务容器
- 支持批量转换
- 转换进度跟踪
- 错误处理和重试机制

### 2.2 高级存储功能 📋

#### 文件去重机制

```typescript
// 基于 SHA-256 的文件去重
async checkDuplicate(fileHash: string): Promise<FileMetadata | null> {
  return await this.prisma.fileSystemNode.findFirst({
    where: { fileHash, status: 'COMPLETED' }
  });
}
```

#### 分片上传和断点续传

```typescript
// 分片上传流程
1. 初始化分片上传 → 返回 uploadId
2. 上传分片 → 并发上传，支持断点续传
3. 完成上传 → 合并分片，校验完整性
```

#### 多存储后端支持

- 本地文件系统（默认）
- AWS S3
- 阿里云 OSS

### 2.3 预览生成系统 📋

#### 缩略图生成

```typescript
async generateThumbnail(fileBuffer: Buffer): Promise<Buffer> {
  // 1. 转换为 MXWeb 格式
  // 2. 生成预览图
  // 3. 压缩优化
  // 4. 返回缩略图
}
```

#### Web 预览

- 支持 MXWeb 格式的在线预览
- 缩放、平移、图层控制
- 标注和测量工具

### 2.4 智能缓存系统 📋

#### 多级缓存策略

```
浏览器缓存 → CDN 缓存 → Redis 缓存 → 文件系统
```

#### 缓存失效机制

- 文件更新时自动清理相关缓存
- 基于 TTL 的自动过期
- 手动缓存清理接口

---

## 3. 实施路线图

### 3.1 优先级排序

#### P0 - 核心功能（立即实施）

1. **文件去重机制** - 减少存储空间，提升上传速度
2. **基础格式转换** - 支持 DWG/DXF 到 MXWeb 转换
3. **缩略图生成** - 提升用户体验

#### P1 - 重要功能（3个月内）

1. **分片上传** - 支持大文件上传
2. **预览系统** - Web 端 CAD 图纸预览
3. **缓存优化** - 提升系统性能

#### P2 - 扩展功能（6个月内）

1. **多存储后端** - 支持云存储服务
2. **高级预览** - 标注、测量等交互功能
3. **批量处理** - 批量转换和预览生成

### 3.2 分阶段实施计划

#### 第一阶段（1个月）：基础转换

- 搭建转换服务
- 实现 DWG/DXF 到 MXWeb 基础转换
- 添加文件去重机制
- 生成基础缩略图

#### 第二阶段（2个月）：性能优化

- 实现分片上传
- 添加缓存系统
- 优化转换性能
- 完善错误处理

#### 第三阶段（3个月）：功能完善

- 实现 Web 预览
- 支持多存储后端
- 添加批量处理
- 完善监控和日志

---

---

## 4. 技术实现细节

### 4.1 存储抽象层设计

#### 统一存储接口

```typescript
interface StorageProvider {
  // 基础操作
  uploadFile(key: string, data: Buffer): Promise<UploadResult>;
  downloadFile(key: string): Promise<Buffer>;
  deleteFile(key: string): Promise<void>;
  fileExists(key: string): Promise<boolean>;

  // 分片上传
  initiateMultipartUpload(key: string): Promise<string>;
  uploadPart(
    uploadId: string,
    key: string,
    partNumber: number,
    data: Buffer
  ): Promise<string>;
  completeMultipartUpload(
    uploadId: string,
    key: string,
    parts: Part[]
  ): Promise<void>;

  // 预签名 URL
  getPresignedUrl(key: string, expiry?: number): Promise<string>;
}
```

#### 多存储后端实现

```typescript
// 本地存储提供商
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  constructor(private config: LocalStorageConfig) {}
  // 实现本地文件系统特定的存储逻辑
}

// S3 提供商
@Injectable()
export class S3StorageProvider implements StorageProvider {
  constructor(private config: S3Config) {}
  // 实现 AWS S3 特定的存储逻辑
}
```

### 4.2 文件处理管道

#### 上传处理流程

```typescript
async processFileUpload(file: File, options: UploadOptions): Promise<ProcessResult> {
  // 1. 文件验证
  await this.validateFile(file);

  // 2. 计算文件哈希
  const fileHash = await this.calculateHash(file);

  // 3. 检查重复文件
  const existingFile = await this.checkDuplicate(fileHash);
  if (existingFile) {
    return this.createReference(existingFile);
  }

  // 4. 上传到存储
  const storageKey = await this.uploadToStorage(file);

  // 5. 创建数据库记录
  const fileRecord = await this.createFileRecord(storageKey, fileHash);

  // 6. 异步处理（转换、预览等）
  await this.queueAsyncProcessing(fileRecord.id);

  return fileRecord;
}
```

#### 转换处理流程

```typescript
async processFileConversion(fileId: string): Promise<void> {
  try {
    // 1. 获取原始文件
    const originalFile = await this.getOriginalFile(fileId);

    // 2. 转换为 MXWeb
    const mxwebBuffer = await this.converter.convertToMXWeb(originalFile.buffer);

    // 3. 生成缩略图
    const thumbnailBuffer = await this.generateThumbnail(mxwebBuffer);

    // 4. 上传转换结果
    await this.uploadProcessedFiles(fileId, {
      mxweb: mxwebBuffer,
      thumbnail: thumbnailBuffer
    });

    // 5. 更新文件状态
    await this.updateFileStatus(fileId, 'COMPLETED');
  } catch (error) {
    await this.updateFileStatus(fileId, 'FAILED', error.message);
  }
}
```

### 4.3 性能优化策略

#### 缓存策略

```typescript
// Redis 缓存配置
const cacheConfig = {
  // 文件元数据缓存（5分钟）
  fileMetadata: { ttl: 300 },

  // 权限信息缓存（10分钟）
  permissions: { ttl: 600 },

  // 转换结果缓存（1小时）
  conversionResults: { ttl: 3600 },

  // 预签名URL缓存（1分钟）
  presignedUrls: { ttl: 60 },
};
```

#### 队列系统

```typescript
// 使用 Bull Queue 处理异步任务
@Injectable()
export class FileProcessingQueue {
  @Process('convert-file')
  async handleFileConversion(job: Job) {
    const { fileId } = job.data;
    return this.fileService.processFileConversion(fileId);
  }

  @Process('generate-thumbnail')
  async handleThumbnailGeneration(job: Job) {
    const { fileId } = job.data;
    return this.fileService.generateThumbnail(fileId);
  }
}
```

---

## 5. 部署配置

### 5.1 Docker Compose 配置

#### 开发环境

```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  app:
    build: .
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/cloucad
      - REDIS_URL=redis://redis:6379
      - STORAGE_DEFAULT=minio
    volumes:
      - ./config:/app/config
    depends_on:
      - postgres
      - redis
      - minio

  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: cloucad
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  # 转换服务（新增）
  converter:
    build:
      context: ./converter
      dockerfile: Dockerfile
    volumes:
      - ./converter/tools:/app/tools
      - temp_files:/app/temp
    environment:
      - NODE_ENV=production
    depends_on:
      - redis

volumes:
  postgres_data:
  redis_data:
  minio_data:
  temp_files:
```

#### 生产环境

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    image: cloucad:latest
    restart: unless-stopped
    environment:
      - NODE_ENV=production
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3001/health']
      interval: 30s
      timeout: 10s
      retries: 3

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - app
```

### 5.2 环境配置

#### 存储配置

```yaml
# config/storage.yml
storage:
  default: minio
  providers:
    - type: minio
      name: minio
      config:
        endPoint: minio
        port: 9000
        useSSL: false
        accessKey: minioadmin
        secretKey: ${MINIO_PASSWORD}
        bucket: cloucad

    - type: s3
      name: s3
      config:
        region: us-west-2
        credentials:
          accessKeyId: ${AWS_ACCESS_KEY_ID}
          secretAccessKey: ${AWS_SECRET_ACCESS_KEY}
        bucket: cloucad-files
```

#### 转换服务配置

```yaml
# config/converter.yml
converter:
  enabled: true
  timeout: 300000 # 5分钟
  retryAttempts: 3
  supportedFormats:
    - .dwg
    - .dxf
  outputFormat: mxweb
  quality: high
```

---

## 6. 开发指导

### 6.1 扩展现有功能

#### 添加新的存储后端

```typescript
// 1. 实现 StorageProvider 接口
@Injectable()
export class AliyunOSSProvider implements StorageProvider {
  // 实现所有接口方法
}

// 注册到存储工厂
@Module({
  providers: [
    {
      provide: 'STORAGE_PROVIDERS',
      useFactory: () => [
        new LocalStorageProvider(localConfig),
        new S3StorageProvider(s3Config),
        new AliyunOSSProvider(ossConfig), // 新增
      ],
    },
  ],
})
export class StorageModule {}
```

#### 添加新的文件格式支持

```typescript
// 1. 扩展转换器
@Injectable()
export class UniversalConverterService {
  async convert(inputBuffer: Buffer, targetFormat: string): Promise<Buffer> {
    switch (targetFormat) {
      case 'mxweb':
        return this.convertToMXWeb(inputBuffer);
      case 'pdf':
        return this.convertToPDF(inputBuffer);
      case 'svg':
        return this.convertToSVG(inputBuffer);
      default:
        throw new Error(`Unsupported format: ${targetFormat}`);
    }
  }
}
```

### 6.2 测试策略

#### 单元测试

```typescript
describe('FileSystemService', () => {
  let service: FileSystemService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [FileSystemService, MockStorageProvider],
    }).compile();

    service = module.get<FileSystemService>(FileSystemService);
  });

  it('should upload file successfully', async () => {
    const mockFile = createMockFile();
    const result = await service.uploadFile(mockFile, { userId: 'user1' });

    expect(result.id).toBeDefined();
    expect(result.status).toBe('COMPLETED');
  });
});
```

#### 集成测试

```typescript
describe('FileSystemController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/file-system/files/upload (POST)', () => {
    return request(app.getHttpServer())
      .post('/file-system/files/upload')
      .send({
        fileName: 'test.dwg',
        fileContent: 'base64-encoded-content',
        projectId: 'project1',
      })
      .expect(201);
  });
});
```

### 6.3 监控和日志

#### 性能监控

```typescript
// 添加性能指标收集
@Injectable()
export class MetricsService {
  @InjectMetric('file_upload_duration')
  private uploadDuration: Histogram<string>;

  async recordUploadDuration(duration: number, fileType: string) {
    this.uploadDuration.observe({ fileType }, duration);
  }
}
```

#### 结构化日志

```typescript
// 使用 Winston 进行结构化日志
@Injectable()
export class FileLogger {
  private logger = new Logger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
  });

  logFileUpload(fileId: string, userId: string, size: number) {
    this.logger.info('File uploaded', {
      fileId,
      userId,
      size,
      timestamp: new Date().toISOString(),
    });
  }
}
```

---

## 7. 版本控制和维护

### 7.1 文档版本策略

| 文档版本 | 对应系统版本 | 主要变更      | 维护状态  |
| -------- | ------------ | ------------- | --------- |
| v1.0     | v0.1.0       | 初始规划文档  | 📋 规划中 |
| v1.1     | v0.2.0       | 基础转换功能  | 🚧 开发中 |
| v1.2     | v0.3.0       | 分片上传      | 📋 规划中 |
| v2.0     | v1.0.0       | 完整 CAD 处理 | 📋 规划中 |

### 7.2 更新触发条件

- **功能开发完成**：当规划的功能完成开发并测试通过后
- **架构重大调整**：当系统架构发生重大变更时
- **技术栈升级**：当核心技术栈版本升级时
- **用户反馈**：根据用户反馈需要调整规划时

### 7.3 定期回顾机制

- **月度回顾**：检查实施进度，调整优先级
- **季度规划**：评估技术趋势，更新规划内容
- **年度总结**：回顾年度目标，制定下一年计划

---

## 8. 附录

### 8.1 技术选型对比

| 技术领域 | 当前方案 | 规划方案         | 优势           | 劣势       |
| -------- | -------- | ---------------- | -------------- | ---------- |
| 文件存储 | 本地文件系统 | 本地文件系统 + 云存储支持 | 简单、高性能 | 分布式扩展有限 |
| 格式转换 | 无       | 专用转换服务     | 专业、准确     | 成本较高   |
| 缓存系统 | Redis    | Redis + CDN      | 高性能、分布式 | 架构复杂   |
| 队列系统 | 无       | Bull Queue       | 可靠、监控     | 学习成本   |

### 8.2 风险评估

#### 技术风险

- **转换服务稳定性**：依赖外部转换程序，可能存在稳定性问题
- **大文件处理**：内存和存储压力较大，需要优化
- **并发性能**：高并发场景下的性能瓶颈

#### 业务风险

- **用户接受度**：新功能的学习成本
- **迁移成本**：从现有系统迁移的复杂性
- **维护成本**：功能增加带来的维护负担

### 8.3 参考资料

- [NestJS 文档](https://docs.nestjs.com/)
- [NestJS 文档](https://docs.nestjs.com/)
- [Prisma 文档](https://www.prisma.io/docs/)
- [MXWeb 技术规范](https://www.mxweb.com/docs)

---

_本文档最后更新：2025-12-16_  
_维护团队：CloudCAD 开发团队_  
_联系方式：dev@cloucad.com_
const storage = this.getStorage(options.provider);

    const uploadId = await storage.initiateMultipartUpload(storageKey);

    // 创建上传会话记录
    const session = await this.prisma.uploadSession.create({
      data: {
        uploadId,
        storageKey,
        fileName,
        fileSize,
        projectId: options.projectId,
        ownerId: options.userId,
        status: 'INITIATED',
      },
    });

    return {
      uploadId,
      storageKey,
      sessionId: session.id,
      chunkSize: this.config.get('upload.chunkSize'),
      totalChunks: Math.ceil(fileSize / this.config.get('upload.chunkSize')),
    };

}
}

````

### 4. Docker Compose 部署配置

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/cloucad
      - REDIS_URL=redis://redis:6379
      - STORAGE_DEFAULT=minio  # 可配置为 s3, oss, local
    volumes:
      - ./config:/app/config
      - ./uploads:/app/uploads  # 本地存储时使用
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: cloucad
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  # MinIO 存储服务（可选）
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: ${MINIO_PASSWORD:-minioadmin}
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"
      - "9001:9001"

  # 转换服务（独立容器）
  converter:
    build:
      context: ./converter
      dockerfile: Dockerfile
    volumes:
      - ./converter/tools:/app/tools
      - temp_files:/app/temp
    environment:
      - NODE_ENV=production
    depends_on:
      - redis

volumes:
  postgres_data:
  redis_data:
  minio_data:
  temp_files:
````

### 5. 环境配置

```yaml
# config/production.yml
storage:
  default: minio
  providers:
    - type: minio
      name: minio
      config:
        endPoint: minio
        port: 9000
        useSSL: false
        accessKey: minioadmin
        secretKey: ${MINIO_PASSWORD}
        bucket: cloucad
        region: us-east-1

    # 可选：AWS S3 配置
    - type: s3
      name: s3
      config:
        region: us-west-2
        credentials:
          accessKeyId: ${AWS_ACCESS_KEY_ID}
          secretAccessKey: ${AWS_SECRET_ACCESS_KEY}
        bucket: cloucad-files

upload:
  maxFileSize: 2147483648 # 2GB
  allowedTypes:
    - .dwg
    - .dxf
    - .pdf
    - .png
    - .jpg
    - .jpeg
  chunkSize: 5242880 # 5MB

features:
  fileDeduplication: true
  multipartUpload: true
  previewGeneration: true
  virusScan: false # 可选功能
```

## 前端技术选型

### 推荐方案：直接调用 API + 轻量级工具库

### 核心依赖包

```json
{
  "dependencies": {
    // 基础 HTTP 请求
    "axios": "^1.6.0",

    // 文件上传相关
    "react-dropzone": "^14.2.0", // 拖拽上传
    "file-saver": "^2.0.5", // 文件下载

    // 文件处理
    "crypto-js": "^4.2.0", // 文件哈希计算
    "file-type": "^18.0.0", // 文件类型检测

    // UI 组件（已有）
    "lucide-react": "^0.300.0", // 图标

    // 状态管理
    "@tanstack/react-query": "^5.0.0", // 数据获取和缓存
    "zustand": "^4.4.0" // 轻量级状态管理
  }
}
```

### 1. 文件上传实现（纯 API 调用）

```typescript
// services/fileUploadService.ts
export class FileUploadService {
  private api = axios.create({
    baseURL: '/api/files',
    timeout: 300000, // 5分钟超时
  });

  // 小文件直接上传
  async uploadSmallFile(file: File, projectId: string) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('projectId', projectId);

    const response = await this.api.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        const progress = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total!
        );
        this.onProgress?.(progress);
      },
    });

    return response.data;
  }

  // 大文件分片上传
  async uploadLargeFile(file: File, projectId: string) {
    // 1. 初始化分片上传
    const initResponse = await this.api.post('/multipart/init', {
      fileName: file.name,
      fileSize: file.size,
      projectId,
    });
    const { uploadId, fileKey } = initResponse.data;

    // 2. 分片上传
    const chunkSize = 5 * 1024 * 1024; // 5MB
    const totalChunks = Math.ceil(file.size / chunkSize);
    const parts = [];

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);

      const partResponse = await this.api.post('/multipart/upload', {
        uploadId,
        fileKey,
        chunkIndex: i,
        chunkData: chunk,
      });

      parts.push(partResponse.data);
      this.onProgress?.(Math.round(((i + 1) / totalChunks) * 100));
    }

    // 3. 完成上传
    const completeResponse = await this.api.post('/multipart/complete', {
      uploadId,
      fileKey,
      parts,
    });

    return completeResponse.data;
  }

  // 文件去重检查
  async checkFileHash(file: File): Promise<string | null> {
    const hash = await this.calculateFileHash(file);
    try {
      const response = await this.api.get(`/check/${hash}`);
      if (response.data.exists) {
        return hash; // 文件已存在，可以秒传
      }
      return null;
    } catch {
      return null;
    }
  }

  // 秒传文件
  async instantUpload(fileHash: string, fileName: string, projectId: string) {
    const response = await this.api.post('/instant', {
      fileHash,
      fileName,
      projectId,
    });
    return response.data;
  }

  // 计算文件哈希
  private async calculateFileHash(file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const buffer = e.target?.result as ArrayBuffer;
        const wordArray = CryptoJS.lib.WordArray.create(buffer);
        const hash = CryptoJS.SHA256(wordArray).toString();
        resolve(hash);
      };
      reader.readAsArrayBuffer(file);
    });
  }

  onProgress?: (progress: number) => void;
}
```

### 2. 拖拽上传组件（使用 react-dropzone）

```typescript
// components/FileUploader.tsx
import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X } from 'lucide-react';
import { FileUploadService } from '../services/fileUploadService';

interface FileUploaderProps {
  projectId: string;
  onUploadComplete?: (file: any) => void;
}

export const FileUploader: React.FC<FileUploaderProps> = ({
  projectId,
  onUploadComplete,
}) => {
  const [uploading, setUploading] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [files, setFiles] = React.useState<File[]>([]);

  const uploadService = new FileUploadService();
  uploadService.onProgress = setProgress;

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setFiles(acceptedFiles);
    setUploading(true);
    setProgress(0);

    try {
      for (const file of acceptedFiles) {
        // 检查文件去重
        const existingHash = await uploadService.checkFileHash(file);

        if (existingHash) {
          // 秒传
          const result = await uploadService.instantUpload(
            existingHash,
            file.name,
            projectId
          );
          onUploadComplete?.(result);
        } else {
          // 正常上传
          const result =
            file.size < 10 * 1024 * 1024
              ? await uploadService.uploadSmallFile(file, projectId)
              : await uploadService.uploadLargeFile(file, projectId);

          onUploadComplete?.(result);
        }
      }
    } catch (error) {
      console.error('上传失败:', error);
    } finally {
      setUploading(false);
      setFiles([]);
      setProgress(0);
    }
  }, [projectId, onUploadComplete]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/acad': ['.dwg'],
      'application/dxf': ['.dxf'],
    },
    multiple: true,
  });

  return (
    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
      <div
        {...getRootProps()}
        className={`text-center cursor-pointer ${
          isDragActive ? 'bg-blue-50' : ''
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto h-12 w-12 text-gray-400" />
        <p className="mt-2 text-sm text-gray-600">
          {isDragActive
            ? '释放文件到此处'
            : '拖拽 CAD 文件到此处，或点击选择文件'}
        </p>
        <p className="text-xs text-gray-500">支持 .dwg, .dxf 格式</p>
      </div>

      {uploading && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-gray-600">上传中...</span>
            <span className="text-sm text-gray-600">{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          {files.map((file, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-2 bg-gray-50 rounded"
            >
              <div className="flex items-center">
                <File className="h-4 w-4 text-gray-500 mr-2" />
                <span className="text-sm text-gray-700">{file.name}</span>
                <span className="text-xs text-gray-500 ml-2">
                  ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
```

### 3. CAD 查看器集成

```typescript
// components/CADViewer.tsx
import React, { useEffect, useRef } from 'react';
import { saveAs } from 'file-saver';

interface CADViewerProps {
  fileId: string;
  fileName: string;
}

export const CADViewer: React.FC<CADViewerProps> = ({ fileId, fileName }) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  useEffect(() => {
    loadCADFile();
  }, [fileId]);

  const loadCADFile = async () => {
    try {
      setLoading(true);
      setError(null);

      // 获取 MXWeb 文件预签名 URL
      const response = await fetch(`/api/files/${fileId}/mxweb`);
      const { url } = await response.json();

      // 初始化 CAD 查看器
      if (viewerRef.current) {
        // 这里集成具体的 CAD 查看器库
        // 例如：@mxcad/viewer 或其他库
        const viewer = new MXWebViewer(viewerRef.current);
        await viewer.load(url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = async () => {
    try {
      const response = await fetch(`/api/files/${fileId}/download`);
      const blob = await response.blob();
      saveAs(blob, fileName);
    } catch (error) {
      console.error('下载失败:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">加载 CAD 文件中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-red-600">{error}</p>
          <button
            onClick={loadCADFile}
            className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg">
      <div className="p-4 border-b flex justify-between items-center">
        <h3 className="font-medium">{fileName}</h3>
        <button
          onClick={downloadFile}
          className="px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200"
        >
          下载
        </button>
      </div>
      <div ref={viewerRef} className="h-96 bg-gray-50" />
    </div>
  );
};
```

### 4. 转换状态监控

```typescript
// hooks/useConversionStatus.ts
import { useState, useEffect } from 'react';

export const useConversionStatus = (fileId: string) => {
  const [status, setStatus] = useState<
    'UPLOADING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  >('UPLOADING');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const pollStatus = async () => {
      try {
        const response = await fetch(`/api/files/${fileId}/status`);
        const data = await response.json();

        setStatus(data.status);
        setProgress(data.progress || 0);
        setError(data.error || null);

        if (data.status === 'COMPLETED' || data.status === 'FAILED') {
          return;
        }

        // 继续轮询
        setTimeout(pollStatus, 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : '获取状态失败');
      }
    };

    pollStatus();
  }, [fileId]);

  return { status, progress, error };
};
```

### 5. 为什么不使用重型库？

| 功能需求 | 推荐方案             | 避免的重型库        |
| -------- | -------------------- | ------------------- |
| 文件上传 | axios + FormData     | uppy, react-uploady |
| 拖拽上传 | react-dropzone       | 自实现或重型组件    |
| 文件处理 | crypto-js, file-type | 大型文件处理库      |
| 进度显示 | 原生实现             | 复杂进度条库        |
| CAD 查看 | 专用查看器           | 通用查看器          |

### 优势

1. **轻量级**：最小依赖，加载快
2. **可控性强**：完全自定义业务逻辑
3. **维护性好**：代码简单，易于调试
4. **性能优**：直接 API 调用，无额外封装
5. **成本低**：减少第三方依赖风险

### 总结

对于企业级 CAD 应用，**推荐直接调用 API + 轻量级工具库**的方案：

- 核心功能自己实现，确保业务逻辑可控
- 只在必要处使用成熟的轻量级库
- 避免过度依赖重型框架，保持系统简洁高效

## MinIO 配置优化

### 1. 存储服务扩展（基于 MinIO 原生能力）

```typescript
@Injectable()
export class StorageService {
  // === MinIO 原生分片上传支持 ===

  // 初始化分片上传
  async initiateMultipartUpload(key: string): Promise<string> {
    return this.client.initiateNewMultipartUpload(this.bucket, key);
  }

  // 上传分片
  async uploadPart(
    uploadId: string,
    key: string,
    partNumber: number,
    data: Buffer
  ): Promise<string> {
    return this.client
      .uploadPart(this.bucket, key, uploadId, partNumber, data)
      .then((result) => result.etag);
  }

  // 完成分片上传
  async completeMultipartUpload(
    uploadId: string,
    key: string,
    parts: Array<{ partNumber: number; etag: string }>
  ) {
    return this.client.completeMultipartUpload(
      this.bucket,
      key,
      uploadId,
      parts
    );
  }

  // 中止分片上传
  async abortMultipartUpload(uploadId: string, key: string) {
    return this.client.abortMultipartUpload(this.bucket, key, uploadId);
  }

  // 列出已上传的分片
  async listParts(uploadId: string, key: string) {
    return this.client.listParts(this.bucket, key, uploadId);
  }

  // === MinIO 原生预签名 URL 支持 ===

  // 获取预签名下载 URL
  async getPresignedUrl(key: string, expiry = 3600): Promise<string> {
    return this.client.presignedGetObject(this.bucket, key, expiry);
  }

  // 获取预签名上传 URL（用于直传）
  async getPresignedPutUrl(key: string, expiry = 3600): Promise<string> {
    return this.client.presignedPutObject(this.bucket, key, expiry);
  }

  // === MinIO 对象锁定和版本控制（企业级功能） ===

  // 设置对象锁定（WORM - Write Once Read Many）
  async setObjectLock(
    key: string,
    mode: 'GOVERNANCE' | 'COMPLIANCE',
    retainUntilDate: Date
  ) {
    return this.client.putObjectLock(this.bucket, key, mode, retainUntilDate);
  }

  // 启用版本控制
  async enableVersioning() {
    return this.client.setBucketVersioning(this.bucket, {
      Status: 'Enabled',
    });
  }

  // 获取对象版本列表
  async listObjectVersions(key: string) {
    return this.client.listObjectVersions(this.bucket, key);
  }

  // === MinIO 生命周期管理 ===

  // 设置生命周期规则（自动转换存储类别）
  async setLifecycleRules() {
    const rules = [
      {
        ID: 'CAD-Original-Files',
        Status: 'Enabled',
        Filter: { Prefix: 'original/' },
        Transitions: [
          { Days: 30, StorageClass: 'STANDARD_IA' }, // 30天后转为低频访问
          { Days: 90, StorageClass: 'GLACIER' }, // 90天后转为归档存储
          { Days: 365, StorageClass: 'DEEP_ARCHIVE' }, // 1年后转为深度归档
        ],
      },
      {
        ID: 'MXWeb-Files',
        Status: 'Enabled',
        Filter: { Prefix: 'mxweb/' },
        Transitions: [
          { Days: 60, StorageClass: 'STANDARD_IA' }, // MXWeb文件60天后转低频访问
        ],
      },
      {
        ID: 'Temp-Files',
        Status: 'Enabled',
        Filter: { Prefix: 'temp/' },
        Expiration: { Days: 1 }, // 临时文件1天后自动删除
      },
    ];

    return this.client.setBucketLifecycle(this.bucket, rules);
  }

  // === MinIO 服务器端加密 ===

  // 启用服务器端加密
  async enableServerSideEncryption() {
    return this.client.setBucketEncryption(this.bucket, {
      Rules: [
        {
          ApplyServerSideEncryptionByDefault: {
            SSEAlgorithm: 'AES256',
          },
        },
      ],
    });
  }

  // === MinIO 复制和同步 ===

  // 跨区域复制
  async enableCrossRegionReplication(destinationBucket: string) {
    return this.client.setBucketReplication(this.bucket, {
      Role: 'arn:aws:iam::account-id:role/CrossRegionReplicationRole',
      Rules: [
        {
          ID: 'CAD-Files-Replication',
          Status: 'Enabled',
          Prefix: 'original/',
          Destination: {
            Bucket: destinationBucket,
            StorageClass: 'STANDARD',
          },
        },
      ],
    });
  }

  // === 基础功能扩展 ===

  // 批量删除文件
  async deleteCADFiles(fileId: string) {
    const keysToDelete = [
      `original/.../${fileId}.dwg`,
      `mxweb/${fileId}.mxweb`,
      `thumbnails/${fileId}.png`,
    ];

    await this.deleteFiles(keysToDelete);
  }

  // 获取文件统计信息
  async getStorageStats(userId: string) {
    const userFiles = await this.listFiles(`user-${userId}/`);

    let totalSize = 0;
    let originalSize = 0;
    let mxwebSize = 0;

    for (const file of userFiles) {
      totalSize += file.size || 0;

      if (file.name?.includes('/original/')) {
        originalSize += file.size || 0;
      } else if (file.name?.includes('/mxweb/')) {
        mxwebSize += file.size || 0;
      }
    }

    return {
      totalSize,
      originalSize,
      mxwebSize,
      compressionRatio:
        originalSize > 0 ? (1 - mxwebSize / originalSize) * 100 : 0,
    };
  }

  // 对象标签管理（用于分类和搜索）
  async setObjectTags(key: string, tags: Record<string, string>) {
    const tagging = Object.entries(tags)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    return this.client.setObjectTagging(this.bucket, key, tagging);
  }

  async getObjectTags(key: string) {
    return this.client.getObjectTagging(this.bucket, key);
  }
}
```

## 安全考虑

### 1. 文件验证

- 文件类型白名单验证
- 文件大小限制
- 病毒扫描（可选）

### 2. 访问控制

- JWT 认证
- 文件级权限控制
- 预签名 URL 时效性

### 3. 转换安全

- 转换程序隔离
- 资源限制
- 错误处理和日志

## 性能优化

### 1. 存储策略

- 原始文件：冷存储，低成本
- MXWeb 文件：热存储，高性能
- 缩略图：CDN 缓存

### 2. 转换优化

- 异步处理队列
- 并发限制
- 缓存转换结果

### 3. 访问优化

- 预签名 URL 缓存
- CDN 分发
- 压缩传输

## 监控和日志

### 1. 转换监控

- 转换成功率
- 转换时间统计
- 错误率监控

### 2. 存储监控

- 存储使用量
- 访问频率
- 性能指标

## 部署配置

### 1. 环境变量

```env
# CAD 转换配置
CAD_CONVERTER_PATH=/opt/cad-converter/cad-converter
CAD_CONVERTER_TIMEOUT=300000
CAD_CONVERTER_MAX_CONCURRENT=5

# MinIO 配置
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=cloucad
```

### 2. Docker 配置

```yaml
# 转换工具容器
cad-converter:
  image: cloucad/converter:latest
  volumes:
    - ./tools:/opt/cad-converter
    - /tmp:/tmp
```

## 开源项目实施计划

### 阶段一：核心文件管理（2-3周）

- [ ] 存储抽象层设计和实现
- [ ] MinIO 存储提供商实现
- [ ] 基础文件上传（单文件和分片）
- [ ] 文件去重和引用机制
- [ ] 数据库模型实现

### 阶段二：高级功能（2-3周）

- [ ] 多存储后端支持（S3、OSS、本地）
- [ ] 文件夹层级管理
- [ ] 权限控制系统
- [ ] 文件预览和缩略图
- [ ] 搜索和过滤功能

### 阶段三：前端界面（2周）

- [ ] 文件上传组件（拖拽、进度、断点续传）
- [ ] 文件管理界面（列表、网格、文件夹）
- [ ] 权限管理界面
- [ ] 项目设置和配置

### 阶段四：开源准备（1-2周）

- [ ] Docker Compose 部署配置
- [ ] 环境变量和配置文档
- [ ] API 文档生成
- [ ] 部署指南和用户手册
- [ ] 开发者文档和扩展指南

### 阶段五：企业级功能（可选）

- [ ] 监控和日志系统
- [ ] 性能指标收集
- [ ] 病毒扫描集成
- [ ] 数据备份和恢复
- [ ] 多租户支持

## 开源项目特点

### 1. 部署简单

```bash
# 一键启动
git clone https://github.com/your-org/cloucad-file-manager
cd cloucad-file-manager
cp .env.example .env
docker-compose up -d
```

### 2. 配置灵活

- 支持 MinIO、AWS S3、阿里云 OSS、腾讯云 COS 等
- 可配置文件大小限制、类型限制
- 可选功能模块（病毒扫描、预览生成等）

### 3. 扩展性强

- 插件化存储提供商
- 可自定义文件处理流程
- 支持二次开发和定制

### 4. 文档完善

- 详细的部署文档
- API 接口文档
- 开发者指南
- 最佳实践建议

## 技术栈总结

### 后端

- **框架**: NestJS + TypeScript
- **数据库**: PostgreSQL + Prisma ORM
- **缓存**: Redis
- **存储**: MinIO（默认）+ 多云存储支持
- **队列**: Bull Queue（Redis）

### 前端

- **框架**: React + TypeScript
- **状态管理**: Zustand + React Query
- **UI组件**: 自定义组件 + Lucide Icons
- **文件处理**: react-dropzone + crypto-js

### 部署

- **容器化**: Docker + Docker Compose
- **反向代理**: Nginx（可选）
- **监控**: Prometheus + Grafana（可选）

## 面向场景

### 1. CAD 文件管理

- 支持 DWG、DXF 等格式
- 大文件上传和断点续传
- 文件版本管理和历史记录

### 2. 企业文档管理

- 项目级权限控制
- 文件夹层级管理
- 审计日志和合规性

### 3. 云盘系统

- 多租户支持
- 存储配额管理
- 文件分享和协作

### 4. 开发基础组件

- 可作为其他项目的文件管理模块
- 提供标准的文件管理 API
- 支持自定义扩展和集成

## MinIO 原生能力总结

### ✅ MinIO 已提供的能力

1. **分片上传**：
   - `initiateNewMultipartUpload()` - 初始化分片上传
   - `uploadPart()` - 上传单个分片
   - `completeMultipartUpload()` - 完成分片上传
   - `abortMultipartUpload()` - 中止分片上传
   - `listParts()` - 列出已上传分片

2. **预签名 URL**：
   - `presignedGetObject()` - 下载预签名 URL
   - `presignedPutObject()` - 上传预签名 URL
   - 支持直传，避免流量经过后端

3. **对象锁定（WORM）**：
   - `putObjectLock()` - 写一次读多次保护
   - 合规性锁定（不可删除）
   - 治理锁定（可管理员删除）

4. **版本控制**：
   - `setBucketVersioning()` - 启用版本控制
   - `listObjectVersions()` - 获取版本列表
   - 自动保存文件历史版本

5. **生命周期管理**：
   - 自动转换存储类别（标准 → 低频 → 归档）
   - 自动删除过期文件
   - 基于规则的存储优化

6. **服务器端加密**：
   - AES-256 加密
   - 自动加密，无需客户端处理

7. **对象标签**：
   - 文件分类和搜索
   - 自定义元数据管理

8. **跨区域复制**：
   - 自动同步到异地存储
   - 灾难恢复支持

### ❌ 需要自己实现的功能

1. **文件去重**：
   - 基于 SHA-256 哈希的去重
   - 引用文件机制（秒传）
   - 数据库哈希索引

2. **转换缓存**：
   - Redis 缓存转换结果
   - 避免重复转换
   - 转换状态管理

3. **业务逻辑**：
   - CAD 格式转换
   - 缩略图生成
   - 权限控制
   - 审计日志

## API 接口设计

### 1. 文件管理接口（统一路径）

```typescript
@Controller('files')
@ApiTags('文件管理')
export class FileController {
  constructor(
    private fileService: FileManagementService,
    private permissionService: FilePermissionService
  ) {}

  // 单文件上传
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: '上传文件' })
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDto,
    @Request() req
  ) {
    return this.fileService.uploadFile(file, {
      userId: req.user.id,
      projectId: dto.projectId,
      folderId: dto.folderId,
    });
  }

  // 初始化分片上传
  @Post('multipart/init')
  @ApiOperation({ summary: '初始化分片上传' })
  async initiateMultipartUpload(
    @Body() dto: InitiateMultipartDto,
    @Request() req
  ) {
    return this.fileService.initiateMultipartUpload({
      fileName: dto.fileName,
      fileSize: dto.fileSize,
      userId: req.user.id,
      projectId: dto.projectId,
      folderId: dto.folderId,
    });
  }

  // 上传分片
  @Post('multipart/chunk')
  @ApiOperation({ summary: '上传分片' })
  async uploadChunk(@Body() dto: UploadChunkDto) {
    return this.fileService.uploadChunk(
      dto.uploadId,
      dto.chunkIndex,
      dto.chunkData
    );
  }

  // 完成分片上传
  @Post('multipart/complete')
  @ApiOperation({ summary: '完成分片上传' })
  async completeMultipartUpload(@Body() dto: CompleteMultipartDto) {
    return this.fileService.completeMultipartUpload(dto.uploadId, dto.parts);
  }

  // 获取上传进度
  @Get('multipart/progress/:uploadId')
  @ApiOperation({ summary: '获取上传进度' })
  async getUploadProgress(@Param('uploadId') uploadId: string) {
    return this.fileService.getUploadProgress(uploadId);
  }

  // 文件下载
  @Get(':id/download')
  @ApiOperation({ summary: '下载文件' })
  async downloadFile(@Param('id') id: string, @Request() req) {
    return this.fileService.downloadFile(id, req.user.id);
  }

  // 获取文件信息
  @Get(':id')
  @ApiOperation({ summary: '获取文件信息' })
  async getFile(@Param('id') id: string, @Request() req) {
    const file = await this.fileService.getFile(id, req.user.id);
    return file;
  }

  // 删除文件
  @Delete(':id')
  @ApiOperation({ summary: '删除文件' })
  async deleteFile(@Param('id') id: string, @Request() req) {
    return this.fileService.deleteFile(id, req.user.id);
  }

  // 文件列表
  @Get()
  @ApiOperation({ summary: '获取文件列表' })
  async listFiles(@Query() query: ListFilesDto, @Request() req) {
    return this.fileService.listFiles({
      userId: req.user.id,
      projectId: query.projectId,
      folderId: query.folderId,
      search: query.search,
      page: query.page,
      limit: query.limit,
    });
  }
}
```

### 2. DTO 定义

```typescript
// 上传相关 DTO
export class UploadDto {
  @ApiProperty()
  projectId: string;

  @ApiProperty()
  folderId?: string;
}

export class InitiateMultipartDto {
  @ApiProperty()
  fileName: string;

  @ApiProperty()
  fileSize: number;

  @ApiProperty()
  projectId: string;

  @ApiProperty()
  folderId?: string;
}

export class UploadChunkDto {
  @ApiProperty()
  uploadId: string;

  @ApiProperty()
  chunkIndex: number;

  @ApiProperty()
  chunkData: Buffer;
}

export class CompleteMultipartDto {
  @ApiProperty()
  uploadId: string;

  @ApiProperty({ type: [PartDto] })
  parts: PartDto[];
}

export class PartDto {
  @ApiProperty()
  partNumber: number;

  @ApiProperty()
  etag: string;
}
```

## 前端集成优化

### 1. 文件上传 Hook

```typescript
// hooks/useFileUpload.ts
export const useFileUpload = (projectId: string) => {
  const [uploadState, setUploadState] = useState<{
    uploading: boolean;
    progress: number;
    error: string | null;
  }>({
    uploading: false,
    progress: 0,
    error: null,
  });

  const uploadFile = useCallback(
    async (file: File) => {
      setUploadState({ uploading: true, progress: 0, error: null });

      try {
        const fileHash = await calculateFileHash(file);

        // 检查重复文件
        const existingFile = await checkFileExists(fileHash);
        if (existingFile) {
          await instantUpload(fileHash, file.name, projectId);
          return;
        }

        // 根据文件大小选择上传方式
        if (file.size < 50 * 1024 * 1024) {
          await uploadSmallFile(file, projectId, (progress) => {
            setUploadState((prev) => ({ ...prev, progress }));
          });
        } else {
          await uploadLargeFile(file, projectId, (progress) => {
            setUploadState((prev) => ({ ...prev, progress }));
          });
        }
      } catch (error) {
        setUploadState((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : '上传失败',
        }));
      } finally {
        setUploadState((prev) => ({ ...prev, uploading: false }));
      }
    },
    [projectId]
  );

  return { uploadFile, ...uploadState };
};
```

### 2. 文件管理组件

```typescript
// components/FileManager.tsx
export const FileManager: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { files, loading, error, refetch } = useFiles(projectId);
  const { uploadFile, uploading, progress } = useFileUpload(projectId);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  const handleDrop = useCallback(async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      await uploadFile(file);
    }
    refetch();
  }, [uploadFile, refetch]);

  return (
    <div className="file-manager">
      <Dropzone onDrop={handleDrop} accept={['.dwg', '.dxf']}>
        {({ getRootProps, getInputProps, isDragActive }) => (
          <div
            {...getRootProps()}
            className={`dropzone ${isDragActive ? 'active' : ''}`}
          >
            <input {...getInputProps()} />
            {uploading ? (
              <div className="upload-progress">
                <div>上传中... {progress}%</div>
                <div className="progress-bar">
                  <div style={{ width: `${progress}%` }} />
                </div>
              </div>
            ) : (
              <div>
                拖拽文件到此处或点击选择
              </div>
            )}
          </div>
        )}
      </Dropzone>

      <FileList
        files={files}
        loading={loading}
        error={error}
        selectedFiles={selectedFiles}
        onSelect={setSelectedFiles}
      />
    </div>
  );
};
```

## 部署配置优化

### 1. 环境变量配置

```bash
# .env.production
# 应用配置
NODE_ENV=production
PORT=3000
API_PREFIX=/api

# 数据库配置
DATABASE_URL=postgresql://user:password@postgres:5432/cloucad

# Redis 配置
REDIS_URL=redis://redis:6379

# 存储配置（默认 MinIO）
STORAGE_TYPE=minio
STORAGE_ENDPOINT=minio
STORAGE_PORT=9000
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
STORAGE_BUCKET=cloucad
STORAGE_USE_SSL=false

# 上传配置
UPLOAD_MAX_SIZE=2147483648  # 2GB
UPLOAD_CHUNK_SIZE=5242880   # 5MB
UPLOAD_CONCURRENT_LIMIT=5
UPLOAD_ALLOWED_TYPES=.dwg,.dxf,.pdf,.png,.jpg,.jpeg

# 功能开关
FILE_DEDUPLICATION=true
MULTIPART_UPLOAD=true
PREVIEW_GENERATION=true
VIRUS_SCAN=false

# 安全配置
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=1h
CORS_ORIGIN=http://localhost:3000
```

### 2. Docker Compose 简化版

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    image: cloucad/file-manager:latest
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - STORAGE_TYPE=${STORAGE_TYPE:-minio}
      - STORAGE_ENDPOINT=${STORAGE_ENDPOINT:-minio}
      - STORAGE_ACCESS_KEY=${STORAGE_ACCESS_KEY:-minioadmin}
      - STORAGE_SECRET_KEY=${STORAGE_SECRET_KEY:-minioadmin}
    ports:
      - '3000:3000'
    volumes:
      - ./uploads:/app/uploads # 本地存储备用
    depends_on:
      - postgres
      - redis
      - minio

  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: cloucad
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-password}
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-minioadmin}
    volumes:
      - minio_data:/data
    ports:
      - '9000:9000'
      - '9001:9001'

volumes:
  postgres_data:
  redis_data:
  minio_data:
```

## 监控和日志

### 1. 文件操作审计

```typescript
@Injectable()
export class FileAuditService {
  constructor(
    private prisma: DatabaseService,
    private logger: Logger
  ) {}

  async logAccess(
    fileId: string,
    userId: string,
    action: string,
    metadata?: any
  ) {
    await this.prisma.auditLog.create({
      data: {
        fileId,
        userId,
        action,
        ip: metadata?.ip,
        userAgent: metadata?.userAgent,
        metadata: metadata || {},
      },
    });

    this.logger.log(`File ${action}: ${fileId} by user ${userId}`);
  }

  async logError(errorType: string, userId: string, details: any) {
    await this.prisma.errorLog.create({
      data: {
        errorType,
        userId,
        details,
        stackTrace: new Error().stack,
      },
    });

    this.logger.error(`Error ${errorType}: ${details}`, details);
  }
}
```

### 2. 性能监控

```typescript
@Injectable()
export class FileMetricsService {
  @Counter('file_upload_total', 'Total file uploads')
  uploadCounter: Counter<string>;

  @Histogram('file_upload_duration', 'File upload duration')
  uploadDuration: Histogram<string>;

  @Gauge('storage_usage_bytes', 'Storage usage in bytes')
  storageGauge: Gauge<string>;

  recordUpload(fileSize: number, duration: number) {
    this.uploadCounter.inc();
    this.uploadDuration.observe(duration);
  }

  updateStorageUsage(usedBytes: number) {
    this.storageGauge.set(usedBytes);
  }
}
```

## 待解决问题

1. **转换程序集成**：需要具体的 CAD 转换工具接口设计
2. **错误处理完善**：统一错误码和用户友好的错误提示
3. **性能优化**：大文件并发上传、缓存策略优化
4. **安全加固**：文件访问审计、病毒扫描集成（可选）
5. **MinIO 企业级配置**：对象锁定、生命周期管理、跨区域复制

---

_文档版本: v1.0_  
_创建时间: 2025-12-16_  
_最后更新: 2025-12-16_

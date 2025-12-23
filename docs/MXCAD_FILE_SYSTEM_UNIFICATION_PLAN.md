# MXCAD 文件系统统一方案

## 目标
- 统一使用 mxcad 的上传功能和图纸转换功能
- 所有文件存储到 MinIO
- 保持 mxcad 所有接口完全不变
- 项目管理系统使用 mxcad 的上传和转换功能
- 以 mxcad-app 为准，项目和文件系统为 demo

## 核心方案

### 1. 存储流程改造
```
当前流程：
文件上传 → 本地存储 → 图纸转换 → 本地存储结果

目标流程：
文件上传 → 本地存储 → 图纸转换 → MinIO 同步 → 保留本地备份
```

### 2. 数据库设计
- 复用 `fileHash` 字段存储 MD5（统一使用 mxcad 的 MD5）
- 修改 FileHashService 使用 MD5 算法
- mxcad 文件基于项目上下文创建 FileSystemNode

### 3. 接口兼容性
- 保持现有 `{ ret: 'ok' }` 返回格式
- mxcad 接口保持公开（无认证），兼容 mxcad-app
- 本地路径 `uploads/{hash}/` 映射到 MinIO `mxcad/{hash}/`

### 4. 项目集成方案
- **项目上下文获取**：修改前端路由，添加项目参数
- **URL 规范**：`/cad-editor/:fileId?project=123&parent=456`
- **文件归属**：上传到指定项目和目录
- **权限控制**：基于 URL 参数实现权限控制

### 5. 权限验证方案（无法改动 mxcad-app）
- **核心约束**：mxcad-app 无法设置请求头、无法添加 token、无法修改 URL 参数
- **解决方案**：
  1. **基于 Referer 的项目上下文获取**：
     - 用户访问编辑器时，Referer 头包含项目信息
     - 例如：`Referer: http://localhost:3000/projects/123/folders/456`
     - 从 Referer 解析 projectId 和 parentId
  
  2. **基于 Session 的用户身份验证**：
     - 用户首次访问编辑器页面时，创建 session
     - mxcad-app 请求时自动携带 session cookie
     - 通过 session 获取用户身份和权限
  
  3. **权限控制策略**：
     - 验证用户是否为项目成员
     - 验证是否有指定文件夹的访问权限
     - 创建 FileSystemNode 时使用 session 中的用户 ID

## 技术实现细节

### MinIO 路径映射
```
本地结构：
uploads/
├── {hash}/
│   ├── {hash}.dwg1__mxole__.jpg
│   └── {hash}.dwg2__mxole__.jpg
├── {hash}.dwg_12345.dwg
├── {hash}.dwg.mxweb
├── {hash}.dwg.mxweb_preloading.json
└── {hash}.json

MinIO 结构：
mxcad/
├── {hash}/
│   ├── {hash}.dwg1__mxole__.jpg
│   └── {hash}.dwg2__mxole__.jpg
├── {hash}.dwg
├── {hash}.mxweb
├── {hash}.mxweb_preloading.json
└── {hash}.json
```

### 项目上下文拦截器（基于 Referer）
```typescript
@Injectable()
export class MxCadContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();
    const referer = request.headers.referer;
    
    // 解析 Referer: http://localhost:3000/projects/123/folders/456
    const urlPattern = /\/projects\/(\d+)(?:\/folders\/(\d+))?/;
    const match = referer?.match(urlPattern);
    
    // 从 session 获取用户信息
    const user = request.session?.user;
    
    request.mxcadContext = {
      projectId: match?.[1],
      parentId: match?.[2],
      userId: user?.id
    };
    
    return next.handle();
  }
}
```

### Session 中间件配置
```typescript
// main.ts 中添加 session 支持
import * as session from 'express-session';

app.use(
  session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // 开发环境
      maxAge: 24 * 60 * 60 * 1000, // 24小时
    },
  })
);
```

### 文件节点创建逻辑（基于 Session）
```typescript
// mxcad 上传时自动创建 FileSystemNode
const mxcadContext = request.mxcadContext;
const fileNode = await this.prisma.fileSystemNode.create({
  data: {
    name: originalName,
    isFolder: false,
    isRoot: false,
    parentId: mxcadContext.parentId, // 从 Referer 解析
    originalName: originalName,
    path: `mxcad/${fileHash}`, // MinIO 路径
    size: fileSize,
    mimeType: 'application/dwg',
    extension: '.dwg',
    fileStatus: FileStatus.ACTIVE,
    fileHash: fileHash, // MD5 哈希
    ownerId: mxcadContext.userId, // 从 Session 获取
  }
});
```

### 权限验证逻辑
```typescript
// 在上传前验证权限
async validateUploadPermission(context: MxCadContext) {
  if (!context.userId) {
    throw new UnauthorizedException('用户未登录');
  }
  
  if (!context.projectId) {
    throw new BadRequestException('缺少项目信息');
  }
  
  // 验证用户是否为项目成员
  const membership = await this.prisma.projectMember.findFirst({
    where: {
      userId: context.userId,
      nodeId: context.projectId,
    },
  });
  
  if (!membership) {
    throw new ForbiddenException('无权限访问该项目');
  }
  
  return true;
}
```

## 现有机制保留

### 并发处理
- `mapCurrentFilesBeingMerged` 防止同一文件重复转换
- 保持现有逻辑不变

### 缓存策略  
- 转换防重复：`mapCurrentFilesBeingMerged`
- 文件访问缓存：`Cache-Control: public, max-age=3600`
- 保持现有缓存机制

### 去重机制
- mxcad 现有的 MD5 去重：`fileisExist` 和 `chunkisExist`
- 统一到 FileSystemNode 的 md5Hash 字段

## 关键发现与调整

### 1. 认证问题
- **发现**：mxcad 接口使用 `@Public()` 装饰器，无认证守卫
- **解决**：移除 `@Public()`，添加 `@UseGuards(JwtAuthGuard)` 和 `@ApiBearerAuth()`

### 2. 字段设计
- **发现**：FileSystemNode 已有 `fileHash` 字段（SHA-256）
- **解决**：复用 `fileHash` 字段存储 MD5，修改注释和用途

### 3. 存储改造策略
- **转换时机**：先本地转换完成，再同步到 MinIO
- **文件同步**：转换后的所有文件（包括子文件）都同步到 MinIO
- **性能策略**：接受性能影响，转换消耗大是客观情况
- **错误处理**：MinIO 上传失败时保留本地文件，支持重试和降级读取

### 4. 项目上下文
- **发现**：mxcad-app 无法设置自定义请求头
- **解决**：使用 URL 参数方式：`/mxcad/files/uploadFiles?projectId=123&parentId=456`

### 5. 文件处理细节
- **转换流程**：本地转换 → 生成多个文件 → 批量上传 MinIO → 保留本地备份
- **降级策略**：MinIO 读取失败时，自动降级到本地文件读取
- **重试机制**：上传失败支持自动重试，确保数据可靠性

## 调整后实施步骤

1. **修改哈希算法**
   - 修改 FileHashService 使用 MD5 算法
   - 更新相关注释和测试用例

2. **配置 Session 支持**
   - 在 main.ts 中添加 express-session 中间件
   - 配置 session 参数和安全性

3. **实现项目上下文拦截器**
   - 创建 MxCadContextInterceptor
   - 从 Referer 解析项目信息
   - 从 Session 获取用户信息

4. **修改 mxcad 上传流程**
   - 保持现有上传和转换逻辑不变
   - 添加权限验证逻辑
   - 转换完成后创建 FileSystemNode 记录
   - 同步所有文件到 MinIO
   - 保留本地备份

5. **修改文件获取流程**
   - 优先从 MinIO 读取文件
   - MinIO 失败时降级到本地文件读取
   - 保持路径映射和返回格式透明

6. **实现文件同步服务**
   - 创建专门的文件同步服务
   - 支持批量上传和重试机制
   - 确保本地和 MinIO 数据一致性

7. **测试验证**
   - Session 和权限验证测试
   - 接口兼容性测试
   - 项目上下文功能测试
   - 文件同步和降级机制测试
   - 完整流程测试

---

*创建时间：2025-12-22*  
*分支：feature/unify-mxcad-file-system*  
*状态：实施阶段*
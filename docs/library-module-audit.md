# 图纸库/图块库模块审计报告

**审计日期**: 2026-05-02
**审计范围**: `apps/backend/src/library/` 及公开资源库相关代码

---

## 一、模块架构概述

### 1.1 目录结构

```
apps/backend/src/library/
├── library.controller.ts  # 公共资源库控制器
├── library.module.ts      # 公共资源库模块
└── library.service.ts     # 公共资源库服务

相关公开文件模块:
apps/backend/src/public-file/
├── public-file.controller.ts  # 公开文件控制器
├── public-file.module.ts     # 公开文件模块
├── public-file.service.ts    # 公开文件服务
└── services/
    └── public-file-upload.service.ts  # 公开文件上传服务
```

### 1.2 核心设计思想

根据 [library.controller.ts:L48-L56](file:///d:/project/cloudcad/apps/backend/src/library/library.controller.ts#L48-L56) 的注释：

```
公共资源库控制器（仅保留只读接口）

设计思想：
- 公共资源库是一个特殊的全局项目，不是某个人的资源库
- 读操作：公开访问（无需登录）
- 写操作：已废弃，统一走文件管理模块
- 无版本管理、无回收站（删除即永久删除）
```

---

## 二、图纸库/图块库与文件系统的共享程度

### 2.1 数据模型共享

**完全复用 `FileSystemNode` 模型**，通过 `libraryKey` 字段区分资源库类型：

| libraryKey 值 | 含义 | 对应枚举 |
|---------------|------|----------|
| `'drawing'` | 公共图纸库根节点 | `LibraryType.DRAWING` |
| `'block'` | 公共图块库根节点 | `LibraryType.BLOCK` |
| `null` | 普通项目/私人空间 | - |

数据库结构 ([schema.prisma:L73-L119](file:///d:/project/cloudcad/apps/backend/prisma/schema.prisma#L73-L119))：

```prisma
model FileSystemNode {
  id                             String    @id @default(cuid())
  name                           String
  isFolder                       Boolean   @default(false)
  isRoot                         Boolean   @default(false)
  parentId                       String?
  libraryKey                     String?   // 区分资源库类型
  personalSpaceKey               String?   // 区分私人空间
  ownerId                        String
  projectId                      String?   // 资源库此字段为 null
  // ... 其他字段
}
```

### 2.2 服务层共享

| 服务 | 共享程度 | 用途 |
|------|----------|------|
| `FileTreeService` | 完全共享 | 节点树操作、获取子节点、递归获取文件 |
| `FileSystemPermissionService` | 完全共享 | 权限检查、节点访问角色判断 |
| `FileDownloadExportService` | 完全共享 | 文件下载处理 |
| `MxcadFileHandlerService` | 完全共享 | 文件访问（serveFile） |
| `SearchService` | 完全共享 | 通过 `SearchScope.LIBRARY` 支持资源库搜索 |

### 2.3 初始化机制

资源库在系统初始化时自动创建 ([initialization.service.ts:L545-L632](file:///d:/project/cloudcad/apps/backend/src/common/services/initialization.service.ts#L545-L632))：

```typescript
private async ensurePublicLibraries(): Promise<void> {
  const libraries = [
    { key: 'drawing', name: '公共图纸库', description: '公共 CAD 图纸资源' },
    { key: 'block', name: '公共图块库', description: '公共 CAD 图块资源' },
  ];
  // 创建时设置 isRoot=true, libraryKey='drawing'|'block'
}
```

---

## 三、资源库相关接口实现

### 3.1 搜索接口

**实现**: [search.service.ts:L395-L498](file:///d:/project/cloudcad/apps/backend/src/file-system/search/search.service.ts#L395-L498)

```typescript
private async searchLibrary(userId: string, params: {
  keyword: string;
  libraryKey?: string;
  type: SearchType;
  extension?: string;
  // ...
}): Promise<NodeListResponseDto>
```

**特点**:
- 不进行权限检查（资源库对所有用户公开）
- 查询条件: `libraryKey: { not: null }, isRoot: false`
- 支持按 `libraryKey` 过滤 (`'drawing'` 或 `'block'`)

### 3.2 上传接口

**资源库没有独立上传接口！**

上传统一走文件管理模块 (`FileSystemController`)：
- 分片上传: `POST /v1/file-system/chunk/upload`
- 文件合并: `POST /v1/file-system/chunk/merge`

### 3.3 下载/访问接口

#### 3.3.1 文件访问接口（公开）

| 接口 | 控制器方法 | 说明 |
|------|-----------|------|
| `GET /v1/library/drawing/filesData/*path` | `getDrawingFile()` | 图纸库文件访问 |
| `GET /v1/library/block/filesData/*path` | `getBlockFile()` | 图块库文件访问 |

**实现**: [mxcad-file-handler.service.ts:L28-L81](file:///d:/project/cloudcad/apps/backend/src/mxcad/core/mxcad-file-handler.service.ts#L28-L81)

```typescript
async serveFile(filename: string, res: Response): Promise<void> {
  const absoluteFilePath = path.resolve(filesDataPath, filename);
  if (fs.existsSync(absoluteFilePath)) {
    return this.streamFile(absoluteFilePath, res);  // 直接返回文件
  }
  // 尝试外部参照路径
  const extRefPath = await this.findExternalReferencePath(filename);
  if (extRefPath) {
    return this.streamFile(extRefPath, res);
  }
  throw new NotFoundException('文件不存在');
}
```

**特点**:
- **无任何认证**
- **无权限检查**
- 直接通过文件系统路径访问
- 设置 `Cache-Control: no-cache`（不禁用缓存）

#### 3.3.2 下载接口（需认证）

| 接口 | 权限要求 |
|------|----------|
| `GET /v1/library/drawing/nodes/:nodeId/download` | `LIBRARY_DRAWING_MANAGE` |
| `GET /v1/library/block/nodes/:nodeId/download` | `LIBRARY_BLOCK_MANAGE` |

**实现**: [library.controller.ts:L176-L194](file:///d:/project/cloudcad/apps/backend/src/library/library.controller.ts#L176-L194)

```typescript
@Get('drawing/nodes/:nodeId/download')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions([SystemPermission.LIBRARY_DRAWING_MANAGE])
async downloadDrawingNode(@Param('nodeId') nodeId: string, @Request() req, @Res() res: Response) {
  await this.fileDownloadHandler.handleDownload(nodeId, req.user.id, res, {
    clientIp: req.ip,
  });
}
```

---

## 四、权限检查机制分析

### 4.1 权限设计

**系统权限** (定义于 [schema.prisma:L327-L347](file:///d:/project/cloudcad/apps/backend/prisma/schema.prisma#L327-L347)):

```prisma
enum Permission {
  LIBRARY_DRAWING_MANAGE   // 图纸库管理权限
  LIBRARY_BLOCK_MANAGE     // 图块库管理权限
  // ...
}
```

### 4.2 权限分配

根据 [permissions.enum.ts:L95-L146](file:///d:/project/cloudcad/apps/backend/src/common/enums/permissions.enum.ts#L95-L146):

| 角色 | LIBRARY_DRAWING_MANAGE | LIBRARY_BLOCK_MANAGE |
|------|------------------------|----------------------|
| ADMIN | ✅ | ✅ |
| USER_MANAGER | ❌ | ❌ |
| FONT_MANAGER | ❌ | ❌ |
| USER | ❌ | ❌ |

### 4.3 公开访问的权限漏洞

**FileSystemPermissionService.getNodeAccessRole()** 中存在特殊处理 ([file-system-permission.service.ts:L110-L115](file:///d:/project/cloudcad/apps/backend/src/file-system/file-permission/file-system-permission.service.ts#L110-L115)):

```typescript
// 2. 检查是否是公共资源库（新增）
const isLibrary = await this.isLibraryNode(nodeId);
if (isLibrary) {
  // 公共资源库允许任何人访问，返回 VIEWER 角色
  return ProjectRole.VIEWER;
}
```

**这是预期行为**，但结合以下事实：
1. 所有读接口都标记 `@Public()`
2. 文件访问接口 `serveFile()` 无任何认证
3. 任何人可以通过猜测路径访问文件

### 4.4 潜在安全问题

| 问题 | 严重程度 | 说明 |
|------|----------|------|
| 文件访问接口无认证 | **高** | 任何人可通过 URL 访问图纸库/图块库文件 |
| 路径遍历风险 | **中** | `filesData/*path` 路由可能存在路径遍历 |
| 无访问频率限制 | **中** | 公开接口可能被滥用 |
| 无审计日志 | **低** | 文件访问缺少详细日志记录 |

---

## 五、公开资源库 API 端点汇总

### 5.1 LibraryController (`/v1/library`)

#### 图纸库接口 (Drawing Library)

| 方法 | 路径 | 认证 | 权限 | 说明 |
|------|------|------|------|------|
| GET | `/v1/library/drawing` | ❌ | - | 获取图纸库详情 |
| GET | `/v1/library/drawing/children/:nodeId` | ❌ | - | 获取图纸库子节点列表 |
| GET | `/v1/library/drawing/all-files/:nodeId` | ❌ | - | 递归获取图纸库所有文件 |
| GET | `/v1/library/drawing/filesData/*path` | ❌ | - | **图纸库文件访问（无认证）** |
| GET | `/v1/library/drawing/nodes/:nodeId` | ❌ | - | 获取图纸库节点详情 |
| GET | `/v1/library/drawing/nodes/:nodeId/download` | ✅ | `LIBRARY_DRAWING_MANAGE` | 下载图纸库文件 |
| GET | `/v1/library/drawing/nodes/:nodeId/thumbnail` | ❌ | - | 获取图纸库文件缩略图 |

#### 图块库接口 (Block Library)

| 方法 | 路径 | 认证 | 权限 | 说明 |
|------|------|------|------|------|
| GET | `/v1/library/block` | ❌ | - | 获取图块库详情 |
| GET | `/v1/library/block/children/:nodeId` | ❌ | - | 获取图块库子节点列表 |
| GET | `/v1/library/block/all-files/:nodeId` | ❌ | - | 递归获取图块库所有文件 |
| GET | `/v1/library/block/filesData/*path` | ❌ | - | **图块库文件访问（无认证）** |
| GET | `/v1/library/block/nodes/:nodeId` | ❌ | - | 获取图块库节点详情 |
| GET | `/v1/library/block/nodes/:nodeId/download` | ✅ | `LIBRARY_BLOCK_MANAGE` | 下载图块库文件 |
| GET | `/v1/library/block/nodes/:nodeId/thumbnail` | ❌ | - | 获取图块库文件缩略图 |

### 5.2 PublicFileController (`/public-file`)

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/public-file/chunk/check` | ❌ | 检查分片是否存在 |
| POST | `/public-file/file/check` | ❌ | 检查文件是否已存在（秒传） |
| POST | `/public-file/chunk/upload` | ❌ | 上传分片 |
| POST | `/public-file/chunk/merge` | ❌ | 合并分片 |
| GET | `/public-file/access/:hash/:filename` | ❌ | **通过 hash 访问文件（无认证）** |
| POST | `/public-file/ext-reference/upload` | ❌ | 上传外部参照文件 |
| GET | `/public-file/ext-reference/check` | ❌ | 检查外部参照文件是否存在 |
| GET | `/public-file/preloading/:hash` | ❌ | 获取预加载数据 |

### 5.3 SearchService (通过 FileSystemController)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/v1/file-system/search` | 搜索（支持 `scope=LIBRARY`） |

---

## 六、审计结论

### 6.1 资源库与文件系统共享程度

**高度共享**：
- ✅ 完全复用 `FileSystemNode` 数据模型
- ✅ 共享 `FileTreeService`、`FileSystemPermissionService` 等核心服务
- ✅ 资源库本质上是标记了 `libraryKey` 的特殊项目

### 6.2 接口实现

| 接口类型 | 实现状态 | 说明 |
|----------|----------|------|
| 搜索 | ✅ 已实现 | 通过 SearchService.searchLibrary() |
| 上传 | ❌ 无独立接口 | 统一走文件管理模块 |
| 下载/访问 | ⚠️ 有隐患 | 公开访问接口无认证 |

### 6.3 权限检查机制

**双层权限设计**：
- 读操作（浏览、预览）: **完全公开**，无需认证
- 写操作（下载管理）: 需要 `LIBRARY_DRAWING_MANAGE` 或 `LIBRARY_BLOCK_MANAGE` 系统权限

**安全隐患**：
1. 文件访问接口 `serveFile()` 无任何认证机制
2. 外部参照文件通过 hash 路径访问，**无需认证**
3. 缩略图接口 `checkFileAccess()` 对资源库返回 `true`，但实际未返回图片数据

### 6.4 安全建议

1. **高优先级**: 对 `filesData/*path` 接口添加可选认证机制
   - 支持通过 URL 参数传递临时访问令牌
   - 或使用签名 URL

2. **中优先级**: 添加公开接口访问频率限制
   - 防止恶意爬取

3. **低优先级**: 增强文件访问审计日志
   - 记录访问时间、IP、文件路径

---

## 七、附录

### 7.1 相关文件列表

```
apps/backend/src/library/
├── library.controller.ts
├── library.module.ts
└── library.service.ts

apps/backend/src/public-file/
├── public-file.controller.ts
├── public-file.module.ts
├── public-file.service.ts
└── services/
    └── public-file-upload.service.ts

apps/backend/src/file-system/
├── file-tree/file-tree.service.ts         # getLibraryKey()
├── file-permission/file-system-permission.service.ts  # getNodeAccessRole()
├── search/search.service.ts               # searchLibrary()
├── file-download/file-download-export.service.ts    # isLibraryNode()
└── file-download/file-download-handler.service.ts

apps/backend/src/mxcad/core/
└── mxcad-file-handler.service.ts          # serveFile()

apps/backend/src/common/services/
└── initialization.service.ts              # ensurePublicLibraries()
```

### 7.2 权限枚举来源

- 系统权限定义: [schema.prisma#L327-L347](file:///d:/project/cloudcad/apps/backend/prisma/schema.prisma#L327-L347)
- 权限枚举导出: [permissions.enum.ts#L30](file:///d:/project/cloudcad/apps/backend/src/common/enums/permissions.enum.ts#L30)

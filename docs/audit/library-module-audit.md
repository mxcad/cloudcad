# 图纸库/图块库模块完整审计报告

**汇报人：** Trae
**审计日期：** 2026-05-02
**审计范围：** `packages/backend/src/library/` 及公开资源库相关代码
**文档整合说明：** 本文档由 `library-permission-audit.md` 和 `library-module-audit.md` 合并而成，保留了 module 版本的完整内容，并整合了 permission 版本的权限安全审计内容。

---

## 一、模块架构概述

### 1.1 目录结构

```
packages/backend/src/library/
├── library.controller.ts  # 公共资源库控制器
├── library.module.ts      # 公共资源库模块
└── library.service.ts     # 公共资源库服务

相关公开文件模块:
packages/backend/src/public-file/
├── public-file.controller.ts  # 公开文件控制器
├── public-file.module.ts     # 公开文件模块
├── public-file.service.ts    # 公开文件服务
└── services/
    └── public-file-upload.service.ts  # 公开文件上传服务
```

### 1.2 核心设计思想

根据 [library.controller.ts:L48-L56](file:///d:/project/cloudcad/packages/backend/src/library/library.controller.ts#L48-L56) 的注释：

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

数据库结构 ([schema.prisma:L73-L119](file:///d:/project/cloudcad/packages/backend/prisma/schema.prisma#L73-L119))：

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

资源库在系统初始化时自动创建 ([initialization.service.ts:L545-L632](file:///d:/project/cloudcad/packages/backend/src/common/services/initialization.service.ts#L545-L632))：

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

**实现**: [search.service.ts:L395-L498](file:///d:/project/cloudcad/packages/backend/src/file-system/search/search.service.ts#L395-L498)

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

**实现**: [mxcad-file-handler.service.ts:L28-L81](file:///d:/project/cloudcad/packages/backend/src/mxcad/core/mxcad-file-handler.service.ts#L28-L81)

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

**实现**: [library.controller.ts:L176-L194](file:///d:/project/cloudcad/packages/backend/src/library/library.controller.ts#L176-L194)

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

**系统权限** (定义于 [schema.prisma:L327-L347](file:///d:/project/cloudcad/packages/backend/prisma/schema.prisma#L327-L347)):

```prisma
enum Permission {
  LIBRARY_DRAWING_MANAGE   // 图纸库管理权限
  LIBRARY_BLOCK_MANAGE     // 图块库管理权限
  // ...
}
```

### 4.2 权限分配

根据 [permissions.enum.ts:L95-L146](file:///d:/project/cloudcad/packages/backend/src/common/enums/permissions.enum.ts#L95-L146):

| 角色 | LIBRARY_DRAWING_MANAGE | LIBRARY_BLOCK_MANAGE |
|------|------------------------|----------------------|
| ADMIN | ✅ | ✅ |
| USER_MANAGER | ❌ | ❌ |
| FONT_MANAGER | ❌ | ❌ |
| USER | ❌ | ❌ |

### 4.3 公开访问的权限漏洞

**FileSystemPermissionService.getNodeAccessRole()** 中存在特殊处理 ([file-system-permission.service.ts:L110-L115](file:///d:/project/cloudcad/packages/backend/src/file-system/file-permission/file-system-permission.service.ts#L110-L115)):

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

## 五、保存端点的权限配置

### 5.1 保存端点不在 LibraryController 中

**重要发现**: LibraryController（`/v1/library`）**仅保留只读接口**，没有任何保存端点。

根据 [library.controller.ts:L48-L56](file:///d:/project/cloudcad/packages/backend/src/library/library.controller.ts#L48-L56) 的注释：

```
公共资源库控制器（仅保留只读接口）

设计思想：
- 公共资源库是一个特殊的全局项目，不是某个人的资源库
- 读操作：公开访问（无需登录）
- 写操作：已废弃，统一走文件管理模块
- 无版本管理、无回收站（删除即永久删除）
```

### 5.2 实际的保存端点：MxcadController

**保存操作的实际端点**: `POST /api/mxcad/savemxweb/:nodeId`

**实现位置**: [mxcad.controller.ts:L485-L531](file:///d:/project/cloudcad/packages/backend/src/mxcad/core/mxcad.controller.ts#L485-L531)

```typescript
@Post('savemxweb/:nodeId')
@UseGuards(JwtAuthGuard, RequireProjectPermissionGuard)
@RequireProjectPermission(ProjectPermission.CAD_SAVE)
@HttpCode(HttpStatus.OK)
@UseInterceptors(FileInterceptor('file'))
async saveMxwebToNode(
  @Param('nodeId') nodeId: string,
  @UploadedFile() file: Express.Multer.File,
  @Body('commitMessage') commitMessage: string,
  @Req() request: MxCadRequest
) {
  // ...
}
```

### 5.3 智能节点类型判断：RequireProjectPermissionGuard

**关键机制**: `RequireProjectPermissionGuard` 实现了**智能节点类型判断**，自动区分项目文件与公开资源库节点。

**实现位置**: [require-project-permission.guard.ts:L93-L111](file:///d:/project/cloudcad/packages/backend/src/common/guards/require-project-permission.guard.ts#L93-L111)

```typescript
// 智能节点类型判断：检查是否为公开资源库节点
const nodeId = this.extractNodeId(request);
let projectId: string | null = null;

if (nodeId) {
  const isLibraryNode = await this.fileTreeService.getLibraryKey(nodeId);
  if (isLibraryNode) {
    // 公开资源库：检查系统权限
    const hasPermission = await this.checkLibraryPermission(
      userId,
      isLibraryNode
    );

    if (!hasPermission) {
      throw new ForbiddenException('没有访问该资源库的权限');
    }

    return true;
  }
  // ...
}
```

**权限映射逻辑**: [require-project-permission.guard.ts:L168-L181](file:///d:/project/cloudcad/packages/backend/src/common/guards/require-project-permission.guard.ts#L168-L181)

```typescript
private async checkLibraryPermission(
  userId: string,
  libraryKey: 'drawing' | 'block'
): Promise<boolean> {
  const requiredPermission =
    libraryKey === 'drawing'
      ? SystemPermission.LIBRARY_DRAWING_MANAGE
      : SystemPermission.LIBRARY_BLOCK_MANAGE;

  return this.systemPermissionService.checkSystemPermission(
    userId,
    requiredPermission
  );
}
```

### 5.4 权限检查流程图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    保存端点权限检查流程 (savemxweb/:nodeId)                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  请求 ──► RequireProjectPermissionGuard                                 │
│              │                                                          │
│              ▼                                                          │
│     提取 nodeId 参数                                                    │
│              │                                                          │
│              ▼                                                          │
│     查询节点的 libraryKey                                                │
│              │                                                          │
│              ├─ libraryKey === 'drawing' ──► 检查 LIBRARY_DRAWING_MANAGE │
│              │                                                          │
│              ├─ libraryKey === 'block'    ──► 检查 LIBRARY_BLOCK_MANAGE  │
│              │                                                          │
│              └─ libraryKey === null       ──► 检查 CAD_SAVE (项目权限)   │
│                                                                         │
│     权限检查通过 ──► 允许保存                                           │
│     权限检查失败 ──► 403 ForbiddenException                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.5 保存端点权限总结

| 文件来源 | 所需权限 | 管理员 | 普通用户 | 匿名用户 |
|----------|----------|--------|----------|----------|
| 公开资源库文件 (drawing) | `LIBRARY_DRAWING_MANAGE` | ✅ | ❌ | ❌ |
| 公开资源库文件 (block) | `LIBRARY_BLOCK_MANAGE` | ✅ | ❌ | ❌ |
| 项目文件 | `CAD_SAVE` (项目级) | ✅ | 视项目角色 | ❌ |

**权限依据**:
- 根据 [permissions.enum.ts](file:///d:/project/cloudcad/packages/backend/src/common/enums/permissions.enum.ts)，只有 `ADMIN` 角色拥有 `LIBRARY_DRAWING_MANAGE` 和 `LIBRARY_BLOCK_MANAGE` 权限
- `RequireProjectPermissionGuard` 在检测到 `nodeId` 属于公开资源库时，自动将检查从项目级 `CAD_SAVE` 切换为系统级 `LIBRARY_*_MANAGE`

### 5.6 前端 SaveAsModal 的额外验证

**额外的前端控制**: [SaveAsModal.tsx:L237-L239](file:///d:/project/cloudcad/packages/frontend/src/components/modals/SaveAsModal.tsx#L237-L239)

```typescript
const hasLibraryPermission =
  hasPermission(SystemPermission.LIBRARY_DRAWING_MANAGE) ||
  hasPermission(SystemPermission.LIBRARY_BLOCK_MANAGE);
```

前端在渲染"公开资源库"保存选项时，也进行了权限检查：

```tsx
{hasLibraryPermission && (
  <button onClick={() => setTargetType('library')}>
    公开资源库
  </button>
)}
```

这意味着即使后端 Guard 意外失效，普通用户也无法通过前端 UI 发起对公开资源库的保存请求。

---

## 六、公开资源库 API 端点汇总

### 6.1 LibraryController (`/v1/library`)

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

### 6.2 PublicFileController (`/public-file`)

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

### 6.3 SearchService (通过 FileSystemController)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/v1/file-system/search` | 搜索（支持 `scope=LIBRARY`） |

---

## 七、安全漏洞确认：未登录用户获取 DWG/PDF 文件

### 7.1 审计结论摘要

**结论：存在安全漏洞（设计缺陷）**

公共资源库（图纸库/图块库）存在 **路径遍历式未授权文件访问漏洞**，允许未登录用户或普通登录用户无需任何权限即可获取任意 DWG/PDF 文件。

### 7.2 漏洞路径分析

#### 漏洞入口 1：`GET /v1/library/drawing/filesData/*path`（图纸库文件访问）

**位置**: [library.controller.ts#L142-L156](file:///d:/project/cloudcad/packages/backend/src/library/library.controller.ts#L142-L156)

```typescript
@Get('drawing/filesData/*path')
@Public()  // ⛔ 无任何认证
@ApiOperation({ summary: '获取图纸库文件（统一入口）' })
async getDrawingFile(
  @Param('path') filePath: string[],
  @Res() res: Response
) {
  const filename = filePath.join('/');
  return this.mxcadFileHandler.serveFile(filename, res);  // 直接服务文件
}
```

**特点**:
- `@Public()` 装饰器明确标记为公开访问
- 无 JWT 认证（`JwtAuthGuard`）
- 无权限检查（`PermissionsGuard`）
- 直接调用 `serveFile()` 流式传输文件

#### 漏洞入口 2：`GET /v1/library/block/filesData/*path`（图块库文件访问）

**位置**: [library.controller.ts#L280-L309](file:///d:/project/cloudcad/packages/backend/src/library/library.controller.ts#L280-L309)

```typescript
@Get('block/filesData/*path')
@Public()  // ⛔ 无任何认证
@ApiOperation({ summary: '获取图块库文件（统一入口）' })
async getBlockFile(
  @Param('path') filePath: string[],
  @Res() res: Response
) {
  const filename = filePath.join('/');
  return this.mxcadFileHandler.serveFile(filename, res);
}
```

**特点**: 与图纸库完全相同，无任何防护。

#### 核心漏洞实现：`MxcadFileHandlerService.serveFile()`

**位置**: [mxcad-file-handler.service.ts#L28-L81](file:///d:/project/cloudcad/packages/backend/src/mxcad/core/mxcad-file-handler.service.ts#L28-L81)

```typescript
async serveFile(filename: string, res: Response): Promise<void> {
  const filesDataPath = this.configService.get('filesDataPath', { infer: true });
  const absoluteFilePath = path.resolve(filesDataPath, filename);

  // ⛔ 漏洞核心：直接拼接路径，无任何验证
  if (fs.existsSync(absoluteFilePath)) {
    return this.streamFile(absoluteFilePath, res);  // 直接返回文件
  }

  // 尝试外部参照路径（同样无认证）
  const extRefPath = await this.findExternalReferencePath(filename);
  if (extRefPath) {
    return this.streamFile(extRefPath, res);
  }

  throw new NotFoundException('文件不存在');
}
```

**漏洞本质**: 通过 URL 路径直接访问服务器文件系统，文件路径格式为 `YYYYMM/nodeId/fileHash.dwg.mxweb`。

### 7.3 漏洞利用方式

#### 方式一：直接文件访问（未登录）

1. 攻击者调用 `GET /v1/library/drawing/children/root` 获取图纸库文件列表
2. 从响应中获取目标文件的 `path` 字段（如 `202605/abc123/xyz456.dwg.mxweb`）
3. 直接构造 URL：`GET /v1/library/drawing/filesData/202605/abc123/xyz456.dwg.mxweb`
4. **文件直接返回，无需任何认证**

#### 方式二：通过另存为绕过（登录用户）

攻击者将图纸库文件另存到自己的个人空间或项目：

1. 在 CAD 编辑器中打开图纸库文件
2. 使用"另存为"功能保存到个人空间
3. 通过 `FileDownloadExportService` 下载（此服务检查权限）
4. **绕过后直接获得文件副本**

#### 方式三：外部参照文件访问

图纸库文件可能包含外部参照（xref），外部参照文件路径格式为 `{dir}/{fileHash}/{fileName}`，通过 `findExternalReferencePath()` 解析。该路径同样**无需认证**。

### 7.4 受影响接口汇总

| 接口 | 方法 | 认证 | 权限 | 文件类型 | 漏洞状态 |
|------|------|------|------|----------|----------|
| `/v1/library/drawing/filesData/*path` | GET | ❌ | - | DWG/MXWEB | **严重漏洞** |
| `/v1/library/block/filesData/*path` | GET | ❌ | - | DWG/MXWEB | **严重漏洞** |
| `/v1/library/drawing/nodes/:nodeId/download` | GET | ✅ | `LIBRARY_DRAWING_MANAGE` | 任意 | ✅ 安全 |
| `/v1/library/block/nodes/:nodeId/download` | GET | ✅ | `LIBRARY_BLOCK_MANAGE` | 任意 | ✅ 安全 |
| `/public-file/access/:hash/:filename` | GET | ❌ | - | 任意 | **设计意图** |

### 7.5 漏洞定性与风险评估

| 项目 | 评估 |
|------|------|
| **漏洞类型** | 未授权信息泄露（Unauthorized Information Disclosure） |
| **严重程度** | **高**（High） |
| **利用难度** | 低（无需特殊工具，浏览器即可） |
| **影响范围** | 所有图纸库/图块库文件 |
| **数据敏感性** | 高（CAD 文件可能包含商业机密） |
| **CVSS 3.1 评分** | 7.5（High） |

**攻击示例**：
```bash
# 获取图纸库根节点
curl "http://localhost:3001/api/v1/library/drawing/children/root"

# 从响应中提取文件 path，构造下载 URL
curl "http://localhost:3001/api/v1/library/drawing/filesData/202605/abc123/xyz456.dwg.mxweb" \
  -o output.dwg
```

### 7.6 安全建议

#### 短期修复（必须）

1. **移除 `@Public()` 装饰器**
   - 将 `filesData/*path` 接口改为需要认证
   - 添加 `JwtAuthGuard`
   - 用户必须登录后才能访问文件

2. **添加 Referer 检查**（可选的快速修复）
   ```typescript
   // 临时方案：检查 Referer 是否来自本站点
   const referer = req.get('referer');
   if (!referer || !referer.includes(req.get('host'))) {
     // 非浏览器直接访问，拒绝
   }
   ```

#### 长期方案（推荐）

1. **实现签名 URL 机制**
   - 文件 URL 包含过期时间戳和签名
   - 签名由服务器生成，有效期（如 5 分钟）
   - 示例：`/filesData/xxx?expires=xxx&signature=xxx`

2. **实现会话绑定**
   - 文件访问与用户会话绑定
   - 记录文件访问日志
   - 可审计、可追溯

3. **添加访问频率限制**
   - 对公开接口添加 Rate Limiting
   - 防止爬虫大规模下载

### 7.7 结论

**漏洞确认：存在**

图纸库/图块库的 `filesData/*path` 接口存在 **未授权文件访问漏洞**，属于 **设计意图与安全要求不匹配** 的问题。

- **不是正常功能**：预览功能不应允许无认证下载
- **不是设计漏洞**：设计者明确标记了 `@Public()`，但低估了安全风险
- **是安全漏洞**：任何人都可以绕过认证获取文件

**建议**：参考 7.6 节安全建议尽快修复。

---

## 八、审计结论

### 8.1 资源库与文件系统共享程度

**高度共享**：
- ✅ 完全复用 `FileSystemNode` 数据模型
- ✅ 共享 `FileTreeService`、`FileSystemPermissionService` 等核心服务
- ✅ 资源库本质上是标记了 `libraryKey` 的特殊项目

### 8.2 接口实现

| 接口类型 | 实现状态 | 说明 |
|----------|----------|------|
| 搜索 | ✅ 已实现 | 通过 SearchService.searchLibrary() |
| 上传 | ❌ 无独立接口 | 统一走文件管理模块 |
| 下载/访问 | ⚠️ 有隐患 | 公开访问接口无认证 |

### 8.3 权限检查机制

**双层权限设计**：
- 读操作（浏览、预览）: **完全公开**，无需认证
- 写操作（下载管理）: 需要 `LIBRARY_DRAWING_MANAGE` 或 `LIBRARY_BLOCK_MANAGE` 系统权限

**安全隐患**：
1. 文件访问接口 `serveFile()` 无任何认证机制
2. 外部参照文件通过 hash 路径访问，**无需认证**
3. 缩略图接口 `checkFileAccess()` 对资源库返回 `true`，但实际未返回图片数据

---

## 九、附录

### 9.1 相关文件列表

```
packages/backend/src/library/
├── library.controller.ts
├── library.module.ts
└── library.service.ts

packages/backend/src/public-file/
├── public-file.controller.ts
├── public-file.module.ts
├── public-file.service.ts
└── services/
    └── public-file-upload.service.ts

packages/backend/src/file-system/
├── file-tree/file-tree.service.ts         # getLibraryKey()
├── file-permission/file-system-permission.service.ts  # getNodeAccessRole()
├── search/search.service.ts               # searchLibrary()
├── file-download/file-download-export.service.ts    # isLibraryNode()
└── file-download/file-download-handler.service.ts

packages/backend/src/mxcad/core/
└── mxcad-file-handler.service.ts          # serveFile()

packages/backend/src/common/services/
└── initialization.service.ts              # ensurePublicLibraries()
```

### 9.2 权限枚举来源

- 系统权限定义: [schema.prisma#L327-L347](file:///d:/project/cloudcad/packages/backend/prisma/schema.prisma#L327-L347)
- 权限枚举导出: [permissions.enum.ts#L30](file:///d:/project/cloudcad/packages/backend/src/common/enums/permissions.enum.ts#L30)

---

**审计完成日期：** 2026-05-02
**报告版本：** 1.0（整合版）

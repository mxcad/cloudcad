# 公共资源库功能设计

## 1. 概述

### 1.1 功能描述

建立公共图纸库和图块库，供所有用户浏览和下载。同时将原有"图库"功能重命名为"个人收藏"，保持功能不变。

### 1.2 核心需求

| 操作 | 公共资源库 | 个人收藏（原图库） |
|------|-----------|-------------------|
| 浏览列表 | ✅ 公开（无需登录） | ❌ 需登录 |
| 预览图纸 | ✅ 公开（无需登录） | ❌ 需登录 |
| 下载文件 | ❌ 需登录 | ❌ 需登录 |
| 添加到收藏 | ❌ 需登录 | - |
| 上传文件 | ❌ 系统管理员 | ❌ 需登录 + 项目权限 |
| 删除文件 | ❌ 系统管理员 | ❌ 需登录 + 项目权限 |
| 管理分类 | ❌ 系统管理员 | ❌ 需登录（个人分类） |

### 1.3 设计原则

- **沿用私人空间模式**：复用 `FileSystemNode` 模型，通过 `libraryKey` 字段标识
- **权限分离**：读操作公开，下载需登录，写操作需管理员权限
- **前端复用**：复用现有文件管理组件，减少开发成本

---

## 2. 数据模型变更

### 2.1 FileSystemNode 表新增字段

**文件**: `packages/backend/prisma/schema.prisma`

```prisma
model FileSystemNode {
  // ... 现有字段保持不变

  // === 项目专属字段（仅根节点使用）===
  description     String?
  projectStatus   ProjectStatus?
  personalSpaceKey String? @unique(map: "unique_personal_space")  // 私人空间标识
  libraryKey      String?  // 新增：公共资源库标识 'drawing' | 'block'

  // === 索引 ===
  @@index([libraryKey])  // 新增：资源库查询优化
}
```

### 2.2 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `libraryKey` | `String?` | 公共资源库标识键 |

**判断逻辑**：
- `libraryKey = 'drawing'` → 公共图纸库
- `libraryKey = 'block'` → 公共图块库
- `libraryKey = null` 且 `personalSpaceKey = null` → 普通项目
- `personalSpaceKey !== null` → 私人空间

**唯一性说明**：
- 不需要 `@unique` 约束（未来可能支持多语言版本）

### 2.3 新增系统权限

```prisma
enum Permission {
  // ... 现有权限

  // ========== 公共资源库管理 ==========
  SYSTEM_LIBRARY_READ          // 查看资源库
  SYSTEM_LIBRARY_UPLOAD        // 上传资源
  SYSTEM_LIBRARY_DELETE        // 删除资源
  SYSTEM_LIBRARY_MANAGE        // 管理资源库（创建文件夹、移动等）
}
```

### 2.4 数据库迁移

```bash
pnpm prisma migrate dev --name add_library_key
```

---

## 3. 后端 API 设计

### 3.1 公共资源库 API

**文件**: `packages/backend/src/library/library.controller.ts`（新建）

| 路由 | 方法 | 权限 | 说明 |
|------|------|------|------|
| `GET /library` | GET | 公开 | 获取资源库列表 |
| `GET /library/:libraryKey` | GET | 公开 | 获取资源库详情 |
| `GET /library/:libraryKey/nodes` | GET | 公开 | 获取资源库文件列表 |
| `GET /library/:libraryKey/nodes/:nodeId` | GET | 公开 | 获取节点详情 |
| `GET /library/:libraryKey/download/:nodeId` | GET | 需登录 | 下载文件 |
| `POST /library/:libraryKey/folders` | POST | 管理员 | 创建文件夹 |
| `POST /library/:libraryKey/upload` | POST | 管理员 | 上传文件 |
| `PUT /library/:libraryKey/nodes/:nodeId` | PUT | 管理员 | 重命名/移动 |
| `DELETE /library/:libraryKey/nodes/:nodeId` | DELETE | 管理员 | 删除文件/文件夹 |
| `POST /library/:libraryKey/collect/:nodeId` | POST | 需登录 | 添加到个人收藏 |
| `DELETE /library/:libraryKey/collect/:nodeId` | DELETE | 需登录 | 从个人收藏移除 |

### 3.2 个人收藏 API（重命名）

**文件**: `packages/backend/src/gallery/gallery.controller.ts`

保持现有 API 不变，仅修改路由前缀和文档描述：

| 原路由 | 新路由 | 说明 |
|--------|--------|------|
| `POST /gallery/drawings/types` | `POST /collection/drawings/types` | 获取分类列表 |
| `POST /gallery/drawings/filelist` | `POST /collection/drawings/filelist` | 获取文件列表 |
| `...` | `...` | 其他接口路由保持一致 |

**前端适配**：更新 API 调用路径从 `/gallery` 改为 `/collection`

### 3.3 权限守卫设计

```typescript
// 公开访问 - 浏览和预览
@Public()
@Get(':libraryKey/nodes')
async getLibraryNodes() { ... }

// 需登录 - 下载
@UseGuards(JwtAuthGuard)
@Get(':libraryKey/download/:nodeId')
async downloadFile() { ... }

// 需管理员权限 - 写操作
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions([Permission.SYSTEM_LIBRARY_UPLOAD])
@Post(':libraryKey/upload')
async uploadFile() { ... }
```

---

## 4. 服务层设计

### 4.1 新建 LibraryService

**文件**: `packages/backend/src/library/library.service.ts`

```typescript
@Injectable()
export class LibraryService {
  /**
   * 获取资源库列表
   */
  async getLibraries(): Promise<FileSystemNode[]>

  /**
   * 获取资源库详情
   */
  async getLibrary(libraryKey: string): Promise<FileSystemNode | null>

  /**
   * 获取资源库文件列表（支持分页、搜索）
   */
  async getLibraryNodes(
    libraryKey: string,
    query: QueryLibraryNodesDto
  ): Promise<PaginatedNodesResponse>

  /**
   * 下载文件（记录下载日志）
   */
  async downloadFile(
    libraryKey: string,
    nodeId: string,
    userId: string
  ): Promise<DownloadResult>

  /**
   * 添加到个人收藏
   */
  async addToCollection(
    libraryKey: string,
    nodeId: string,
    userId: string
  ): Promise<void>

  /**
   * 创建文件夹（管理员）
   */
  async createFolder(
    libraryKey: string,
    parentId: string | null,
    name: string,
    userId: string
  ): Promise<FileSystemNode>

  /**
   * 上传文件（管理员）
   */
  async uploadFile(
    libraryKey: string,
    parentId: string | null,
    file: Express.Multer.File,
    userId: string
  ): Promise<FileSystemNode>

  /**
   * 删除文件/文件夹（管理员）
   */
  async deleteNode(
    libraryKey: string,
    nodeId: string,
    userId: string
  ): Promise<void>
}
```

### 4.2 修改 FileSystemService

**文件**: `packages/backend/src/file-system/file-system.service.ts`

在现有方法中添加资源库过滤：

```typescript
// 获取项目列表 - 过滤私人空间和资源库
async getUserProjects(userId: string, query?: QueryProjectsDto) {
  return this.prisma.fileSystemNode.findMany({
    where: { 
      ownerId: userId, 
      isRoot: true,
      personalSpaceKey: null,  // 排除私人空间
      libraryKey: null,        // 排除公共资源库
    },
    // ...
  });
}
```

---

## 5. 初始化逻辑

### 5.1 在 InitializationService 中创建资源库

**文件**: `packages/backend/src/common/services/initialization.service.ts`

```typescript
async onModuleInit() {
  await this.createSystemDefaultRoles();
  await this.createProjectDefaultRoles();
  await this.checkAndCreateInitialAdmin();
  await this.ensureAllUsersHavePersonalSpace();
  await this.ensurePublicLibraries();  // 新增
}

/**
 * 确保公共资源库存在
 */
private async ensurePublicLibraries(): Promise<void> {
  const libraries = [
    { key: 'drawing', name: '公共图纸库', description: '公共 CAD 图纸资源' },
    { key: 'block', name: '公共图块库', description: '公共 CAD 图块资源' },
  ];

  const adminUser = await this.getSystemAdminUser();

  for (const lib of libraries) {
    const existing = await this.prisma.fileSystemNode.findFirst({
      where: { libraryKey: lib.key }
    });

    if (!existing) {
      await this.prisma.fileSystemNode.create({
        data: {
          name: lib.name,
          description: lib.description,
          isFolder: true,
          isRoot: true,
          libraryKey: lib.key,
          projectStatus: ProjectStatus.ACTIVE,
          ownerId: adminUser.id,
        }
      });
      this.logger.log(`创建公共资源库: ${lib.name}`);
    }
  }
}
```

---

## 6. 前端变更

### 6.1 新增路由

**文件**: `packages/frontend/src/App.tsx`

```typescript
const routes = [
  // ... 现有路由
  { path: '/library/drawing', element: <LibraryPage type="drawing" /> },
  { path: '/library/block', element: <LibraryPage type="block" /> },
];
```

### 6.2 导航菜单更新

**文件**: `packages/frontend/src/components/Layout.tsx`

```typescript
const menuItems = [
  { to: '/projects', icon: FolderOpen, label: '项目管理' },
  { to: '/personal-space', icon: FileText, label: '我的图纸' },
  { to: '/library/drawing', icon: Library, label: '公共图纸库' },  // 新增
  { to: '/library/block', icon: Box, label: '公共图块库' },        // 新增
  { to: '/collection', icon: Star, label: '个人收藏' },           // 重命名
];
```

### 6.3 API 服务更新

**文件**: `packages/frontend/src/services/libraryApi.ts`（新建）

```typescript
export const libraryApi = {
  // 公开接口
  getLibraries: () => getApiClient().LibraryController_getLibraries(),
  getLibraryNodes: (libraryKey: string, query: QueryNodesDto) => 
    getApiClient().LibraryController_getLibraryNodes(libraryKey, query),
  
  // 需登录
  downloadFile: (libraryKey: string, nodeId: string) => 
    getApiClient().LibraryController_downloadFile(libraryKey, nodeId),
  addToCollection: (libraryKey: string, nodeId: string) =>
    getApiClient().LibraryController_addToCollection(libraryKey, nodeId),
};
```

### 6.4 复用组件

- **文件列表**：复用 `FileSystemManager` 组件，通过 `mode="library"` 区分
- **预览器**：复用现有 CAD 预览组件
- **下载按钮**：未登录时跳转登录页

---

## 7. 存储结构

```
storage/
├── filesData/
│   ├── projects/           # 私有项目文件
│   │   └── {projectId}/
│   ├── personal/           # 私人空间文件
│   │   └── {userId}/
│   └── library/            # 公共资源库文件（新增）
│       ├── drawing/        # 图纸库
│       │   └── {nodeId}/
│       │       ├── {fileId}.dwg
│       │       ├── {fileId}.dwg.mxweb
│       │       └── thumbnail.jpg
│       └── block/          # 图块库
│           └── {nodeId}/
```

---

## 8. 修改文件清单

### 后端

| 序号 | 文件路径 | 修改类型 | 说明 |
|------|----------|----------|------|
| 1 | `prisma/schema.prisma` | 修改 | 新增 `libraryKey` 字段和 `SYSTEM_LIBRARY_*` 权限 |
| 2 | `src/library/library.module.ts` | **新增** | 资源库模块 |
| 3 | `src/library/library.service.ts` | **新增** | 资源库服务 |
| 4 | `src/library/library.controller.ts` | **新增** | 资源库 API |
| 5 | `src/library/dto/*.dto.ts` | **新增** | DTO 定义 |
| 6 | `src/common/services/initialization.service.ts` | 修改 | 添加资源库初始化 |
| 7 | `src/file-system/file-system.service.ts` | 修改 | 项目列表过滤资源库 |
| 8 | `src/gallery/gallery.controller.ts` | 修改 | 路由前缀改为 `/collection` |
| 9 | `src/gallery/gallery.service.ts` | 修改 | 更新注释和文档 |

### 前端

| 序号 | 文件路径 | 修改类型 | 说明 |
|------|----------|----------|------|
| 1 | `src/services/libraryApi.ts` | **新增** | 资源库 API 服务 |
| 2 | `src/pages/LibraryPage.tsx` | **新增** | 资源库页面（复用 FileSystemManager） |
| 3 | `src/App.tsx` | 修改 | 新增资源库路由 |
| 4 | `src/components/Layout.tsx` | 修改 | 更新导航菜单 |
| 5 | `src/services/galleryApi.ts` | 修改 | 更新 API 路径 |

---

## 9. 测试要点

### 9.1 功能测试

- [ ] 未登录用户可以浏览资源库
- [ ] 未登录用户可以预览图纸
- [ ] 未登录用户下载时跳转登录
- [ ] 登录用户可以下载文件
- [ ] 登录用户可以添加到个人收藏
- [ ] 管理员可以上传文件
- [ ] 管理员可以删除文件
- [ ] 管理员可以创建文件夹
- [ ] 个人收藏功能正常（重命名后）

### 9.2 权限测试

- [ ] 普通用户无法上传资源库文件
- [ ] 普通用户无法删除资源库文件
- [ ] 资源库不在项目列表中显示

### 9.3 初始化测试

- [ ] 系统启动自动创建图纸库和图块库
- [ ] 重复启动不会创建重复资源库

---

## 10. 实施顺序

### Phase 1: 数据模型（后端）
1. 修改 `schema.prisma`
2. 执行数据库迁移
3. 更新 `InitializationService`

### Phase 2: 资源库服务（后端）
1. 创建 `LibraryModule`
2. 实现 `LibraryService`
3. 实现 `LibraryController`
4. 配置权限守卫

### Phase 3: 个人收藏重命名（后端 + 前端）
1. 修改后端路由前缀
2. 更新前端 API 调用
3. 更新导航菜单文案

### Phase 4: 前端资源库页面
1. 创建 API 服务
2. 实现资源库页面
3. 更新路由和导航

### Phase 5: 测试与验收
1. 功能测试
2. 权限测试
3. 集成测试

---

## 11. 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 现有图库数据迁移 | 用户收藏数据丢失 | 保持 GalleryItem 表不变，仅改路由 |
| 未登录用户权限控制 | 安全漏洞 | 下载接口强制登录验证 |
| 资源库文件过大 | 存储压力 | 配置上传大小限制，定期清理 |

---

**文档版本**: 1.0.0
**创建日期**: 2026-03-27

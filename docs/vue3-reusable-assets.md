# Vue3 可复用代码资产盘点

> 盘点时间：2026-05-02
> 盘点范围：`apps/frontend/src/services/`、`apps/frontend/src/utils/`、`apps/frontend/src/types/`、`apps/frontend/src/constants/`

---

## 一、services/（API 调用层）

### 迁移方式总览

| 文件 | 迁移方式 | 原因 |
|------|----------|------|
| `apiClient.ts` | **需要重写** | 核心 HTTP 客户端，依赖 Axios 拦截器、OpenAPI-client-axios、本地 swagger JSON、401 自动刷新 token 逻辑 |
| `index.ts` | **直接复制** | 纯导出文件 |
| `authApi.ts` | **需要框架转换** | 依赖 `apiClient.ts`（需重写），类型来自 `api-client.ts` |
| `projectApi.ts` | **需要框架转换** | 同上 |
| `mxcadApi.ts` | **需要框架转换** | 依赖 `apiClient.ts` + `hashUtils.ts` |
| `projectsApi.ts` | **需要框架转换** | 依赖 `apiClient`，含 OpenAPI 生成代码 |
| `nodeApi.ts` | **需要框架转换** | 同上 |
| `projectsApi.ts.bak` | **直接复制** | 备份文件 |
| `searchApi.ts` | **需要框架转换** | 依赖 `apiClient` |
| `projectTrashApi.ts` | **需要框架转换** | 同上 |
| `projectPermissionApi.ts` | **需要框架转换** | 同上 |
| `projectMemberApi.ts` | **需要框架转换** | 同上 |
| `filesApi.ts` | **需要框架转换** | 同上 |
| `usersApi.ts` | **需要框架转换** | 同上 |
| `rolesApi.ts` | **需要框架转换** | 同上 |
| `cacheApi.ts` | **需要框架转换** | 同上 |
| `adminApi.ts` | **需要框架转换** | 同上 |
| `trashApi.ts` | **需要框架转换** | 同上 |
| `fontsApi.ts` | **需要框架转换** | 同上 |
| `healthApi.ts` | **需要框架转换** | 同上 |
| `publicFileApi.ts` | **需要框架转换** | 同上 |
| `auditApi.ts` | **需要框架转换** | 同上 |
| `versionControlApi.ts` | **需要框架转换** | 同上 |
| `userCleanupApi.ts` | **需要框架转换** | 同上 |
| `runtimeConfigApi.ts` | **需要框架转换** | 同上 |
| `mxcadManager.ts` | **需要重写** | 大量 MxCAD 专有逻辑，依赖 `mxcadApi.ts` |

### 详细分析

#### 1. `apiClient.ts` — 需要重写

**可复用部分：**
- Axios 单例模式（请求/响应拦截器架构）
- Token 刷新逻辑（401 → refreshToken → 重试）
- 取消请求检测（AbortController/CancelToken）
- 统一响应解包 `{ code, data, message } → data`
- 错误消息标准化

**不可复用部分（需要重写）：**
- `OpenAPIClientAxios` 依赖（Vue3 项目可用axios +手动类型定义替代）
- 本地 swagger JSON 导入（`../../../../swagger_json.json`）
- `API_BASE_URL`、`API_TIMEOUT` 从 `../config/apiConfig` 导入
- `localStorage.getItem('accessToken')` 存储结构

**Vue3 迁移建议：** 提取一个纯 Axios 实例封装，保持拦截器逻辑，移除 OpenAPI-client-axios。

#### 2. `authApi.ts` / `projectApi.ts` 等 — 需要框架转换

**可复用部分：**
- API 方法命名和参数结构
- DTO 类型接口（`LoginDto`、`RegisterDto` 等）

**不可复用部分：**
- `getApiClient().AuthController_login(...)` 调用方式
- 所有类型来自 `../types/api-client`（自动生成的大文件）

**Vue3 迁移建议：** 保持 API 方法签名不变，将 `getApiClient()` 替换为 Vue3 项目的 Axios 实例。

#### 3. `mxcadManager.ts` — 需要重写

该文件包含大量 MxCAD SDK 专有逻辑，是 MxCAD 的核心管理器，与 CAD 编辑器强绑定：
- `IMxCadManager` 接口
- 文件打开/保存命令注册
- MxCAD 初始化和事件监听
- 分片上传和缓存管理

**不可迁移到 Vue3**，属于 CAD 平台专有代码。

---

## 二、utils/（工具函数）

### 迁移方式总览

| 文件 | 迁移方式 | 可复用率 | 依赖/备注 |
|------|----------|----------|-----------|
| `fileUtils.ts` | **直接复制** | 95% | 无框架依赖，含文件大小格式化、扩展名判断、缩略图 URL 等 |
| `validation.ts` | **直接复制** | 100% | 纯函数验证逻辑，无框架依赖 |
| `errorHandler.ts` | **直接复制** | 100% | 纯错误处理函数，无框架依赖 |
| `dateUtils.ts` | **直接复制** | 95% | 日期格式化，含中文 locale 硬编码（`zh-CN`），可直接改为参数化 |
| `hashUtils.ts` | **直接复制** | 100% | `SparkMD5` 哈希计算，纯 JS/TS |
| `loadingUtils.ts` | **需要框架转换** | 0% | 直接调用 `useUIStore.setState()`，Zustand 强依赖 |
| `permissionUtils.ts` | **需要框架转换** | 60% | `canView`、`hasNodePermission` 等逻辑可复用，但依赖 `projectsApi` |
| `mxcadUtils.ts` | **需要框架转换** | 40% | `ErrorHandler`、`FileStatusHelper`、`UrlHelper`、`ValidationHelper`、`RetryHelper` 可部分复用，但依赖 `StoragePathConstants` |
| `mxcadUploadUtils.ts` | **需要框架转换** | 50% | 分片上传逻辑可复用，但依赖 `mxcadApi` |
| `filesystemUtils.ts` | **直接复制** | 80% | `getStatusText`、`getStatusStyle` 可复用，`formatDate`/`formatFileSize` 从 `fileUtils` 重导出 |
| `cleanConsole.ts` | **直接复制** | 80% | Node.js 文件操作脚本，在 Vue3 构建流程中做相同处理 |
| `authCheck.ts` | **直接复制** | 100% | `isAuthenticated()`、`getCurrentUserId()` 等 localStorage 读取函数 |

### 详细分析

#### 1. `fileUtils.ts` — 直接复制（可迁移性最高）

```typescript
// 以下函数可直接复制到 Vue3 项目使用：
formatFileSize(bytes)           // 文件大小格式化
getFileIcon(node)               // 文件图标 emoji 映射
formatDate(dateString)          // 日期格式化
formatRelativeTime(dateString)   // 相对时间（"2小时前"）
isCadFile(extension)            // CAD 文件判断
isImageFile(extension)          // 图片文件判断
isPdfFile(extension)             // PDF 文件判断
getThumbnailUrl(node)           // 缩略图 URL（依赖 API_BASE_URL）
getCadThumbnailUrl(node)         // CAD 缩略图 URL
getOriginalFileUrl(node)         // 原文件/下载 URL
isDrawingFile(fileName)         // 图纸文件判断
isBlockFile(fileName)            // 图块文件判断
sanitizeFileName(name)           // 文件名非法字符清理
validateFolderName(name)         // 文件夹名合法性验证
```

**注意：** `getThumbnailUrl`、`getCadThumbnailUrl`、`getOriginalFileUrl` 依赖 `API_BASE_URL`，需在 Vue3 项目中配置相同的环境变量。

#### 2. `validation.ts` — 直接复制（可迁移性最高）

```typescript
// 以下函数可直接复制：
ValidationRules          // 验证规则常量对象（email/username/password/nickname）
validateField(field, value)       // 单字段验证
validateRegisterForm(data, options) // 注册表单验证
```

**注意：** `ERROR_MESSAGES` 中文消息硬编码，如需国际化需改造。

#### 3. `errorHandler.ts` — 直接复制

```typescript
// 以下函数可直接复制：
getErrorMessage(error)      // 提取错误消息
handleError(error, context, severity) // 错误日志记录
createError(message, code, severity)  // 创建标准错误对象
isNetworkError(error)       // 网络错误检测
isAbortError(error)        // 请求取消检测
isAuthError(error)          // 认证错误检测（401/403）
isServerError(error)        // 服务器错误检测（5xx）
```

#### 4. `authCheck.ts` — 直接复制

```typescript
// 以下函数可直接复制（localStorage 结构需对齐）：
isAuthenticated()           // 检查登录状态
getCurrentUserId()           // 获取当前用户 ID
getCurrentUser()            // 获取当前用户信息
getAuthToken()              // 获取 accessToken
checkAuth(onNotLoggedIn, action)  // 检查并回调
clearAuthData()             // 清除认证信息
```

**注意：** 依赖 `localStorage` 中 `accessToken`、`refreshToken`、`user` 三个键，Vue3 项目需保持一致的存储结构。

#### 5. `loadingUtils.ts` — 需要框架转换（Zustand 依赖）

```typescript
// 以下函数依赖 Zustand store：
showGlobalLoading(message?)
hideGlobalLoading()
setLoadingMessage(message)
setLoadingProgress(progress)
resetLoading()
getLoadingState()
```

**Vue3 迁移建议：** 改用 `ref` + `provide/inject` 或 Pinia store 替代。

#### 6. `permissionUtils.ts` — 需要框架转换

**可复用部分：**
```typescript
canView(user)           // 用户查看权限检查（纯逻辑）
NodeAccessRole 类型      // 角色枚举类型
clearNodePermissionCache(nodeId?)  // 缓存清除
```

**不可复用部分：**
```typescript
hasNodePermission(user, nodeId, requiredRoles)  // 依赖 projectsApi
canEditNode(user, nodeId)     // 依赖 projectsApi
canDeleteNode(user, nodeId)   // 依赖 projectsApi
canManageNodeMembers(...)     // 依赖 projectsApi
canViewNode(user, nodeId)      // 依赖 hasNodePermission
canManageNodeRoles(user, nodeId)  // 依赖 projectsApi
```

**Vue3 迁移建议：** 权限检查函数签名可保留，将内部 `projectsApi` 替换为 Vue3 项目的 API 调用。

#### 7. `mxcadUtils.ts` — 需要框架转换

**可复用部分（纯工具类）：**
```typescript
ErrorHandler.handle/error)        // 错误处理
FileStatusHelper.getStatusText/isCompleted/canOpen  // 文件状态工具
ValidationHelper.isValidFileHash/isValidNodeId/isValidProjectContext  // 验证工具
delay(ms)                        // 延迟Promise
RetryHelper.retry(fn, maxRetries, delayMs, context)  // 重试工具
```

**不可复用部分：**
- `UrlHelper.buildMxCadFileUrl()` 依赖 `StoragePathConstants.STORAGE_PATH_PREFIX`

---

## 三、types/（类型定义）

### 迁移方式总览

| 文件 | 迁移方式 | 可复用率 | 依赖/备注 |
|------|----------|----------|-----------|
| `filesystem.ts` | **直接复制** | 90% | 纯 TypeScript 类型定义，扩展自 `api-client.ts` DTO |
| `api-client.ts` | **直接复制** | 100% | OpenAPI 自动生成的全量类型（约 345KB），纯类型定义 |
| `tour.ts` | **需要框架转换** | 80% | 引导系统类型，依赖 `../constants/permissions` |
| `sidebar.ts` | **直接复制** | 100% | 侧边栏 UI 状态类型，无外部依赖 |
| `lucide-icons.d.ts` | **直接复制** | 100% | Icon 类型声明文件 |

### 详细分析

#### 1. `api-client.ts` — 直接复制（最大可复用资产）

这是通过 `pnpm generate:api-types` 从 Swagger/OpenAPI spec 自动生成的类型定义文件，约 345KB，包含：
- 所有 DTO 类型（`LoginDto`、`ProjectDto`、`FileSystemNodeDto` 等）
- 所有 API 响应类型（`ProjectListResponseDto`、`NodeTreeResponseDto` 等）
- 所有枚举类型

**Vue3 迁移方式：** 直接复制整个文件，或在构建时重新运行 `pnpm generate:api-types`（推荐）。

#### 2. `filesystem.ts` — 直接复制

在 `api-client.ts` 的 DTO 类型基础上扩展了前端专用属性：
```typescript
FileSystemNode extends FileSystemNodeDto  // 添加 extension、children 等
FolderNode extends FileSystemNode         // 添加 expanded、loading 等
ProjectNode extends ProjectDto
BreadcrumbItem、ConfirmDialogState、ExternalReferenceFile 等 UI 类型
toFileSystemNode(dto)      // DTO 转换函数
projectToNode(project)     // 项目转节点函数
trashItemToNode(item)      // 回收站项转节点函数
getFileExtension(filename)  // 文件扩展名提取
```

**Vue3 迁移方式：** 直接复制，但需同时保留 `api-client.ts`。

#### 3. `tour.ts` — 需要框架转换

引导系统类型定义，依赖 `../constants/permissions` 中的 `Permission` 类型。**可复用 80%**（类型定义本身可直接复制，但与权限常量的关联需确认）。

---

## 四、constants/（常量定义）

### 迁移方式总览

| 文件 | 迁移方式 | 可复用率 | 依赖/备注 |
|------|----------|----------|-----------|
| `permissions.ts` | **直接复制** | 100% | 自动生成，Prisma Schema 来源，无外部依赖 |
| `storage.constants.ts` | **直接复制** | 100% | 纯常量定义，`ValidationHelper` 是纯函数 |
| `appConfig.ts` | **需要框架转换** | 60% | 依赖 `import.meta.env`（Vite 特有），需替换为 Vue3 的 `import.meta.env` |

### 详细分析

#### 1. `permissions.ts` — 直接复制（最高价值）

自动生成文件（`pnpm generate:frontend-permissions`），来源是 Prisma Schema，包含：
- `SystemPermission` / `ProjectPermission` 枚举（39 个权限常量）
- `Permission` 联合类型
- `PERMISSION_DEPENDENCIES` 权限依赖关系图
- `PERMISSION_GROUPS` 权限分组配置（中文标签）
- `SYSTEM_ROLE_NAMES` / `PROJECT_ROLE_NAMES` 角色名称映射
- `isPermissionEnabled()` / `getMissingDependencies()` / `togglePermission()` 工具函数

**Vue3 迁移方式：** 直接复制，建议在 Vue3 项目中也建立类似的自动化生成流程（从 Prisma Schema → 前端权限常量）。

#### 2. `storage.constants.ts` — 直接复制

包含存储路径常量、安全常量和验证工具类：
```typescript
StoragePathConstants.STORAGE_PATH_PREFIX   // 'filesData'
StoragePathConstants.MXWEB_ACCESS_PREFIX  // '/api/mxcad/'
StoragePathConstants.MXWEB_EXTENSION      // '.mxweb'
SecurityConstants.PATH_TRAVERSAL_CHARS
ValidationHelper.isValidNodePath(nodePath)  // 路径安全性验证
ValidationHelper.isValidFileExtension(name, allowed)
```

**Vue3 迁移方式：** 直接复制，`ValidationHelper` 是纯函数，无任何外部依赖。

#### 3. `appConfig.ts` — 需要框架转换

```typescript
// 需要修改的部分：
API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'  // Vite 特有
APP_COOPERATE_URL = '/api/cooperate'  // 直接复制

// 可直接复制的部分：
DEFAULT_APP_NAME / DEFAULT_APP_LOGO
BrandConfig 接口
fetchBrandConfig() / getAppName() / getAppLogo()
PAGINATION_CONFIG
```

**Vue3 迁移建议：** Vue3 (Vite) 项目同样使用 `import.meta.env`，可直接复制，无需修改。

---

## 五、总结与建议

### 可直接复制的文件（共 19 个）

| 类别 | 文件 |
|------|------|
| **utils** | `fileUtils.ts`、`validation.ts`、`errorHandler.ts`、`dateUtils.ts`、`hashUtils.ts`、`filesystemUtils.ts`、`cleanConsole.ts`、`authCheck.ts` |
| **types** | `api-client.ts`、`filesystem.ts`、`sidebar.ts`、`lucide-icons.d.ts` |
| **constants** | `permissions.ts`、`storage.constants.ts` |
| **services** | `index.ts`、`projectsApi.ts.bak` |

### 需要框架转换的文件（共 14 个）

| 类别 | 文件 | 转换要点 |
|------|------|----------|
| **services** | `apiClient.ts` 以外的所有 API 文件 | 替换 `getApiClient()` 为 Vue3 Axios 实例 |
| **utils** | `loadingUtils.ts`、`permissionUtils.ts`、`mxcadUtils.ts`、`mxcadUploadUtils.ts` | 替换 Zustand/项目 API 依赖 |
| **types** | `tour.ts` | 确认权限类型引用 |
| **constants** | `appConfig.ts` | `import.meta.env` 在 Vite 版 Vue3 中可直接用 |

### 需要重写的文件（共 2 个）

| 文件 | 原因 |
|------|------|
| `apiClient.ts` | 核心 HTTP 客户端依赖 OpenAPI-client-axios 和本地 swagger JSON，需在 Vue3 中重新设计 |
| `mxcadManager.ts` | MxCAD SDK 专有管理器，与 CAD 平台强绑定，不适合迁移 |

### 迁移优先级建议

1. **第一优先级（高价值低难度）**：复制 `permissions.ts`、`storage.constants.ts`、`validation.ts`、`errorHandler.ts`、`authCheck.ts`、`api-client.ts`、`filesystem.ts`、`fileUtils.ts`、`dateUtils.ts`、`hashUtils.ts` — 这些文件无外部框架依赖，直接复制即可使用。
2. **第二优先级（中等价值）**：复制 `appConfig.ts`（去除 Vite 特有部分）、`tour.ts`、`sidebar.ts`，并将 API 服务层从 `getApiClient()` 迁移到 Vue3 Axios 实例。
3. **第三优先级（低价值高难度）**：`loadingUtils.ts`（需引入 Pinia 或 provide/inject）、`permissionUtils.ts`（替换 API 依赖）、`mxcadUtils.ts` 中的工具类。
4. **不建议迁移**：`apiClient.ts`（建议重写）、`mxcadManager.ts`（CAD 专有）。

### 重复检测发现

通过语义分析，发现以下可合并的重复：

| 重复组 | 重复内容 | 建议 |
|--------|----------|------|
| 日期格式化 | `fileUtils.formatDate()` 与 `dateUtils.formatDate()` | 合并到 `dateUtils`，`fileUtils` 重导出 |
| 文件状态 | `mxcadUtils.FileStatusHelper` 与 `filesystemUtils.getStatusText` | 两者功能重叠，考虑合并 |
| 错误处理 | `errorHandler.ts` 与 `mxcadUtils.ErrorHandler` | `mxcadUtils.ErrorHandler` 仅为 `handle/handleAsync` 包装，可废弃 |

---

## 附录：迁移检查清单

```markdown
- [ ] 复制 constants/permissions.ts（权限常量）
- [ ] 复制 constants/storage.constants.ts（存储常量）
- [ ] 复制 utils/validation.ts（验证规则）
- [ ] 复制 utils/errorHandler.ts（错误处理）
- [ ] 复制 utils/authCheck.ts（认证检查）
- [ ] 复制 utils/fileUtils.ts（文件工具）
- [ ] 复制 utils/dateUtils.ts（日期工具）
- [ ] 复制 utils/hashUtils.ts（哈希工具）
- [ ] 复制 types/api-client.ts（API 类型）
- [ ] 复制 types/filesystem.ts（文件系统类型）
- [ ] 重写 services/apiClient.ts（Vue3 Axios 实例）
- [ ] 转换 API 服务层（替换 getApiClient 调用）
- [ ] 转换 permissionUtils.ts（替换 projectsApi 依赖）
- [ ] 转换 loadingUtils.ts（引入 Pinia 或 provide/inject）
- [ ] 验证文件大小格式化、日期格式化、错误处理函数功能正常
```

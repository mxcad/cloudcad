# 功能审计报告 — 文件系统搜索、存储、配额

> **审计日期:** 2026-05-08
> **对比范围:** `main` (old, functionally complete) vs `worktree-agent-a3784fd16772b5536` (refactor/circular-deps)
> **审计方法:** 逐文件逻辑意图对比，不关注实现细节

---

## 一、总体结论

| 状态 | 数量 | 说明 |
|------|------|------|
| ✅ **一致** | 8/8 后端文件 | 所有核心逻辑意图保持一致，未丢失任何功能 |
| ⚠️ **需要决策** | 0 | 无意图分歧 |
| 🔴 **缺失/损坏** | 0 | 无功能缺失 |

**结论：refactor/circular-deps 分支完整保留了 main 分支的文件系统搜索、存储、配额全部功能。**

---

## 二、逐文件对比详情

### 2.1 SearchService (`search.service.ts`)

**main 分支能力清单:**
- 四种搜索范围: `PROJECT`, `PROJECT_FILES`, `ALL_PROJECTS`, `LIBRARY`
- 全文搜索: 对 `name` + `description` 做大小写不敏感 `contains` 匹配
- 类型过滤: `ALL` / `FILE` / `FOLDER`
- 扩展名过滤: `extension` 字段精确匹配
- 文件状态过滤: `fileStatus` 字段（如 `COMPLETED`）
- 分页: `page`, `limit`, `skip` 标准分页 + `totalPages` 计算
- 排序: 任意字段 `sortBy` + `sortOrder` (`asc`/`desc`)
- 权限控制: 通过 `FileSystemPermissionService.checkNodePermission` 验证 `FILE_OPEN` 权限
- 项目过滤: `filter` 参数支持 `all` / `owned` / `joined`
- 递归节点收集: `getAllProjectNodeIds` 递归收集项目下所有子节点 ID
- 响应包含: `childrenCount`, `projectMembers` 计数

**当前分支状态:** ✅ 完全一致
- 差异仅在于每个方法中添加了 `safeLimit = Number(limit) || 50` 安全转换（增强健壮性，非功能变更）

**结论:** 🔵 意图相同，功能完整，仅增加了安全的 `limit` 数值转换。

---

### 2.2 StorageInfoService (`storage-info.service.ts`)

**main 分支能力清单:**
- 配额类型判定: `determineQuotaType` 委托给 `StorageQuotaService`
- 配额上限获取: `getStorageQuotaLimit` 委托给 `StorageQuotaService`
- 配额计算（带缓存）: `getStorageQuota` 含 5 分钟 TTL 内存缓存
- 节点自动解析: nodeId → DB 查询 or personalSpaceKey → 个人空间
- 数据库聚合查询: 按类型（LIBRARY/PROJECT/PERSONAL）分组 SUM(size)
- 缓存管理: `invalidateQuotaCache`
- 用户存储概览: `getUserStorageInfo`
- 临时文件清理: `deleteMxCadFilesFromUploads`（单文件 + 批量，含外部参照子目录清理）

**当前分支状态:** ✅ 完全一致

**结论:** 🔵 意图相同，代码逐行一致。

---

### 2.3 StorageQuotaService (`storage-quota.service.ts`)

**main 分支能力清单:**
- 三种配额类型: `PERSONAL`, `PROJECT`, `LIBRARY`
- 类型判定逻辑: `libraryKey != null` → LIBRARY, `isRoot === true` → PROJECT, 其他 → PERSONAL
- 配额上限优先级: 节点级 `storageQuota` (GB) > RuntimeConfig 配置值 > 硬编码默认值
- 默认值: 个人 10GB, 项目 50GB, 资源库 100GB
- `updateNodeStorageQuota`: 占位方法（实际实现在 FileSystemService）

**当前分支状态:** ✅ 完全一致

**结论:** 🔵 意图相同，代码逐行一致。

---

### 2.4 QuotaEnforcementService (`quota-enforcement.service.ts`)

**main 分支能力清单:**
- 上传前配额检查: `checkUploadQuota` — 检查 `remaining < fileSize`，超限抛 `BadRequestException`
- `QuotaExceededError` 结构包含: `code`, `message`, `quotaInfo`(used/total/remaining/usagePercent)
- 超额检查: `isQuotaExceeded` — 返回 boolean
- 超额详情: `getQuotaExceededDetails` — 返回 isExceeded, exceededBy, suggestions
- 建议列表: 删除文件、联系管理员、清理回收站
- `formatSize` 工具: GB/MB/KB 人性化显示

**当前分支状态:** ✅ 完全一致

**结论:** 🔵 意图相同，代码逐行一致。

---

### 2.5 FileDownloadExportService (`file-download-export.service.ts`)

**main 分支能力清单:**
- 单文件下载: `downloadNode` — 含权限检查、文件夹→ZIP下载
- 多格式 CAD 下载: `downloadNodeWithFormat` — MXWEB/DWG/DXF/PDF
- CAD 文件转换: 调用 MxCadService.convertServerFile 实时转换
- PDF 参数支持: width, height, colorPolicy
- 目录 ZIP 下载: `downloadNodeAsZip` — 递归 `addFilesToArchive`
- 下载限制: zipMaxTotalSize, zipMaxFileCount, zipMaxDepth, zipMaxSingleFileSize, zipCompressionLevel
- 文件名清理: `sanitizeFileName` — 处理路径分隔符、控制字符、长度截断
- 临时文件清理: 转换后的临时文件在流 `end`/`error` 时自动删除
- 扩展 MIME 类型映射: 60+ 文件类型
- 权限检查: `checkFileAccess` 通过 `FileSystemPermissionService`
- 延迟导入 MxCadService（通过 ModuleRef 避免循环依赖）

**当前分支差异:**
- 导入路径: `../../mxcad/core/mxcad.service` vs main 的 `../../mxcad/mxcad.service`（目录结构调整）
- 增加更详细的错误日志（如 `获取文件流失败` 附加 `文件路径`）
- `fsPromises.access` 的 catch 中添加了错误信息日志

**结论:** 🔵 意图相同，功能完整。差异为导入路径重构和日志增强。

---

### 2.6 StorageService (`storage.service.ts`)

**main 分支能力清单:**
- `fileExists`: 委托 LocalStorageProvider
- `getFileStream`: 委托 LocalStorageProvider
- `getFileInfo`: 手动 stat + 扩展名 content-type 映射
- `healthCheck`: 目录存在性 + 可写性检查
- `listFiles`: 委托 LocalStorageProvider + startsWith 过滤
- `deleteFile`: 委托 LocalStorageProvider

**当前分支差异（架构重构，非功能变更）:**
- 注入方式: `@Inject(IStorageProvider)` 接口注入 替代直接注入 `LocalStorageProvider`
- `getFileInfo`: 委托 `storageProvider.getMetaData()` 替代手动 stat
- **新增方法**（main 分支存在于 LocalStorageProvider 层，当前提升到 StorageService 统一管理）:
  - `deleteAll`, `copyFile`, `moveFile`, `writeFile`, `writeStream`, `copyFromFs`, `getFile`, `getFileBytes`, `getUrl`, `getProvider`

**结论:** 🔵 意图相同。当前分支将存储操作统一通过 `IStorageProvider` 接口暴露，是对 main 分支中分散在 `LocalStorageProvider` 的直接调用进行的架构提升。功能上 **更完整**（暴露了更多存储操作方法）。

---

### 2.7 StorageCheckService (`storage-check.service.ts`)

**main 分支能力清单:**
- `checkInStorage`: 通过 StorageService.fileExists 检查
- `checkInLocal`: 通过 fs.access 检查
- `checkInAny`: 先本地再存储的级联检查
- `checkInLocalDirectory`: 指定目录下的文件存在检查
- `checkInUploadTemp`: 上传临时目录检查
- `checkInConvertDirectory`: 转换目录检查

**当前分支差异:**
- `checkInLocal` 的 catch 分支添加了 `error` 参数日志（main 分支为空 catch）

**结论:** 🔵 意图相同，仅增强了错误日志。

---

### 2.8 SearchDto (`search.dto.ts`)

**main 分支能力清单:**
- 所有与当前分支相同的 enum 和验证规则

**当前分支差异:**
- 添加了 `@ApiProperty` Swagger 装饰器（增强 API 文档，不影响功能）

**结论:** 🔵 意图相同，增加了 Swagger 文档注解。

---

## 三、前端组件概览

当前分支前端中与搜索/存储/配额相关的组件均基于后端 API 构建，功能完好：

| 组件/模块 | 路径 | 职责 |
|-----------|------|------|
| `useFileSystemSearch` | `hooks/file-system/useFileSystemSearch.ts` | 搜索词管理、分页、页面大小持久化 |
| `FileSystemHeader` | `pages/FileSystemManager/FileSystemHeader.tsx` | 搜索框、工具栏、面包屑、上传按钮 |
| `FileSystemToolbar` | `pages/components/` | 搜索输入、视图切换、多选模式 |
| `useLibraryQuota` | `hooks/library/useLibraryQuota.ts` | 资源库配额弹窗、加载、保存 |
| `UserQuotaModal` | `pages/UserManagement/UserQuotaModal.tsx` | 用户存储配额配置模态框 |
| `Dashboard` | `pages/Dashboard.tsx` | 仪表盘统计卡片（含存储使用概览） |

---

## 四、未确认项 / 需要决策

**无。**

所有后端文件的逻辑意图与 main 分支完全一致。差异仅为：

1. `search.service.ts`: `safeLimit` 安全包装（向后兼容增强）
2. `storage.service.ts`: `IStorageProvider` 接口注入 + 方法集合扩展（架构重构，功能更完整）
3. `storage-check.service.ts`: 错误日志增强
4. `file-download-export.service.ts`: 导入路径重构 + 日志增强
5. `search.dto.ts`: Swagger 文档注解

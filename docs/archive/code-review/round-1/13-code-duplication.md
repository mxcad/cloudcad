# 代码重复审查报告 (Round 1)

> 审查日期：2026-05-08 | 审查范围：packages/backend/src + packages/frontend/src

---

## 1. 函数级重复

### 1.1 完全文件重复：permission.util.ts 与 permission.utils.ts

- **文件路径**: `packages/backend/src/common/utils/permission.util.ts` (287行)
- **文件路径**: `packages/backend/src/common/utils/permission.utils.ts` (287行)
- **重复类型**: 函数 (完全文件级重复)
- **严重程度**: 🔴 严重
- **问题描述**: 两个文件内容逐字完全相同，均定义了 `PermissionContext`、`FieldFilterContext`、`FieldPermissionRule`、`FieldFilterResult`、`ContextRule` 等接口，以及 `isValidPermission`、`getAllPermissions`、`applyFieldFilter`、`createDefaultFieldPermissionRules`、`validateFieldFilterContext` 函数。`roles/roles.service.ts` 从 `permission.utils.ts` 导入 `isValidPermission`。
- **修复建议**: 删除其中一个文件（建议保留 `permission.utils.ts`），将另一个文件中的导入更新为指向保留文件。`permission.util.ts`（单数）无外部导入者，可直接删除。
- **是否需要用户确认**: 是（涉及文件删除）

### 1.2 完全文件重复：validation.decorator.ts 与 validation.decorators.ts

- **文件路径**: `packages/backend/src/common/decorators/validation.decorator.ts` (135行)
- **文件路径**: `packages/backend/src/common/decorators/validation.decorators.ts` (135行)
- **重复类型**: 函数 (完全文件级重复)
- **严重程度**: 🔴 严重
- **问题描述**: 两个文件内容逐字完全相同，均定义了 `IsMatchConstraint` 类、`IsMatch`、`IsStrongPassword`、`IsUsername`、`IsEmailField`、`IsNickname` 装饰器。两者 import 语句、类定义、函数体完全一致。
- **修复建议**: 删除其中一个文件（建议保留 `validation.decorators.ts`），更新引用该文件的导入路径。
- **是否需要用户确认**: 是（涉及文件删除）

### 1.3 后端 node-utils.ts 双份存在且大量重叠

- **文件路径**: `packages/backend/src/common/utils/node-utils.ts` (404行, `NodeUtils` 类)
- **文件路径**: `packages/backend/src/file-system/utils/node-utils.ts` (424行, `NodeUtils` 类)
- **重复类型**: 函数 (类级重复)
- **严重程度**: 🔴 严重
- **问题描述**: 两个文件中存在两个不同的 `NodeUtils` 类，但它们共享大量语义相同的功能：

| 功能 | common/utils/node-utils.ts | file-system/utils/node-utils.ts |
|------|---------------------------|--------------------------------|
| 格式化文件大小 | `formatFileSize(bytes)` (第365行) | `formatFileSize(bytes)` (第378行) — **完全相同逻辑** |
| 扩展名标准化 | `normalizeExtension(extension)` (第237行) | `normalizeExtension(extension)` (第359行) — **完全相同逻辑** |
| 提取扩展名 | `extractExtension(fileName)` (第256行) | `getExtension(filename)` (第244行) — **语义相同** |
| 验证文件哈希 | `isValidFileHash(fileHash)` (第165行) | `isValidFileHash(fileHash)` (第396行) — **完全相同正则** |
| 检查 CAD 文件 | `isSupportedCADFile(extension)` (第338行) | `isCADFile(filename)` (第304行) — 都检查 `.dwg/.dxf` |
| 检查图片文件 | `isSupportedImageFile(extension)` (第348行) | `isImageFile(filename)` (第314行) — 相同扩展名列表 |
| Windows 保留名检查 | 内联正则 (第152行) | `RESERVED_NAMES` 静态属性 (第79行) |
| 验证文件名 | `isValidFileName(fileName)` (第134行) | `validateFileName(filename)` (第164行) — **相同逻辑** |
| 生成唯一文件名 | `generateUniqueFileName(...)` (第284行) | `generateUniqueFileName(...)` (第99行) — **相同逻辑** |

另外 `file-system/utils/` 版本还包含 `SUPPORTED_EXTENSIONS`、`MIME_TYPES`（在 `common/utils/` 中没有），而 `common/utils/` 版本包含 `validateCreateOptions`、`canPerformOperation` 等额外功能。

- **修复建议**: 合并两个类为单一的共享 `NodeUtils` 类，放置于 `common/utils/`。`file-system/utils/node-utils.ts` 应改为从 common 版本导入并仅保留 file-system 特有的扩展功能。
- **是否需要用户确认**: 是（涉及架构调整）

### 1.4 文件名清洗/验证函数多处重复

- **涉及文件**:
  - `packages/backend/src/common/utils/node-utils.ts:134` — `isValidFileName()`
  - `packages/backend/src/file-system/utils/node-utils.ts:164` — `validateFileName()`
  - `packages/backend/src/file-system/utils/node-utils.ts:213` — `sanitizeFileName()`
  - `packages/backend/src/common/utils/file-utils.ts:277` — `validateFilename()`
  - `packages/backend/src/common/utils/file-utils.ts:315` — `sanitizeFilename()`
  - `packages/backend/src/file-system/file-download/file-download-export.service.ts:73` — `sanitizeFileName()`
  - `packages/backend/src/file-system/services/file-download-export.service.ts:76` — `sanitizeFileName()`
  - `packages/backend/src/mxcad/core/mxcad.controller.ts:1742` — `validateFileName()`
  - `packages/frontend/src/utils/fileUtils.ts:214` — `sanitizeFileName()`
  - `packages/frontend/src/utils/fileUtils.ts:223` — `validateFolderName()`
- **重复类型**: 函数
- **严重程度**: 🟡 中等
- **问题描述**: 文件名合法性检查逻辑（如检查非法字符 `<>:"|?*`、控制字符、Windows 保留名 `CON/PRN/AUX/NUL/COM1-9/LPT1-9`、长度限制255）在至少7个不同位置有不同实现。每个实现的细节略有差异（如 `file-utils.ts:FileUtils.validateFilename` 还检查中文/下划线/连字符），但核心逻辑重复。
- **修复建议**: 在后端 `common/utils/` 中创建单一 `FileNameValidator` 工具类，所有模块统一调用。
- **是否需要用户确认**: 否（建议性重构）

### 1.5 isCadFile / isCADFile / CAD 文件检查逻辑重复

- **涉及文件**:
  - `packages/backend/src/common/services/file-extensions.service.ts:79` — `isCadFile()`
  - `packages/backend/src/common/utils/node-utils.ts:338` — `isSupportedCADFile()`
  - `packages/backend/src/file-system/utils/node-utils.ts:304` — `isCADFile()`
  - `packages/backend/src/mxcad/utils/file-type-detector.ts:71` — `isCadFile()`
  - `packages/backend/src/file-system/file-validation.service.ts:263` — 内联 `['.dwg', '.dxf'].includes()`
  - `packages/backend/src/file-system/file-validation/file-validation.service.ts:263` — 内联 `['.dwg', '.dxf'].includes()`
  - `packages/backend/src/public-file/public-file.service.ts:87,184` — 内联 `['.dwg', '.dxf'].includes()`
  - `packages/backend/src/file-system/file-download/file-download-export.service.ts:196,407` — 内联检查
  - `packages/frontend/src/utils/fileUtils.ts:91-95` — `isCadFile()`
  - `packages/frontend/src/utils/fileUtils.ts:176-205` — `isDrawingFile()`, `isBlockFile()`, `isCadFileByName()`
  - `packages/frontend/src/services/mxcadManager/index.ts:934` — 内联扩展名检查
- **重复类型**: 函数
- **严重程度**: 🟡 中等
- **问题描述**: 判断文件是否为 CAD 文件（`.dwg`, `.dxf`）的逻辑在至少11个不同位置有实现，部分带附加扩展名（`.mxweb`, `.mxwbe`, `.dwt`）。`isDwgFile` / `isCadFile` / `isCADFile` 函数名不一致。
- **修复建议**: 前端已有的 `fileUtils.ts` 中已聚合了大部分函数。建议在 `common/services/file-extensions.service.ts` 中统一后端所有 CAD/图片/文档类型检查，其他模块注入该服务使用。
- **是否需要用户确认**: 否（建议性重构）

### 1.6 相对时间 / 日期格式化函数重复

- **文件路径**: `packages/frontend/src/utils/dateUtils.ts:71-92` — `getRelativeTime()`
- **文件路径**: `packages/frontend/src/utils/fileUtils.ts:63-89` — `formatRelativeTime()`
- **重复类型**: 函数
- **严重程度**: 🟡 中等
- **问题描述**: 两个函数语义几乎完全一致——计算与当前时间的差值并返回"刚刚/N分钟前/N小时前/N天前"。`fileUtils.ts` 版本更丰富（支持"昨天/周前/月前/年前"），`dateUtils.ts` 版本更简洁（30天内用天前，超过30天直接格式化日期）。两函数返回的粒度不同，但核心计算逻辑相同。
- **修复建议**: 将 `fileUtils.ts` 中的 `formatRelativeTime` 合并到 `dateUtils.ts`，`fileUtils.ts` 改为从 `dateUtils.ts` 导入。
- **是否需要用户确认**: 否

### 1.7 formatDate 函数重复定义

- **文件路径**: `packages/frontend/src/utils/dateUtils.ts:38-50` — `formatDate()`
- **文件路径**: `packages/frontend/src/utils/fileUtils.ts:49-58` — `formatDate()`
- **重复类型**: 函数
- **严重程度**: 🟡 中等
- **问题描述**: `dateUtils.ts` 中的 `formatDate` 格式化为 `yyyy/MM/dd`（仅日期），`fileUtils.ts` 中的 `formatDate` 格式化为 `yyyy/MM/dd HH:mm`（日期+时间）。`fileUtils.ts` 的版本实际与 `dateUtils.ts` 的 `formatDateTime` 语义相同。
- **修复建议**: `fileUtils.ts` 中的 `formatDate` 应改名为 `formatDateTime` 或直接使用 `dateUtils.ts` 的 `formatDateTime`。
- **是否需要用户确认**: 否

### 1.8 formatFileSize 函数重复

- **文件路径**: `packages/backend/src/common/utils/node-utils.ts:365` — `NodeUtils.formatFileSize()`
- **文件路径**: `packages/backend/src/file-system/utils/node-utils.ts:378` — `NodeUtils.formatFileSize()`
- **文件路径**: `packages/frontend/src/utils/fileUtils.ts:16-24` — `formatFileSize()`
- **重复类型**: 函数
- **严重程度**: 🟡 中等
- **问题描述**: 三个位置均实现了相同的逻辑——将字节数格式化为 `B/KB/MB/GB`。后端两个版本逻辑完全一致，前端版本语法略有差异但功能等价。
- **修复建议**: 后端两个 `node-utils.ts` 合并后自然消除。前端后端因平台不同可保留各自实现，无需跨栈统一。
- **是否需要用户确认**: 否

---

## 2. 组件级重复

### 2.1 Loading Spinner 内联 CSS 重复

- **文件路径**: `packages/frontend/src/components/CategoryTabs.tsx:228,293` — `<div className={styles.loadingSpinner} />`
- **文件路径**: `packages/frontend/src/components/CollaborateSidebar.tsx:295` — `<div className={styles.loadingSpinner} />`
- **重复类型**: 组件
- **严重程度**: 🟢 低
- **问题描述**: 两个组件各自通过 CSS Module 定义了 loading spinner，使用相同的 JSX 模式。虽然 `components/ui/` 目录下有 10 个基础 UI 组件（Button, Modal, Toast 等），但没有独立的 `LoadingSpinner` 组件。
- **修复建议**: 在 `components/ui/` 下创建 `LoadingSpinner.tsx`，统一 spinner 样式和行为，然后在 `CategoryTabs`、`CollaborateSidebar` 等组件中使用。
- **是否需要用户确认**: 否

### 2.2 Empty State 模式重复

- **涉及文件**: 多处页面和组件中使用 `<div>暂无数据</div>` 或类似的空状态 UI
- **重复类型**: 组件
- **严重程度**: 🟢 低
- **问题描述**: 多个列表/表格页面中空数据状态的 UI 未抽取为通用 `EmptyState` 组件。
- **修复建议**: 在 `components/ui/` 下创建 `EmptyState.tsx`，统一空数据状态的图标、文字、操作按钮样式。
- **是否需要用户确认**: 否

---

## 3. DTO/类型重复

### 3.1 file-validation.service.ts 文件重复

- **文件路径**: `packages/backend/src/file-system/file-validation.service.ts`
- **文件路径**: `packages/backend/src/file-system/file-validation/file-validation.service.ts`
- **重复类型**: 类型/文件
- **严重程度**: 🔴 严重
- **问题描述**: 同一 service 在 `file-system/` 下存在两份完全相同的实现（含对应的 `.spec.ts` 测试文件也重复）。两个文件包含相同的 CAD 扩展名检查逻辑、MIME 类型映射、文件验证规则。
- **修复建议**: 删除 `file-system/file-validation.service.ts`（扁平化版本），统一使用 `file-system/file-validation/` 子目录版本。同时删除重复的测试文件 `file-system/file-validation.service.spec.ts`。
- **是否需要用户确认**: 是（涉及文件删除）

### 3.2 file-download-export.service.ts 重复

- **文件路径**: `packages/backend/src/file-system/file-download/file-download-export.service.ts`
- **文件路径**: `packages/backend/src/file-system/services/file-download-export.service.ts`
- **重复类型**: 类型/文件
- **严重程度**: 🔴 严重
- **问题描述**: 同一 service 在 `file-system/` 下存在两份几乎相同的实现，均包含 `sanitizeFileName`、CAD 文件检测、MIME 类型映射等逻辑。
- **修复建议**: 确定一个版本为规范来源，删除另一个。与服务目录结构重构一并处理。
- **是否需要用户确认**: 是（涉及文件删除）

### 3.3 前后端验证规则重复

- **文件路径**: `packages/frontend/src/utils/validation.ts:6-24` — `ValidationRules` 常量
- **文件路径**: `packages/backend/src/common/decorators/validation.decorators.ts:68-134` — `IsStrongPassword`, `IsUsername`, `IsEmailField`, `IsNickname` 装饰器
- **重复类型**: 类型
- **严重程度**: 🟢 低
- **问题描述**: 前端的 `ValidationRules`（email/isEmail、username/minLength:3/maxLength:20/pattern、password/minLength:8/maxLength:50、nickname/maxLength:50）与后端 class-validator 装饰器中的约束完全一致。前后端各维护自己的验证规则副本。
- **修复建议**: 这是前后端分离架构的正常现象——前后端需要各自独立验证。但建议在 `apiConfig.ts` 或共享常量文件中集中定义这些业务规则常量，避免分散。当前影响不大，可保持现状。
- **是否需要用户确认**: 否

---

## 4. Service 层重复

### 4.1 CAD 文件扩展名硬编码应统一来源

- **重复类型**: 模式
- **严重程度**: 🟡 中等
- **问题描述**: CAD 文件扩展名 `.dwg`, `.dxf` 在后续端至少 20+ 个位置以数组字面量硬编码（如 `['.dwg', '.dxf']`），而非引用统一的常量或服务。涉及：
  - `file-download-export.service.ts` (多处)
  - `public-file.service.ts` (多处)
  - `file-merge.service.ts` (多处)
  - `external-reference-update.service.ts`
  - `mxcad.controller.ts`
  - `configuration.ts`
  - 多个 DTO 的 `@ApiProperty` 装饰器 `example` 字段
  - 多个测试文件

**已有统一来源但未被充分使用**:
  - `common/services/file-extensions.service.ts` 已定义 `cadExtensions` getter + `isCadFile()` 方法
  - `mxcad/constants/storage.constants.ts` 已定义 `ALLOWED_CAD_EXTENSIONS`
  - `mxcad/utils/file-type-detector.ts` 已定义 `CAD_EXTENSIONS`

- **修复建议**: 所有模块应注入 `FileExtensionsService` 或引用 `StorageConstants.ALLOWED_CAD_EXTENSIONS`，而非各自内联硬编码数组。
- **是否需要用户确认**: 否（建议性重构）

### 4.2 MIME 类型映射重复

- **涉及文件**:
  - `packages/backend/src/common/utils/node-utils.ts` (无 MIME 映射，但 `file-system/utils/node-utils.ts` 有)
  - `packages/backend/src/file-system/utils/node-utils.ts:50-76` — `MIME_TYPES` 静态映射
  - `packages/backend/src/file-system/file-download/file-download-export.service.ts:485-486` — 内联 `{dwg: 'application/acad', dxf: 'application/dxf'}`
  - `packages/backend/src/file-system/services/file-download-export.service.ts:504-505` — 同上
  - `packages/backend/src/mxcad/core/mxcad.controller.ts:1158` — 内联 `{'.dwg': 'application/dwg', '.dxf': 'application/dxf'}`
  - `packages/backend/src/mxcad/core/mxcad-file-handler.service.ts:145-146` — 内联
  - `packages/backend/src/mxcad/external-ref/external-reference-handler.service.ts:260-261` — 内联
- **重复类型**: 模式
- **严重程度**: 🟡 中等
- **问题描述**: DWG/DXF 的 MIME 类型在至少5个不同文件中以不同方式定义——有的是 `application/acad`，有的是 `application/dwg`，不一致。
- **修复建议**: 在 `common/constants/` 中创建统一的 MIME 类型常量映射，所有模块引用。
- **是否需要用户确认**: 否

### 4.3 权限检查模式重复

- **涉及文件**:
  - `packages/frontend/src/utils/permissionUtils.ts` — `canEditNode`, `canDeleteNode`, `canManageNodeMembers`, `canViewNode`, `canManageNodeRoles`
  - `packages/backend/src/roles/project-permission.service.ts` — `checkProjectPermission`
  - `packages/backend/src/roles/providers/prisma-permission-store.ts` — `checkProjectPermission`
- **重复类型**: 模式
- **严重程度**: 🟢 低
- **问题描述**: 前端的 `canEditNode`/`canDeleteNode`/`canManageNodeMembers`/`canManageNodeRoles` 四个函数具有相同的结构模式（检查 user、调用 `checkProjectPermission`、捕获错误），仅 `permission` 查询参数不同。可以抽象为 `checkNodePermission(user, nodeId, permission)` 公共函数。
- **修复建议**: 前端 `permissionUtils.ts` 中的四个函数可以简化为一个带参数的通用函数；不过当前写法 API 更清晰，可保持现状。
- **是否需要用户确认**: 否

---

## 5. 常量/配置重复

### 5.1 CAD 扩展名常量多处定义

- **涉及文件及常量名**:
  - `packages/frontend/src/config/apiConfig.ts:72` — `CAD_EXTENSIONS: ['.dwg', '.dxf']`
  - `packages/frontend/src/components/ProjectDrawingsPanel/constants.ts:10` — `DRAWING_EXTENSIONS: ['.dwg', '.dxf', '.dwt']`
  - `packages/frontend/src/utils/fileUtils.ts:166` — `DRAWING_EXTENSIONS: ['.dwg', '.dxf', '.dwt']`
  - `packages/frontend/src/utils/fileUtils.ts:169` — `BLOCK_EXTENSIONS: ['.dwg', '.dxf', '.dwt', '.blk']`
  - `packages/frontend/src/services/mxcadManager/mxcadTypes.ts:117` — `ALLOWED_EXTENSIONS: '.dwg,.dxf,.dwt,.mxweb,.mxwbe'`
  - `packages/backend/src/mxcad/constants/storage.constants.ts:31` — `ALLOWED_CAD_EXTENSIONS: ['.dwg', '.dxf']`
  - `packages/backend/src/common/services/file-extensions.service.ts:30` — `cadExtensions` getter
- **重复类型**: 常量
- **严重程度**: 🟡 中等
- **问题描述**: CAD 扩展名列表在前后端共7处定义，值不完全一致（有些含 `.dwt`，有些含 `.mxweb`/`.mxwbe`）。
- **修复建议**:
  - 前端：`apiConfig.ts` 和 `ProjectDrawingsPanel/constants.ts` 应统一引用 `fileUtils.ts` 中的常量。
  - 后端：所有模块引用 `file-extensions.service.ts` 或 `storage.constants.ts`。
  - 注意不同上下文的扩展名集合确实有语义差异，应明确区分"纯 CAD 文件"（`.dwg`, `.dxf`）与"MxCAD 支持的文件"（`.dwg`, `.dxf`, `.mxweb`, `.mxwbe`）。
- **是否需要用户确认**: 否

### 5.2 图片扩展名常量重复

- **涉及文件**:
  - `packages/frontend/src/utils/fileUtils.ts:98-99` — 内联 `['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']`
  - `packages/frontend/src/utils/fileUtils.ts:118` — 同上图片扩展名
  - `packages/backend/src/common/utils/node-utils.ts:349-356` — 内联图片扩展名
  - `packages/backend/src/file-system/utils/node-utils.ts:315-317` — 内联图片扩展名
  - `packages/backend/src/common/services/file-extensions.service.ts:85` — `isImageFile()`
- **重复类型**: 常量
- **严重程度**: 🟢 低
- **问题描述**: 图片扩展名列表在前后端多处内联定义，应提取为常量。
- **修复建议**: 提取为命名常量。
- **是否需要用户确认**: 否

---

## 6. 工具函数复用检查

### 6.1 前端 utils/ 函数使用情况

| 文件 | 主要导出 | 是否被外部使用 |
|------|---------|--------------|
| `dateUtils.ts` | `formatDateTime`, `formatDate`, `formatTime`, `getRelativeTime` | ✅ 被多处使用 |
| `fileUtils.ts` | `formatFileSize`, `getFileIcon`, `formatDate` (重名!), `formatRelativeTime`, `isCadFile`, etc. | ✅ 被 filesystemUtils.ts re-export，多处使用 |
| `validation.ts` | `ValidationRules`, `validateField`, `validateRegisterForm` | ✅ 被注册页面使用 |
| `permissionUtils.ts` | `canView`, `hasNodePermission`, `canEditNode`, etc. | ✅ 被文件系统相关页面使用 |
| `errorHandler.ts` | `handleError`, `handleApiError`, `isAbortError`, etc. | ✅ 被多处页面/组件使用 |
| `filesystemUtils.ts` | `getStatusText`, `getStatusStyle` + re-export | ✅ 从 fileUtils re-export |
| `hashUtils.ts` | 未读，需确认 | 未知 |
| `tokenUtils.ts` | 未读，需确认 | 未知 |
| `libraryApi.ts` | 未读，需确认 | 未知 |
| `loadingUtils.ts` | 未读，需确认 | 未知 |
| `authCheck.ts` | 未读，需确认 | 未知 |
| `cleanConsole.ts` | 未读，需确认 | 未知 |
| `uppyUploadUtils.ts` | 未读，需确认 | 未知 |
| `wechat-auth-result.ts` | 未读，需确认 | 未知 |
| `mxcadUtils.ts` | 未读，需确认 | 未知 |

**潜在问题**: `fileUtils.ts` 中的 `formatDate` 与 `dateUtils.ts` 中的 `formatDate` 同名但语义不同；`fileUtils.ts` 从 `dateUtils.ts` 的导入路径不存在于当前 `fileUtils.ts` 文件的 import 中，说明 `filesystemUtils.ts` 从 `fileUtils.ts` re-export `formatDate` 时实际拿到的可能是 `fileUtils.ts` 自己定义的 `formatDate`，而不是 `dateUtils.ts` 的版本——这造成了 API 混淆。

### 6.2 后端 common/utils/ 函数使用情况

| 文件 | 主要导出 | 是否被外部使用 |
|------|---------|--------------|
| `permission.util.ts` | `isValidPermission`、`getAllPermissions`、`applyFieldFilter` 等 | ⚠️ 与 `permission.utils.ts` 完全重复 |
| `permission.utils.ts` | 同上 | ✅ 被 `roles/roles.service.ts` 使用 |
| `node-utils.ts` | `NodeUtils` 类（验证、格式化、文件类型检测） | ✅ 被多处使用 |
| `file-utils.ts` | `FileUtils` 类（文件/目录 CRUD） | ✅ 被文件系统模块使用 |

---

## 总结

### 严重程度分布

| 严重程度 | 数量 | 问题项 |
|---------|------|--------|
| 🔴 严重 | 5 | permission.util.ts 重复、validation.decorator 重复、node-utils.ts 双份、file-validation.service 重复、file-download-export.service 重复 |
| 🟡 中等 | 8 | 文件名验证重复、CAD 检查重复、相对时间重复、formatDate 重复、formatFileSize 重复、CAD 扩展名硬编码、MIME 映射重复、CAD 扩展名常量重复 |
| 🟢 低 | 5 | LoadingSpinner 重复、EmptyState 重复、前后端验证规则重复、权限检查模式重复、图片扩展名常量重复 |

### 修复优先级建议

1. **P0 (立即)**: 删除 `permission.util.ts` 和 `validation.decorator.ts` — 纯文件级重复，零风险
2. **P1 (短期)**: 合并两个 `node-utils.ts`、删除重复的 `file-validation.service.ts` 和 `file-download-export.service.ts`
3. **P2 (中期)**: 统一 CAD 文件检测函数、文件名验证函数、日期/时间格式化函数
4. **P3 (长期)**: 统一常量定义、创建缺失的通用 UI 组件（LoadingSpinner, EmptyState）

### 修复后预期收益

- 删除约 1,500 行完全重复的代码
- 合并约 800 行语义重复的代码
- 减少未来因多处修改导致的不一致 bug 风险
- 提升新开发者对代码库的理解效率

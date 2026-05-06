# PRD: 拆分 MxCadController 为子控制器

## Problem Statement

`MxCadController`（2372 行，18 个路由）是一个单体控制器，承载了 mxcad 模块下所有 HTTP 接口。虽然 mxcad 模块已经拆分为 10 个子模块（chunk、conversion、external-ref、facade、infra、node、save、upload、core、tus），但 controller 层没有跟进拆分，导致：

- 职责分散：子模块提供了服务，但路由逻辑全在一个 controller 里，阅读代码时需要频繁跳转
- 测试困难：一个 spec 要 mock 10+ 个依赖，且每个路由的测试都混在一起
- 合并冲突：多人同时修改不同路由时，冲突概率高
- 认知负担：2372 行单文件难以快速定位某个路由的实现

## Solution

将 `MxCadController` 按职责域拆分为 6 个子控制器，每个控制器对齐已有的子模块。路由前缀统一保持 `/mxcad`，由 NestJS 的模块系统自动拼接。

## User Stories

1. 作为开发者，我想在 `chunk/` 目录下看到 chunk 相关的路由代码，这样我不需要在 2372 行的 controller 中搜索
2. 作为开发者，我想在 `save/` 目录下看到保存相关的路由代码，这样保存逻辑和上传逻辑不会混在一起
3. 作为开发者，我想每个子控制器只注入它需要的服务，这样我可以清楚地看到每个功能的依赖关系
4. 作为开发者，我想每个子控制器的 spec 文件只测试该控制器的路由，这样测试用例更聚焦、运行更快
5. 作为新加入的开发者，我想通过目录结构就能理解 mxcad 模块的 API 分组，这样我不需要读完整个 controller 才能理解架构
6. 作为开发者，我想在修改 thumbnail 路由时只打开一个 200 行的文件，而不是一个 2372 行的文件
7. 作为开发者，我想每个子控制器有独立的 `@ApiTags` 分组，这样 Swagger 文档按功能分组展示
8. 作为开发者，我想拆分后不影响现有 API 路径和行为，这样前端不需要任何改动
9. 作为开发者，我想公共的辅助方法（如 `buildContextFromRequest`、权限校验）抽取为共享工具，避免在多个 controller 中重复
10. 作为开发者，我想拆分后的控制器仍然使用 `StorageQuotaInterceptor`，这样存储配额限制不丢失

## Implementation Decisions

### 控制器拆分方案

| 子控制器 | 路由 | 所属子模块 | 注入的服务 |
|---|---|---|---|
| `ChunkController` | `files/chunkisExist`、`files/fileisExist`、`files/checkDuplicate` | `MxcadChunkModule` | `MxCadService`、`JwtService` |
| `UploadController` | `files/uploadFiles` | `MxcadUploadModule` | `MxCadService`、`FileConversionService`、`JwtService` |
| `SaveController` | `savemxweb/:nodeId`、`save-as` | `MxcadSaveModule` | `MxCadService`、`SaveAsService`、`MxcadFileHandlerService`、`JwtService` |
| `ExtRefController` | `file/:nodeId/check-reference`、`file/:nodeId/refresh-external-references`、`up_ext_reference_dwg/:nodeId`、`up_ext_reference_image` | `MxcadExternalRefModule` | `MxCadService`、`FileConversionService`、`JwtService` |
| `ThumbnailController` | `thumbnail/:nodeId`（GET、POST） | `MxcadInfraModule` | `MxCadService`、`ThumbnailGenerationService`、`JwtService` |
| `FileServeController` | `file/:nodeId/preloading`、`filesData/*path`、`file/*path`（GET/HEAD）、`files/:storageKey` | `MxcadCoreModule` | `MxCadService`、`FileConversionService`、`MxcadFileHandlerService`、`VersionControlService`、`FileTreeService`、`JwtService` |

### 公共代码提取

- `buildContextFromRequest()` → 提取为 `MxCadRequestContextBuilder` 工具类，放入 `core/` 目录
- `validateTokenAndGetUserId()` → 同上，归入 `MxCadRequestContextBuilder`
- `getAllNodeIdsInProject()`、`getFileSystemNodeByHash()`、`getProjectRootByNodeId()` → 归入 `MxCadRequestContextBuilder`
- `checkFileAccessPermission()` → 归入 `MxCadRequestContextBuilder`
- `cleanupTempFiles()` → 保留在 `UploadController`（仅 upload 使用）
- 预加载数据缓存（`preloadingDataCache`）和历史版本转换锁（`historyConversionLocks`）→ 保留在 `FileServeController`

### 路由前缀

所有子控制器使用 `@Controller('mxcad')` 前缀，与现有路由路径完全一致。前端无需任何改动。

### 模块注册

- `MxCadCoreModule` 注册 `FileServeController`
- `MxCadChunkModule` 注册 `ChunkController`
- `MxcadUploadModule` 注册 `UploadController`
- `MxcadSaveModule` 注册 `SaveController`
- `MxcadExternalRefModule` 注册 `ExtRefController`
- `MxcadInfraModule` 注册 `ThumbnailController`
- `MxcadCoreModule` 不再注册旧的 `MxCadController`

### DTO 和 Swagger

- 所有 DTO 保持不变，继续放在 `dto/` 目录
- 每个子控制器使用独立的 `@ApiTags`，例如 `@ApiTags('MxCAD 分片检查')`、`@ApiTags('MxCAD 文件上传')`、`@ApiTags('MxCAD 图纸保存')` 等
- Swagger 文档将按功能分组展示，比现在的单一 `MxCAD 文件上传与转换` tag 更清晰

### 清理工作

- 删除旧的 `MxCadController` 类
- 删除 `packages/backend/src/mxcad/services/` 目录下的旧文件（已被子模块中的新文件替代）
- 确保 `mxcad.service.ts` 和 `upload.orchestrator.ts` 的导入路径更新为子模块路径

## Testing Decisions

### 测试策略

- 每个子控制器的 spec 文件只测试该控制器的路由处理逻辑
- 公共工具类 `MxCadRequestContextBuilder` 单独测试
- 使用 NestJS 的 `Test.createTestingModule()` 创建测试模块
- Mock 所有注入的服务，不测试服务内部逻辑

### 测试覆盖

| 测试文件 | 覆盖范围 |
|---|---|
| `chunk.controller.spec.ts` | 3 个路由：chunkisExist、fileisExist、checkDuplicate |
| `upload.controller.spec.ts` | 1 个路由：uploadFiles |
| `save.controller.spec.ts` | 2 个路由：savemxweb、save-as |
| `ext-ref.controller.spec.ts` | 4 个路由：check-reference、refresh、up_ext_reference_dwg、up_ext_reference_image |
| `thumbnail.controller.spec.ts` | 2 个路由：thumbnail GET、thumbnail POST |
| `file-serve.controller.spec.ts` | 5 个路由：preloading、filesData、file GET/HEAD、files/:storageKey |
| `mxcad-request-context-builder.spec.ts` | 公共工具方法 |

### 参考先例

- 现有的 `mxcad.controller.spec.ts`（430 行）作为测试模式参考
- 每个 spec 遵循现有模式：`beforeEach` 中用 `Test.createTestingModule()` + mock providers

## Out of Scope

- **路由路径变更** — 本次只拆分代码组织，不改变任何 API 路径
- **功能重构** — handler 内部逻辑保持原样，不进行功能增强或 bug 修复
- **前端改动** — 前端调用路径不变
- **`mxcad.service.ts` 的拆分** — 本次只拆 controller，service 层的清理作为后续任务
- **`MxcadController` 的 2372 行逻辑重构** — 仅做结构拆分，不重写 handler 逻辑

## Further Notes

### 风险点

- **DI 顺序**：NestJS 子模块的 controller 注册顺序可能影响 Swagger 文档的展示顺序，但不影响功能
- **拦截器**：`StorageQuotaInterceptor` 需要在每个子控制器上单独声明，或通过 `MxCadCoreModule` 的 `APP_INTERCEPTOR` 全局注册
- **Guard 一致性**：所有路由的 `@UseGuards(JwtAuthGuard, RequireProjectPermissionGuard)` 装饰器需要在每个子控制器中保持一致

### 执行顺序建议

1. 先提取 `MxCadRequestContextBuilder`，跑通测试
2. 逐个拆分控制器，每拆一个跑一次完整测试
3. 最后删除旧 controller 和旧 services 目录

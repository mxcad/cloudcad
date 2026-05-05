# T16 执行报告

**状态**: [x] 成功

## 修改的文件
- `packages/frontend/src/services/filesApi.ts` - 替换 `getApiClient()` 为直接 `@/api-sdk` 导入
- `packages/frontend/src/services/fontsApi.ts` - 替换 `getApiClient()` 为直接 `@/api-sdk` 导入
- `packages/frontend/src/services/auditApi.ts` - 替换 `getApiClient()` 为直接 `@/api-sdk` 导入，移除 `OperationMethods` 类型引用
- `packages/frontend/src/services/versionControlApi.ts` - 替换 `getApiClient()` 为直接 `@/api-sdk` 导入，移除 `OperationMethods` 类型引用
- `packages/frontend/src/services/projectApi.ts` - 替换所有方法为 `@/api-sdk` 导入（`getUserPersonalSpace` 降级为 rejecting stub 因 SDK 和后端均缺少该端点）

## SDK 映射

| 文件 | 旧方法 | 新 SDK 方法 |
|------|--------|-------------|
| filesApi | `getApiClient().FileSystemController_getProjects()` | `fileSystemControllerGetProjects()` |
| filesApi | `getApiClient().FileSystemController_getNode({nodeId})` | `fileSystemControllerGetNode({path:{nodeId}})` |
| filesApi | `getApiClient().FileSystemController_downloadNode({nodeId},null,{responseType:'blob'})` | `fileSystemControllerDownloadNode({path:{nodeId}})` |
| filesApi | `getApiClient().FileSystemController_downloadNodeWithFormat(...)` | `fileSystemControllerDownloadNodeWithFormat(...)` |
| filesApi | `getApiClient().FileSystemController_updateNode({nodeId},data)` | `fileSystemControllerUpdateNode({path:{nodeId},body:data})` |
| filesApi | `getApiClient().FileSystemController_deleteNode(...)` | `fileSystemControllerDeleteNode({path:{nodeId},query:{permanently}})` |
| filesApi | `getApiClient().FileSystemController_createFolder({parentId},data)` | `fileSystemControllerCreateFolder({path:{parentId},body:data})` |
| filesApi | `getApiClient().FileSystemController_moveNode({nodeId},data)` | `fileSystemControllerMoveNode({path:{nodeId},body:data})` |
| filesApi | `getApiClient().FileSystemController_copyNode({nodeId},data)` | `fileSystemControllerCopyNode({path:{nodeId},body:data})` |
| filesApi | `getApiClient().FileSystemController_getRootNode({nodeId})` | `fileSystemControllerGetRootNode({path:{nodeId}})` |
| fontsApi | `getApiClient().FontsController_getFonts({location})` | `fontsControllerGetFonts({query:{location}})` |
| fontsApi | `getApiClient().FontsController_uploadFont(undefined,formData)` | `fontsControllerUploadFont({body:formData})` |
| fontsApi | `getApiClient().FontsController_deleteFont({fileName,target})` | `fontsControllerDeleteFont({path:{fileName},query:{target}})` |
| fontsApi | `getApiClient().FontsController_downloadFont({fileName,location},null,{responseType:'blob'})` | `fontsControllerDownloadFont({path:{fileName},query:{location}})` |
| auditApi | `getApiClient().AuditLogController_findAll(params)` | `auditLogControllerFindAll({query:params})` |
| auditApi | `getApiClient().AuditLogController_findOne({id})` | `auditLogControllerFindOne({path:{id}})` |
| auditApi | `getApiClient().AuditLogController_getStatistics()` | `auditLogControllerGetStatistics()` |
| auditApi | `getApiClient().AuditLogController_cleanupOldLogs(null,{daysToKeep})` | `auditLogControllerCleanupOldLogs({query:{daysToKeep}})` |
| versionControlApi | `getApiClient().VersionControlController_getFileHistory(params)` | `versionControlControllerGetFileHistory({query:params})` |
| versionControlApi | `getApiClient().VersionControlController_getFileContentAtRevision(params)` | `versionControlControllerGetFileContentAtRevision({path:{revision},query})` |
| projectApi | `getApiClient().FileSystemController_getProjects(...)` | `fileSystemControllerGetProjects({query})` |
| projectApi | `getApiClient().FileSystemController_getDeletedProjects(...)` | `fileSystemControllerGetTrash({query})` |
| projectApi | `getApiClient().FileSystemController_createProject(null,data)` | `fileSystemControllerCreateProject({body:data})` |
| projectApi | `getApiClient().FileSystemController_getProject({projectId})` | `fileSystemControllerGetProject({path:{projectId}})` |
| projectApi | `getApiClient().FileSystemController_updateProject({projectId},data)` | `fileSystemControllerUpdateProject({path:{projectId},body:data})` |
| projectApi | `getApiClient().FileSystemController_deleteProject(...)` | `fileSystemControllerDeleteNode({path:{nodeId:projectId},query:{permanently}})` |
| projectApi | `getApiClient().FileSystemController_restoreTrashItems(null,{itemIds})` | `fileSystemControllerRestoreTrashItems({query:{itemIds}})` |
| projectApi | `getApiClient().FileSystemController_getStorageQuota(null)` | `fileSystemControllerGetStorageQuota()` |
| projectApi | `getApiClient().FileSystemController_getStorageQuota({nodeId})` | `fileSystemControllerGetStorageQuota({query:{nodeId}})` |
| projectApi | `getApiClient().FileSystemController_updateStorageQuota(null,{nodeId,quota})` | `fileSystemControllerUpdateStorageQuota({body:{nodeId,quota}})` |
| projectApi | `getApiClient().FileSystemController_getPersonalSpace()` | `fileSystemControllerGetPersonalSpace()` |

## 验证结果
- `pnpm type-check`: 0 errors ✓

## 遗留问题
- `projectApi.getUserPersonalSpace(userId)` 已降级为 rejecting stub（`Promise.reject`），因为 SDK 和后端均缺少该端点。调用方 `SaveAsModal.tsx` 已有 TODO 注释标记。
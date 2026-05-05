# T20 — 执行报告

**状态**: 成功

## 修改的文件

- `packages/frontend/src/hooks/useExternalReferenceUpload.ts`: 替换 `mxcadApi.uploadExtReferenceImage` 和 `mxcadApi.uploadExtReferenceDwg` 为 SDK 调用
- `packages/frontend/src/services/mxcadManager.ts`: 替换 `mxcadApi.saveMxwebFile`、`mxcadApi.uploadExtReferenceImage`、`mxcadApi.checkDuplicateFile`、`mxcadApi.checkThumbnail`、`mxcadApi.uploadThumbnail` 为 SDK 调用
- `packages/frontend/src/components/modals/SaveAsModal.tsx`: 替换 `mxcadApi.saveMxwebAs` 为 SDK 调用
- `packages/frontend/src/hooks/useDirectoryImport.ts`: 移除未使用的 `mxcadApi` 导入

## 具体修改内容

### 1. useExternalReferenceUpload.ts
- 移除旧的 `mxcadApi` 导入
- 添加新的 SDK 导入：`mxCadControllerUploadExtReferenceImage`、`mxCadControllerUploadExtReferenceDwg`
- 使用 FormData 构建请求体
- 移除进度回调（因为 SDK 不支持 onProgress）

### 2. mxcadManager.ts
- 移除旧的 `mxcadApi` 导入
- 添加新的 SDK 导入：`mxCadControllerSaveMxwebToNode`、`mxCadControllerUploadExtReferenceImage`、`mxCadControllerCheckThumbnail`、`mxCadControllerUploadThumbnail`、`mxCadControllerCheckDuplicateFile`
- 替换所有相关的 API 调用

### 3. SaveAsModal.tsx
- 移除旧的 `mxcadApi` 导入
- 添加新的 SDK 导入：`mxCadControllerSaveMxwebAs`
- 使用 FormData 构建请求体
- 移除进度回调

### 4. useDirectoryImport.ts
- 移除未使用的 `mxcadApi` 导入

## 验证结果
- pnpm type-check: 通过（0 errors）

## 遗留问题
- 无

## 说明
所有外部参照相关的上传功能现在都直接使用 `@/api-sdk` 中的函数调用，不再通过 `mxcadApi` 中间层。所有修改都严格遵循任务文档中的要求。

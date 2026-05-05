# T17 — API Services Migration (Batch 3): Library + PublicFile + Delete Bridge

## Dependency: T15 + T16 must complete first (libraryApi depends on mxcadApi being gone)

## Files to modify

- `D:\project\cloudcad\packages\frontend\src\services\libraryApi.ts`
- `D:\project\cloudcad\packages\frontend\src\services\publicFileApi.ts`
- `D:\project\cloudcad\packages\frontend\src\services\mxcadApi.ts` ← DELETE after migration
- `D:\project\cloudcad\packages\frontend\src\services\index.ts` ← update barrel exports

## Instructions

### libraryApi.ts

`libraryApi.ts` uses both `getApiClient()` and `mxcadApi`. Two-step:
1. Replace `getApiClient()` calls with `@/api-sdk` (same as T15/T16)
2. Replace `mxcadApi.checkFileExist`, `mxcadApi.checkChunkExist`, `mxcadApi.uploadChunk` with direct SDK calls

SDK equivalents:
| old | new |
|-----|-----|
| `mxcadApi.checkFileExist(data)` | `mxCadControllerCheckFileExist({ body: data })` |
| `mxcadApi.checkChunkExist(data)` | `mxCadControllerCheckChunkExist({ body: data })` |
| `mxcadApi.uploadChunk(formData)` | `mxCadControllerUploadFile({ body: formDataAsUploadFilesDto })` |

Note: `uploadChunk` receives a pre-built FormData. The SDK `mxCadControllerUploadFile` expects `UploadFilesDto` typed body. You can pass the FormData directly but need to cast. Or reconstruct the object.

### publicFileApi.ts

This file uses raw axios (`getAxiosInstance()`) with direct API paths. Convert to SDK functions:
- `PublicFileController_checkFile` → `publicFileControllerCheckFile`
- `PublicFileController_checkChunk` → `publicFileControllerCheckChunk`
- `PublicFileController_uploadChunk` → `publicFileControllerUploadChunk`
- `PublicFileController_mergeChunks` → `publicFileControllerMergeChunks`
- `PublicFileController_getPreloadingData` → `publicFileControllerGetPreloadingData`
- `PublicFileController_accessFile` → `publicFileControllerAccessFile`

Remove: `AxiosProgressEvent`, `AxiosInstance` imports, `getAxiosInstance` import.

Note: `publicFileApi.uploadChunk` supports `onUploadProgress` callback — the SDK is fetch-based so this will no longer fire. Accept this limitation (will be replaced by Uppy in next phase).

### mxcadApi.ts

This bridge file can be **deleted** after all consumers have been migrated.

### services/index.ts

Remove `export { mxcadApi } from './mxcadApi'` after bridge is deleted.

## Verify

```bash
cd D:\project\cloudcad\packages\frontend && node ./node_modules/typescript/bin/tsc --noEmit 2>&1 | head -30
```

## Report

Write to `D:\project\cloudcad\docs\tasks\reports\T17-report.md`

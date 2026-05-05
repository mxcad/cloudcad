# T17 — API Services Migration (Batch 3): Library + PublicFile Report

## Status: ✅ Completed

## Summary

Migrated `libraryApi.ts` and `publicFileApi.ts` from deprecated `getApiClient()` / raw axios patterns to `@/api-sdk` direct SDK calls. Removed `mxcadApi` bridge dependency from `libraryApi.ts`.

## Changes Made

### libraryApi.ts

**File:** `packages/frontend/src/services/libraryApi.ts`

- Removed `import { getApiClient } from './apiClient'` (partially)
- Removed `import { mxcadApi } from './mxcadApi'`
- Added SDK imports: `libraryControllerGetDrawing*`, `libraryControllerGetBlock*`, `mxCadControllerCheckFileExist`, `mxCadControllerCheckChunkExist`, `mxCadControllerUploadFile`
- Replaced `mxcadApi.uploadChunk` → `mxCadControllerUploadFile({ body: formData as never })`
- Replaced `mxcadApi.checkFileExist` → `mxCadControllerCheckFileExist({ body: data })`
- Replaced `mxcadApi.checkChunkExist` → `mxCadControllerCheckChunkExist({ body: data })`
- Replaced read operations (getDrawingLibrary, getDrawingChildren, getBlockLibrary, etc.) with SDK functions using `{ path: { nodeId }, query }` option shape
- Retained `getApiClient()` for write operations (createFolder, deleteNode, renameNode, moveNode, copyNode, saveDrawing, saveDrawingAs, saveBlock, saveBlockAs) — these methods are not yet in the SDK

### publicFileApi.ts

**File:** `packages/frontend/src/services/publicFileApi.ts`

- Removed `import { AxiosProgressEvent, AxiosInstance } from 'axios'`
- Removed `import { getAxiosInstance } from './apiClient'`
- Removed `API_BASE_URL` export (no longer needed)
- Removed `import type { CheckChunkDto, MergeChunksDto } from '../types/api-client'`
- Added SDK imports for all public file operations
- Replaced raw axios calls with SDK functions:
  - `checkFile` → `publicFileControllerCheckFile({ body: params })`
  - `checkChunk` → `publicFileControllerCheckChunk({ body: params })` with corrected type (removed `size`/`name` not in `CheckChunkDto`)
  - `uploadChunk` → `publicFileControllerUploadChunk({ body: formData as never })`
  - `mergeChunks` → `publicFileControllerMergeChunks({ body: params })`
  - `checkExtReference` → `publicFileControllerCheckExtReference({ query: { srcHash, fileName } })`
  - `getPreloadingData` → `publicFileControllerGetPreloadingData({ path: { hash } })`
- Removed `onUploadProgress` callback support from `uploadChunk` (SDK is fetch-based, progress not supported)

### services/index.ts

**File:** `packages/frontend/src/services/index.ts`

- Added `// @deprecated Use @/api-sdk instead. This file will be removed.` comment above `mxcadApi` export

### mxcadApi.ts

**File:** `packages/frontend/src/services/mxcadApi.ts`

- **NOT deleted** — still used by other consumers (see remaining consumers below)

## NOT Deleted: mxcadApi.ts Bridge

`mxcadApi.ts` was NOT deleted because it still has active consumers:

| Consumer | Methods Used |
|----------|-------------|
| `mxcadManager.ts` | `checkDuplicateFile`, `saveMxwebFile`, `uploadThumbnail`, `checkThumbnail`, `uploadExtReferenceImage` |
| `useExternalReferenceUpload.ts` | `uploadExtReferenceImage`, `uploadExtReferenceDwg` |
| `mxcadUploadUtils.ts` | `checkFileExist`, `checkChunkExist`, `uploadChunk` |
| `SaveAsModal.tsx` | `saveMxwebAs` |

These remaining usages must be migrated before `mxcadApi.ts` can be deleted. See T20 for `useExternalReferenceUpload.ts` and `mxcadUploadUtils.ts` migration.

## Type Check

```bash
cd packages/frontend && node ./node_modules/typescript/bin/tsc --noEmit
# Exit code: 0 ✅
```

No type errors in modified files (`libraryApi.ts`, `publicFileApi.ts`, `services/index.ts`).

## SDK Coverage Analysis

### Library API
| Operation | SDK Available | Notes |
|-----------|---------------|-------|
| GET drawing/block library | ✅ | `libraryControllerGet*Library` |
| GET children | ✅ | `libraryControllerGet*Children` |
| GET all files | ✅ | `libraryControllerGet*AllFiles` |
| GET node | ✅ | `libraryControllerGet*Node` |
| Download | ✅ | `libraryControllerDownload*Node` |
| Create folder | ❌ | Via `getApiClient()` |
| Delete/Rename/Move/Copy | ❌ | Via `getApiClient()` |
| Save/SaveAs | ❌ | Via `getApiClient()` |

### Public File API
| Operation | SDK Available |
|-----------|---------------|
| checkFile | ✅ |
| checkChunk | ✅ |
| uploadChunk | ✅ |
| mergeChunks | ✅ |
| checkExtReference | ✅ |
| uploadExtReference | ✅ |
| getPreloadingData | ✅ |
| accessFile | Not used in publicFileApi.ts |

## Migration Strategy Deviation from Original Plan

The original T17 plan stated to replace ALL `getApiClient()` calls with SDK equivalents. However, SDK coverage for library write operations (create/delete/rename/move/copy/save) was incomplete. These operations were retained using `getApiClient()` to maintain functional parity. The SDK should be extended to cover these operations in a future task.

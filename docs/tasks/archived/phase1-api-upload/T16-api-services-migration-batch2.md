# T16 — API Services Migration (Batch 2): Files + Fonts + Audit + Version + Project

## Dependency: None (gate task, can run in parallel with T15)

## Files to modify

- `D:\project\cloudcad\packages\frontend\src\services\filesApi.ts`
- `D:\project\cloudcad\packages\frontend\src\services\fontsApi.ts`
- `D:\project\cloudcad\packages\frontend\src\services\auditApi.ts`
- `D:\project\cloudcad\packages\frontend\src\services\versionControlApi.ts`
- `D:\project\cloudcad\packages\frontend\src\services\projectApi.ts`

## Instructions

Same as T15: replace `getApiClient()` with direct `@/api-sdk` imports.

Key differences:
- `filesApi.ts` downloads blobs → SDK supports `{ responseType: 'blob' }` via `parseAs: 'blob'` option
- `auditApi.ts` uses `OperationMethods` type → remove, not needed
- `projectApi.ts` has local DTO interfaces → keep those

## SDK Mapping

| File | Old | New |
|------|-----|-----|
| filesApi | `getApiClient().FileSystemController_getProjects()` | `import { fileSystemControllerGetProjects } from '@/api-sdk'` → `const { data } = await fileSystemControllerGetProjects()` |
| fontsApi | `getApiClient().FontsController_getFonts(params)` | `fontsControllerGetFonts({ query: params })` |
| auditApi | `getApiClient().AuditLogController_findAll(params)` | `auditLogControllerFindAll({ query: params })` |
| versionControlApi | `getApiClient().VersionControlController_getFileHistory(params)` | `versionControlControllerGetFileHistory({ query: params })` |
| projectApi | `getApiClient().FileSystemController_getProjects()` | `fileSystemControllerGetProjects()` |

Read each file for exact method names and match against SDK exports in `src/api-sdk/index.ts`.

## Verify

```bash
cd D:\project\cloudcad\packages\frontend && node ./node_modules/typescript/bin/tsc --noEmit 2>&1 | head -30
```

## Report

Write to `D:\project\cloudcad\docs\tasks\reports\T16-report.md`

# T19 — LibraryManager: Switch to Uppy Upload

## Dependency: None (Uppy backend is ready)

## Files to modify

- `D:\project\cloudcad\packages\frontend\src\pages\LibraryManager.tsx`

## Instructions

Same as T18. `LibraryManager.tsx` imports `MxCadUploader` and renders it.

Changes:
1. Replace import from `MxCadUploader` to `MxCadUppyUploader`
2. Replace ref type from `MxCadUploaderRef` to `MxCadUppyUploaderRef`
3. Replace rendered `<MxCadUploader>` with `<MxCadUppyUploader>`

## Verify

```bash
cd D:\project\cloudcad\packages\frontend && node ./node_modules/typescript/bin/tsc --noEmit 2>&1 | head -30
```

## Report

Write to `D:\project\cloudcad\docs\tasks\reports\T19-report.md`

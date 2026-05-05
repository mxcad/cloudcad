# T18 — FileSystemManager: Switch to Uppy Upload

## Dependency: None (Uppy backend is ready)

## Files to modify

- `D:\project\cloudcad\packages\frontend\src\pages\FileSystemManager.tsx`

## Instructions

Currently `FileSystemManager.tsx` imports both `MxCadUploader` and `MxCadUppyUploader` but renders `MxCadUploader` (the deprecated one).

Changes:
1. Replace the rendered `<MxCadUploader>` with `<MxCadUppyUploader>`
2. The ref type changes from `MxCadUploaderRef` → `MxCadUppyUploaderRef`
3. Both components have identical props interface — should be drop-in replacement
4. Remove unused import of `MxCadUploader` if no longer referenced elsewhere in the file
5. Remove the `import MxCadUploader` line

## Verify

```bash
cd D:\project\cloudcad\packages\frontend && node ./node_modules/typescript/bin/tsc --noEmit 2>&1 | head -30
```

Check the file renders properly at `import` level (no broken imports).

## Report

Write to `D:\project\cloudcad\docs\tasks\reports\T18-report.md`

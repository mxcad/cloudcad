---
id: T21
phase: 1
group: sequential
depends_on: [T18, T19, T20]
skills: []
files:
  - packages/frontend/src/utils/mxcadUploadUtils.ts
  - packages/frontend/src/hooks/useMxCadUploadNative.ts
  - packages/frontend/src/components/MxCadUploader.tsx
commit_format: "feat: cleanup T21 - {filename}"
---

# T21 — Cleanup Old Upload Code

## Skills
(无特殊需求，删除文件 + 修引用)

## Prompt

复制以下内容发给你的 agent（替换 `{YOUR_AGENT_NAME}`）：

```
{YOUR_AGENT_NAME}，执行 T21。

## 工作目录
D:\project\cloudcad

## 任务
删除旧的自定义上传文件，修复残留引用。

## 必读文件
- 本任务文档：docs/tasks/phase1-api-upload/sequential/T21-cleanup-old-upload-code.md
- 项目规范：CLAUDE.md
- 前端规范：packages/frontend/CLAUDE.md

## 执行规范
1. 只改任务文档列出的文件
2. 每删一个文件验证类型检查
3. 完成后 git commit，消息格式: "feat: cleanup T21 - {文件名}"

## 完成后
写报告到 docs/tasks/reports/T21-report.md
```

---

## Dependency: T18 + T19 + T20 (all upload consumers migrated)

## Files to delete

- `D:\project\cloudcad\packages\frontend\src\utils\mxcadUploadUtils.ts`
- `D:\project\cloudcad\packages\frontend\src\hooks\useMxCadUploadNative.ts`
- `D:\project\cloudcad\packages\frontend\src\components\MxCadUploader.tsx`

## Instructions

1. Delete the three files above
2. After deletion, run type-check to find any remaining references
3. Fix any files that still import from these deleted modules:
   - Check `src/hooks/useDirectoryImport.ts` — may reference `uploadMxCadFile`
   - Check spec files that mock these modules
   - Check `src/pages/FileSystemManager.tsx` — should already import `MxCadUppyUploader` after T18
   - Check `src/pages/LibraryManager.tsx` — should already import `MxCadUppyUploader` after T19

## Verify

```bash
cd packages/frontend && node ./node_modules/typescript/bin/tsc --noEmit 2>&1 | head -30
```

## Report

Write to `docs/tasks/reports/T21-report.md`

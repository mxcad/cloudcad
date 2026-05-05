---
id: T20
phase: 1
group: sequential
depends_on: [T17]
skills: []
files:
  - packages/frontend/src/hooks/useExternalReferenceUpload.ts
  - packages/frontend/src/services/mxcadManager.ts
  - packages/frontend/src/components/modals/SaveAsModal.tsx
  - packages/frontend/src/hooks/useDirectoryImport.ts
commit_format: "feat: migrate T20 - {filename}"
---

# T20 — External Reference Upload: Direct SDK Calls

## Skills
(无特殊需求，直接执行)

## Prompt

复制以下内容发给你的 agent（替换 `{YOUR_AGENT_NAME}`）：

```
{YOUR_AGENT_NAME}，执行 T20。

## 工作目录
D:\project\cloudcad

## 任务
将 4 个文件中 `mxcadApi.xxx` 的调用替换为 `@/api-sdk` 直接调用。

## 必读文件
- 本任务文档：docs/tasks/phase1-api-upload/sequential/T20-ext-ref-upload-uppy.md
- 项目规范：CLAUDE.md
- 前端规范：packages/frontend/CLAUDE.md

## 执行规范
1. 只改任务文档列出的文件，不改其他
2. 只用 @/api-sdk（不要用 getApiClient）
3. 每改一个文件验证类型检查
4. 完成后 git commit，消息格式: "feat: migrate T20 - {文件名} to @/api-sdk"
5. 保留原始版权头

## 完成后
写报告到 docs/tasks/reports/T20-report.md
```

---

## Dependency: T17 (mxcadApi bridge must be deleted)

## Files to modify

- `D:\project\cloudcad\packages\frontend\src\hooks\useExternalReferenceUpload.ts`
- `D:\project\cloudcad\packages\frontend\src\services\mxcadManager.ts`
- `D:\project\cloudcad\packages\frontend\src\components\modals\SaveAsModal.tsx`
- `D:\project\cloudcad\packages\frontend\src\hooks\useDirectoryImport.ts`

## Instructions

These files import `{ mxcadApi } from '../services/mxcadApi'` and call:
- `mxcadApi.uploadExtReferenceImage(file, nodeId, fileName, updatePreloading?, onProgress?)`
- `mxcadApi.saveMxwebFile(blob, nodeId, onProgress?, commitMessage?, expectedTimestamp?)`
- `mxcadApi.saveMxwebAs(...)`
- `mxcadApi.uploadExtReferenceDwg(file, nodeId, fileName, updatePreloading?, onProgress?)`

### For uploadExtReferenceImage / uploadExtReferenceDwg

Replace with direct `@/api-sdk` calls:
```ts
import { mxCadControllerUploadExtReferenceImage, mxCadControllerUploadExtReferenceDwg } from '@/api-sdk';
```

SDK calls are fetch-based — no `onUploadProgress`. Drop progress callbacks.

For `uploadExtReferenceImage`:
```ts
const formData = new FormData();
formData.append('file', file);
formData.append('ext_ref_file', fileName);
formData.append('nodeId', nodeId);
if (updatePreloading) formData.append('updatePreloading', 'true');
await mxCadControllerUploadExtReferenceImage({ body: formData as any });
```

For `uploadExtReferenceDwg`:
```ts
const formData = new FormData();
formData.append('file', file);
formData.append('ext_ref_file', fileName);
if (updatePreloading) formData.append('updatePreloading', 'true');
await mxCadControllerUploadExtReferenceDwg({ path: { nodeId }, body: formData as any });
```

### For saveMxwebFile / saveMxwebAs

Replace with SDK:
```ts
import { mxCadControllerSaveMxwebToNode, mxCadControllerSaveMxwebAs } from '@/api-sdk';
```

`saveMxwebFile(blob, nodeId, onProgress, commitMessage, expectedTimestamp)` → 
```ts
const formData = new FormData();
formData.append('file', blob);
if (commitMessage) formData.append('commitMessage', commitMessage);
if (expectedTimestamp) formData.append('expectedTimestamp', expectedTimestamp);
await mxCadControllerSaveMxwebToNode({ path: { nodeId }, body: formData as any });
```

`saveMxwebAs(mxwebBlob, targetType, targetParentId, projectId, format, onProgress, commitMessage, fileName)` →
```ts
const formData = new FormData();
formData.append('file', mxwebBlob);
formData.append('targetType', targetType);
formData.append('targetParentId', targetParentId);
if (projectId) formData.append('projectId', projectId);
formData.append('format', format);
if (commitMessage) formData.append('commitMessage', commitMessage);
if (fileName) formData.append('fileName', fileName);
await mxCadControllerSaveMxwebAs({ body: formData as any });
```

### For each file:
- Remove `import { mxcadApi } from '../services/mxcadApi'`
- Add `@/api-sdk` imports as needed
- For `useDirectoryImport.ts`: it imports `mxcadApi` but only uses it indirectly via `uploadMxCadFile` — that dependency comes from `mxcadUploadUtils.ts`, not directly. Check actual usage.

## Verify

```bash
cd packages/frontend && node ./node_modules/typescript/bin/tsc --noEmit 2>&1 | head -30
```

## Report

Write to `docs/tasks/reports/T20-report.md`

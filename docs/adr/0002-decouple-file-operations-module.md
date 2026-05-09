# Decouple file-operations module and trim FileSystemService facade

Extract project CRUD and file operations into `file-operations/` module to break circular dependencies in `file-system/`. The original `FileSystemService` (3986 lines) was split into 6 sub-services. This ADR captures what to keep in `FileSystemService` as a facade vs. what to route directly — driven by the split between internal consumers (`FileSystemController`) and external consumers (`library/`, `mxcad/`).

**Considered Options**

1. **Full facade removal — delete `FileSystemService` entirely.** `FileSystemController` and all external consumers inject sub-services directly. Rejected: `mxcad/upload/`, `mxcad/save/`, `library/` call methods that span multiple sub-services (`FileTreeService` + `FileOperationsService` + `FileDownloadExportService`). Full removal would force each external consumer to depend on 3-4 sub-services, spreading coupling.

2. **Keep facade for all consumers (status quo).** `FileSystemController` and external modules both go through `FileSystemService`. Rejected: Controller-only methods are pure pass-throughs (`createProject(…) → this.projectCrudService.createProject(…)`), adding 12 forwarding methods and ~500 lines of noise with zero logic.

3. **Selective facade — Controller injects sub-services directly; external consumers keep using `FileSystemService` (chosen).** Reduces `FileSystemService` from 527 to ~250 lines. `FileSystemController` gains direct access to `ProjectCrudService`, `FileOperationsService`, `FileTreeService`, `FileDownloadExportService`, `ProjectMemberService`, `StorageInfoService`. External modules unchanged.

**Consequences**

- `FileSystemController` no longer depends on `FileSystemService`; injects sub-services directly.
- `updateNodeStorageQuota` (the only method with actual business logic inside `FileSystemService`) moves to `StorageInfoService`, which already has `DatabaseService` injection.
- 12 controller-only forwarding methods removed from `FileSystemService`:
  - `createProject`, `getUserProjects`, `getUserDeletedProjects`, `getPersonalSpace`, `getProject`, `updateProject`, `deleteProject`
  - `getTrashItems`, `restoreTrashItems`, `permanentlyDeleteTrashItems`, `clearTrash`
  - `getProjectTrash`, `restoreNode`, `clearProjectTrash`
  - `createNode`, `createFolder`, `deleteNode`, `updateNode`, `moveNode`, `copyNode`, `generateUniqueName`, `uploadFile`
  - `getNodeTree`, `getRootNode`, `getChildren`, `getAllFilesUnderNode`, `getCategoryTree`, `getNode`
  - `downloadNode`, `downloadNodeWithFormat`, `getFullPath`, `checkFileAccess`, `isLibraryNode`
  - `getProjectMembers`, `addProjectMember`, `updateProjectMember`, `removeProjectMember`, `transferProjectOwnership`, `batchAddProjectMembers`, `batchUpdateProjectMembers`
  - `getUserStorageInfo`, `getNodeStorageQuota`, `updateNodeStorageQuota`
- Methods retained in `FileSystemService` for external consumers:
  - `createFileNode`, `updateNodePath` (mxcad/save, mxcad/upload)
  - `getNode`, `getChildren`, `generateUniqueName`, `deleteNode`, `updateNodePath` (mxcad/upload, file-merge)
  - `getCategoryTree`, `getChildren`, `getAllFilesUnderNode`, `getNodeTree`, `checkFileAccess`, `createFolder`, `deleteNode`, `updateNode`, `moveNode`, `copyNode` (library/)
  - `downloadNode`, `getNode`, `checkFileAccess`, `getFullPath` (file-download)
- Old `packages/backend/src/file-system/services/project-crud.service.ts` (537 lines, zero references) deleted.
- `FileSystemModule` remains as the import target for `app.module.ts`, `mxcad.module.ts`, `library.module.ts`, `version-control.module.ts`, `tus.module.ts`, and test utilities — no breaking module changes.
- Project CRUD and recycle bin API contracts are unchanged from `main`.

**Implementation on `refactor/circular-deps` (2026-05-09 verified):**

Backend changes:

| Change | Detail |
|--------|--------|
| `FileOperationsService` | Moved from `file-system/services/` to `file-operations/`. `moveNode()`, `copyNode()`, `copyNodeRecursive()` logic byte-for-byte identical to main. Added `IStorageProvider` injection for `deleteFileFromStorage` (was direct `fsPromises.rm`). |
| `FileTreeService` | Extracted from `file-system/services/` to `file-system/file-tree/`. `getProjectId()` helper unchanged. |
| `ProjectCrudService` | Extracted from `file-system/services/` to `file-operations/`. |
| `StorageManager` | `copyNodeDirectory()` and `recursiveCopyDirectory()` unchanged (whitespace only diff). |
| Controller | `FileSystemController` now injects sub-services directly. Added `@CsrfProtected()` on move/copy endpoints (security enhancement). |
| Permissions | `FILE_MOVE`/`FILE_COPY` enum values and role assignments unchanged (whitespace only diff). |

Frontend changes:

| Change | Detail |
|--------|--------|
| API layer | Hand-written `services/*Api.ts` → auto-generated `@/api-sdk` (OpenAPI-based). Move/copy call signatures functionally equivalent. |
| Library hooks | `useLibrary.ts` monolithic hook → `useLibraryMutations.ts` (react-query mutations, same API parameters). Added `isMovingNode`/`isCopyingNode` loading states. |
| Project file-system | New `useMoveCopy.ts` hook supporting single and batch move/copy operations. Previously inlined in `FileSystemManager.tsx`. |
| MxCAD manager | `mxcadManager.ts` → `mxcadManager/` sub-modules (check, extRef, save, thumbnail, types). |

Move/copy functional verification (2026-05-09):

| # | Item | Result |
|---|------|--------|
| 1 | API routes (`POST nodes/:nodeId/move`, `POST nodes/:nodeId/copy`) | ✅ Unchanged |
| 2 | Request body (`{ targetParentId }`) | ✅ Unchanged |
| 3 | Backend moveNode logic | ✅ Identical |
| 4 | Backend copyNode + copyNodeRecursive logic | ✅ Identical |
| 5 | Permission guards (`FILE_MOVE`/`FILE_COPY`) | ✅ Identical |
| 6 | Frontend API call parameters | ✅ Functionally equivalent |
| 7 | Frontend post-operation refresh strategy | ✅ Equivalent (invalidateQueries vs manual refresh) |
| 8 | CSRF protection | 🟡 Added (security enhancement) |

No API contract changes. No breaking changes for external consumers (library/, mxcad/).

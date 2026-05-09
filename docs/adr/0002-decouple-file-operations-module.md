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

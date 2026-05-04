# Frontend Refactoring Task Index

**Dispatch order:** Send T00 to one agent first. After T00 completes, dispatch T01–T14 to 14 agents concurrently.

---

## Gating Task (Run First)

| ID | Task | File | Effort |
|----|------|------|--------|
| **T00** | Environment Repair | infrastructure | 30–45 min |

---

## Parallel Tasks (All Concurrent After T00 Completes)

| ID | Task | Files Modified | Est. Effort |
|----|------|---------------|-------------|
| **T01** | `useFileSystemData` API migration | `hooks/file-system/useFileSystemData.ts` + new spec | 45–60 min |
| **T02** | `useFileSystemCRUD` API migration | `hooks/file-system/useFileSystemCRUD.ts` + new spec | 45–60 min |
| **T03** | File-system hooks batch | `useFileSystemDragDrop.ts` + `useFileSystem.ts` + `index.ts` | 30–40 min |
| **T04** | `useProjectPermission` API migration | `hooks/useProjectPermission.ts` + new spec | 25–35 min |
| **T05** | `FileSystemManager` API migration | `pages/FileSystemManager.tsx` + new spec | 45–60 min |
| **T06** | `Dashboard` API migration | `pages/Dashboard.tsx` + new spec | 30–40 min |
| **T07** | `UserManagement` API migration + TDD split | `pages/UserManagement.tsx` → 8 files + tests | 90–120 min |
| **T08** | `LibraryManager` + `CADEditorDirect` migration | 2 page files | 35–45 min |
| **T09** | `ProjectDrawingsPanel` API migration | `components/ProjectDrawingsPanel.tsx` | 40–50 min |
| **T10** | `MembersModal` API migration | `components/modals/MembersModal.tsx` | 30–40 min |
| **T11** | Simple components batch | 5 files: SelectFolderModal, SaveAsModal, Layout, SidebarContainer, ProjectFilterTabs | 25–35 min |
| **T12** | Permission utils + barrel cleanup + delete `projectsApi.ts` | `utils/permissionUtils.ts` + `services/index.ts` + delete `projectsApi.ts` | 30–40 min |
| **T13** | `mxcadManager` API extraction + console cleanup | `services/mxcadManager.ts` + 2 new service files | 60–90 min |
| **T14** | Types & exports cleanup | Remove duplicate Profile exports + verify types | 20–30 min |

---

## Pre-Dispatch Checklist for Each Agent

Each task document in `docs/tasks/` includes step-by-step instructions. Before dispatching, ensure each agent has:

1. **The task document** (e.g., `docs/tasks/T01-useFileSystemData-migration.md`)
2. **The API migration reference** (`docs/tasks/API-MIGRATION-REFERENCE.md`)
3. **Project CLAUDE.md** for context on conventions
4. **Working directory:** `D:\project\cloudcad\packages\frontend`

## Dependency Graph

```
T00 (gating) ──┬── T01
               ├── T02
               ├── T03
               ├── T04
               ├── T05
               ├── T06
               ├── T07
               ├── T08
               ├── T09
               ├── T10
               ├── T11
               ├── T12 (MUST be last API task — deletes projectsApi.ts)
               ├── T13
               └── T14
```

**Note:** T12 deletes `projectsApi.ts`. All other tasks (T01–T11, T13) must complete their migration before T12's deletion, but since each task only modifies its own files (not `projectsApi.ts` itself), they can all run concurrently. T12 simply removes the file after everyone has stopped importing from it.

## Conflict Resolution

If two agents modify the same file (unlikely since each task targets different files), the conflict is trivial to resolve: each agent only changes `import` statements and applies standard rules. Git merge will handle it.

Files that NO two tasks share: each task targets unique files.

## After All Tasks Complete

1. Run `pnpm type-check` — should be 0 errors
2. Run `pnpm test -- --run` — all tests should pass
3. Run `grep -r "projectsApi" src/` — should return zero results
4. Run `grep -r "console\.log\|console\.warn" src/` — should return significantly fewer results (only CAD engine debug logs in mxcadManager.ts)
5. Check `pnpm build` passes

# Migration Task Index

## Task Groups

### Group A: API Service Migration (gate tasks, no dependency between T15+T16)

| ID | Task | Files | Risk |
|----|------|-------|------|
| **T15** | API migration batch 1: auth, users, roles, health, config | 5 service files | Low — each file independent |
| **T16** | API migration batch 2: files, fonts, audit, version, project | 5 service files | Low — each file independent |

**T15 and T16 can run in parallel** — no overlapping files.

### Group B: Post-API cleanup (depends on T15+T16)

| ID | Task | Depends On | Risk |
|----|------|-----------|------|
| **T17** | libraryApi + publicFileApi migration, delete mxcadApi bridge | T15, T16 | Medium — libraryApi imports mxcadApi |

### Group C: Upload migration (no dependency on API group)

| ID | Task | Depends On | Risk |
|----|------|-----------|------|
| **T18** | FileSystemManager → MxCadUppyUploader | None | Low — drop-in component swap |
| **T19** | LibraryManager → MxCadUppyUploader | None | Low — drop-in component swap |
| **T20** | External ref upload → SDK direct calls | T17 (mxcadApi deletion) | Medium — removes mxcadApi dependency |

### Group D: Final cleanup (depends on C)

| ID | Task | Depends On | Risk |
|----|------|-----------|------|
| **T21** | Delete mxcadUploadUtils, useMxCadUploadNative, MxCadUploader | T18, T19, T20 | Low — file deletion + fix references |

## Dependency Graph

```
T15 ──┐
      ├── T17 ──→ T20
T16 ──┘

T18 ──→ T21
T19 ──→ T21
           T20 ──→ T21
```

## Execution Order

**Phase 1** (parallel): T15, T16, T18, T19
**Phase 2** (after T15+T16): T17
**Phase 3** (after T17): T20
**Phase 4** (after T18+T19+T20): T21

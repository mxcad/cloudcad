# T08: `pages/LibraryManager.tsx` + `pages/CADEditorDirect.tsx` — API Migration

**Dependency:** T00 (Environment Repair) must complete first.

**Estimated effort:** 35–45 min

---

## Input Files

1. `packages/frontend/src/pages/LibraryManager.tsx` (~1195 lines)
2. `packages/frontend/src/pages/CADEditorDirect.tsx` (~1325 lines)

## File 1: `LibraryManager.tsx`

### Current Import

```typescript
import { projectsApi } from '../services/projectsApi';
```

### Replace With

```typescript
import { projectApi } from '@/services/projectApi';
```

### Replace API calls

| Old | New |
|-----|-----|
| `projectsApi.getQuota(libraryId)` | `projectApi.getQuota(libraryId)` |
| `projectsApi.updateStorageQuota(libraryId, quota)` | `projectApi.updateStorageQuota(libraryId, quota)` |

### Apply cross-cutting rules

- 4 console calls to clean, catch blocks to fix, imports to `@/`

## File 2: `CADEditorDirect.tsx`

### Current Imports

```typescript
import { projectsApi } from '../services/projectsApi';
// And later in the file (line ~245):
const { projectsApi } = await import('../services/projectsApi');
```

### Replace With

```typescript
import { projectPermissionApi } from '@/services/projectPermissionApi';
// The dynamic import on line ~245 should become:
const { projectPermissionApi } = await import('@/services/projectPermissionApi');
```

Wait — dynamic imports can't use `@/` alias at runtime (they're resolved by the bundler). In Vite, `@/` works in dynamic imports too, so this is fine.

### Replace API calls

| Old | New |
|-----|-----|
| `projectsApi.checkPermission(projectId, 'CAD_SAVE')` | `projectPermissionApi.checkPermission(projectId, 'CAD_SAVE')` |
| `projectsApi.checkPermission(projectId, 'FILE_READ')` | `projectPermissionApi.checkPermission(projectId, 'FILE_READ')` |
| `projectsApi.checkPermission(projectId, 'FILE_CREATE')` | `projectPermissionApi.checkPermission(projectId, 'FILE_CREATE')` |

### Apply cross-cutting rules

- 21 console calls — delete `log`/`warn`, replace `error` with `handleError`
- Fix catch blocks
- Convert remaining imports to `@/`

## Verify

```bash
pnpm type-check
```

---

## Verification Checklist

- [ ] `LibraryManager.tsx`: 3 API calls migrated
- [ ] `CADEditorDirect.tsx`: 3 API calls migrated, dynamic import fixed
- [ ] All cross-cutting rules applied to both files
- [ ] `pnpm type-check` passes (0 errors)

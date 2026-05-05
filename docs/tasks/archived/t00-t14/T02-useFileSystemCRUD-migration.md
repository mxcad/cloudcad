# T02: `hooks/file-system/useFileSystemCRUD.ts` — API Migration

**Dependency:** T00 (Environment Repair) must complete first.

**Estimated effort:** 45–60 min

---

## Input File

`packages/frontend/src/hooks/file-system/useFileSystemCRUD.ts` (~470 lines)

## Current Import

```typescript
import { projectsApi } from '../../services/projectsApi';
```

## What to do

### Step 1: Write a behavior smoke test

Create `packages/frontend/src/hooks/file-system/useFileSystemCRUD.spec.ts`:

- Mock `projectApi`, `nodeApi`, `projectTrashApi`
- Render minimal component that calls the hook
- Verify: create action calls correct API, delete action calls correct API

### Step 2: Replace imports

```typescript
// REMOVE:
import { projectsApi } from '../../services/projectsApi';

// ADD:
import { projectApi } from '@/services/projectApi';
import { nodeApi } from '@/services/nodeApi';
import { projectTrashApi } from '@/services/projectTrashApi';
```

### Step 3: Replace API calls

This file has the most API calls of any file (~14). See `API-MIGRATION-REFERENCE.md`.

| Old | New |
|-----|-----|
| `projectsApi.createFolder(parentId, data)` | `nodeApi.createFolder(parentId, data)` |
| `projectsApi.updateNode(id, data)` | `nodeApi.updateNode(id, data)` |
| `projectsApi.delete(id, permanent)` / `projectsApi.deleteNode(id, permanent)` | `nodeApi.deleteNode(id, permanent)` |
| `projectsApi.create(data)` | `projectApi.create(data)` |
| `projectsApi.restoreProject(id)` / `projectsApi.restoreNode(id)` | `projectApi.restore(id)` / `nodeApi.restoreNode(id)` |
| `projectsApi.clearProjectTrash(id)` | `projectTrashApi.clearProjectTrash(id)` |
| `projectsApi.moveNode(..)` / `projectsApi.copyNode(..)` | `nodeApi.moveNode(..)` / `nodeApi.copyNode(..)` |

### Step 4: Apply cross-cutting rules

- Fix all `catch` blocks to `handleError` pattern
- Delete `console.log`/`console.warn`
- Replace `console.error` with `handleError`
- Convert all imports to `@/` alias
- Group imports properly

### Step 5: Verify

```bash
pnpm test -- --run src/hooks/file-system/useFileSystemCRUD.spec.ts
pnpm type-check
```

---

## Verification Checklist

- [ ] Smoke test written and passing
- [ ] All 14+ API calls migrated correctly
- [ ] No `projectsApi` references remain
- [ ] All cross-cutting rules applied
- [ ] `pnpm type-check` passes

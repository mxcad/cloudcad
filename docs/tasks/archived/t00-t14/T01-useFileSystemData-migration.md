# T01: `hooks/file-system/useFileSystemData.ts` — API Migration

**Dependency:** T00 (Environment Repair) must complete first.

**Estimated effort:** 45–60 min

---

## Input File

`packages/frontend/src/hooks/file-system/useFileSystemData.ts` (~585 lines)

## Current Imports

```typescript
import { projectsApi } from '../../services/projectsApi';
import type { ProjectFilterType } from '../../services/projectsApi';
```

## What to do

### Step 1: Write a behavior smoke test

Create `packages/frontend/src/hooks/file-system/useFileSystemData.spec.ts`:

- Mock the API modules (`projectApi`, `nodeApi`, `searchApi`, `projectTrashApi`) with `vi.mock`
- Render a minimal component that calls the hook
- Verify the hook returns expected shape (loading, data, pagination)
- This is a **smoke test** — it verifies the hook doesn't crash, not full behavioral coverage

### Step 2: Replace imports

```typescript
// REMOVE:
import { projectsApi } from '../../services/projectsApi';
import type { ProjectFilterType } from '../../services/projectsApi';

// ADD (use @/ alias):
import { projectApi } from '@/services/projectApi';
import type { ProjectFilterType } from '@/services/projectApi';
import { nodeApi } from '@/services/nodeApi';
import { searchApi } from '@/services/searchApi';
import { projectTrashApi } from '@/services/projectTrashApi';
```

### Step 3: Replace API calls

See `docs/tasks/API-MIGRATION-REFERENCE.md` for the full mapping. Specific calls in this file:

| Line pattern | Old call | New call |
|-------------|----------|----------|
| `projectsApi.getNode(nodeId, ...)` | projectsApi | `nodeApi.getNode(nodeId, ...)` |
| `projectsApi.getChildren(nodeId, ...)` | projectsApi | `nodeApi.getChildren(nodeId, ...)` |
| `projectsApi.search(keyword, ...)` | projectsApi | `searchApi.search(keyword, ...)` |
| `projectsApi.getProjectTrash(projectId, ...)` | projectsApi | `projectTrashApi.getProjectTrash(projectId, ...)` |
| `projectsApi.getDeleted(filter?, ...)` | projectsApi | `projectApi.getDeleted(filter?, ...)` |
| `projectsApi.list(filter?, ...)` | projectsApi | `projectApi.list(filter?, ...)` |

### Step 4: Apply cross-cutting rules

See `docs/tasks/API-MIGRATION-REFERENCE.md` section "Cross-Cutting Rules":
- Fix `catch` blocks: `catch (error: unknown)` + `handleError(error, 'context')`
- Delete all `console.log`/`console.warn` lines
- Replace `console.error` with `handleError`
- Convert all imports to `@/` alias
- Group imports: React → libraries → services → hooks → types → utils

### Step 5: Verify

```bash
cd D:\project\cloudcad\packages\frontend
pnpm test -- --run src/hooks/file-system/useFileSystemData.spec.ts
pnpm type-check
```

---

## Verification Checklist

- [ ] Smoke test written and passing
- [ ] `projectsApi` import removed
- [ ] New modular imports added with `@/` alias
- [ ] All API calls migrated to new modules
- [ ] No `console.log`/`console.warn` remaining
- [ ] All catch blocks use `handleError`
- [ ] `pnpm type-check` passes (0 errors)

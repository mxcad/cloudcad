# T04: `hooks/useProjectPermission.ts` — API Migration

**Dependency:** T00 (Environment Repair) must complete first.

**Estimated effort:** 25–35 min

---

## Input File

`packages/frontend/src/hooks/useProjectPermission.ts` (~360 lines)

## Current Import

```typescript
import { projectsApi } from '../services/projectsApi';
```

## What to do

### Step 1: Write a smoke test

Create `packages/frontend/src/hooks/useProjectPermission.spec.ts`:

- Mock `projectPermissionApi`
- Render component using the hook
- Verify permission check returns expected structure

### Step 2: Replace imports

```typescript
// REMOVE:
import { projectsApi } from '../services/projectsApi';

// ADD:
import { projectPermissionApi } from '@/services/projectPermissionApi';
```

### Step 3: Replace API calls

| Old | New |
|-----|-----|
| `projectsApi.checkPermission(projectId, permission)` | `projectPermissionApi.checkPermission(projectId, permission)` |
| `projectsApi.getPermissions(projectId)` | `projectPermissionApi.getPermissions(projectId)` |
| `projectsApi.getRole(projectId)` | `projectPermissionApi.getRole(projectId)` |

### Step 4: Apply cross-cutting rules

- Fix catch blocks, clean console, convert to `@/` imports

### Step 5: Verify

```bash
pnpm test -- --run src/hooks/useProjectPermission.spec.ts
pnpm type-check
```

---

## Verification Checklist

- [ ] Smoke test written and passing
- [ ] 4 API calls migrated to `projectPermissionApi`
- [ ] All cross-cutting rules applied
- [ ] `pnpm type-check` passes

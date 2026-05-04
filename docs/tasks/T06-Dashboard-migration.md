# T06: `pages/Dashboard.tsx` — API Migration

**Dependency:** T00 (Environment Repair) must complete first.

**Estimated effort:** 30–40 min

---

## Input File

`packages/frontend/src/pages/Dashboard.tsx` (~655 lines)

## Current Import

```typescript
import { projectsApi } from '../services/projectsApi';
```

## What to do

### Step 1: Write a render smoke test

Create `packages/frontend/src/pages/Dashboard.spec.tsx`:

- Mock `projectApi` and other services
- Mock auth + notification contexts
- Render and verify no crash

### Step 2: Replace imports

```typescript
// REMOVE:
import { projectsApi } from '../services/projectsApi';

// ADD:
import { projectApi } from '@/services/projectApi';
import { nodeApi } from '@/services/nodeApi';
```

### Step 3: Replace API calls

| Old | New |
|-----|-----|
| `projectsApi.create(data)` | `projectApi.create(data)` |
| `projectsApi.list()` | `projectApi.list()` |
| `projectsApi.getPersonalSpace()` | `projectApi.getPersonalSpace()` |
| `projectsApi.getChildren(nodeId, params)` | `nodeApi.getChildren(nodeId, params)` |

Note: `projectsApi.list()` and `projectsApi.getPersonalSpace().catch(() => null)` are called in parallel via `Promise.all`. Just change the module prefix.

### Step 4: Apply cross-cutting rules

- Fix catch blocks, clean console (2 occurrences), convert to `@/` imports

### Step 5: Verify

```bash
pnpm test -- --run src/pages/Dashboard.spec.tsx
pnpm type-check
```

---

## Verification Checklist

- [ ] Render smoke test written and passing
- [ ] 5 API calls migrated
- [ ] All cross-cutting rules applied
- [ ] `pnpm type-check` passes

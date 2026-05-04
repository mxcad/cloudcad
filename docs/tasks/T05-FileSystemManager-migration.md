# T05: `pages/FileSystemManager.tsx` — API Migration

**Dependency:** T00 (Environment Repair) must complete first.

**Estimated effort:** 45–60 min

---

## Input File

`packages/frontend/src/pages/FileSystemManager.tsx` (~1629 lines)

## Current Imports

```typescript
import { projectsApi } from '../services/projectsApi';
import type { ProjectFilterType } from '../services/projectsApi';
```

## What to do

### Step 1: Write a render smoke test

Create `packages/frontend/src/pages/FileSystemManager.spec.tsx`:

- Mock all API services (`projectApi`, `nodeApi`)
- Mock Zustand store (`useFileSystemStore`)
- Mock auth context, router params
- Render the page wrapped in necessary providers
- Verify it renders without crashing

### Step 2: Replace imports

```typescript
// REMOVE:
import { projectsApi } from '../services/projectsApi';
import type { ProjectFilterType } from '../services/projectsApi';

// ADD:
import { projectApi } from '@/services/projectApi';
import type { ProjectFilterType } from '@/services/projectApi';
import { nodeApi } from '@/services/nodeApi';
```

### Step 3: Replace API calls

| Old | New |
|-----|-----|
| `projectsApi.getPersonalSpace()` | `projectApi.getPersonalSpace()` |
| `projectsApi.update(id, data)` | `projectApi.update(id, data)` |
| `projectsApi.create(data)` | `projectApi.create(data)` |
| `projectsApi.moveNode(id, target)` | `nodeApi.moveNode(id, target)` |
| `projectsApi.copyNode(id, target)` | `nodeApi.copyNode(id, target)` |

### Step 4: Apply cross-cutting rules

This file has 10 `console.*` calls (per count). Follow `API-MIGRATION-REFERENCE.md`:
- Fix all catch blocks
- Delete `console.log`/`console.warn`
- Replace `console.error` with `handleError`
- Convert all imports to `@/` alias (this file uses `../` relative imports extensively)

### Step 5: Verify

```bash
pnpm test -- --run src/pages/FileSystemManager.spec.tsx
pnpm type-check
```

---

## Verification Checklist

- [ ] Render smoke test written and passing
- [ ] All 8+ API calls migrated
- [ ] No `console.log`/`console.warn` remaining
- [ ] All catch blocks use `handleError`
- [ ] All imports use `@/` alias
- [ ] `pnpm type-check` passes

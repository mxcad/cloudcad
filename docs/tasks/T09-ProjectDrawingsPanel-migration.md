# T09: `components/ProjectDrawingsPanel.tsx` — API Migration

**Dependency:** T00 (Environment Repair) must complete first.

**Estimated effort:** 40–50 min

---

## Input File

`packages/frontend/src/components/ProjectDrawingsPanel.tsx` (~2605 lines)

**Warning:** This is the largest component in the codebase. This task does ONLY API migration + cross-cutting rules. Do NOT attempt to split this component — structural refactoring is deferred to Phase 2.

## Current Imports

```typescript
import { projectsApi } from '../services/projectsApi';
import type { ProjectFilterType } from '../services/projectsApi';
```

## What to do

### Step 1: Replace imports

```typescript
// REMOVE:
import { projectsApi } from '../services/projectsApi';
import type { ProjectFilterType } from '../services/projectsApi';

// ADD:
import { projectApi } from '@/services/projectApi';
import type { ProjectFilterType } from '@/services/projectApi';
import { nodeApi } from '@/services/nodeApi';
```

### Step 2: Replace API calls

| Old | New |
|-----|-----|
| `projectsApi.list(projectFilter)` | `projectApi.list(projectFilter)` |
| `projectsApi.getChildren(nodeId, params)` | `nodeApi.getChildren(nodeId, params)` |
| `projectsApi.getNode(currentId)` | `nodeApi.getNode(currentId)` |
| `projectsApi.update(id, data)` | `projectApi.update(id, data)` |

### Step 3: Apply cross-cutting rules

This file has 25 `console.*` calls — the highest of any component. This is the main work for this task:

- Delete ALL `console.log(...)` and `console.warn(...)` lines (~20 occurrences)
- Replace `console.error(...)` with `handleError(error, 'ProjectDrawingsPanel: ...')` (~5 occurrences)
- Fix all catch blocks: ensure `catch (error: unknown)` + narrowing
- Convert imports to `@/` alias where possible (this file already uses mostly `../` relative)

### Step 4: Verify

```bash
pnpm type-check
```

---

## Verification Checklist

- [ ] 5 API calls migrated
- [ ] All `console.log`/`console.warn` deleted (~20 lines)
- [ ] All `console.error` replaced with `handleError`
- [ ] All catch blocks fixed
- [ ] `ProjectFilterType` import from `@/services/projectApi`
- [ ] `pnpm type-check` passes (0 errors)

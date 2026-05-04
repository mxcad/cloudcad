# T11: Simple Components Batch — API Migration

**Dependency:** T00 (Environment Repair) must complete first.

**Estimated effort:** 25–35 min

---

## Input Files (5 files, 1–2 API calls each)

1. `packages/frontend/src/components/modals/SelectFolderModal.tsx` — 1 call
2. `packages/frontend/src/components/modals/SaveAsModal.tsx` — 1 call
3. `packages/frontend/src/components/Layout.tsx` — 1 call
4. `packages/frontend/src/components/sidebar/SidebarContainer.tsx` — 1 call
5. `packages/frontend/src/pages/components/ProjectFilterTabs.tsx` — type-only import

## What to do

### File 1: `SelectFolderModal.tsx`

```typescript
// REMOVE: import { projectsApi } from '../../services/projectsApi';
// ADD:    import { nodeApi } from '@/services/nodeApi';
// projectsApi.getChildren(nodeId) → nodeApi.getChildren(nodeId)
```

8 `console.*` calls to clean. Fix catch blocks.

### File 2: `SaveAsModal.tsx`

```typescript
// REMOVE: import { projectsApi } from '../../services/projectsApi';
// ADD:    import { projectApi } from '@/services/projectApi';
// projectsApi.list('all') → projectApi.list('all')
```

5 `console.*` calls to clean. Fix catch blocks.

### File 3: `Layout.tsx`

```typescript
// REMOVE: import { projectsApi } from '../services/projectsApi';
// ADD:    import { projectApi } from '@/services/projectApi';
// projectsApi.getPersonalSpace() → projectApi.getPersonalSpace()
```

### File 4: `SidebarContainer.tsx`

```typescript
// REMOVE: import { projectsApi } from '../../services/projectsApi';
// ADD:    import { projectApi } from '@/services/projectApi';
// projectsApi.list('all') → projectApi.list('all')
```

4 `console.*` calls to clean.

### File 5: `ProjectFilterTabs.tsx`

```typescript
// REMOVE: import type { ProjectFilterType } from '../../services/projectsApi';
// ADD:    import type { ProjectFilterType } from '@/services/projectApi';
```

No API calls, type-only change. No other changes needed.

---

## Verify

```bash
pnpm type-check
```

---

## Verification Checklist

- [ ] All 5 files: `projectsApi` import removed
- [ ] New imports use `@/` alias
- [ ] API calls migrated correctly
- [ ] All `console.log`/`console.warn` deleted from touched files
- [ ] All catch blocks use `handleError` pattern
- [ ] `pnpm type-check` passes (0 errors)

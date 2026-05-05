# T03: File-system hooks batch — API Migration

**Dependency:** T00 (Environment Repair) must complete first.

**Estimated effort:** 30–40 min

---

## Input Files

1. `packages/frontend/src/hooks/file-system/useFileSystemDragDrop.ts` (~70 lines)
2. `packages/frontend/src/hooks/file-system/useFileSystem.ts` (~140 lines)
3. `packages/frontend/src/hooks/file-system/index.ts` (~40 lines)

## What to do

### File 1: `useFileSystemDragDrop.ts`

- Replace: `import { projectsApi } from '../../services/projectsApi'`
- With: `import { nodeApi } from '@/services/nodeApi'`
- Migrate calls: `projectsApi.copyNode(...)` → `nodeApi.copyNode(...)`, `projectsApi.moveNode(...)` → `nodeApi.moveNode(...)`
- Apply cross-cutting rules (error handling, console, `@/` imports)

### File 2: `useFileSystem.ts`

- Replace: `import type { ProjectFilterType } from '../../services/projectsApi'`
- With: `import type { ProjectFilterType } from '@/services/projectApi'`
- Convert all other imports to `@/` alias
- No API call changes needed (only type import)

### File 3: `hooks/file-system/index.ts`

This barrel re-exports hooks from its own directory AND from the parent `hooks/` directory (cross-boundary barrel):

```typescript
// REMOVE these cross-boundary re-exports:
export { useBreadcrumbCollapse } from '../useBreadcrumbCollapse';
export type { UseBreadcrumbCollapseReturn, UseBreadcrumbCollapseOptions } from '../useBreadcrumbCollapse';
export { useFileListPagination } from '../useFileListPagination';
export type { UseFileListPaginationReturn, UseFileListPaginationOptions } from '../useFileListPagination';
export { useFileListSearch } from '../useFileListSearch';
export type { UseFileListSearchReturn, UseFileListSearchOptions } from '../useFileListSearch';
```

These hooks (`useBreadcrumbCollapse`, `useFileListPagination`, `useFileListSearch`) live in `hooks/` — they should be imported directly from there, not re-exported through `hooks/file-system/`.

Search for consumers that import these from `hooks/file-system`:
```bash
grep -r "from.*hooks/file-system" --include="*.ts" --include="*.tsx"
```

For each consumer, change:
```typescript
import { useBreadcrumbCollapse } from '@/hooks/file-system'
// → 
import { useBreadcrumbCollapse } from '@/hooks/useBreadcrumbCollapse'
```

After all consumers updated, remove the cross-boundary re-exports from `index.ts`.

### Step 4: Verify

```bash
pnpm type-check
pnpm test -- --run
```

---

## Verification Checklist

- [ ] `useFileSystemDragDrop.ts`: API migrated, no `projectsApi` references
- [ ] `useFileSystem.ts`: `ProjectFilterType` import fixed
- [ ] `index.ts`: Cross-boundary re-exports removed, consumers updated
- [ ] All cross-cutting rules applied
- [ ] `pnpm type-check` passes

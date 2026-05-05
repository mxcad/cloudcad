# T12: `utils/permissionUtils.ts` + Barrel Cleanup + Delete `projectsApi.ts`

**Dependency:** T00 (Environment Repair) must complete first.

**Estimated effort:** 30–40 min

**IMPORTANT:** This task deletes `projectsApi.ts`. By the time this runs, all other tasks (T01–T11, T13) should have already migrated their imports away from it. Verify this before proceeding.

---

## Part A: `utils/permissionUtils.ts`

File: `packages/frontend/src/utils/permissionUtils.ts` (~250 lines)

This file uses **dynamic `import()`** to load `projectsApi` at 5 call sites, specifically to avoid circular dependencies.

### Step 1: Replace dynamic imports

Each instance follows this pattern:
```typescript
const { projectsApi } = await import('../services/projectsApi');
const response = await projectsApi.checkPermission(nodeId, permission);
```

Replace with:
```typescript
const { projectPermissionApi } = await import('@/services/projectPermissionApi');
const response = await projectPermissionApi.checkPermission(nodeId, permission);
```

Specific call sites (line references approximate):

| Line ~ | Old call | New module |
|--------|----------|------------|
| 87-90 | `projectsApi.getMembers(nodeId)` | `projectMemberApi.getMembers(nodeId)` |
| 130-133 | `projectsApi.checkPermission(...)` | `projectPermissionApi.checkPermission(...)` |
| 161-164 | `projectsApi.checkPermission(...)` | `projectPermissionApi.checkPermission(...)` |
| 192-195 | `projectsApi.checkPermission(...)` | `projectPermissionApi.checkPermission(...)` |
| 242-245 | `projectsApi.checkPermission(...)` | `projectPermissionApi.checkPermission(...)` |

### Step 2: Apply cross-cutting rules

- 5 `console.*` calls to clean
- Fix any catch blocks
- Convert remaining fixed imports to `@/`

## Part B: Update `services/index.ts`

File: `packages/frontend/src/services/index.ts`

```typescript
// REMOVE this line:
export { projectsApi } from './projectsApi';

// ADD (ProjectFilterType re-export for consumers who get it through the barrel):
export type { ProjectFilterType } from './projectApi';
```

## Part C: Delete `projectsApi.ts`

```bash
rm packages/frontend/src/services/projectsApi.ts
```

## Part D: Verify no references remain

```bash
cd D:\project\cloudcad\packages\frontend
grep -r "projectsApi" src/ --include="*.ts" --include="*.tsx"
```

This should return ZERO results. If any remain, find and fix them before proceeding.

---

## Verify

```bash
pnpm type-check
```

---

## Verification Checklist

- [ ] `permissionUtils.ts`: 5 dynamic imports migrated
- [ ] `permissionUtils.ts`: cross-cutting rules applied
- [ ] `services/index.ts`: `projectsApi` export removed, `ProjectFilterType` re-export added
- [ ] `services/projectsApi.ts` deleted
- [ ] `grep -r "projectsApi" src/` returns zero results
- [ ] `pnpm type-check` passes (0 errors)

# T13: `services/mxcadManager.ts` — API Extraction + Error/Console Cleanup

**Dependency:** T00 (Environment Repair) must complete first.

**Estimated effort:** 60–90 min

---

## Input File

`packages/frontend/src/services/mxcadManager.ts` (~3255 lines)

The CAD engine lifecycle manager. This file contains CAD engine management, file operations, API calls, and cache logic all mixed together. This task does a LIGHT split: extract API calls only, leave CAD engine core intact.

## Phase A: Write Contract Tests

Create `packages/frontend/src/services/mxcadManager.spec.ts`:

- Mock the CAD engine (`mxcad-app`) — it's a black box
- Test the API-call portions that will be extracted:
  1. `getPersonalSpace()` call returns personal space data
  2. `checkPermission(projectId, 'CAD_SAVE')` returns permission result
  3. File save flow calls correct API endpoints

These are contract tests — they verify the external behavior doesn't change during extraction.

## Phase B: Replace API Imports

### Current Import

```typescript
import { projectsApi } from './projectsApi';
```

### Replace With

```typescript
import { projectApi } from '@/services/projectApi';
import { projectPermissionApi } from '@/services/projectPermissionApi';
```

### Replace API calls

| Line ~ | Old call | New call |
|--------|----------|----------|
| 989 | `projectsApi.getPersonalSpace()` | `projectApi.getPersonalSpace()` |
| 1955 | `projectsApi.checkPermission(projectId, 'CAD_SAVE')` | `projectPermissionApi.checkPermission(projectId, 'CAD_SAVE')` |
| 1990 | `projectsApi.checkPermission(projectId, 'CAD_SAVE')` | `projectPermissionApi.checkPermission(projectId, 'CAD_SAVE')` |
| 3167 | `projectsApi.getPersonalSpace()` | `projectApi.getPersonalSpace()` |

## Phase C: Extract API Calls to Separate Files

Extract CAD-related API operations into new service files:

### `services/mxcadSaveApi.ts` (~150 lines)

```typescript
import { getApiClient } from '@/services/apiClient';

export const mxcadSaveApi = {
  // CAD file save/load operations that use the API client directly
  // Extract from mxcadManager.ts lines dealing with save/open
};
```

Extract the `saveDrawing`, `openDrawing`, and related API operations from mxcadManager. These are methods that call `getApiClient().MxCadController_*`.

### `services/mxcadPermissionApi.ts` (~50 lines)

```typescript
import { projectPermissionApi } from '@/services/projectPermissionApi';

export const mxcadPermissionApi = {
  checkCadSave: (projectId: string) =>
    projectPermissionApi.checkPermission(projectId, 'CAD_SAVE'),
  checkCadRead: (projectId: string) =>
    projectPermissionApi.checkPermission(projectId, 'FILE_READ'),
};
```

## Phase D: Cross-Cutting Rules

This file has **63 `console.*` calls** — the most in the entire codebase.

### Console cleanup strategy:
- DELETE all `console.log(...)` lines (approximately 40 occurrences)
- DELETE all `console.warn(...)` lines (approximately 10 occurrences)
- For `console.error(...)` (approximately 13 occurrences):
  - CAD engine internal errors (hardware/WebGL failures) → keep as `console.error` (these are the only way to diagnose CAD engine crashes)
  - API call failures → replace with `handleError(error, 'mxcadManager: ...')`
  - File operation failures → replace with `handleError(error, 'mxcadManager: ...')`

### Error handling fix:
- All `catch (error: any)` → `catch (error: unknown)` + narrowing
- All API-related catch blocks → add `handleError(error, 'mxcadManager: context')`
- CAD engine catch blocks → keep error handling as-is (CAD engine errors need special handling)

### Import fix:
- Convert remaining relative imports to `@/` alias where applicable
- Note: `mxcad-app` imports must stay as-is (it's an external npm package)

## Verify

```bash
pnpm test -- --run src/services/mxcadManager.spec.ts
pnpm type-check
```

---

## Verification Checklist

- [ ] Contract tests written and passing
- [ ] 5 `projectsApi` calls migrated to new modules
- [ ] `mxcadSaveApi.ts` created with extracted save/load operations
- [ ] `mxcadPermissionApi.ts` created
- [ ] All `console.log`/`console.warn` deleted
- [ ] API-related `console.error` replaced with `handleError`
- [ ] CAD engine `console.error` preserved (with comment noting why)
- [ ] All `catch (error: any)` fixed to `catch (error: unknown)`
- [ ] `pnpm type-check` passes

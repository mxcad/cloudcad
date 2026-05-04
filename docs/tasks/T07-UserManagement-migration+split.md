# T07: `pages/UserManagement.tsx` — API Migration + TDD Split

**Dependency:** T00 (Environment Repair) must complete first.

**Estimated effort:** 90–120 min (largest task — API migration + full TDD split)

---

## Input File

`packages/frontend/src/pages/UserManagement.tsx` (~2416 lines)

A monolithic CRUD table page: user list, search, pagination, create/edit/delete modals, storage quota management.

## Phase A: API Migration

### Current Import

```typescript
import { projectsApi } from '../services/projectsApi';
```

### Replace With

```typescript
import { projectApi } from '@/services/projectApi';
```

### Replace API calls

| Old | New |
|-----|-----|
| `projectsApi.getUserPersonalSpace(userId)` | `projectApi.getUserPersonalSpace(userId)` |
| `projectsApi.getQuota(personalSpaceId)` | `projectApi.getQuota(personalSpaceId)` |
| `projectsApi.updateStorageQuota(id, quota)` | `projectApi.updateStorageQuota(id, quota)` |

## Phase B: TDD — Write Tests First

Create `packages/frontend/src/pages/UserManagement/UserManagement.spec.tsx`:

**RED phase** — write tests that define expected behavior:
1. **Render smoke test**: renders user list, search bar, pagination
2. **User CRUD**: create user button opens modal, edit opens modal with data, delete shows confirmation
3. **Search**: typing in search filters the user list
4. **useUserCRUD hook**: unit test the extracted hook (create/update/delete operations)
5. **useUserSearch hook**: unit test pagination + search logic

These tests will fail initially (RED) since the components don't exist yet.

## Phase C: Split into Modules

### Target structure:

```
pages/UserManagement/
├── index.tsx                    (~200 lines, assembly layer)
├── UserTable.tsx                (table + pagination display)
├── UserSearchBar.tsx            (search input + role filter)
├── UserModals/
│   ├── CreateUserModal.tsx      (create user form)
│   ├── EditUserModal.tsx        (edit user form)
│   └── DeleteUserConfirm.tsx    (delete confirmation dialog)
├── UserQuotaModal.tsx           (storage quota management)
└── hooks/
    ├── useUserCRUD.ts           (create/update/delete operations)
    └── useUserSearch.ts         (search + filter + pagination logic)
```

### Extraction rules:
- Each extracted file ≤400 lines
- `index.tsx` assembles sub-components, handles route-level concerns only
- Hooks contain ALL business logic (API calls, state management, validation)
- Sub-components receive data via props, emit events via callbacks
- All files use `@/` imports
- All `catch` blocks use `handleError`
- No `console.log`/`console.warn`

## Phase D: GREEN — Make Tests Pass

Implement the extracted components and hooks until all tests pass.

## Phase E: Apply Cross-Cutting Rules

- Fix the 5 existing `console.*` calls in the original file (they'll move to extracted files)
- Ensure all catch blocks use `handleError`
- All imports use `@/`

## Verify

```bash
pnpm test -- --run src/pages/UserManagement/
pnpm type-check
```

---

## Verification Checklist

- [ ] API calls migrated from `projectsApi` to `projectApi`
- [ ] 5 tests written (RED → GREEN)
- [ ] `index.tsx` ≤250 lines (assembly only)
- [ ] Each sub-component ≤400 lines
- [ ] Each hook ≤300 lines
- [ ] All imports use `@/`
- [ ] No `console.log`/`console.warn`
- [ ] All catch blocks use `handleError`
- [ ] `pnpm type-check` passes (0 errors)
- [ ] `pnpm test` passes all tests

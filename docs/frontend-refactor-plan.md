# Frontend Refactoring Plan

## Goal

Full-range refactoring in 3 phases: stability → maintainability → coverage.

## Decisions Summary

| # | Topic | Decision |
|---|-------|----------|
| 1 | Overall goal | D — Full range, phased |
| 2 | mxcadManager (3255 lines) | B — Light split, extract API calls only |
| 3 | Dual-track API layer | A — Delete old `projectsApi.ts`, keep new modular API |
| 4 | Giant page split strategy | C — Hybrid (sub-components + hooks, page becomes assembly layer) |
| 5 | Test strategy | A — TDD: write tests first, then refactor |
| 6 | Pilot file | `UserManagement.tsx` (2416 lines) |
| 7 | Import paths | A — Switch to `@/` alias during refactoring |
| 8 | Error handling | A — Force uniform `handleError()` in refactored files |
| 9 | `console.*` cleanup | B — Delete `log`/`warn`, replace `error` with `handleError` |
| 10 | Execution order | A — Sequential: env → API → mxcadManager → UserManagement |
| 11 | Phase 2 approach | C — Split all 1000+ line files to ≤800, Phase 3 focuses on coverage |
| 12 | Misc items | A — All included in plan |

---

## Cross-Cutting Rules (All Phases)

- **Error handling**: Every catch block in refactored files uses `catch (error: unknown)` + `handleError(error, context)`
- **Console hygiene**: Delete all `console.log`/`console.warn` in touched files. Replace `console.error` with `handleError`
- **Imports**: All new/moved files use `@/` alias. Existing files in the same directory that get touched also switch to `@/`
- **File size**: New files ≤400 lines target, ≤800 lines hard maximum
- **Commit strategy**: One cohesive change per commit

---

## Phase 1 — Foundation + Pilot (~2-3 weeks)

### Step 0: Environment Repair

No tests needed — infrastructure fixes only.

- [x] ~~Regenerate API types:~~ `pnpm generate:api-types` → clear 55 type errors
- [x] ~~Fix vitest setup:~~ create `src/test/setup.ts` (referenced by `vitest.config.ts` but missing)
- [x] ~~Fix vitest `@` alias:~~ change from `./` to `./src` to match tsconfig and vite.config
- [x] Get existing 8 test files passing after setup fix

### Step 1: API Layer Unification (TDD)

Delete old `projectsApi.ts`, migrate all callers to new modular API.

- [x] Find all references to `projectsApi` across the codebase
- [x] For each caller: write behavior test → replace with new modular API → verify test passes → commit
- [x] New modular API targets: `projectApi`, `nodeApi`, `projectMemberApi`, `projectPermissionApi`, `projectTrashApi`
- [x] After all callers migrated: delete `services/projectsApi.ts`
- [x] Re-run `pnpm generate:api-types` and fix any remaining type errors

### Step 2: mxcadManager Light Split

- [x] Write contract tests for API-call portions to be extracted
- [x] Extract API calls from `mxcadManager.ts` (3255 lines) into dedicated service files under `services/`
- [x] Keep CAD engine lifecycle, cache, and event bus in place
- [x] Target: reduce mxcadManager to ~2200 lines, new service files ~800 lines total

### Step 3: UserManagement TDD Split (Pilot)

- [x] Write render smoke test → verify behavior before split
- [x] Split `UserManagement.tsx` (2416 lines) into:

```
pages/UserManagement/
├── index.tsx              (~200 lines, assembly layer)
├── UserTable.tsx          (table + pagination)
├── UserSearchBar.tsx      (search + filters)
├── UserModals/
│   ├── CreateUserModal.tsx
│   ├── EditUserModal.tsx
│   └── DeleteUserModal.tsx
└── hooks/
    ├── useUserCRUD.ts     (all CRUD operations)
    └── useUserSearch.ts   (search + pagination logic)
```

- [x] Write unit tests for extracted hooks
- [x] All new files use `@/` imports
- [x] All catch blocks use `catch (error: unknown)` + `handleError(error, context)`

---

## Phase 2 — Bulk Split (~3-4 weeks)

Split all remaining 1000+ line files to ≤800 lines each. Order: low risk → high risk.

| # | File | Lines | Pattern | Risk |
|---|------|-------|---------|------|
| 1 | `Register.tsx` | 1647 | Forms | Low |
| 2 | `Login.tsx` | 1521 | Forms | Low |
| 3 | `Profile.tsx` | 1296 | Tabs | Low |
| 4 | `FontLibrary.tsx` | 1087 | CRUD table | Low |
| 5 | `RoleManagement.tsx` | 1368 | CRUD table | Low |
| 6 | `RuntimeConfigPage.tsx` | 1119 | Config forms | Low |
| 7 | `SystemMonitorPage.tsx` | 1184 | Dashboard | Medium |
| 8 | `LibraryManager.tsx` | 1195 | File browsing | Medium |
| 9 | `FileSystemManager.tsx` | 1629 | Core file browsing | High |
| 10 | `CADEditorDirect.tsx` | 1325 | CAD overlay | High |
| 11 | `ProjectDrawingsPanel.tsx` | 2605 | CAD sidebar | Highest |

Each file follows the same TDD pattern established in Phase 1 Step 3.

---

## Phase 3 — Test Coverage (~4-6 weeks)

- [x] Target 80% unit test coverage for all extracted hooks and utilities
- [x] Add Playwright E2E tests for 3 critical paths:
  - CAD editing workflow (open → edit → save)
  - File browsing workflow (navigate → create → upload → delete)
  - User management workflow (create → edit → delete user)
- [x] Integrate coverage thresholds into CI

---

## Miscellaneous Items

Included in plan, handled opportunistically during Phase 1/2:

| Item | Work | Phase |
|------|------|-------|
| Duplicate types: `types.ts` vs `types/filesystem.ts` | Merge into `types/filesystem.ts`, deprecate root `types.ts` | Phase 1 |
| Duplicate exports: `pages/components/` vs `pages/Profile/` | Keep one barrel, remove the other | Phase 1 |
| `hooks/file-system/index.ts` cross-boundary barrel | Re-export from correct locations | Phase 1 |
| `index.html` Import Map → external CDN | Let Vite handle, remove CDN dependency | Phase 2 |
| Vitest `@` alias mismatch | Fix to `./src` (in Step 0) | Phase 1 |

---

## Risk Mitigation

- `CADEditorDirect.tsx` and `ProjectDrawingsPanel.tsx` deferred to end of Phase 2 — highest coupling to CAD engine
- `mxcadManager.ts` split is gated by contract tests — no refactoring without passing tests
- All page splits start with render smoke test — catch regressions immediately
- Feature branches per step, merge only after tests pass
- CAD engine (`mxcad-app`) is a black box — never modify its integration surface

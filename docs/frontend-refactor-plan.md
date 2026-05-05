# Frontend Refactoring Plan

## Goal

Full-range refactoring in 3 phases: stability → maintainability → coverage.

## Decisions Summary

> 更新于 2026-05-05 `/grill-with-docs` 对齐会议。新增决策 #13-#20 见下方。

| # | Topic | Decision |
|---|-------|----------|
| 1 | Overall goal | D — Full range, phased |
| 2 | mxcadManager (3255 lines) | B — Light split, extract API calls only；最终目标 → CAD 引擎生命周期与文件操作业务流程完全分离 |
| 3 | API layer | **全部迁移到自动生成 SDK**（`api-sdk/`），删除所有 `services/*Api.ts`。`services/` 仅保留 `mxcadManager/` + `apiClient.ts`。参见 ADR-0001 |
| 4 | Giant page split strategy | C — Hybrid (sub-components + hooks, page becomes assembly layer) |
| 5 | Test strategy | A — TDD: write tests first, then refactor。优先级：hooks 单元测试 → 共享组件渲染测试 → E2E 关键路径 |
| 6 | Pilot file | `UserManagement.tsx` (2416 lines) |
| 7 | Import paths | A — Switch to `@/` alias during refactoring |
| 8 | Error handling | A — Force uniform `handleError()` in refactored files。时机：Phase 2 拆分完成后、Phase 3 hooks 封装前 |
| 9 | `console.*` cleanup | B — Delete `log`/`warn`, replace `error` with `handleError` |
| 10 | Execution order | A — Sequential: SDK 全覆盖 → 错误处理统一 → hooks 封装+测试 → 组件复用提取 |
| 11 | Phase 2 approach | C — Split all 1000+ line files to ≤800, Phase 3 focuses on coverage |
| 12 | Misc items | A — All included in plan |
| 13 | Data flow direction | SDK → hooks（唯一数据源）→ store（纯缓存）→ 页面（纯消费）。单向数据流 |
| 14 | Zustand Store 职责 | 3 个 store 保留，但只做纯缓存——不发起 API 请求。数据由 hooks 推入 |
| 15 | Context vs Store 边界 | Context 管注入型配置（用户、主题、权限），Zustand Store 管运行时业务数据。`NotificationContext` 合并到 `notificationStore`。参见 ADR-0002 |
| 16 | 组件复用策略 | B 级——抽取共享业务组件 + zod schema。用已有工具：react-hook-form + zod + shadcn/ui |
| 17 | 表单复用 | 共享 `<UserForm />`、`<RoleForm />` 等业务组件，zod schema 定义一次，所有页面消费 |
| 18 | 表格复用 | 抽取 `<DataTable />` 泛型组件（基于 TanStack Table 或 shadcn DataTable） |
| 19 | 测试执行方式 | TDD 先行，子代理并发写测试。每个 hook/组件的 spec 文件独立，可并行 |
| 20 | 错误处理时机 | 统一 `catch (error: unknown)` + `handleError(error, context)` 在 hooks 层建立前完成，hooks 层直接继承标准 |

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

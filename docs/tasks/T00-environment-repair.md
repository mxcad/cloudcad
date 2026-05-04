# T00: Environment Repair (GATING)

**Dependency:** None — this task must complete before all others.

**Estimated effort:** 30–45 min

---

## What to do

### 1. Regenerate API types

```bash
cd D:\project\cloudcad
pnpm generate:api-types
```

This regenerates `packages/frontend/src/types/api-client.ts` from backend Swagger. Should clear most of the 55 `tsc --noEmit` errors.

After regeneration, run `pnpm type-check` from `packages/frontend`. If errors remain, fix them — these are likely real type mismatches that need code changes (not config changes).

### 2. Fix vitest `@` alias

File: `packages/frontend/vitest.config.ts`, line 20:

```typescript
// CURRENT (WRONG):
'@': path.resolve(__dirname, '.'),

// FIX:
'@': path.resolve(__dirname, './src'),
```

This makes vitest match tsconfig.json and vite.config.ts (both map `@/*` → `./src/*`).

### 3. Clean stale build artifacts

Delete these files from `src/test/` — they are compiled JS output that shouldn't be in source:

```
packages/frontend/src/test/setup.js
packages/frontend/src/test/setup.js.map
packages/frontend/src/test/setup.d.ts
packages/frontend/src/test/setup.d.ts.map
```

Keep `setup.ts` — it's the real source file.

### 4. Remove unused root `types.ts`

File `packages/frontend/types.ts` has zero consumers (search confirmed). Delete it.

Its types (`FileNode`, `Library`, `Asset`, `Role`, `FileType`) are either already defined in `src/types/filesystem.ts` or unused. The `User` re-export from `api-client` is unused.

### 5. Get existing tests passing

```bash
cd D:\project\cloudcad\packages\frontend
pnpm test -- --run
```

Four spec files exist:
- `src/hooks/useExternalReferenceUpload.integration.spec.ts`
- `src/hooks/useExternalReferenceUpload.spec.ts`
- `src/hooks/usePermission.spec.ts`
- `src/utils/fileUtils.spec.ts`

Fix any failures. Common issues: ESM import mocking, missing test setup mocks, path alias resolution.

---

## Verification

- [ ] `pnpm type-check` passes with 0 errors
- [ ] `pnpm test -- --run` passes all 4 test files
- [ ] `@/components/ui/Button` resolves correctly in test files
- [ ] Root `types.ts` deleted
- [ ] No `.js`/`.js.map`/`.d.ts.map` artifacts in `src/test/`

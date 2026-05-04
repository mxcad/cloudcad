# T00: Environment Repair (GATING)

**Dependency:** None — this task must complete before all others.

**Estimated effort:** 30–45 min

---

## Step 0: Fix backend `_v1` operationId issue (ROOT CAUSE)

The 55 type errors are caused by NestJS URI versioning appending `_v1` to Swagger operationIds.

File: `packages/backend/src/app.module.ts`, line 130

```typescript
// CURRENT (line 130):
operationIdFactory: (controllerKey, methodKey) => `${controllerKey}_${methodKey}`,

// FIX:
operationIdFactory: (controllerKey, methodKey) => {
  const cleanMethod = methodKey.replace(/_v\d+$/, '');
  return `${controllerKey}_${cleanMethod}`;
},
```

Then **delete lines 133-140** (the post-processing strip loop — no longer needed).

## Step 1: Regenerate API types

```bash
cd D:\project\cloudcad\packages\frontend
pnpm generate:api-types
```

This runs `node scripts/generate-api-types.js`, regenerating `src/types/api-client.ts`. After the backend fix above, generated types should have NO `_v1` suffixes. Most type errors should disappear.

After regeneration, run `pnpm type-check`. If any errors remain, fix them.

## Step 2: Fix vitest `@` alias

File: `packages/frontend/vitest.config.ts`, line 20:

```typescript
// CURRENT (WRONG):
'@': path.resolve(__dirname, '.'),

// FIX:
'@': path.resolve(__dirname, './src'),
```

## Step 3: Clean stale build artifacts

Delete these compiled artifacts from `src/test/` (keep `setup.ts`):

```
packages/frontend/src/test/setup.js
packages/frontend/src/test/setup.js.map
packages/frontend/src/test/setup.d.ts
packages/frontend/src/test/setup.d.ts.map
```

## Step 4: Remove unused root `types.ts`

File `packages/frontend/types.ts` has zero consumers. Delete it.

## Step 5: Get existing tests passing

```bash
cd D:\project\cloudcad\packages\frontend
pnpm test -- --run
```

Fix any test failures.

---

## Verification

- [ ] Backend `operationIdFactory` fixed
- [ ] `pnpm generate:api-types` succeeds with no `_v1` suffixes
- [ ] `pnpm type-check` passes with **0 errors**
- [ ] `pnpm test -- --run` all tests pass
- [ ] `@/components/ui/Button` resolves correctly in test files
- [ ] Root `types.ts` deleted
- [ ] No `.js`/`.js.map`/`.d.ts.map` artifacts in `src/test/`

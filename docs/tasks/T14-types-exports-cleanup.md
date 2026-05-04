# T14: Types & Exports Cleanup

**Dependency:** T00 (Environment Repair) must complete first.

**Estimated effort:** 20–30 min

---

## Input Files

1. `packages/frontend/types.ts` — already deleted by T00, nothing to do here
2. `packages/frontend/src/types/filesystem.ts` — keep as primary type file
3. `packages/frontend/src/pages/Profile/index.ts` — duplicate barrel
4. `packages/frontend/src/pages/components/index.ts` — duplicate barrel

---

## Part A: Types — No Action Needed

T00 already deleted the unused root `types.ts`. `src/types/filesystem.ts` is the single source of truth for frontend file-system types. Verify:

```bash
grep -r "from.*['\"].*\/types['\"]" src/ --include="*.ts" --include="*.tsx"
```

Should return zero results (root `types.ts` had no consumers).

## Part B: Remove Duplicate Component Exports

Two barrel files export the same Profile tab components:

1. `packages/frontend/src/pages/Profile/index.ts`
2. `packages/frontend/src/pages/components/index.ts`

### Step 1: Find which one is actually used

```bash
grep -r "from.*pages/Profile" src/ --include="*.ts" --include="*.tsx"
grep -r "from.*pages/components" src/ --include="*.ts" --include="*.tsx"
```

### Step 2: Pick the canonical export path

The profile tabs logically belong to `pages/Profile/`. Keep `pages/Profile/index.ts` as the canonical export.

Remove the duplicate Profile re-exports from `pages/components/index.ts`.

### Step 3: Update consumers

If any file imports Profile components from `pages/components`, change to `@/pages/Profile`.

---

## Part C: Verify Clean Build

```bash
pnpm type-check
```

---

## Verification Checklist

- [ ] Root `types.ts` confirmed deleted (already done by T00)
- [ ] No files importing from root `types.ts`
- [ ] Duplicate Profile exports resolved — only `pages/Profile/index.ts` exports them
- [ ] All consumers updated to correct import path
- [ ] `pnpm type-check` passes (0 errors)

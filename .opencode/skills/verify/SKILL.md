---
name: verify
description: Run lint + type-check + tests across the project to verify code quality before committing. Use /verify when you want to check that your changes don't break anything.
---

# /verify — Project-wide Verification

Run all quality checks in sequence and report results.

## Workflow

1. **Lint:** `pnpm lint` (root ESLint)
2. **Format check:** `pnpm format:check` (Prettier root + Biome backend)
3. **Type check:** `pnpm type-check` (tsc --noEmit all packages)
4. **Backend tests:** `cd packages/backend && pnpm exec jest` (or filter with `$ARGUMENTS`)
5. **Frontend tests:** `cd packages/frontend && pnpm test` (vitest)

If `$ARGUMENTS` is provided (e.g., `/verify auth`), pass it as a test path pattern to backend Jest: `pnpm exec jest -- --testPathPattern="$ARGUMENTS"`.

## Report

After all checks complete, report:
- ✅ Pass / ❌ Fail for each step
- If any step failed, show the error output and suggest a fix

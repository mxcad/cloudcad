# Merge conversion-engine into backend

The `@cloudcad/conversion-engine` package is only consumed by `packages/backend`. Keeping it as a separate monorepo package adds indirection (workspace dependency, build coordination, mock complexity) without any benefit — no other package reuses it, and it's not independently deployable. We're moving its source into `packages/backend/src/conversion/` and deleting the standalone package.

**Considered Options**

- **Keep as separate package.** Pros: enforced boundary, could be reused. Cons: no actual second consumer exists; adds workspace wiring and mock overhead.
- **Merge into backend `src/conversion/`.** Pros: simpler imports, single build, fewer mock paths to maintain. Cons: slightly harder to extract later if a second consumer appears.

**Consequences**

- `ConversionModule.forRoot()` replaced with `ConfigService`-based configuration (more NestJS-idiomatic).
- All imports of `@cloudcad/conversion-engine` become relative paths from `src/conversion/`.
- All test mocks referencing `@cloudcad/conversion-engine` updated to mock the local module.
- `packages/conversion-engine/` directory and its `package.json` deleted.
- `packages/backend/package.json` loses the `@cloudcad/conversion-engine` workspace dependency.

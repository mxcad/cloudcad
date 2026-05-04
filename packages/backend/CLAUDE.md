# CLAUDE.md

Backend-specific instructions. See root CLAUDE.md for project-wide guidance.

## CRITICAL: NestJS DI

**Never `import type` for classes used in constructor injection.** The decorator metadata gets stripped, breaking DI. Biome's `organizeImports` can do this automatically — manually verify after running it.

## Testing (Jest)

```bash
pnpm exec jest                    # All tests (timeout: 30s)
pnpm exec jest -- --testPathPattern="auth"  # Filter
pnpm exec jest -- --testPathPattern="file-operations" --no-coverage  # No coverage
pnpm test:unit                    # Unit only
pnpm test:integration             # Integration only
pnpm test:e2e                     # E2E (supertest)
pnpm test:cov                     # With coverage report
pnpm test:ci                      # CI mode
pnpm test:permission              # Permission-specific tests
pnpm test:permission:scenarios
```

**Coverage thresholds** (enforced per-file):
- P0 (80%): `auth.service.ts`, `permission.service.ts`
- P1 (70%): `file-system.service.ts`, `role-inheritance.service.ts`, `file-validation.service.ts`, `file-system-permission.service.ts`

Config: `clearMocks`, `restoreMocks`, `resetMocks` all true. `detectOpenHandles: true`, `forceExit: true`.

## Database (Prisma)

```bash
pnpm prisma generate              # Regenerate client
pnpm prisma db push               # Sync schema (dev)
pnpm prisma migrate dev           # New migration
pnpm prisma studio                # GUI browser
pnpm db:seed                      # Seed data
pnpm db:audit-permissions         # Audit permission records
```

## TypeScript Config (Deliberately Loose)

- `strictNullChecks: false`, `noImplicitAny: false`, `noImplicitReturns: false`
- `strictPropertyInitialization: false`, `useUnknownInCatchVariables: false`
- `isolatedModules: false` — some NestJS patterns break with it
- `module: "commonjs"`, `moduleResolution: "node"`
- `emitDecoratorMetadata: true`, `experimentalDecorators: true`

Type safety is enforced via lint rules, not the compiler.

## Linting (Biome)

Biome is used for the backend only (root uses Prettier). Config in `biome.json`:
- Formatter: single quotes, trailing commas es5, semicolons always, 80 width, 2-space, LF
- Linter: hand-picked rules (not `recommended`). Disabled: `noUnusedVariables`, `noExplicitAny`, `useTemplate`, `noExcessiveCognitiveComplexity` and others
- Scoped to `src/**/*.ts` and `test/**/*.ts`

## Guards & Decorators

- `@RequirePermissions(SystemPermission.XX)` — system-level permissions
- `@RequireProjectPermission(ProjectPermission.XX)` — project-level permissions (`FILE_CREATE` is project-level!)
- `@Roles('admin')` — role check
- `@Version('2')` — for new v2 endpoints when needed (URI versioning enabled globally)
- Global guards: `PermissionsGuard`, `RateLimitGuard`
- Global interceptor: `ResponseInterceptor` (wraps in `ApiResponse` format)

## Architecture Notes

- **Module pattern:** Each feature module (auth, users, file-system, mxcad, etc.) is self-contained with its own controller, service, module, DTOs
- **Common services** in `src/common/services/` are shared across modules (permission-cache, storage-manager, redis-cache, file-lock, etc.)
- **Schedulers** in `src/common/schedulers/` handle cache cleanup, storage cleanup, user cleanup (via `@nestjs/schedule`)
- **Validation:** Uses `class-validator` + `class-transformer` decorators on DTOs
- **API responses** are wrapped by `ResponseInterceptor` into a standard `ApiResponse` envelope
- **Custom ESLint rule** `custom-rules/no-prisma-enum-in-api-property` forbids Prisma enums in `@ApiProperty` decorators

## Quick Commands

```bash
pnpm exec nest build              # Production build (uses SWC)
pnpm check                        # lint + type-check
pnpm check:fix                    # Auto-fix lint + format
pnpm verify                       # check:fix → test → build
```

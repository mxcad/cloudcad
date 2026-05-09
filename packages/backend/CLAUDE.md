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

## Dependency Upgrades — Backend-Specific Gotchas

### Prisma v7 (`@prisma/client: ^7.1.0`)

- **Generated type rename:** Prisma v7 may rename `ModelName` to `ModelNameOmit` when the model has relations that affect type generation. Example: `FileSystemNode` → `FileSystemNodeOmit`. Always run `pnpm type-check` after `pnpm prisma generate`.
- **Enum incompatibility:** `@prisma/client` `$Enums.FileStatus` is not assignable to the local `FileStatus` enum in `src/common/enums/file-status.enum.ts`. When mapping Prisma query results to DTOs, cast explicitly:
  ```typescript
  fileStatus: node.fileStatus as FileStatus,
  ```
  The custom ESLint rule `no-prisma-enum-in-api-property` already forbids Prisma enums in `@ApiProperty` decorators — the local enum must be used instead.

### Express v5 (`express: ^5.2.1`)

- **Session is now Promise-based:** `session.destroy()` returns `Promise<void>` (no callback). `session.save()` also returns `Promise<void>`. Do NOT wrap in `new Promise` with callback-style — just `await` directly.
- **`AuthenticatedRequest` lacks Express properties** (`protocol`, `get()`, `originalUrl`, `method`, `ip`). The `AuthenticatedRequest` in `src/mxcad/types/request.types.ts` explicitly omits `session` from Express Request. When these properties are needed, cast the request to `any`.

### ADR 0002 — FileSystemService Façade

`FileSystemService` (`src/file-system/file-system.service.ts`) is now a **Façade** for external consumers only (`library/`, `mxcad/`, `file-download/`). The `FileSystemController` injects sub-services directly:
- `ProjectCrudService` — project CRUD, folders, project members
- `FileOperationsService` — file operations (move, copy, delete, update)
- `FileTreeService` — tree navigation (children, node lookup, categories)
- `FileDownloadExportService` — download, format conversion, file access checks
- `StorageInfoService` — quota management
- `ProjectMemberService` — project member management
- `SearchService` — search functionality

When adding methods, decide: external API consumers → add to Facade; internal controller logic → call sub-service directly.

### TypeScript Version Gap

`package.json` declares `"typescript": "~5.0.0"` but `pnpm-lock.yaml` resolves to `5.9.3`. The stricter type inference can expose incompatibilities not caught by 5.0.

### ConvertServerFileParam

Uses **camelCase**: `srcPath`, `fileHash`, `nodeId`, `createPreloadingData` (NOT `srcpath`, `src_file_md5`, `create_preloading_data`). Defined in `src/mxcad/types/mxcad-context.types.ts`.

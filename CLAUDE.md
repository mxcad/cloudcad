# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## GitNexus — Code Intelligence

This project is indexed by GitNexus as **cloudcad**. Use `gitnexus_impact()` before editing any symbol and `gitnexus_detect_changes()` before committing. See `.claude/skills/gitnexus/` for full skill references.

## Project Overview

CloudCAD — web-based CAD collaboration platform (online DWG/DXF editing, SVN version control, RBAC team collaboration).

**Stack:** NestJS (Express) + Prisma + PostgreSQL + Redis | React 19 + Vite + Tailwind CSS v4 + Zustand + Radix UI | pnpm monorepo

**Environment:** Node.js >= 20.19.5 | pnpm >= 9.15.9 | PostgreSQL 15 | Redis 7 | SVN 1.14.x

```
packages/
├── backend/          # NestJS API (port 3001)
├── frontend/         # React 19 SPA (port 5173)
├── config-service/   # Deployment config center (port 3002)
├── server-tasks/     # Sharp image resizing utility
└── svnVersionTool/   # SVN subprocess wrapper
```

## Critical Gotchas

- **NestJS DI:** Never `import type` for classes used in constructor injection — the decorator metadata gets stripped. Biome's `organizeImports` can do this automatically; manually verify after running it.
- **CAD engine is a black box:** `mxcad-app` npm package creates its own Vue 3 + Vuetify app internally. React communicates via `mxcadManager.ts` (singleton, `document.body`-level container). `CADEditorDirect.tsx` renders as a global overlay outside `<Routes>` to preserve WebGL context.
- **Dual formatters:** Root uses **Prettier**; backend uses **Biome** (formatter + linter + `organizeImports` — but that breaks NestJS DI, see above).
- **API types are auto-generated:** `packages/frontend/src/types/api-client.ts` generated via `pnpm generate:api-types`. Run this after API changes.

## Common Commands

```bash
pnpm dev                         # Start both frontend + backend
pnpm check                       # lint + format:check + type-check
pnpm generate:api-types          # Regenerate frontend types from backend Swagger
pnpm generate:frontend-permissions  # Sync backend permissions to frontend constants

# Backend (packages/backend)
pnpm exec jest                   # All tests
pnpm exec jest -- --testPathPattern="auth"  # Specific suite
pnpm prisma generate             # Regenerate Prisma client
pnpm prisma migrate dev          # New migration
pnpm test:permission             # Permission-specific tests

# Frontend (packages/frontend)
pnpm test                        # vitest run
pnpm type-check                  # tsc --noEmit
```

## Dependency Versions (Post-Upgrade Gotchas)

| Dependency | Version | Breaking Change |
|-----------|---------|----------------|
| **Prisma** | ^7.1.0 | Generated types renamed (`FileSystemNode` → `FileSystemNodeOmit`). `$Enums.FileStatus` incompatible with local `FileStatus` enum — use `as FileStatus` casts. |
| **Express** | ^5.2.1 | Session API is Promise-based: `session.destroy()` returns `Promise<void>`. |
| **TypeScript** | ~5.0.0 declared, 5.9.3 resolved | Stricter type inference exposes hidden incompatibilities. |

## Key Backend Conventions

- API routes at `/api/xxx` (no version prefix). URI versioning enabled for future v2 — use `@Version('2')`.
- Permissions: `SystemPermission.*` (system-level), `ProjectPermission.*` (project-level). `FILE_CREATE` is project-level.
- DTOs in `src/*/dto/`, validated via `class-validator` + `class-transformer`.
- Guards: `@RequirePermissions` for system, `@RequireProjectPermission` for project.
- Custom ESLint rule `no-prisma-enum-in-api-property` forbids Prisma enums in `@ApiProperty`.
- `ConvertServerFileParam` uses **camelCase** (`srcPath`, `fileHash`, `nodeId`, `createPreloadingData`), not snake_case.
- **ADR 0002:** `FileSystemService` is a Façade — external consumers use it; `FileSystemController` injects sub-services directly.

## Key Frontend Conventions

- `mxcadManager.ts` is the singleton CAD engine manager — never instantiate MxCADView outside it.
- CAD editor (`CADEditorDirect.tsx`) renders via `visibility` + `z-index` to preserve WebGL context across routes.
- Z-index values from `constants/layers.ts` (`Z_LAYERS`), no bare numbers.
- API SDK auto-generated in `src/api-sdk/` via `@hey-api/openapi-ts` — do not manually edit `sdk.gen.ts` / `types.gen.ts`.

## Architecture Decision Records

See `docs/adr/` for major decisions:
- **0001** — Merged conversion-engine into backend
- **0002** — Decoupled file-operations; FileSystemService is now a Façade
- **0003** — IPermissionStore strategy pattern (eliminates circular deps)
- **0004** — Frontend CSS z-index layering system

## Backend-Specific Guidance

详见 `packages/backend/CLAUDE.md`，包含 NestJS DI 详细说明、Jest 测试配置、Prisma v7 类型变更、Biome 配置、Guards & 装饰器使用方式。

## CI

GitHub Actions: push/PR to main/develop → PostgreSQL 15 + Redis 7 → lint + format + type-check → build → test → Codecov.

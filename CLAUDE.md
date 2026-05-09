# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## GitNexus — Code Intelligence

This project is indexed by GitNexus as **cloudcad**. Use `gitnexus_impact()` before editing any symbol and `gitnexus_detect_changes()` before committing. See `.claude/skills/gitnexus/` for full skill references.

## Project Overview

CloudCAD — web-based CAD collaboration platform (online DWG/DXF editing, SVN version control, RBAC team collaboration).

**Stack:** NestJS (Express) + Prisma + PostgreSQL + Redis | React 19 + Vite + Tailwind CSS v4 + Zustand + Radix UI | pnpm monorepo

```
packages/
├── backend/          # NestJS API (port 3001) — auth, users, file-system, mxcad, version-control, cache, storage, conversion-engine
├── frontend/         # React 19 SPA (port 5173) — pages, components, services, hooks, stores
├── config-service/   # Deployment config center (port 3002)
├── server-tasks/     # Sharp image resizing utility
└── svnVersionTool/   # SVN subprocess wrapper
```

## Critical Gotchas

- **NestJS DI:** Never `import type` for classes used in constructor injection — the decorator metadata gets stripped. The `organizeImports` LSP action (Biome) can break DI; manually verify after running it.
- **CAD engine is a black box:** `mxcad-app` npm package creates its own Vue 3 + Vuetify app internally. React communicates via `mxcadManager.ts` (singleton, `document.body`-level container). `CADEditorDirect.tsx` renders as a global overlay outside `<Routes>` to preserve WebGL context.
- **Custom ESLint rule:** `custom-rules/no-prisma-enum-in-api-property` — forbids Prisma enums in API property decorators.
- **Dual formatters:** Root uses **Prettier**; backend uses **Biome** (formatter + linter + `organizeImports` — but that breaks NestJS DI, see above).
- **API types are auto-generated:** `packages/frontend/src/types/api-client.ts` generated via `pnpm generate:api-types` (uses `openapicmd` from `swagger_json.json`). `swagger_json.json` is fetched from running backend or falls back to local file. Run `pnpm generate:api-types` after API changes to keep frontend types in sync.

## Common Commands

```bash
pnpm install                     # Install + postinstall → prisma generate
pnpm dev                         # Start both frontend + backend

pnpm lint                        # ESLint all .{js,jsx,ts,tsx}
pnpm format:check                # Prettier check (root) + Biome check (backend)
pnpm type-check                  # tsc --noEmit across all packages
pnpm check                       # lint + format:check + type-check
pnpm build                       # Build all packages in parallel
pnpm generate:api-types          # Regenerate frontend types from backend Swagger (needs backend running or local swagger_json.json)

# Backend (packages/backend)
pnpm exec jest                   # All tests
pnpm exec jest -- --testPathPattern="auth"  # Specific suite
pnpm prisma generate             # Regenerate Prisma client
pnpm prisma migrate dev          # New migration

# Frontend (packages/frontend)
pnpm test                        # vitest run
pnpm type-check                  # tsc --noEmit
pnpm build                       # Vite build
```

**CI requires** PostgreSQL 15 + Redis 7 as service containers.

## Dependency Versions (Post-Upgrade Gotchas)

These upgrades introduced breaking type changes. When upgrading any of these, expect type errors:

| Dependency | Version | Breaking Change |
|-----------|---------|----------------|
| **Prisma** | ^7.1.0 | `FileSystemNode` → `FileSystemNodeOmit` (renamed generated types). `$Enums.FileStatus` no longer compatible with local `FileStatus` enum — use `as FileStatus` casts when mapping Prisma results to DTOs. |
| **Express** | ^5.2.1 | Session API is now Promise-based: `session.destroy()` returns `Promise<void>` (no callback). `session.save()` returns `Promise<void>`. Request type changes cause `string \| ParsedQs` mismatches — wrap with `String()`. |
| **TypeScript** | ~5.0.0 declared, 5.9.3 resolved | Stricter type inference exposes hidden incompatibilities. `Record<string, unknown>` no longer assignable from `unknown`. Use `any` or explicit narrowing.

- **Prisma Client v7 naming:** When a model has relations/config that affect the generated type, Prisma v7 may export `ModelNameOmit` instead of `ModelName`. Always run `pnpm type-check` after `pnpm prisma generate`.
- **FileStatus enum rule:** The custom ESLint rule `no-prisma-enum-in-api-property` forbids Prisma enums in `@ApiProperty`. Map Prisma `$Enums.FileStatus` to local `FileStatus` enum using `as FileStatus` when building DTOs.
- **`ConvertServerFileParam`:** Uses **camelCase** (`srcPath`, `fileHash`, `nodeId`, `createPreloadingData`), not snake_case. See `src/mxcad/types/mxcad-context.types.ts`.
- **ADR 0002:** `FileSystemService` (`src/file-system/file-system.service.ts`) is now a **Façade** — external consumers (library, mxcad, file-download) use it, but `FileSystemController` injects sub-services directly. When adding methods, check which pattern applies.

## Key Backend Conventions

- API routes at `/api/xxx` (no version prefix in path). NestJS URI versioning is enabled for future v2 support — use `@Version('2')` on new endpoints when needed
- Permissions: `SystemPermission.*` (system-level), `ProjectPermission.*` (project-level). `FILE_CREATE` is a project permission.
- DTOs in `src/*/dto/`, response DTOs in `file-system-response.dto.ts`
- `@RequirePermissions` for system permissions, `@RequireProjectPermission` for project permissions

## Key Frontend Conventions

- `mxcadManager.ts` is the singleton CAD engine manager — never instantiate MxCADView outside it
- CAD editor (`CADEditorDirect.tsx`) renders as a global overlay via `visibility` + `z-index` to preserve WebGL context across routes
- ESLint config at repo root references `packages/frontend/**` and `packages/backend/**` — do not change these paths

## Workshop Setup

Root `tsconfig.json` uses `composite: true` + `incremental: true`. Each package overrides to `composite: false`.

## 使用技能

当遇到项目相关问题时先查找项目技能是否可以使用
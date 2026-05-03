# Architecture Health Report

**Scope:** `packages/backend/src/` — All backend source code
**Date:** 2026-05-02
**Branch:** refactor/circular-deps
**Total Files Scanned:** ~230
**Total Issues Found:** 38

---

## Overview

| Category | Issues | Severity |
|---|---|---|
| Dependency Injection | 8 | Critical |
| Exception Handling | 12 | High |
| Naming Consistency | 11 | Medium |
| Code Style | 7 | Medium |

---

## Top 5 Most Critical Improvements

### 1. Orphaned Service: `LinuxInitService` Not Registered in Any Module

**File:** `mxcad/services/linux-init.service.ts`
**Issue:** The service has `@Injectable()` and implements `OnModuleInit`, but is **not listed in any module's `providers` array**. Its `onModuleInit()` hook (SVN checks, permission setup, locale file copying) **never executes**.
**Impact:** Linux environment initialization silently fails on every deployment.
**Fix:** Add `LinuxInitService` to `MxCadModule` providers.

### 2. Duplicate Singleton: `ConcurrencyManager` Instantiated Twice

**Files:** `common.module.ts:64`, `mxcad.module.ts:136`
**Issue:** `ConcurrencyManager` is listed in both `CommonModule` and `MxCadModule` providers, creating **two separate instances**. As a rate limiter / concurrency controller, this defeats its purpose — two instances means two independent counters.
**Fix:** Keep it in `CommonModule` with `exports: [ConcurrencyManager]`, remove from `MxCadModule`.

### 3. Controllers Throwing Raw `Error` Instead of HTTP Exceptions

**File:** `mxcad/mxcad.controller.ts` — 7 instances (lines 1657, 1694, 1715, 2131, 2254, 2287, 2294)
**Also:** `policy-engine/controllers/policy-config.controller.ts:144`
**Issue:** Controllers throw `new Error('...')` which the global filter maps to **500 Internal Server Error**, losing proper HTTP semantics. A "file not found" should be 404, not 500.
**Fix:** Replace with `NotFoundException`, `BadRequestException`, or the project's own `MxCadException` subclasses.

### 4. Excessive Circular Dependencies (8+ Chains)

**Modules involved:** `CommonModule`, `UsersModule`, `AuthModule`, `CacheArchitectureModule`, `FileSystemModule`, `RolesModule`, `MxCadModule`, `VersionControlModule`
**Issue:** 14 module-level `forwardRef` usages and 5 service-level `forwardRef` usages. This indicates deeply coupled module boundaries that make refactoring difficult and can cause subtle initialization-order bugs.
**Fix:** Break chains by:
- Extracting shared interfaces/types into a `common/interfaces` module (no imports needed)
- Using events (`EventEmitter2`) for cross-module notifications instead of direct service injection
- Consolidating `CommonModule` <-> `AuthModule` <-> `UsersModule` triangle into a single `UserManagementModule`

### 5. Global Exception Filter Uses `console.log` Instead of `Logger`

**File:** `common/filters/exception.filter.ts:49`
**Issue:** The class already has `private readonly logger = new Logger(...)` but the very first line in `catch()` uses `console.log(...)`. This bypasses NestJS logging configuration (log levels, custom loggers, log aggregation).
**Also:** `database/database.service.ts:34` logs DB connection URL via `console.log`, and `mxcad/mxcad.controller.ts:1467` has debug logging left in production.
**Fix:** Replace all `console.log/error/warn` with `this.logger.log/error/warn`.

---

## Detailed Findings

### A. Dependency Injection Issues (8 issues)

| # | Severity | File | Issue |
|---|---|---|---|
| A1 | **Critical** | `mxcad/services/linux-init.service.ts` | Service not registered in any module; `onModuleInit` never runs |
| A2 | **Critical** | `common.module.ts`, `mxcad.module.ts` | `ConcurrencyManager` duplicated across 2 modules |
| A3 | **High** | `file-system.module.ts`, `mxcad.module.ts`, `roles.module.ts` | `RequireProjectPermissionGuard` instantiated in 3 modules |
| A4 | **High** | `common.module.ts`, `auth.module.ts` | `InitializationService` duplicated in 2 modules |
| A5 | **High** | `mxcad/mxcad.module.ts:36` | `StorageCheckService` (from `storage/`) provided directly in `MxCadModule` instead of via `StorageModule` export |
| A6 | **Medium** | `auth/services/sms/providers/index.ts:40-54` | SMS providers are `@Injectable()` but bypassed via static factory `new` calls |
| A7 | **Medium** | `mxcad/services/chunk-upload-manager.service.ts:28`, `mxcad/services/file-conversion.service.ts:54` | `RateLimiter` instantiated with `new` instead of DI |
| A8 | **Medium** | `mxcad/services/file-upload-manager-facade.service.ts` | 14 constructor parameters — potential over-segregation |

### B. Exception Handling Issues (12 issues)

| # | Severity | File | Issue |
|---|---|---|---|
| B1 | **High** | `mxcad/mxcad.controller.ts` | 7x `throw new Error()` in controller — should be HTTP exceptions |
| B2 | **High** | `policy-engine/controllers/policy-config.controller.ts:144` | `throw new Error('策略配置不存在')` — should be `NotFoundException` |
| B3 | **High** | `common/filters/exception.filter.ts:49` | `console.log` in exception filter instead of `Logger` |
| B4 | **High** | `database/database.service.ts:34` | `console.log` of DB connection URL |
| B5 | **High** | `mxcad/mxcad.controller.ts:1467` | Debug `console.log` in production controller |
| B6 | **Medium** | `auth/strategies/jwt.strategy.ts:36,66,99` | 3x `throw new Error()` in Passport strategy — should be `UnauthorizedException` |
| B7 | **Medium** | `auth/strategies/refresh-token.strategy.ts:36,52,59,76` | 4x `throw new Error()` in Passport strategy |
| B8 | **Medium** | `auth/auth.controller.ts:684-720` | 5x `console.log` in controller — should use `Logger` |
| B9 | **Medium** | `cache-architecture/services/cache-warmup.service.ts:332,388` | Re-wraps `NotFoundException` into raw `Error`, losing HTTP semantics |
| B10 | **Medium** | `storage/local-storage.provider.ts:158,196,202` | `throw new Error()` for "file not found" — should use domain exception |
| B11 | **Low** | `mxcad/errors/upload.error.ts` | `UploadError extends Error` (not `HttpException`) — always mapped to 500 |
| B12 | **Low** | `test/jwt-config-test.ts:51` | Empty catch block in test utility |

### C. Naming Consistency Issues (11 issues)

| # | Severity | File | Issue |
|---|---|---|---|
| C1 | **Medium** | `common/utils/permission.util.ts` | `.util.ts` (singular) vs `.utils.ts` (plural) everywhere else |
| C2 | **Medium** | `cache-architecture/utils/cache-key.util.ts` | Same `.util.ts` singular issue |
| C3 | **Medium** | `cache-architecture/utils/cache-hashed-key.util.ts` | Same `.util.ts` singular issue |
| C4 | **Medium** | `common/decorators/validation.decorators.ts` | `.decorators.ts` (plural) vs `.decorator.ts` (singular) everywhere else |
| C5 | **Medium** | `mxcad/interfaces/upload-options.ts` | Missing `.interface.ts` suffix (inconsistent with siblings) |
| C6 | **Medium** | `mxcad/errors/upload.error.ts` | `.error.ts` suffix — project also uses `.exception.ts` |
| C7 | **Low** | `auth/jwt.strategy.executor.ts` | Non-standard `.executor.ts` suffix |
| C8 | **Medium** | `mxcad/mxcad.service.ts:43` vs `mxcad/services/mxcad-file-handler.service.ts:15` | `MxCadService` (capital C) vs `MxcadFileHandlerService` (lowercase c) |
| C9 | **High** | `policy-engine/dto/policy.dto.ts:27` + `policy-engine/dto/policy-config.dto.ts:29` | `PolicyConfigDto` class name duplicated with different shapes |
| C10 | **High** | `admin/dto/admin-response.dto.ts:27` + `cache-architecture/dto/cache-stats.dto.ts:18` | `CacheStatsDto` class name duplicated with different shapes |
| C11 | **Low** | `mxcad/utils/file-type-detector.ts`, `common/concurrency/*.ts` | Classes without standard suffix (acceptable but inconsistent) |

### D. Code Style Issues (7 issues)

| # | Severity | File | Issue |
|---|---|---|---|
| D1 | **High** | `file-system.controller.ts`, `mxcad.controller.ts`, `library.controller.ts`, `version-control.service.ts` | Import order inconsistent — `fs`/`path` imports appear **after** relative imports |
| D2 | **Medium** | `auth/auth-facade.service.ts:11`, `auth/services/registration.service.ts:11` | Single-line destructured imports ~150-185 chars — exceeds 80-char Prettier width |
| D3 | **Medium** | `auth-facade.service.ts:737,829`, `registration.service.ts:263,279` | Prisma include chains ~155 chars per line |
| D4 | **Low** | `audit-log.service.ts:15` | Double space in import: `import {  Prisma }` |
| D5 | **Medium** | Multiple files | Trailing commas inconsistent — some files use them, others don't |
| D6 | **Medium** | 40+ lines across codebase | Lines exceeding 120 characters (excluding boilerplate copyright comments) |
| D7 | **Low** | `file-conversion.service.ts:277,298` | Trailing whitespace on blank lines |

---

## Recommendations

1. **Immediate (P0):** Register `LinuxInitService` in `MxCadModule`; deduplicate `ConcurrencyManager`.
2. **Short-term (P1):** Replace all `throw new Error()` in controllers/strategies with proper HTTP exceptions; migrate all `console.*` to `Logger`.
3. **Medium-term (P2):** Rename duplicate DTO classes (`PolicyConfigDto` → `PolicyConfigDetailDto`; `CacheStatsDto` → `AdminCacheStatsDto` / `CacheStatsDto`); fix `.util.ts` → `.utils.ts` naming.
4. **Long-term (P3):** Refactor module architecture to reduce `forwardRef` count; enforce import order via ESLint `import/order` rule.

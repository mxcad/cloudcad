# T15 — API Services Migration (Batch 1): Auth + Users + Roles + Health + Config

## Dependency: None (gate task)

## Files to modify

- `D:\project\cloudcad\packages\frontend\src\services\authApi.ts`
- `D:\project\cloudcad\packages\frontend\src\services\usersApi.ts`
- `D:\project\cloudcad\packages\frontend\src\services\rolesApi.ts`
- `D:\project\cloudcad\packages\frontend\src\services\healthApi.ts`
- `D:\project\cloudcad\packages\frontend\src\services\runtimeConfigApi.ts`

## Instructions

For each file:

1. Replace `import { getApiClient } from './apiClient'` with direct `@/api-sdk` imports
2. Each `getApiClient().XxxController_yyy(args)` → import the corresponding SDK function and call directly
3. SDK functions take `{ body?, path?, query? }` options object — NOT positional args
4. SDK returns `{ data, error }` — extract `.data`
5. Remove `OperationMethods` type imports — not needed with SDK
6. Keep file's public API shape unchanged (export const sameApi = { sameMethodNames })

## SDK Function Mapping

| Old call | New import + call |
|----------|------------------|
| `getApiClient().AuthController_login(data)` | `import { authControllerLogin } from '@/api-sdk'` → `const { data } = await authControllerLogin({ body: data })` |
| `getApiClient().AuthController_register(data)` | `authControllerRegister({ body: data })` |
| `getApiClient().AuthController_getProfile()` | `authControllerGetProfile()` |
| `getApiClient().AuthController_refreshToken(data)` | `authControllerRefreshToken({ body: data })` |
| `getApiClient().AuthController_logout()` | `authControllerLogout()` |
| `getApiClient().UsersController_findAll(params)` | `usersControllerFindAll({ query: params })` |
| `getApiClient().UsersController_findOne({ id })` | `usersControllerFindOne({ path: { id } })` |
| `getApiClient().UsersController_create(data)` | `usersControllerCreate({ body: data })` |
| `getApiClient().UsersController_update({ id }, data)` | `usersControllerUpdate({ path: { id }, body: data })` |
| `getApiClient().RolesController_findAll(params)` | `rolesControllerFindAll({ query: params })` |
| `getApiClient().HealthController_check()` | `healthControllerCheck()` |
| `getApiClient().RuntimeConfigController_getConfig(params)` | `runtimeConfigControllerGetConfig({ path: params })` |

Read each service file to see exact method names and match to SDK. All SDK functions are exported from `@/api-sdk` (see `src/api-sdk/index.ts`).

## Verify

```bash
cd D:\project\cloudcad\packages\frontend && node ./node_modules/typescript/bin/tsc --noEmit 2>&1 | head -30
```

## Report

Write results to `D:\project\cloudcad\docs\tasks\reports\T15-report.md`

# T15 Report — API Services Migration (Batch 1)

## Status: ✅ Completed

## Files Modified

| File | Methods Migrated | SDK Functions Used |
|------|-----------------|-------------------|
| `services/authApi.ts` | 24 | `authControllerLogin`, `authControllerRegister`, `authControllerRefreshToken`, `authControllerLogout`, `authControllerGetProfile`, `authControllerResendVerification`, `authControllerForgotPassword`, `authControllerResetPassword`, `authControllerSendBindEmailCode`, `authControllerVerifyBindEmail`, `authControllerSendUnbindEmailCode`, `authControllerVerifyUnbindEmailCode`, `authControllerRebindEmail`, `authControllerSendSmsCode`, `authControllerVerifySmsCode`, `authControllerLoginByPhone`, `authControllerRegisterByPhone`, `authControllerVerifyPhone`, `authControllerBindEmailAndLogin`, `authControllerBindPhoneAndLogin`, `authControllerBindPhone`, `authControllerSendUnbindPhoneCode`, `authControllerVerifyUnbindPhoneCode`, `authControllerRebindPhone`, `authControllerCheckFieldUniqueness`, `authControllerVerifyEmailAndRegisterPhone`, `authControllerGetWechatAuthUrl`, `authControllerWechatCallback`, `authControllerBindWechat`, `authControllerUnbindWechat` |
| `services/usersApi.ts` | 14 | `usersControllerFindAll`, `usersControllerSearchUsers`, `usersControllerSearchByEmail`, `usersControllerCreate`, `usersControllerUpdate`, `usersControllerRemove`, `usersControllerDeleteImmediately`, `usersControllerRestore`, `usersControllerRestoreAccount`, `usersControllerGetProfile`, `usersControllerUpdateProfile`, `usersControllerChangePassword`, `usersControllerGetDashboardStats`, `usersControllerDeactivateAccount` |
| `services/rolesApi.ts` | 9 + 9 | `rolesControllerFindAll`, `rolesControllerFindOne`, `rolesControllerCreate`, `rolesControllerUpdate`, `rolesControllerRemove`, `rolesControllerGetRolePermissions`, `rolesControllerAddPermissions`, `rolesControllerRemovePermissions` (system roles); `rolesControllerGetAllProjectRoles`, `rolesControllerGetSystemProjectRoles`, `rolesControllerGetProjectRolesByProject`, `rolesControllerCreateProjectRole`, `rolesControllerUpdateProjectRole`, `rolesControllerDeleteProjectRole`, `rolesControllerGetProjectRolePermissions`, `rolesControllerAddProjectRolePermissions`, `rolesControllerRemoveProjectRolePermissions` (project roles) |
| `services/healthApi.ts` | 3 | `healthControllerCheck`, `healthControllerCheckDatabase`, `healthControllerCheckStorage` |
| `services/runtimeConfigApi.ts` | 6 | `runtimeConfigControllerGetPublicConfigs`, `runtimeConfigControllerGetAllConfigs`, `runtimeConfigControllerGetDefinitions`, `runtimeConfigControllerGetConfig`, `runtimeConfigControllerUpdateConfig`, `runtimeConfigControllerResetConfig` |

## Migration Pattern Applied

For each service method:

1. **Import change**: Replaced `import { getApiClient } from './apiClient'` with direct SDK imports from `@/api-sdk`
2. **Call transformation**: `getApiClient().XxxController_yyy(args)` → `XxxController_yyy({ body/path/query: args }).then(r => r.data)`
3. **Type imports**: Removed `OperationMethods` type imports (not needed with SDK)
4. **Public API shape**: Preserved all exported method names unchanged

## Key Observations

- `usersApi.getWechatDeactivateQr()` still uses raw `getApiClient().get()` — no SDK equivalent available (non-standard endpoint)
- `rolesApi` split into system `rolesApi` and `projectRolesApi` both fully migrated
- All 5 files retain `@deprecated Use @/api-sdk instead.` comment and copyright header
- TypeScript strict check passed with zero errors

## Verification

```bash
cd packages/frontend && node ./node_modules/typescript/bin/tsc --noEmit
# Exit code: 0 (no errors)
```

## Next

Proceed to T16 — API Services Migration (Batch 2).

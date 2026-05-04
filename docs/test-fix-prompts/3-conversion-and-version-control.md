# Agent 3: 修复 file-conversion + version-control

**文件:**
- `packages/backend/src/mxcad/conversion/file-conversion.service.spec.ts`
- `packages/backend/src/version-control/version-control.service.spec.ts`

## 错误

`file-conversion.service.spec.ts`:
- DI 问题或 mock 不完整，ProcessRunnerService / ConfigService 注入失败

`version-control.service.spec.ts`:
- VERSION_CONTROL token 注入问题，或 SVN 路径相关 mock 缺失

## 修复步骤

### file-conversion.service.spec.ts
1. 检查 `beforeEach` 里的 `Test.createTestingModule` 配置
2. 确保 `ConfigService` 用 `jest.fn()` mock，提供 `get()` 方法返回 mxcad 配置：
   ```typescript
   { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue({}) } }
   ```
3. 确保 `ProcessRunnerService` mock 有 `run()` 方法
4. 注意：`ProcessRunnerService` 来自 `@cloudcad/conversion-engine`，已在 `src/test/setup.ts` 里全局 mock，但某些测试可能 override 了
5. 如果测试 override 了全局 mock，确保新的 mock 也包含 `run`、`stop`、`isRunning`

### version-control.service.spec.ts
1. 检查 `VERSION_CONTROL` token 的 provide：
   ```typescript
   { provide: VERSION_CONTROL_TOKEN, useValue: mockVersionControl }
   ```
2. 补全 mock：`checkout`、`commit`、`log`、`revert` 等 SVN 方法都 mock 掉
3. 不需要真实 SVN 可执行文件

## 验证

```bash
cd packages/backend
pnpm test -- --testPathPattern="file-conversion"
pnpm test -- --testPathPattern="version-control"
```

目标：每个文件 0 FAIL

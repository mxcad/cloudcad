# Agent 3: 修复 file-conversion + version-control

> **2026-08-03 更新**：`src/conversion/` 模块（`ProcessRunnerService`/`ConversionModule`/`I_CONVERSION_SERVICE`）已删除（ADR-0014 Amendment 1），`setup.ts` 中的全局 mock 已移除。以下 conversion 相关步骤已过时，仅 version-control 部分仍有效。

**文件:**
- `packages/backend/src/mxcad/conversion/file-conversion.service.spec.ts`
- `packages/backend/src/version-control/version-control.service.spec.ts`

## 错误

`file-conversion.service.spec.ts`:
- DI 问题或 mock 不完整，`ConfigService` 注入失败（转换配置键为 `mxcad.*`：`assemblyPath`/`fileExt`/`compression`）

`version-control.service.spec.ts`:
- VERSION_CONTROL token 注入问题，或 SVN 路径相关 mock 缺失

## 修复步骤

### file-conversion.service.spec.ts
1. 检查 `beforeEach` 里的 `Test.createTestingModule` 配置
2. 确保 `ConfigService` 用 `jest.fn()` mock，提供 `get()` 方法返回 mxcad 配置：
   ```typescript
   { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue({}) } }
   ```
3. `FileConversionService` 自身是最终执行者，无需 mock 转换引擎；如测试直接构造它，只需注入 mock `ConfigService`

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

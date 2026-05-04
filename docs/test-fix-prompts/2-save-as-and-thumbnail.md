# Agent 2: 修复 save-as + thumbnail-generation + mxcad service/controller

**文件:**
- `packages/backend/src/mxcad/save/save-as.service.spec.ts`
- `packages/backend/src/mxcad/infra/thumbnail-generation.service.spec.ts`
- `packages/backend/src/mxcad/core/mxcad.service.spec.ts`
- `packages/backend/src/mxcad/core/mxcad.controller.spec.ts`

## 错误

```
ENOENT: no such file or directory, copyfile 'D:\tmp\test.mxweb'
expect(received).toBe(expected) // Expected: true, Received: false
expect(received).toContain(expected) ...
```

## 根因

测试依赖真实文件路径（`D:\tmp\test.mxweb`），文件不存在。需要 mock 文件系统操作（`fs.promises.copyFile`、`fs.existsSync`、`fs.statSync` 等）。

## 修复步骤

1. 读每个 spec 文件，找到失败的测试用例
2. 在每个测试的 arrange 阶段，mock 文件系统操作：
   ```typescript
   jest.spyOn(fs.promises, 'copyFile').mockResolvedValue(undefined);
   jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
   jest.spyOn(fs, 'existsSync').mockReturnValue(true);
   jest.spyOn(fs, 'statSync').mockReturnValue({ size: 1024 } as any);
   ```
3. 在 afterEach 里 `jest.restoreAllMocks()`
4. 如果测试需要临时文件，用 `os.tmpdir()` + `path.join` 构造跨平台路径，不要硬编码 `D:\tmp\`
5. 在 beforeEach 里创建临时目录和文件，afterEach 清理

## 验证

```bash
# 逐个验证
cd packages/backend
pnpm test -- --testPathPattern="save-as"
pnpm test -- --testPathPattern="thumbnail-generation"
pnpm test -- --testPathPattern="mxcad.service"
pnpm test -- --testPathPattern="mxcad.controller"
```

目标：每个文件 0 FAIL

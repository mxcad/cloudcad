# Agent 4: 修复 file-system + file-tree + search

**文件:**
- `packages/backend/src/file-system/file-system.service.spec.ts`
- `packages/backend/src/file-system/file-tree/file-tree.service.spec.ts`
- `packages/backend/src/file-system/search/search.service.spec.ts`

## 错误

主要是 DI 提供者缺失：
```
Nest can't resolve dependencies of the ...Service (..., IStorageProvider, ...)
```

## 修复步骤

1. 读每个 spec 文件的 `beforeEach` 里 `Test.createTestingModule` 配置
2. 找到缺失的提供者并补全 mock。常见缺失：
   - `'IStorageProvider'` 或 `STORAGE_PROVIDER` token → 提供 mock 对象
   - `StorageManager` → mock
   - `ConfigService` → `{ get: jest.fn().mockReturnValue({}) }`
   - `FileTreeService` / `SearchService` → 依赖的子服务需要 mock
3. 读对应源文件的 constructor，逐个对照每个参数是否在 testing module 里有 provide
4. 用 `jest.fn()` 创建 mock，给 mock 方法 `.mockResolvedValue()` 合适的返回值
5. 如果某个服务是 `import type` 引入的，改成 `import`

## 验证

```bash
cd packages/backend
pnpm test -- --testPathPattern="file-system.service"
pnpm test -- --testPathPattern="file-tree"
pnpm test -- --testPathPattern="search"
```

目标：每个文件 0 FAIL

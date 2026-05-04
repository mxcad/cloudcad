# Agent 1: 修复 filesystem-node.service.spec.ts

**文件:** `packages/backend/src/mxcad/node/filesystem-node.service.spec.ts`

## 错误

```
TypeError: tx.fileSystemNode.count is not a function
```

## 根因

Prisma 7 中 `count()` 方法的调用方式变了。测试 mock 的 `tx.fileSystemNode.count` 需要是函数。

## 修复步骤

1. 读 `packages/backend/src/mxcad/node/filesystem-node.service.spec.ts`
2. 找到所有 mock Prisma transaction 的地方，确保 `count` 是 `jest.fn()`
3. 在测试的 beforeEach 或 arrange 里加上 `(mockTx.fileSystemNode.count as jest.Mock).mockResolvedValue(0)`
4. 读源文件 `packages/backend/src/mxcad/node/filesystem-node.service.ts`，对比 `count` 的实际调用方式（可能在 `generateUniqueFileName` 方法里），确保 mock 签名匹配

## 验证

```bash
cd packages/backend && pnpm test -- --testPathPattern="filesystem-node"
```

目标：0 FAIL

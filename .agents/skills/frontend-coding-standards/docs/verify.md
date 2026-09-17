# 提交前验证

## 前端

```bash
cd packages/frontend
pnpm lint          # ESLint 检查
pnpm format:check  # Prettier 检查
pnpm type-check    # TypeScript 类型检查
pnpm test          # Vitest 测试
pnpm depcruise     # 依赖分层门禁（ADR-0028，暂未接入 check/CI）
```

## 后端

```bash
cd packages/backend
pnpm verify        # 一键：lint + format + type-check + test
```

等价于：
```bash
pnpm check         # lint + type-check
pnpm check:fix     # Auto-fix lint + format
pnpm test          # Jest 测试（timeout: 30s）
```

## Prisma 变更后额外检查

```bash
pnpm prisma generate    # 重新生成 client
pnpm type-check         # 验证 Prisma v7 类型重命名
```

## 重复实现扫描（横切平台能力门禁）

新增工具函数或 Hook 前，先按**底层 API 名**确认是否已有实现。以下命令应返回 0 行（出口文件已排除）：

```bash
cd packages/frontend
grep -rn "navigator\.clipboard\|document\.execCommand" src --include="*.ts" --include="*.tsx" \
  | grep -v "\.spec\.\|\.test\.\|api-sdk/" \
  | grep -v "clipboard\.ts"
```

有命中 = 存在绕过唯一出口的内联调用，必须改为调用方（`src/lib/clipboard.ts` / `src/hooks/useCopy.ts`）。**门禁必须带"牙齿"**：去掉 `grep -v "clipboard\.ts"` 应能看到命中（本仓为 5 行），否则说明扫描本身是空匹配、不可信。

其他横切能力按同样方式建门禁：`document.execCommand`、`window.open`（下载）、`Intl.DateTimeFormat`、`localStorage.getItem`（业务态）、`new Blob` + `URL.createObjectURL`。

## 测试卫生

| 坑 | 说明 |
|----|------|
| `Object.defineProperty` stub 不被 `vi.restoreAllMocks()` 还原 | happy-dom 的 `navigator.clipboard` 是**原型上的 accessor**，`delete navigator.clipboard` 删不掉；必须在实例上 `Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true, writable: true })` 遮蔽它。这类 stub 会在用例间泄漏，须在模块加载时快照 `Object.getOwnPropertyDescriptor`、在 `afterEach` 显式还原（还原时区分：原描述符存在则 `defineProperty` 回去，不存在则 `delete`） |
| `vi.waitFor` 与 `vi.useFakeTimers()` 不兼容 | 改用 `act(() => vi.advanceTimersByTime(ms))` 后直接断言 |
| 计时器未清理 | 用 fake timers 的用例结束要 `vi.useRealTimers()`，否则污染同文件后续用例 |
| hook 测试里 `act` 的导入来源 | 从 `@testing-library/react` 导入，不是 `react` |
| 把 hook 返回值存到局部变量（含 `renderHook` 的 `result.current`） | hook 每次渲染返回**新对象**，局部变量会冻在首次渲染的旧值上，症状是「函数返回 true 但 `copied` 恒 false」——极易被误判成实现 bug 或跨文件污染。断言时持续读 `hook.result.current`，勿在 host 组件或 setup 里赋值捕获（本仓两种捕获写法均实测失败），见 `src/hooks/useCopy.spec.tsx` |

## 测试覆盖率阈值

| 优先级 | 文件 | 阈值 |
|--------|------|------|
| P0 | `auth.service.ts`, `permission.service.ts` | 80% |
| P1 | `file-system.service.ts`, `role-inheritance.service.ts`, `file-validation.service.ts`, `file-system-permission.service.ts` | 70% |

## 绝对禁止提交的内容

- 未通过 lint/format/type-check/test 的代码
- `.env` 文件或任何包含 secrets/credentials 的文件
- 修改 schema.prisma 后不提交 migration 脚本
- 手动修改后的 `api-sdk/` 自动生成文件

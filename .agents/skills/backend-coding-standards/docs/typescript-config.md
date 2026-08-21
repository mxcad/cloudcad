# 后端 TypeScript 配置

> `strictNullChecks: false`, `noImplicitAny: false`, `noImplicitReturns: false`

## 宽松配置的意图

后端 tsconfig 故意宽松，类型安全通过 lint 规则而非编译器保证：

```json
// tsconfig.build.json
{
  "compilerOptions": {
    "strictNullChecks": false,
    "noImplicitAny": false,
    "noImplicitReturns": false
  }
}
```

## 实际影响

| 场景 | 宽松下的行为 | 建议 |
|------|-------------|------|
| `const x: string = null` | 编译通过 | 仍应避免，显式标注 `string \| null` |
| `function f(x)` | 参数隐式 `any` | 仍应显式标注类型 |
| `return;` 在预期返回值函数中 | 编译通过 | 仍应返回正确值 |

## TypeScript 版本注意

`package.json` 声明 `typescript: "~5.0.0"`，但 lockfile 解析到 5.9.x。
更严格的类型推断可能暴露 5.0 未发现的问题——类型检查通过不代表逻辑正确。

## type-check 命令

```bash
pnpm --filter backend type-check  # tsc --noEmit --project tsconfig.build.json
```

---
name: type-check-fix
description: AUTO-TRIGGER on: type-check, tsc, TypeScript 错误, 类型错误, TS 错误, 编译错误. 全包类型检查→解析错误→修复→重检循环工作流。
---

# 类型检查修复工作流

> 本技能封装了 CloudCAD monorepo 中最高频的重复工作流：类型检查 → 解析错误 → 修复 → 重检。

## 触发场景

| 场景 | 示例 |
|------|------|
| 代码修改后验证 | 写完组件/service 后跑类型检查 |
| 修复 TS 错误 | 用户贴出 TS 错误日志 |
| 提交前检查 | 任何代码变更后的必检步骤 |
| Prisma schema 变更后 | schema 变更可能导致类型重命名 |

## 各包类型检查命令

| 包 | 命令 | 说明 |
|----|------|------|
| 前端 (frontend) | `cd packages/frontend && pnpm type-check` | `tsc --noEmit` |
| 后端 (backend) | `cd packages/backend && pnpm type-check` | `tsc --noEmit --project tsconfig.build.json` |
| 移动端 (frontend_mobile) | `cd packages/frontend_mobile && pnpm type-check` | `vue-tsc --noEmit` |
| 全包 | `pnpm type-check` | 根目录并行检查所有包 |

**快捷方式**：
- 后端：`cd packages/backend && pnpm verify`（= lint + format + type-check + test）
- 前端：`cd packages/frontend && pnpm check`（= lint + format:check + type-check）

## 修复循环工作流

```
Step 1: 运行类型检查
   ↓
Step 2: 解析错误输出（只关注 src/ 下的错误，忽略 test/msw）
   ↓
Step 3: 按文件分组，优先修复高频出错文件
   ↓
Step 4: 修复后重跑类型检查
   ↓
Step 5: 重复直到 0 错误
```

### Step 2 — 解析错误输出

类型检查输出格式：
```
src/path/to/file.ts(42,10): error TS2339: Property 'xxx' does not exist on type 'YYY'
```

**提取规则**：
- 文件路径：括号前的部分
- 行号/列号：括号内的数字
- 错误代码：`TS` 后的数字
- 错误描述：冒号后的部分

**过滤规则**：
- ✅ 只处理 `src/` 下的错误
- ❌ 忽略 `test/msw` 相关错误
- ❌ 忽略 `node_modules` 相关错误

### Step 3 — 常见错误模式速查

| 错误代码 | 含义 | 修复方向 |
|----------|------|----------|
| TS2339 | 属性不存在 | 检查类型定义、Prisma 生成类型、DTO |
| TS2304 | 找不到名称 | 检查 import 是否正确、是否遗漏依赖 |
| TS2345 | 参数类型不匹配 | 检查函数签名、DTO 类型 |
| TS2322 | 类型不可赋值 | 检查返回值类型、状态管理类型 |
| TS7006 | 隐式 any | 添加类型注解 |
| TS2531 | 对象可能为 null | 添加 null check 或 `!` 断言 |
| TS2769 | 无匹配重载 | 检查函数调用参数 |

### Step 4 — Prisma v7 特殊处理

Prisma schema 变更后可能出现 `ModelNameOmit` 替代 `ModelName` 的情况：

```bash
# 先重新生成 Prisma Client
cd packages/backend && pnpm prisma generate

# 再跑类型检查
pnpm type-check
```

如果类型名称变了（如 `User` → `UserOmit`），需要在使用处更新类型引用。

### Step 5 — Biome organizeImports 陷阱

运行 Biome 的 `organizeImports` 后，NestJS DI 需要的 `import` 可能被自动改为 `import type`：

```typescript
// ❌ Biome 会自动改成这个（破坏 DI）
import type { UsersService } from '../users/users.service';

// ✅ 必须手动还原为
import { UsersService } from '../users/users.service';
```

**检查方法**：类型检查通过后，用 Grep 搜索 `import type.*Service` 确认无误。

## 常见修复模式

### 模式 1：Prisma 类型与 DTO 不匹配

```typescript
// 后端 Prisma 返回的是 Omit 类型
const user = await prisma.user.findUnique({ where: { id } });
// user 类型可能是 UserOmit 而非 User

// 修复：更新 DTO 或使用 pick/select 明确返回类型
```

### 模式 2：API SDK 类型变更

```bash
# 重新生成 SDK
cd packages/frontend && pnpm generate:sdk
# 或根目录
pnpm generate:api-types
```

### 模式 3：模块变量与 Store 重复

```typescript
// ❌ 模块级变量（应迁移到 Zustand store）
let currentFileInfo: CurrentFileInfo | null = null;

// ✅ 使用 store
const store = useCADEditorStore.getState();
store.setCurrentFileInfo(info);
```

### 模式 4：React Hook 调用顺序

```typescript
// ❌ 权限变量在 hook 调用之后声明
const { canCopy, canMove } = useProjectPermissions();
useFileSystemShortcuts({ canCopy, canMove }); // hook 调用
const permissionVars = { canCopy, canMove }; // ❌ 声明在后

// ✅ 声明在 hook 调用之前
const { canCopy, canMove } = useProjectPermissions();
const permissionVars = { canCopy, canMove }; // ✅ 先声明
useFileSystemShortcuts(permissionVars); // 再调用
```

## 检查清单

- [ ] 运行对应包的 `pnpm type-check`
- [ ] 只修复 `src/` 下的错误
- [ ] 修复后重跑确认 0 错误
- [ ] 检查 Biome 是否将 `import` 改为 `import type`（后端）
- [ ] Prisma 变更后先 `pnpm prisma generate` 再 type-check

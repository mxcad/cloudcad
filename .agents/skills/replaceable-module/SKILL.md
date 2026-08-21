---
name: replaceable-module
description: 可替换模块设计规范 — 三类扩展机制（①覆盖同 token / ②新增可选扩展点 / ③新增功能模块）+ 类型获取规则 + 复制即用模板。Use when adding a new module that may need different implementations per deployment scenario, when refactoring an existing module to support replaceability, or when deciding whether a new capability is an extension point vs an internal service. Triggers include: creating a new provider interface, implementing a strategy pattern for module replacement, building OSS/Pro/TOB-specific implementations of an existing module, adding a @Optional() injection point, or registering a private impl hook.
---

# 可替换模块设计规范

规范总纲为 **ADR-0026《扩展机制总纲》**（`docs/adr/0026-extension-mechanism-master.md`），本 skill 是其操作化提炼。遇到三类扩展判断、类型获取、契约先行、六场景验收、AI 探针协议，先读总纲。

## 一、三类扩展机制判断

先走 ADR-0020 判定"OSS/Pro/Enterprise 实现会不同吗？"——不会 → 直接 class-based DI，不抽象。会或存疑 → 按下面三类选机制：

| 机制 | 定义 | 频率 | 判断规则 |
|------|------|------|---------|
| **① 替换现有实现** | impl 注册与 OSS 相同的 DI token，覆盖同 token 下的实现 | 少用 | 仅当**同时**满足：① 被覆盖接口是单一责任接口（只含一个业务方法，覆盖不会连带接管相邻职责）；② OSS 侧仍保留完整可用实现（覆盖只是替换实现而非「复刻+旁路」）；③ 无法用机制②表达（无合适主流程插入点）。任一条不满足即走机制② |
| **② 新增可选扩展点** | contracts 定义接口 + token → backend 消费点 `@Optional()` 注入 → impl 注册实现 | **首选** | 默认路径。主流程有可插入位置、需要「OSS 无实现时零变化」时使用。`USER_SYNC_HOOK` 为活示例 |
| **③ 新增功能模块** | 私有包提供完整 controller/service，backend 动态挂载 | 按需 | 能力是独立功能面（非对既有流程的增强）时使用。参照 ADR-0019 的 `IMPL` 加载机制 |

**判断流程**（决策链路入口）：

```
[新能力或替换需求]
    │
    ├─ 先问 ADR-0020：OSS/Pro/Enterprise 实现会不同吗？
    │     不会 → 直接 class-based DI，不抽象（内部服务）
    │     会或存疑 → 继续↓
    │
    ├─ 是既有流程的增强/替换？  → 机制① 或 ②（先试②）
    │     ├─ 有主流程插入点 & 需要无实现零变化 → ② 扩展点（首选）
    │     └─ 无插入点 & 满足①三条准入 → ① 覆盖同 token
    │
    └─ 是全新功能面？ → 机制③ 独立私有模块
```

> 机制①反例（ADR-0018 教训）：`OldSiteAuthHandler` 覆盖 `AUTHENTICATION_HANDLER` 复刻整套登录，导致 `register()` 一并被接管、与 OSS 双实现漂移。重构后改为机制② `USER_SYNC_HOOK` 可选钩子，认证主流程始终由 OSS 执行。

## 二、类型获取规则

| 类型 | 来源 | 禁止 |
|------|------|------|
| 数据访问层（Prisma 模型记录类型） | `@cloudcad/db` 导出的 Prisma 类型 | 在 contracts 或 impl 手写 DB 形状 |
| 业务层（跨包共享业务契约） | `@cloudcad/contracts` | — |
| HTTP 层 DTO 形状（请求/响应） | **不手动定义**；唯一来源 = backend DTO class → Swagger → `@cloudcad/api-sdk` 自动生成 | contracts 不得重复定义 HTTP DTO |
| 本地私有类型（单实现内部） | 留在 impl 内部 | 不进 contracts（避免契约膨胀） |

铁律：
- contracts 接口方法**不得使用 `any`**；`IDatabaseService` 这类数据适配器接口返回 Prisma 类型（从 `@cloudcad/db`），而非 any。
- 扩展点接口方法签名**不直接引用 HTTP DTO 类型**，只用基础类型 + contracts 领域类型——保持 contracts 独立（零框架依赖、不依赖 api-sdk）。
- impl 需要 HTTP DTO 形状时 `import type { XxxDto } from '@cloudcad/api-sdk'`（type-only import 编译期擦除，零运行时依赖）。

依赖方向无环：`backend → contracts`、`backend → api-sdk(生成物)`、`impl-mx → contracts`、`impl-mx → api-sdk(type-only)`。

## 三、契约先行规则

1. **核心判据（铁律）**：类型/接口被 **≥2 个独立包**引用时才进 contracts。只有单一消费者的留在消费者包内。
2. **归属层**：进 contracts 后按 ADR-0021 三层划分归类（基础设施/领域仓库/业务服务），token 统一进 `tokens.ts`。
3. **排除项**（三类禁止进 contracts）：
   - 仅内部实现细节（纯 impl 私有类型）；
   - 具体实现类 / 抽象类（contracts 只放 interface + token）；
   - DTO 校验 class（带 NestJS 装饰器，违反「contracts 不依赖框架」）。HTTP DTO 形状根本不用手动定义，由 api-sdk 自动生成；contracts 需要共享形状时定义纯 interface，backend DTO class 用 `implements` 子句与结构类型兼容。

## 四、复制即用模板

### 机制② 扩展点模板（首选路径）

三步：**contracts 加接口+token → backend 消费点 `@Optional()` 注入 → impl 注册实现**。

**Step 1 — contracts 定义接口 + token**

`packages/contracts/src/<domain>/xxx-hook.interface.ts`：

```typescript
export interface IXxxHook {
  onXxx(...args: BasicType[]): Promise<void>;
}
```

`packages/contracts/src/tokens.ts`：

```typescript
export const XXX_HOOK = 'IXxxHook';
```

> 活示例参照：`packages/contracts/src/auth/user-sync.interface.ts`（`IUserSyncHook`）、`packages/contracts/src/tokens.ts`（`USER_SYNC_HOOK`）。

**Step 2 — backend 消费点 `@Optional()` 注入**

```typescript
constructor(
  // ... 其他依赖
  @Optional() @Inject(XXX_HOOK) private readonly xxxHook?: IXxxHook,
) {}
```

消费点只做可选调用，无钩子时行为零变化：

```typescript
if (this.xxxHook) await this.xxxHook.onXxx(account, password);
```

> 活示例参照：`packages/backend/src/auth/impl/services/login.service.ts:27`（`@Optional() @Inject(USER_SYNC_HOOK)`）。注意：NestJS DI 必须 `import { ... }`（不能 `import type`）否则装饰器元数据丢失。

**Step 3 — impl 注册实现**

```typescript
// packages/impl-mx/src/xxx-hook.ts
@Injectable()
export class XxxHook implements IXxxHook {
  async onXxx(...args): Promise<void> {
    // 实现逻辑；非目标场景直接 return，不抛错
  }
}
```

```typescript
// packages/impl-mx/src/<auth>/index.ts（createAuthProviders 内）
export function createAuthProviders(): Provider[] {
  return [
    XxxHook,
    { provide: XXX_HOOK, useExisting: XxxHook },
  ];
}
```

> 活示例参照：`packages/impl-mx/src/old-site-user-sync.hook.ts`（实现）、`packages/impl-mx/src/auth/index.ts`（注册 `{ provide: USER_SYNC_HOOK, useExisting: OldSiteUserSyncHook }`）。

### 机制① 覆盖模板（少用路径）

```typescript
// impl 包中提供同名 token 的覆盖实现
{ provide: AUTH_PROVIDER, useClass: ProAuthProvider },
```

准入三条件（缺一不可）：① 被覆盖接口是单一责任接口；② OSS 侧 `createDefaultAuthProviders()` 永不删，保留完整可用实现；③ 无法用机制②表达。反例参照 ADR-0018 重构史。

### 机制③ 新功能模块模板（占位规范）

私有包提供完整 `@Controller` + Service，backend 经 ADR-0019 `IMPL` 机制动态挂载。**无已落地参照**——明确标注，探针测试可优先选此机制验证模板。

## 五、现有参考实现

| 模块 | 接口 | DI Token | 机制 | OSS 实现 |
|------|------|----------|------|----------|
| 认证 | IAuthProvider (6 子接口) | AUTH_PROVIDER | ① | OssAuthProvider |
| 权限 | IPermissionStore | IPERMISSION_STORE | ① | PrismaPermissionStore |
| 用户 | IUserService | USER_SERVICE | ① | UserService |
| 存储 | IStorageProvider | — | ① | LocalStorageProvider / FlydriveStorageProvider |
| 登录同步 | IUserSyncHook | USER_SYNC_HOOK | ②（活示例） | 无（OSS 不注册） |

## 六、反模式

- ❌ 接口中使用具体实现类作为参数类型
- ❌ 接口依赖 Prisma 模型（应使用 DTO 或从 `@cloudcad/db` 取类型）
- ❌ 一个接口超过 8 个方法（应拆为子接口）
- ❌ 没有第二个实现需求时就抽象接口（预测性设计）
- ❌ `@Optional()` 注入后不提供 fallback 默认值
- ❌ contracts 接口方法返回 `any`（用 `@cloudcad/db` / contracts 类型）
- ❌ 机制①复刻整套流程覆盖主 token（应改机制②，ADR-0018 教训）
- ❌ 接口方法直接引用 HTTP DTO 类型（进 contracts 违反零框架依赖）

## 七、验收

新增扩展点必须能在「最弱场景」跑通——本地离线（无 Redis/无外部依赖）零配置可用，OSS 不注册时行为零变化（ADR-0026 六场景矩阵）。涉及规范变更后，按 ADR-0026 第五节 AI 探针协议复测。

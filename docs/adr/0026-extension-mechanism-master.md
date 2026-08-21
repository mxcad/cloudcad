# 扩展机制总纲：三类扩展 + 类型获取 + 契约先行 + 六场景验收 + AI 探针

面向 AI 编程的扩展架构总纲。统一回答三个问题：**用哪种机制扩展**（三类机制判断规则）、**类型从哪来**（类型获取规则）、**怎么证明文档够用**（AI 探针测试协议）。是 0019/0020/0021 的选型入口与差异补丁，不重复既有内容。

**Status**: accepted

## Decision

### 一、三类扩展机制与判断规则

| 机制 | 定义 | 频率 | 判断规则 |
|------|------|------|---------|
| **① 替换现有实现** | impl 注册与 OSS 相同的 DI token，覆盖同 token 下的实现 | 少用 | 仅当**同时**满足：① 被覆盖接口是单一责任接口（只含一个业务方法，覆盖不会连带接管相邻职责）；② OSS 侧仍保留完整可用实现（`createDefaultAuthProviders()` 永不删），覆盖只是替换实现而非「复刻+旁路」；③ 无法用机制② 表达（无合适主流程插入点，或插入需改 OSS 代码）。任一条不满足即走机制② |
| **② 新增可选扩展点** | contracts 定义接口 + token → backend 消费点 `@Optional()` 注入 → impl 注册实现 | 首选 | 默认路径。主流程有可插入位置、需要「OSS 无实现时零变化」时使用。`USER_SYNC_HOOK` 为活示例 |
| **③ 新增功能模块** | 私有包提供完整 controller/service，backend 动态挂载 | 按需 | 能力是独立功能面（非对既有流程的增强）时使用。参照 ADR-0019 的 `IMPL` 加载机制。目前无已落地参照，本总纲只写架构规范 + 占位骨架 |

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

反例（机制①的教训）：ADR-0018 原实现 `OldSiteAuthHandler` 覆盖 `AUTHENTICATION_HANDLER` 复刻整套登录，导致 `register()` 一并被接管、与 OSS 双实现漂移。重构后改为机制② `USER_SYNC_HOOK` 可选钩子，认证主流程始终由 OSS 执行。

### 二、类型获取规则

| 类型 | 来源 | 禁止 |
|------|------|------|
| 数据访问层（Prisma 模型记录类型） | `@cloudcad/db` 导出的 Prisma 类型 | 在 contracts 或 impl 手写 DB 形状 |
| 业务层（跨包共享业务契约） | `@cloudcad/contracts` | — |
| HTTP 层 DTO 形状（请求/响应） | **不手动定义**；唯一来源 = backend DTO class → Swagger → `@cloudcad/api-sdk` 自动生成（`types.gen.ts`） | contracts 不得重复定义 HTTP DTO |
| 本地私有类型（单实现内部） | 留在 impl 内部 | 不进 contracts（避免契约膨胀） |

铁律：
- contracts 接口方法的参数/返回值**不得使用 `any`**；`IDatabaseService` 这类数据适配器接口返回 Prisma 类型（从 `@cloudcad/db`），而非 any。
- 扩展点接口的方法签名**不直接引用 HTTP DTO 类型**，只用基础类型 + contracts 领域类型——保持 contracts 独立（零框架依赖、不依赖 api-sdk）。
- impl 需要 HTTP DTO 形状时 `import type { XxxDto } from '@cloudcad/api-sdk'`（type-only import 编译期擦除，零运行时依赖）。

依赖方向无环：`backend → contracts`、`backend → api-sdk(生成物)`、`impl-mx → contracts`、`impl-mx → api-sdk(type-only)`。

### 三、契约先行规则

1. **核心判据（铁律）**：类型/接口被 **≥2 个独立包**引用时才进 contracts。只有单一消费者的留在消费者包内。
2. **归属层**：进 contracts 后按 ADR-0021 三层划分归类（基础设施/领域仓库/业务服务），token 统一进 `tokens.ts`。
3. **排除项**（三类禁止进 contracts）：
   - 仅内部实现细节（纯 impl 私有类型）；
   - 具体实现类 / 抽象类（contracts 只放 interface + token）；
   - DTO 校验 class（带 NestJS 装饰器，违反「contracts 不依赖框架」）。**DTO 只进纯 interface 形状**——且按第 4 条，HTTP DTO 形状根本不用手动定义，由 api-sdk 自动生成；contracts 需要共享形状时定义纯 interface，backend DTO class 用 `implements` 子句与结构类型兼容（ADR-0021 落地写法）。
4. **清理义务**：契约包不得提交构建产物（`*.js`、`*.js.map`），已误提交的清理（挂 #174/#175）。

### 四、六场景验收依据与选型依据

场景收编进总纲，不单独成文档。六场景（本地离线/高并发/云函数 FaaS/多服务/toB/toC）作为**选型依据**与**验收依据**：

| 场景 | 扩展点要求 | 类型要求 | 部署形态要求 |
|------|-----------|---------|-------------|
| 本地离线 | 无 Redis/外部依赖下零配置可用；OSS 不注册时行为零变化 | 无外部服务类型耦合 | 单进程可跑 |
| 高并发 | 扩展点不得引入同步阻塞热点；失败仅记录不拖垮主流程 | 类型不可泄漏实现细节 | 可水平扩容 |
| 云函数 FaaS | 不能依赖启动时静态加载的覆盖层（机制①在此场景失效）；用机制② `@Optional()` 按需裁剪 | 无 Node 原生依赖 | 冷启动可裁剪 |
| 多服务 | 扩展点跨服务边界需契约化，token 全局唯一 | 跨服务类型必须进 contracts | 服务间仅经契约通信 |
| toB | 客户定制通过私有 impl 包叠加，不改 OSS 源码 | 私有类型隔离 | 可独立部署客户定制层 |
| toC | OSS 单版本开箱完整可用，扩展点无实现不报错 | 不泄漏私有类型到 OSS | 单点发布 |

**全局结论一（选型依据）**：六场景共同逼出「②扩展点优先于①覆盖」——机制① 要求实现包在启动时被**静态引入**（编译期 import 或运行时 require 路径），在 FaaS/多服务场景失效或需冷启动额外加载；机制② 的 `@Optional()` 注入对无实现场景零影响，天然适配 FaaS 裁剪。

**全局结论二（验收依据）**：新增扩展点必须能在「最弱场景」跑通——本地离线（无 Redis/无外部依赖）也零配置可用，OSS 不注册时行为零变化。

### 五、AI 探针测试协议

**目的**：验证规范文档（本总纲 + replaceable-module + backend-coding-standards 等 skill）能让一个全新 AI session 独立完成一个新扩展点，一次做对。

- **触发时机**：ADR 0026 落盘 + skill 扩充完成后执行**一次**（落在 #175 之后、map 收尾验收时）；此后每次扩展机制相关规范变更，复测一次。
- **探针任务**：从「探针候选清单」（见附录）预选一个——不选已实现的（`USER_SYNC_HOOK` 已落地，抄答案无意义），选规模适中（1 接口 + 1 消费点 + 1 impl 实现 + 单测）的真实扩展点。优先选机制③ 以验证占位模板。
- **环境隔离（防作弊）**：全新 session、空上下文，唯一输入 = 仓库规范文档（AGENTS.md / CLAUDE.md ADR 索引 / ADR 0026 / replaceable-module + backend-coding-standards skill）。**禁止**查看既有 impl-mx 实现细节——测的是「文档够不够」，不是「AI 会不会抄」。
- **验收步骤**：读规范 → 自行完成「contracts 加接口+token → backend 消费点 `@Optional()` 注入 → impl 注册实现 → 单测」→ type-check + 测试全绿 → 人工 reviewer 按本总纲规则终审（只审不纠）。
- **判定标准**：
  - **通过**：一次完成、无返工、规则全符合 → 文档合格，map 收尾。
  - **失败**：任一环节偏航/返工 → 记录缺口补文档，重测一轮；超一轮仍败 → 文档不合格，不收尾。

### 六、复制即用模板（以 impl-mx + USER_SYNC_HOOK 为活示例）

总纲内嵌三个「从零到一」逐步模板，每步配可复制 TS 骨架 + 指向活示例文件参照：

**① 机制② 扩展点模板**（首选路径）：contracts 加接口+token → backend 消费点 `@Optional() @Inject(TOKEN)` → impl `implements IInterface` + `createAuthProviders()` 注册。
- 参照：`packages/contracts/src/auth/user-sync.interface.ts`（接口定义）、`packages/contracts/src/tokens.ts`（token）、`packages/backend/src/auth/impl/services/login.service.ts:27`（`@Optional()` 消费）、`packages/impl-mx/src/old-site-user-sync.hook.ts`（实现）、`packages/impl-mx/src/auth/index.ts`（注册）。

**② 机制① 覆盖模板**（少用路径）：覆盖同 token 的写法 + 强调第一条的三条准入。反例参照 ADR-0018 重构史。

**③ 机制③ 新功能模块模板**（占位规范）：私有包提供 `@Controller` + Service，backend 经 ADR-0019 `IMPL` 机制动态挂载。**无已落地参照**——明确标注，探针测试可优先选机制③ 验证此模板。

### 七、与 0019/0020/0021 的关系

| 既有 ADR | 总纲引用方式 | 总纲补充 |
|---------|-------------|---------|
| 0019 分包架构 | 引用 `@cloudcad/*` 命名空间、IMPL 加载机制、多实现体系 | 明确 0019 的「覆盖同 token」属机制①且是少用路径；USER_SYNC_HOOK 式扩展点（机制②）是首选 |
| 0020 可替换 vs 内部 | 引用 OSS/Pro 实现是否不同 → 判断是否抽象 | 0020 的「可替换模块」= 机制①/② 的**触发前置**；扩展点 vs 内部服务判定放在判断流程第一步 |
| 0021 contracts/impl 边界 | 引用 contracts 三层划分、token 归拢、impl 不得相对路径 | 类型获取规则 + DTO 自动生成条款（0021 未覆盖）；0021 的「结构类型兼容」在总纲有 DTO 形状落地写法 |

**决策链路**：`0020 判定可替换 → 0021 定契约位置 → 0019 定包形态 → 0026 定机制+类型+验收`。

## Considered Options

- **机制① 直接禁止**：否决——单一责任接口的覆盖在少数场景（如替换存储实现）合理，一刀切禁止会迫使绕路。
- **DTO 手动进 contracts**：否决——与 api-sdk 自动生成形成双来源，必然漂移（grilling Q3 修正）。
- **六场景各自成文**：否决——注水；收敛为矩阵 + 两条全局结论，可被直接引用。
- **探针任务让 AI 自选**：否决——规模不可控、不可复现；改用预选候选清单。

## Consequences

- 新增私有能力默认走机制②，contracts 是唯一接口承载处，`@cloudcad/api-sdk` 是唯一 HTTP DTO 形状来源。
- `IDatabaseService` 的 `any` 需随 #174（@cloudcad/db 建包）清理为 Prisma 类型。
- impl-mx 的 `as any`/`as string`（6 处非 spec）随类型获取规则落地后清理（#174）。
- 契约包构建产物误提交（`*.js`/`*.js.map`）需清理（#174/#175）。
- map 收尾以探针测试一次通过为准（#175 之后执行）。

## Cross-references

- ADR-0019 分包架构：包划分与 IMPL 加载机制
- ADR-0020 可替换 vs 内部服务：是否抽象的触发前置
- ADR-0021 contracts/impl 边界：契约三层划分与结构类型兼容
- ADR-0018 旧官网用户同步：机制② 活示例（USER_SYNC_HOOK）与机制① 反例
- ADR-0007 三层依赖约束：可替换模块接口是 Layer1→Layer2 解耦核心手段

## 附录：探针候选扩展点清单

- 文件上传后回调钩子（`IUploadCallbackHook`，机制②）
- 审计日志输出目标（可替换，机制① 候选）
- VIP 权益变更通知钩子（`IMembershipEventHook`，机制②）
- 私有统计面板模块（独立 controller/service，机制③，用于验证占位模板）

# 0031 — 前端可替换与扩展点选型规则
**Status**: accepted

后端以 ADR-0020（可替换 vs 内部服务）与 ADR-0026（扩展机制三选一）把「何时抽象」落成了判断规则。前端若照搬同一机制（接口 + DI token + `@Optional()` + impl 包）成本极高：React 无 DI 容器，「接口」只能退化为 Context/Provider/注册表，每个都是复杂度负担；且前端是单一构建产物，多数「差异」已被运行时配置覆盖，真实的第二个实现需求迄今未出现。本 ADR 为前端立相反的规则——**默认不抽象，配置优先**，并划清与后端扩展机制的边界。

**Decision**

**一、判断规则（两步，默认停在第一步）：**

```
[前端遇到"可能不同"的需求]
    ├─ 配置能表达差异？ → 读配置，结束
    │   （RuntimeConfigContext / apiConfig / serverConfig 等）
    └─ 配置不能表达 → 有第二个真实实现需求吗？
        ├─ 没有 → 写死默认实现，不抽象
        └─ 有 → 模块入口配置选择（逃生门，见二）
```

- **配置差异化**（同一实现，靠运行时数据切换）→ 只读配置，**不做接口抽象**。登录方式（wechatEnabled/smsEnabled/allowRegister）、功能开关、上传限制、品牌均属此类。
- **实现差异化**（不同部署/客户要真正不同的行为）→ 默认仍不抽象，**等第二个实现需求真实出现**再走逃生门；不提前预留接口（YAGNI，对应后端 ADR-0020/0012 的「无差别全量抽象增加认知负担」教训）。

**二、逃生门（最轻机制，仅此一句，不展开设计）：**

真实出现第二个实现需求时，在**模块入口**（ADR-0029 的 barrel 边界）用配置选择实现：

```ts
export const getStorageAdapter = () =>
  config.storageAdapter === 'custom' ? new CustomAdapter() : new DefaultAdapter();
```

禁止为此引入：注册表、插件系统、动态 import 加载实现包、Provider 预置 strategy 框架。React 响应式/跨组件共享需求出现时再单独评估，不在本规则内预定义。

**三、与后端扩展机制的边界（不混用）：**

- 前端规则**不引入后端词汇**：不出现「DI token」「`@Optional()`」「impl 包」「OSS/Pro 覆盖」；只与后端 ADR-0020 的**意图**对齐——「会不会有第二个实现」。
- **ADR-0026 的「三选一」机制（替换 / 扩展点 / 新模块）不适用于前端**：
  - 替换：前端无 token 覆盖机制；
  - 扩展点：`@Optional()` 注入是容器词汇，前端无容器；
  - 新功能模块：前端新功能 = 常规开发（新页面/模块，走 ADR-0029 模块入口），不是扩展机制。
- 避免 AI 在 React 里套后端扩展机制是写死本规则的直接原因。

**四、现状盘点（2026-07 审计结论）：**

| Seam | 现状事实 | 判定 |
|---|---|---|
| 登录 | AuthContext 直调 SDK；微信登录内联（popup + storage 事件）；开关由 RuntimeConfigContext 驱动 | 配置差异化，不抽象 |
| 主题 | ThemeContext：localStorage + DOM data-theme + 与 mxcad-app 事件双向同步；CSS 变量体系 | 配置差异化（主题色是数据），不抽象 |
| 存储/上传 | `apiConfig.UPLOAD_CONFIG` + `serverConfig.uploadFileConfig`；上传走 SDK | 配置差异化，不抽象 |
| 配置 | RuntimeConfigContext（后端公参）+ getConfig（模块级 Map）+ BrandContext | 配置差异化，不抽象 |

> 注：`getConfig.ts` 的模块级 `Map` 本身违反「禁止模块级变量」规范（状态管理归 ADR-0030 管），属执行层问题，与本规则无关。

**Guidance**

- 新增需求先走两步判断；默认不造任何抽象，除非第二个实现需求已真实出现。
- Code Review 必拦：前端出现仿后端 DI 的接口/Provider 注册体系、或从 ADR-0026 三选一词汇推导出的前端抽象。
- 逃生门只在模块入口开，消费者继续只从入口导入（ADR-0029），实现细节不外泄。

**Status**: accepted

**Cross-references**

- ADR-0020 后端可替换 vs 内部服务（判断问题的意图来源）
- ADR-0026 后端扩展机制总纲（三选一词汇的出处，本 ADR 明确其不适用于前端）
- ADR-0029 前端模块入口 Façade（逃生门的落点边界）
- ADR-0030 前端状态归属（配置数据归属 react-query 的边界）
- 前端可替换与扩展点选型规则 ticket（map「前端 AI 开发地基建设」子票 179）

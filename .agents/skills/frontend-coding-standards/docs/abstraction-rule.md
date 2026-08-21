# 可替换与扩展点选型规则（前端）

对应 ADR-0031。**前端默认不抽象，配置优先**；后端 ADR-0026 的「三选一」机制（替换/扩展点/新模块）及其词汇（DI token / `@Optional()` / impl 包）**不适用于前端**。

## 两步判断流程

```
[前端遇到"可能不同"的需求]
    ├─ 配置能表达差异？ → 读配置，结束
    │   （RuntimeConfigContext / apiConfig / serverConfig 等）
    └─ 配置不能表达 → 有第二个真实实现需求吗？
        ├─ 没有 → 写死默认实现，不抽象
        └─ 有 → 模块入口配置选择（逃生门）
```

- **配置差异化**（同一实现，靠数据切换）→ 只读配置，不做接口抽象。
- **实现差异化** → 等第二个实现需求真实出现再抽象；不提前预留接口（YAGNI）。

## 逃生门（最轻机制，真实出现第二个实现需求时）

在**模块入口**（ADR-0029 的 barrel）用配置选择实现：

```ts
export const getStorageAdapter = () =>
  config.storageAdapter === 'custom' ? new CustomAdapter() : new DefaultAdapter();
```

禁止：注册表、插件系统、动态 import 加载实现包、Provider 预置 strategy 框架。

## 当前盘点（2026-07 审计）

| Seam | 判定 |
|---|---|
| 登录（AuthContext） | 配置差异化，不抽象 |
| 主题（ThemeContext） | 配置差异化，不抽象 |
| 存储/上传（UPLOAD_CONFIG / serverConfig.uploadFileConfig） | 配置差异化，不抽象 |
| 配置（RuntimeConfigContext / getConfig / BrandContext） | 配置差异化，不抽象 |

## 反模式

| ❌ | ✅ |
|----|-----|
| 前端照搬后端「接口 + DI token + @Optional()」抽象 | 默认不抽象，配置优先；确需时走模块入口配置选择 |
| 从 ADR-0026 三选一词汇推导前端扩展机制（注册表/插件/动态加载） | 前端无容器，无需扩展机制 |
| 为「可能的未来差异」提前抽接口（预测性设计） | 等第二个真实实现需求出现再说 |

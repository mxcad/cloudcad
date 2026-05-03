# 架构门禁审查报告

审查时间：2026-05-03
扫描范围：apps/frontend-vue/src/
扫描文件数：16（6 composables + 4 stores + 4 components + 2 pages）

## 审查结果：PASS

### 统计

| 规则 | 违规数 |
|------|--------|
| 规则一：域间隔离 | 0 |
| 规则二：Store 只存状态 | 0 |
| 规则三：页面只做组装 | 0 |
| 规则四：事件桥接 | 0 |
| **合计** | **0** |

## ✅ 架构门禁通过

全部 16 个文件通过四条规则检查，无违规项。

---

### 逐规则详析

#### 规则一：域间隔离

所有 composable 导入均在域内或基础设施域：

| Composable | 导入的其他 Composable | 域 |
|------------|---------------------|-----|
| useCadEngine | cad.store（仅 Store）| cad |
| useCadCommands | useCadEngine, useCadEvents, useProgress | cad + infra |
| useCadEvents | 无 | cad |
| useProgress | 无 | infrastructure |
| useTheme | 无 | infrastructure |
| useI18n | 无 | infrastructure |
| useUppyUpload | auth.store（仅 Store）| upload |

无跨业务域依赖。

#### 规则二：Store 只存状态

| Store | 状态 | 判定 |
|-------|------|------|
| cad.store.ts | ref/getter/setter 纯状态 | ✅ |
| ui.store.ts | ref/getter/setter 纯状态 | ✅ |
| auth.store.ts | validateToken() 中 API 调用已注释，当前仅操作 ref | ✅ |
| theme.store.ts | ref/computed/getter/setter + localStorage 持久化 | ✅ |

> **建议（非违规）**：`auth.store.ts` 的 `validateToken()` 方法注释中预留了 API 调用。将来取消注释时需将 API 逻辑移到 composable 或 service 层。

#### 规则三：页面只做组装

`CadEditorPage.vue`（唯一页面组件）：

- `handleOpenFile()` — 创建隐藏 `<input type="file">` 并调用 `cadEngine.openFile()`。属于浏览器原生 API 的 UI 交互，非业务逻辑。
- `beforeUnloadHandler()` — 标准 `beforeunload` 事件处理，仅检查 `cadEngine.isDocumentModified` 状态。
- `handleExitChoice()` — 简单编排：调用 `cadEngine.saveFile()` 或关闭对话框。

`App.vue` — 纯模板，`<script setup>` 为空。

#### 规则四：事件桥接

扫描到 5 处 `window.*Event*` 调用：

| 文件 | 事件 | 判定 |
|------|------|------|
| useCadEvents.ts:40 | `addEventListener` | ✅ 桥接内部实现 |
| useCadEvents.ts:51 | `dispatchEvent` | ✅ 桥接内部实现 |
| CadEditorPage.vue:224 | `beforeunload` | ✅ 浏览器标准事件 |
| useTheme.ts:71 | `storage`（跨标签页同步）| ✅ 浏览器标准事件 |
| useCadCommands.ts:100 | `keydown`（Ctrl+S 快捷键）| ✅ 浏览器标准事件 |

无 `mxcad-*` 自定义事件绕过 useCadEvents 的情况。

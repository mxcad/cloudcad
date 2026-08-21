# 状态管理归属规则（ADR-0030）

**归属判断顺序：先分 server/client，client 再按共享范围与更新频率分。**

## 归属判断规则

| 状态类型 | 归属 | 判定依据 |
|----------|------|----------|
| **Server 状态**（从后端读取/写入的数据） | **@tanstack/react-query** | queryKey 统一收 `lib/queryKeys.ts`；缓存/失效/重试交给 react-query，staleTime 兜底本地缓存。**禁止**用 Zustand/Context 手写 fetch+缓存布尔 |
| **Client 状态 · 组件私有** | **局部 state（useState）** | 仅单个组件使用、不跨组件共享 |
| **Client 状态 · 树形作用域共享** | **React Context** | 读取多、写入少（「读重写轻」）；作用于 Provider 子树。典型：Auth、Theme、Sidebar、Tour、Notification |
| **Client 状态 · 全局共享** | **Zustand** | 写入频繁；或需在 React 外（命令/事件/服务）通过 `getState()` 访问；或需 persist。典型：CADEditor 状态、文件系统导航、撤销/重做栈、剪贴板、全局弹窗开关 |

**判定顺序**：先问是不是 server 状态（→ react-query），再问作用域（组件私有 → 局部；子树共享 → Context；全局/高频写/外部访问 → Zustand）。

## 使用规则

- 新增状态先走判定顺序；「该用哪个容器」不确定时按上表决策，**不自行发明 fetch+缓存布尔模式**
- server 数据一律 react-query；`useState` 只放组件私有；Context 只放子树共享读重写轻；Zustand 只放全局高频写/外部访问/persist
- **禁止模块级可变状态**（模块级 `let` / 模块级 `Map` 缓存等）
- 非 React 代码通过 `useXxxStore.getState()` 读写 Zustand

## React Query Key

所有 `@tanstack/react-query` 的 `queryKey` 必须通过 `src/lib/queryKeys.ts` 工厂创建。禁止本地常量和硬编码字符串。详见 `docs/query-key-management.md`。

## 现状判定（2026-07 审计定案）

| 项 | 判定 |
|----|------|
| `uiStore.toasts/activeModal`、`notificationStore` | 僵尸，判死删除（写入方改走 NotificationContext 的 `globalShowToast`） |
| `tierConfigStore`、`BrandContext` 配置、`RuntimeConfigContext` 配置 | 迁 react-query（query + staleTime） |
| `AuthContext`、`fileSystemStore.personalSpaceId` | 保留豁免 |
| `fileSystemStore`/`fileSystemUndoRedoStore`/`fileSystemClipboardStore`/`planSelectStore`/`useBatchDownloadStore`/`useCADEditorStore` | 合规保留（高频写/外部访问/persist） |
| `NotificationContext`/`ThemeContext`/`SidebarContext`/`TourContext`/`ProfileContext` | 合规保留（读重写轻 + 子树作用域） |

## ADR 参考

- ADR-0030 前端状态管理归属规则：`docs/adr/0030-frontend-state-ownership.md`

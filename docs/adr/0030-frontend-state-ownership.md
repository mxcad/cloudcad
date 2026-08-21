# 0030 — 前端状态管理归属规则
**Status**: accepted

前端同时存在 9 个 Zustand store、8 个 React Context 与 @tanstack/react-query（`lib/queryKeys.ts`，104 处 useQuery/useMutation），但归属无成文规则：`tierConfigStore` 把 server 状态（VIP 配置注册表 fetch + 缓存）塞进 Zustand；`uiStore.toasts/activeModal` 被写入却无人渲染；`notificationStore` 生产零消费，真实 toast 系统是 `NotificationContext`（CustomEvent 桥接 + `globalShowToast`）。本 ADR 定下归属判断规则、僵尸处置定案与存量审计结论，对应后端 ADR 的「契约单一源/类型单一源」治理精神，为前端立「状态该住哪」的显式标准。

**Decision**

**归属判断规则（先分 server/client，client 再按共享范围与更新频率分）：**

| 状态类型 | 归属 | 判定依据 |
|---|---|---|
| **Server 状态**（从后端读取/写入的数据） | **@tanstack/react-query** | queryKey 统一收 `lib/queryKeys.ts`；缓存/失效/重试交给 react-query，staleTime 兜底本地缓存。**禁止**用 Zustand/Context 手写 fetch+缓存布尔。 |
| **Client 状态 · 组件私有** | **局部 state（useState）** | 仅单个组件使用、不跨组件共享。 |
| **Client 状态 · 树形作用域共享** | **React Context** | 读取多、写入少（「读重写轻」）；作用于 Provider 子树。典型：Auth、Theme、Sidebar、Tour、Notification、页面私有 Context。 |
| **Client 状态 · 全局共享** | **Zustand** | 写入频繁；或需在 React 外（命令/事件/服务）通过 `getState()` 访问；或需 persist。典型：CADEditor 状态、文件系统导航、撤销/重做栈、剪贴板、全局弹窗开关。 |

判定顺序：**先问是不是 server 状态（→ react-query），再问作用域（组件私有 → 局部；子树共享 → Context；全局/高频写/外部访问 → Zustand）。**

**僵尸处置定案**（判死，删除走尾部执行队列）：

- `uiStore.toasts / addToast / removeToast`（写入方：`CADEditorDirect.tsx`、`useExternalReferenceUpload.ts`）与 `uiStore.activeModal / openModal / closeModal`（生产零读写）→ **删除**，写入方改走 `globalShowToast`（NotificationContext）。
- `notificationStore.ts`（唯一消费方 `notificationStore.spec.ts`）→ **删除**（含 spec）。
- `uiStore` 保留（`globalLoading` 子系 live，`LoadingOverlay.tsx` 消费）。

**存量审计结论**：

| 项 | 判定 | 处置 |
|---|---|---|
| `tierConfigStore` | 该挪 | 迁至 react-query（query + staleTime），删 store；消费方改走 hook |
| `BrandContext` / `RuntimeConfigContext` | 该挪 | server 配置迁 react-query；Provider 只做读取透传或移除 |
| `AuthContext` | 保留豁免 | 读重写轻 + 全树作用域 + 命令式登录/登出，迁移风险高收益低 |
| `fileSystemStore.personalSpaceId` | 保留豁免 | server 缓存但仅作导航上下文，改动面小，不迁 |
| `fileSystemStore`（path/selection/viewMode/sort/search/persist）、`fileSystemUndoRedoStore`、`fileSystemClipboardStore`、`planSelectStore`、`useBatchDownloadStore`、`useCADEditorStore` | 合规保留 | 高频写 / 外部访问 / persist 属 Zustand 正当场景 |
| `NotificationContext` / `ThemeContext` / `SidebarContext` / `TourContext` / `ProfileContext` | 合规保留 | 读重写轻 + 子树作用域 |

**Guidance**

- 新增状态：先走判定顺序；「该用哪个容器」不确定时按上表决策，不自行发明 fetch+缓存布尔模式。
- server 数据一律 react-query；`useState` 只放组件私有；Context 只放子树共享读重写轻；Zustand 只放全局高频写/外部访问/persist。
- 存量迁移（tierConfig/Brand/RuntimeConfig）与僵尸删除属破坏性变更，排入尾部执行队列，与并行开发协调，不在本 ADR 内动手。
- 新增 server 缓存一律不进 Context/Zustand；发现「Zustand/Context 手写 server 缓存」的新代码，Code Review 必拦。

**Status**: accepted

**Cross-references**

- ADR-0028 前端依赖分层与门禁（L2 含 `stores/`/`contexts/`/`hooks/`，本 ADR 是其内部归属细化）
- ADR-0029 前端模块入口（hook 归属边界；状态归属与入口归位正交）
- ADR-0019 / ADR-0021 契约与类型单一源（server 数据归属 react-query 的后端对应）
- 前端状态管理归属规则 ticket（map「前端 AI 开发地基建设」子票 178）
- 「死代码与重复实现清点」ticket（僵尸清单锁定）

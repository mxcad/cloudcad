---
name: cad-engine-integration
description: CAD 引擎集成规范 — mxcad-app 黑盒、MxCADManager 单例、WebGL 上下文保持、协同 SDK、事件驱动通信。Use when working with MxCADView, mxcadManager, MxCpp, collaboration (cooperate), CADEditorDirect, MxFun commands, file open/save, ext reference, or any CAD engine interaction in frontend or mobile.
---

# CAD 引擎集成

> mxcad-app（Vue + Vuetify 黑盒 npm 包）通过单例门面与 React 通信。

## 架构总览

```
CADEditorDirect.tsx (全局叠加层)
  → mxcadManager (MxCADManager 单例)
    ├── MxCADContainerManager — DOM 容器
    └── MxCADInstanceManager — MxCADView 生命周期
      → MxCADView (mxcad-app 黑盒)
```

**关键文件：** `packages/frontend/src/services/mxcadManager/index.ts`, `packages/frontend/src/pages/CADEditorDirect.tsx`

## 初始化流程

```
loadMxCADDependencies()
  → initMxCADConfig(file)           // mxcad-app 配置 + 打印/裁剪/上传回调
    → mxcadManager.initializeMxCADView(fileUrl)  // 创建 MxCADView
      → initThemeSync()              // Vuetify 主题同步
        → wait 2 requestAnimationFrame  // 确保 canvas 已渲染
```

## 核心模式

### MxCAD API 访问

```typescript
import { MxCpp, MxFun } from 'mxcad';
const mxcad = MxCpp.getCurrentMxCAD();
```

### 打开文件

```typescript
MxFun.sendStringToExecute('__openWebFile__', [url, undefined, true, authHeaders, fetchFlags]);
// 监听 openFileComplete 事件确认完成，60s 超时，失败重试 3 次
```

### 保存文件

```typescript
MxCpp.App.getCurrentMxCAD().saveFile(name, callback(data), false, false, undefined);
// callback 接收 Uint8Array（含 .buffer），然后 POST /api/v1/mxcad/savemxweb/{nodeId}
```

### 协同 SDK

**加入/退出协同禁止裸调 SDK，必须经引擎命令派发**（`mxcadCollaboration.ts` 已注册
`__joinCollabWork__` / `__exitCollabWork__`，见下方「命令注册」铁律）：

```typescript
import { dispatchCreateWork, dispatchJoinWork, dispatchExitWork, getCooperate } from '@/services/mxcadManager';

// 加入协同：派发 __joinCollabWork__（引擎先停掉在途绘图命令再 joinWork）
// 返回 false = 引擎未就绪/派发失败（回调不会再来，调用方须自行落定）
dispatchJoinWork(workId, (iRet) => { /* 0=成功, 17=已恢复会话, 5=已关闭, 负值=SDK繁忙 */ }, userId, encodedUser);

// 创建协同：派发 __createCollabWork__（成功后引擎**自动加入**协同，无需再 joinWork）
// 返回 false 同上；回调 workid > 0 = 成功, 4 = 已存在
dispatchCreateWork((workid) => { /* ... */ }, workData, userId, encodedUser);

// 退出协同：派发 __exitCollabWork__（同步，返回引擎错误码，0=成功）
dispatchExitWork();
```

> 详细模式见 [docs/collaboration.md](docs/collaboration.md)

### 事件驱动通信

mxcad-app（Vue 黑盒）与 React 通过 `window.CustomEvent` 通信：

| 事件 | 用途 |
|------|------|
| `mxcad-save-required` | 未登录时显示登录提示 |
| `mxcad-save-as` | 触发另存为弹窗 |
| `mxcad-file-opened` | 更新 URL 和 store |
| `mxcad-file-open-complete` | 隐藏全局 loading |
| `mxcad-new-file` | 重置状态 |
| `mxcad-theme-changed` | 主题同步 |

### 命令注册（引擎命令机制 — 铁律）

mxcad/mxdraw 内部有**命令机制（命令状态机）**：引擎同一时刻只执行一个命令。
**凡涉及图纸打开/修改的操作，必须注册为引擎命令并经 `MxFun.sendStringToExecute` 触发，禁止在 React 层直接调 SDK**——
否则该操作会与在途绘图命令（如画线）并发执行，破坏引擎状态 → 内存溢出/各种意外崩溃。

```typescript
// 覆盖 mxcad-app 默认命令需要先 removeCommand
MxFun.removeCommand('Mx_NewFile');
MxFun.addCommand('Mx_NewFile', handler);
// 延迟 2s 确保 mxcad-app 初始化完成

// 注册内部命令后，统一经 sendStringToExecute 触发（不要裸调底层 SDK）
MxFun.addCommand('__openWebFile__', handler);
MxFun.sendStringToExecute('__openWebFile__', [url, ...]);
```

- `__openWebFile__`（打开文件）是该规则的**既有实例**（`mxcadBootstrap.ts`）——**不是特例**，勿因它"单独注册了一个命令"就认为它与其他调用方式有差异
- 加入协同（`joinWork`）/ 退出协同（`exitWork`）/ 创建协同（`createWork`，成功后自动加入）本质也涉及图纸的**打开与修改**（`joinWork` 自动加载协同文件、`exitWork` 回退本地编辑），**必须同样注册为引擎命令**——已落地：`mxcadCollaboration.ts` 模块加载期注册 `__joinCollabWork__` / `__exitCollabWork__` / `__createCollabWork__`，唯一入口 `dispatchJoinWork` / `dispatchExitWork` / `dispatchCreateWork`（barrel 导出），所有调用点（`useCollabActions` / `useCollabAutoJoin` / 退出命令 `performExitWorkSync`）均经派发，不得裸调 `cooperate.joinWork/exitWork/createWork`

### WebGL 上下文保持

`CADEditorDirect.tsx` 使用 `visibility: hidden + z-index + pointer-events: none` 而非条件渲染。
渲染在 React Router `<Routes>` 之外，通过 `isActive`（store）控制显示。

### 容器管理

一个永不销毁的 `<div id="mxcad-global-container">`（`position: absolute; left: 300px`），
`mxcadManager` 在 `document.body` 下管理此容器。

## 关键陷阱

- **永远不要自己 `new MxCADView()`** — 必须通过 `mxcadManager.initializeMxCADView()`
- **`Mx_NewFile` 覆盖必须在 setTimeout(2s) 后** — 否则 mxcad-app 会覆盖回来
- **协同 `createWrok` 成功后会自动加入** — 无需再调 `joinWork`
- **`joinWork` 的 SDK 自动加载文件** — 调用前确保 UI 状态已就位
- **协同退出使用 `exitGuardRef`（3s 冷却）** — 防止 auto-join 循环
- **初始化等待 2 个 `requestAnimationFrame`** — 确保 canvas 已挂载再隐藏 loading
- **`cache` 模式** — `__openWebFile__` 的 header flags 控制缓存行为
- **加入/退出/创建协同必须走引擎命令**（同 `__openWebFile__`）— 裸调 `joinWork`/`exitWork`/`createWork` 会与在途绘图命令（画线等）并发，破坏引擎状态（内存溢出/崩溃）；`__openWebFile__` 不是特例，是「凡动图纸的操作都注册为引擎命令」这条通用规则的实例
- **后端转换 `mxcadassembly.exe` 子进程传参（Windows）** — `spawn` 传含双引号的 JSON 参数**必须** `windowsVerbatimArguments: true`（`packages/backend/src/mxcad/conversion/mxcad-exec.ts` 已设 `!isLinux`）：Node 默认把参数里的 `"` 转义成 `\"`，而 mxcadassembly 按原始命令行解析、不认转义 → 解析不到 `srcpath` 报 `read file error`（aaf2626 把 exec 改 spawn 后回归）。**mxcadassembly 成功/失败退出码恒 2123，成败只认 JSON stdout 的 `code`，勿按退出码判成败**

## 文档引用

- 协同详细实现：`docs/collaboration.md`
- 文件存储路径：加载 `file-storage-paths` Skill
- API 契约：加载 `api-contracts` Skill

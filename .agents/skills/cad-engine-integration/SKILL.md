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

```typescript
const mxCAD = MxCpp.getCurrentMxCAD();
const cooperate = mxCAD.getCooperate();
cooperate.init({ server_addres: '/api/cooperate' });

cooperate.createWrok(onResult, workData, userId, encodedUser);
// workid > 0 = 成功, 4 = 已存在; 成功后**自动加入**协同

cooperate.joinWork(workId, callback, userId, encodedUser);
// 结果码: 0=成功, 17=已恢复会话, 5=已关闭, 负值=SDK繁忙

cooperate.exitWrok();  // 断开连接 → 回退本地编辑
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

### 命令注册

```typescript
// 覆盖 mxcad-app 默认命令需要先 removeCommand
MxFun.removeCommand('Mx_NewFile');
MxFun.addCommand('Mx_NewFile', handler);
// 延迟 2s 确保 mxcad-app 初始化完成
```

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
- **后端转换 `mxcadassembly.exe` 子进程传参（Windows）** — `spawn` 传含双引号的 JSON 参数**必须** `windowsVerbatimArguments: true`（`packages/backend/src/mxcad/conversion/mxcad-exec.ts` 已设 `!isLinux`）：Node 默认把参数里的 `"` 转义成 `\"`，而 mxcadassembly 按原始命令行解析、不认转义 → 解析不到 `srcpath` 报 `read file error`（aaf2626 把 exec 改 spawn 后回归）。**mxcadassembly 成功/失败退出码恒 2123，成败只认 JSON stdout 的 `code`，勿按退出码判成败**

## 文档引用

- 协同详细实现：`docs/collaboration.md`
- 文件存储路径：加载 `file-storage-paths` Skill
- API 契约：加载 `api-contracts` Skill

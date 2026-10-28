# 0084 — 引擎命令机制铁律：凡动图纸的操作必须注册为引擎命令并经 sendStringToExecute 派发

**Status**: accepted（2026-10-27）

## 背景

mxcad/mxdraw 引擎内部有**命令机制（命令状态机）**：引擎同一时刻只执行一个命令。`MxFun.sendStringToExecute(cmd, args)` 同步执行 `MxCmdRunManager.runCmd`——先 `endPanCommand()` + `MxJigCmdManager.stopCmd(kNewCommadIn)` **停掉在途绘图命令**（如画线），再调用注册的 handler；参数按引用传递（同一 JS 上下文），回调函数可作参数（与 `__openWebFile__` 的 retCall 同模式）。

历史上前端存在两种形态并存：

- `__openWebFile__`（打开文件）注册为引擎命令，所有调用点经 `sendStringToExecute` 派发（`mxcadBootstrap.ts` 注册）；
- 协同操作（`cooperate.joinWork` / `exitWork` / `createWork`）从 React 层（`useCollabActions` / `useCollabAutoJoin`）**直接裸调 SDK**。

裸调是并发隐患：用户正在执行画线命令时点「加入协同」，`joinWork`（SDK 内部自动加载协同文件 = 打开层面）与在途画线命令**并发执行**，破坏引擎状态 → 内存溢出 / 各种意外崩溃。`exitWork`（回退本地编辑 = 修改层面）、`createWork`（成功后自动加入协同）同理。`__openWebFile__` 不是特例——它是「凡动图纸的操作都注册为引擎命令」这条通用规则的正确形态，协同操作只是漏网。

## 决策

### D1 铁律：凡动图纸的操作必须注册为引擎命令

凡涉及图纸打开/修改的操作（打开 / 保存 / 加入协同 / 退出协同 / 创建协同 / …）必须经 `MxFun.addCommand` 注册、`MxFun.sendStringToExecute` 派发，**禁止在 React 层直接调 SDK**。引擎命令状态机保证「同一时刻只有一个命令在跑」——执行新命令前先停掉在途绘图命令，是 mxcad/mxdraw 防内存溢出 / 意外崩溃的底层机制；绕过它 = 两个操作在引擎里并发 = 状态破坏。

### D2 协同三命令 + 唯一派发入口

- `mxcadCollaboration.ts` 模块加载期注册 `__joinCollabWork__` / `__exitCollabWork__` / `__createCollabWork__`（handler 自取 `getCooperate()` 并 `init` 服务端地址，自包含；协同对象不可用时回调 -1）；
- 唯一入口（barrel 导出）：`dispatchJoinWork(workId, onResult, userId, encodedUser): boolean`、`dispatchCreateWork(onResult, workData, userId, encodedUser): boolean`、`dispatchExitWork(): number`（同步，返回引擎错误码，-1 = 引擎/协同对象不可用）；
- 返回 `false` / `-1` = 引擎未就绪 / 派发失败，**回调不会再来**——调用方须自行落定（复位 phase/锁、关 loading、toast），不得等一个永不到来的回调；
- 调用点全部收敛：`useCollabActions`（handleJoinWork / handleCreateWork + 卸载孤儿清理）、`useCollabAutoJoin`（tryJoin + 卸载清理；派发失败按瞬时失败进重试链）、`performExitWorkSync`（退出命令唯一执行点）。收敛后 `cooperate.joinWork/exitWork/createWork` 在 src 只剩命令 handler 一处直调。

### D3 自定义命令名用 `__xxx__` 前缀，模块加载期注册即存活

引擎 `registerCommand()` 只覆盖它自己的**内置**命令名，`__openWebFile__` / `__joinCollabWork__` 等自定义名模块加载期注册即存活，无需引擎 init 后重新绑定（区别于 `Mx_NewFile` 这类撞内置名的命令——那些须 `rebindMxCommands` 夺回，见 mxcadBootstrap 既有机制）。

### D4 已否决备选

| 备选 | 否决理由 |
|---|---|
| React 层直调 SDK（现状） | 与在途绘图命令并发，破坏引擎状态（内存溢出/崩溃）——本 ADR 要消灭的正是它 |
| CustomEvent 桥接（React 层发事件、引擎侧监听后调 SDK） | 事件不在引擎命令状态机内——不会停掉在途命令，并发问题原样存在，只是把裸调挪了一层 |
| React 层 Promise 队列串行化 | React 层感知不到引擎在途命令状态（画线命令在引擎内部），自研队列替代不了引擎 `stopCmd(kNewCommadIn)` 的语义 |

### D5 测试环境守卫

vitest 把 mxcad/mxdraw 别名到空模块（`MxFun = undefined`）：注册处用 `typeof MxFun?.addCommand === 'function'` 守卫跳过，派发入口用 `typeof MxFun?.sendStringToExecute !== 'function'` 短路 + try/catch——模块加载不受影响，测试环境下派发入口返回 false / -1，调用方走「派发失败」落定路径。

## 后果与代价

- **三层**：仅前端改动（`mxcadCollaboration.ts` 注册 + 派发入口、调用点收敛、barrel 导出）；后端 / API SDK / DB 零改动。
- **测试形态**：vitest 的 mxcad/mxdraw 别名指向同一 stub，两个 `vi.mock` 工厂互相覆盖，须在一个 factory 里同时给 `MxCpp` + `MxFun`；mock 引擎命令表 = `Map<name, handler>` + `sendStringToExecute` 同步调用；mock barrel 的 spec（useCollabActions / useCollabAutoJoin / CollaborateSidebar.collab）必须补三个 dispatch mock（透传到 cooperateMock 对应方法），否则真实 hook 触达缺失导出即 VitestMocker 报错。
- **新操作准入**：以后任何「动图纸」的新操作先问一句「它注册成引擎命令了吗」，没注册就按 `__openWebFile__` 模式补；评审协同相关代码时，看到裸调 `cooperate.joinWork/exitWork/createWork` 即视为违反本铁律。
- **派发失败语义**：调用方必须处理「回调不会再来」（立即落定），不得永久卡在 joining/creating 态。

## 相关

- ADR-0005（mxcadManager Command pattern——前端 UI 层 CommandRegistry，与引擎命令机制是**两套机制**：前者是前端命令路由，后者是引擎状态机，勿混）
- ADR-0069（mxcad 两级参数契约——后端侧引擎契约；本 ADR 是前端侧命令派发契约）
- `cad-engine-integration` skill（「命令注册」铁律节 + 「协同 SDK」节）

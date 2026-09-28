# 移动端 mxcad 使用盲区清单（Mobile CAD Blind Spots）

> 生成日期：2026-09-28
> 范围：`packages/frontend_mobile` 中一切与 mxcad / mxdraw 引擎交互的代码
> 方法：只读通读 `src/plugins/mxcad/**`、`src/command/**`、`src/pages/home/**`、`public/mxUIConfig.json`，
> 外加 `node_modules/mxcad/dist/mxcad.d.ts`、`node_modules/mxdraw/dist/mxdraw.esm.js`（引擎源码）、
> `node_modules/mxcad/package.json`，以及线上构建产物 `dist/js/index.*.js` 的静态核对。
>
> **状态图例**：🐞 已确认缺陷（有代码/产物证据）｜⚠️ 高风险疑点（需真机验证）｜❓ 待用户裁定（需领域知识）｜ℹ️ 现状记录

---

## 0. 先读这段：本轮发现的最重要事实

**命令注册是「排进队列但永不执行」的。**

`src/plugins/mxcad/command/index.ts` 里有一个命令排队机制：

```ts
let commands: { cmd: string, fun: Function }[] = []

export const registerCommand = () => {
  while (commands.length !== 0) {
    const obj = commands.pop()
    if (obj) { const { cmd, fun } = obj; MxFun.addCommand(cmd, fun) }
  }
}

export const addCommand = (cmd: string, fun: Function) => {
  (store.state.MxFun !== null) ? MxFun.addCommand(cmd, fun) : commands.push({ cmd, fun })
}
```

`registerCommand()` 这个「排空队列」的函数**全仓从未被调用**（`grep -rn "registerCommand"` 只命中它自己的定义）。

排空函数存在的唯一理由：`src/main.ts:40` 在模块求值阶段就 `import "./command"`，把 34 个命令文件
全部执行一遍（`src/command/index.ts:1-34`）。那一刻 `store.state.MxFun === null`——mxdraw 的 store
初始态就是 `{ MxFun: null, Mxassembly: null, isCreateDrawObj: false }`，`setMxFun` 只在
`loadCoreCode() → _load() → window.MxUiMain = (t) => { store.commit("setMxFun", t) }` 里被调用，
而 `_load()` 是 `mxfun()` 这个独立打包函数加载 MxUiMain bundle 时才跑的（`mxdraw.esm.js` 实证，全仓仅此 1 处 `setMxFun`）。

**产物证据**（`dist/js/index.e13e0263.js`，非猜测）：

- 排队分支确实存在：`let I5=[];const ve=(e,t)=>{Xo.state.MxFun!==null?xe.addCommand(e,t):I5.push({cmd:e,fun:t})}`
- 排空函数被 tree-shake 掉了：`I5.pop(` 在整包里出现 **0 次**（`registerCommand` 是 dead code，vite 直接删掉）
- 但命令体本身还在：`"m_mx_offset"` @506391、`"m_mx_trim"` @501409、`"m_mx_fillet"` @517923、
  `"m_mx_chamfer"` @529321、`"m_mx_extend"` @503634 —— 函数体打包进来了，**只是从没被 `addCommand` 注册**

**结论**：`src/command/**` 下全部 61 个 `addCommand(...)` 调用（绘制/图层/测量/标注/编辑全组）
在这个代码形态下都是**静默 no-op**。用户点按钮 → `callCommand('m_mx_xxx')` →
`MxFun.sendStringToExecute` → 引擎 `runCmd` 在模块级命令表里查不到 → 打 `未知命令"m_mx_xxx"` 到引擎命令行 → 返回 `false`。

对照 PC：`packages/frontend/src/services/mxcadManager/mxcadBootstrap.ts` 直接 `MxFun.addCommand`，
不排队、且都在引擎初始化完成后调用，所以没有这个问题。

> ❓ **这一点需要用户确认**：这个结论与你描述的「倒角能生效、偏移能生效」相矛盾——
> 若队列真的永不排空，这 4 个命令应该**全都**无效。所以我无法确定你测的是
> (a) 当前这套源码（那 4 个都该是 no-op），还是 (b) 某个排空过的构建。
> 详见文末 Q1。

---

## 1. 架构总览（移动端实际长什么样）

```
src/main.ts:40  import "./command"          ← 模块求值期，排队 61 个命令（永不排空）
      │
src/pages/home/index.vue  (编辑器根，keep-alive)
      ├─ onMounted
      │    ├─ 协同分支   : await createMxCAD()                       (L469)
      │    ├─ 分享分支   : useShareFileLoad(..., createMxCAD, ...)   (L504-508)
      │    └─ 普通分支   : await createMxCAD()                       (L516)
      │    └─ initEditObjectToolbar(mxcad)                          (L476 / L530)
      │
src/plugins/mxcad/index.ts  createMxCAD(fileUrl?)
      ├─ new McObject()
      ├─ mode 判定 / getParamsFromUrl / empty.mxweb 兜底
      ├─ mxcad.on("init")        → MxFun.getQueryString("sup_mul_touch")
      │                            → MxFun.setIniset({MobileCommandOperationSupportsMultipoint:true})
      ├─ mxcad.create({ canvas:"#mxCanvas", locateFile, fileUrl, fontspath,
      │                 middlePan:true, enableUndo:true })
      ├─ await initReady         ← resolve 于 mxcad.on("init_mxcad")
      └─ return mxcad

单一分发器：callCommand(cmd) === MxFun.sendStringToExecute.bind(MxFun)
      ├─ useFooterToolbar.onClick / onHistoryBtnClick
      ├─ useEditObjectToolbar  (选中浮层)
      ├─ useMenu  (顶栏菜单)
      ├─ pages/home/index.vue  头部按钮
      └─ LibraryPanel.vue:380  (唯一一处直接调 MxFun.sendStringToExecute)
```

**移动端没有 `mxcadManager`。** PC 的 `packages/frontend/src/services/mxcadManager/`
（MxCADContainerManager + MxCADInstanceManager + 全局叠加层）在移动端**没有对应物**，
就是一个 `createMxCAD()` 自由函数 + 一个 `<canvas id="mxCanvas">`（`index.vue:704`）。

移动端**没有任何共享 CAD 包**：`@cloudcad/contracts` 在 `frontend_mobile` 中 0 命中，
CAD 代码相对 PC 是**整套复制并另写了一遍**——连引擎原生就有的命令也重写了
（`docs/archive/plans/mobile-pc-cad-gap-analysis.md:64-70` 记录了这件事：
PC 用 `Mx_Offset`/`Mx_Chamfer`/`Mx_Fillet`/`Mx_Trim`/`Mx_Extend`，移动端手写 `m_mx_*`）。

---

## 2. 命令清单（61 个 addCommand，按分组）

| 分组 | 命令名 |
|---|---|
| 绘制 | `m_mx_line` `m_mx_circle` `m_mx_arc` `m_mx_rect` `m_mx_elliptical` `m_mx_polyline` `m_mx_point` `m_mx_et_pencil` `m_mx_text` `m_mx_revcloud` `Mx_Insert` `m_mx_img` `Mx_InsertImageWithUpload` |
| 编辑 | `m_mx_copy` `m_mx_move` `m_mx_rotate` `m_mx_mirror` `m_mx_trim` `m_mx_extend` `m_mx_offset` `m_mx_fillet` `m_mx_chamfer` |
| 图层 | `new_layer` `layer_list` `set_current` `close_the_layer` `turn_off_other_layers` `fully_open_layers` `layer_fully_closed` `restores_the_previous_layer_current` |
| 标注 | `m_mx_aligned_marked` `m_mx_linear_marked` `m_mx_dimangular` `m_mx_radial_dimension` `m_mx_diametric_dimension` |
| 测量 | `m_mx_measuring_length` `m_mx_measuring_length_continuous` `m_mx_measuring_area` `m_mx_measuring_area_line` `m_mx_measuring_coordinate` `m_mx_measuring_arc` `m_mx_measuring_angle` |
| 批注 | `m_mx_arrow` `m_mx_lead_comment` |
| 工具/文件 | `Mx_SetObjectColor` `m_mx_find_text` `OpenDwg` `OpenDwg_DoNotUseCache` `Mx_SaveAsMxWeb` `Mx_NewFile` `Mx_versionHistory` `Mx_layouts` `Mx_ShowCollaborate` `Mx_ShowDrawingLibrary` `Mx_ShowBlockLibrary` `Mx_export` `Mx_saveDwg` `Mx_exportPDF` `Mx_Share` `Mx_SaveToCloud` `Mx_SaveAsToCloud` |

**引擎原生注册的只有 13 个**（`mxdraw.esm.js` 里 `addCommand("` 的全部命中）：
`Mx_Undo` `Mx_Redo` `Mx_Pan` `McDraw_GripEdit` `Mx_FrontEndWebpageIntelliSel`
`Mx_FrontEndWebpageGripEdit` `MxTest_*`（测试用）。

> ℹ️ 所以 `Mx_Undo`（头部撤销按钮）能工作、`Mx_Erase`（选中浮层「删除」）能工作——
> 后者是引擎 mxcad 侧自带的。**凡是 `m_mx_*` 前缀的，全在移动端自己实现。**

---

## 3. 移动端交互的特殊配置（`setIniset` / `create` 选项）

这是移动端和 PC 端**唯一的**引擎行为差异点，全部集中在 `src/plugins/mxcad/index.ts`：

| 配置 | 位置 | 作用 | 备注 |
|---|---|---|---|
| `canvas: "#mxCanvas"` | `create()` | 画布挂载点 | `index.vue:704` 的裸 `<canvas id="mxCanvas">` |
| `locateFile` | `create()` | wasm/js/worker 路径 | `/node_modules/mxcad/dist/wasm/${mode}/`，**mode 决定 2d 还是 2d-st** |
| `middlePan: true` | `create()` | 中键/单指平移 | 引擎内部在 `browse==2 && middlePan===undefined` 时会 `setMouseMiddlePan(0)` 并 `setIniset({ForbiddenDynInput:true, EnableCADEntityGripEdit:0})`——**这会把动态输入框关掉** |
| `enableUndo: true` | `create()` | 撤销栈 | 头部 `Mx_Undo` 依赖 |
| `ShowCoordinate: false` | `init_mxcad` 事件 | 隐藏坐标图标 | `setAttribute` |
| `MobileCommandOperationSupportsMultipoint: true` | `init` 事件 | 多点触控命令操作 | **仅当 URL 带 `?sup_mul_touch=true`** |
| `Mx_Fillet_radius` / `Mx_Fillet_isPruning` | `localStorage` | 圆角半径/修剪模式持久化 | 命令内自管 |
| `mx_chamfer_dist` / `mx_chamfer_dist1` | `localStorage` | 倒角距离持久化 | 命令内自管 |
| `mx_historyBtnList` | `localStorage` | 工具栏最近使用 6 项 | `useFooterToolbar` |

> ❓ **`?sup_mul_touch=true` 的开关没有任何入口。** 全仓没有代码会往 URL 里加这个参数，
> 也没有 UI 开关。也就是说移动端默认跑在**单点触控**模式，除非用户手动拼 URL。
> 这是否符合预期？见 Q4。

---

## 4. 数字输入的盲区（本轮最重要的架构发现）

**移动端没有任何给 CAD 命令输入数字的机制。**

- 全仓 7 处 `MxCADUiPrDist` / `MxCADUiPrAngle` 调用（`m_mx_chamfer`、`m_mx_fillet`、`m_mx_offset`、
  `m_mx_rotate`、`m_mx_revcloud`、`m_mx_polyline`、`marked/m_mx_dimangular`），
  全部直接 `await xxx.go()`，**没有任何一处接了数字键盘**。
- 关键词桥 `src/pages/home/hooks/useRunCmdOperationBtnList.ts`：
  正则 `/(.+)\[(.+)\]/` 拆出 `[选项(A)/选项(B)]`，渲染成 vant 按钮，
  点按钮走 `MxFun.setCommandLineInputData(key, 13)`——**永远只发送单个字母，从不发送数字**。
- `src/App.vue:60` 有个 `<van-number-keyboard safe-area-inset-bottom />`，
  **没有任何 `show` / `value` / `@input` 绑定，全仓没有任何代码显示它**。它是个死掉的占位。
- 引擎侧**没有**任何虚拟键盘逻辑：`mxdraw.esm.js` / `mxcad.es.js` 里 `keyboard`、`van-number`、
  `insertText`、`execCommand`、`showInputDialog` 命中数全部为 0。
  引擎只监听真实 `keydown`/`keyup`，**没有模拟键盘输入的官方 API**。

后果（这正是你报的几个问题的共同根因）：

| 命令 | 距离从哪来 | 触屏上的实际结果 |
|---|---|---|
| `m_mx_offset` 偏移 | 「通过点」模式：`dist = pt.distanceTo(closestPoint)` | 距离 = 你点在哪儿，**只受位置控制，不能指定数值** |
| `m_mx_fillet` 圆角 | `MxCADUiPrDist`，默认 `radius = 0` | `radius=0` → `kernel.ts:495` 返回 `undefined` → **无几何产出** |
| `m_mx_chamfer` 倒角 | `MxCADUiPrDist`，默认 `0/0` | 内核返回 `undefined` → 落到 `MxChamfer` 原生兜底 → **用引擎默认值倒角**（所以"能倒"，但长度改不了） |

> ℹ️ 所以「偏移有效但设置不了方位和距离」「倒角有效但设置不了长度」**不是两个独立 bug**，
> 而是同一个缺失能力的两种表现：**没有任何输入数字的通道**。

---

## 5. 你报的 4 个问题的逐条定位

### 5.1 倒圆角无效（🐞 已确认，3 个叠加原因）

`src/command/m_mx_fillet.ts`

1. **`L22` 参数传错**：`getDist.setKeyWords(\`${t("指定圆角半径")}<${radius.toFixed(4)}>\`)`
   ——提示文案被传给了 `setKeyWords` 而不是 `setMessage`。`setKeyWords` 期望 `[选项(字母)]` 语法，
   传中文文案进去等于给了个非法关键词表。
2. **默认半径是 0**：`L15` `let radius = Number(localStorage.getItem("Mx_Fillet_radius")) || 0`。
   首次使用时 `radius === 0`。
3. **`radius=0` 时几何内核直接放弃**：`kernel.ts` 的 `createLineSegmentRoundJoin`
   → `createChamferedLinesFromSegments(..., 0, 0, ...)` → `L495 if (chamferDist <= 0 && chamferDist1 <= 0) return`
   → 多段线分支 `L105 if(!segmentLine) return`（no-op）；两直线分支 `L335-343` `arc` 为 `undefined`，
   `arc && draw(arc)` 不执行，**但 `apply()` 仍返回 `true`**——「看起来成功，什么都不画」。

### 5.2 倒角能生效但长度改不了（🐞 已确认）

`src/command/m_mx_chamfer.ts`

- `L37-40`：`chamferDist`/`chamferDist1` 默认 `0`。
- `L39-40` 的 `if (typeof chamferDist !== "number")` 是**死代码**：`Number(null) === 0`，
  类型永远就是 `number`，这个兜底永不生效。
- 长度只能靠 `距离(D)` / `角度(A)` 关键词按钮进入 `MxCADUiPrDist`，而后者在触屏上只能靠点在画布上给值（见 §4）。
- `L1169` 原生兜底 `MxCpp.App.MxCADAssist.MxChamfer(id, id, x1,y1,x2,y2, dist1, dist2, isPruning)`
  在 `dist1=dist2=0` 时**仍然执行**——引擎按默认距离倒角。这就是「倒角能倒但长度改不了」的确切成因。

### 5.3 剪切无效（🐞 部分确认 + ❓）

`src/command/m_mx_trim.ts`

- **`L54-62` 无守卫空引用**：`getPoint` 由 `MxCADUtility.userSelect` 的回调赋值，
  但 `L62 getPoint.getStatus()` 没有 `if (getPoint)` 守卫。
  回调只在用户取消时触发，正常选完对象后 `getPoint` 可能未赋值 → `TypeError`。
- **两阶段选择**：先选边界（edge），再选要修剪的对象。移动端单点触控下，
  第一次选不到东西就 `ss.allSelect(filter)` 全选——**没有任何"只选边"的引导**，
  用户无从知道要先选哪一条。
- `L103` / `L173` 只认 `ent instanceof McDbCurve`，而 `L53` 的 filter 含
  `CIRCLE,ARC,XLINE`——这几类在栏选/窗交分支里被**静默跳过**。

### 5.4 延伸无效（🐞 已确认，含一个纯死代码状态机）

`src/command/m_mx_extend.ts`

- **`isExtend` 是纯死状态**：`L11` 声明，`L77-95` 的「边(E) → 隐含边延伸模式」分支
  会 `isExtend = true/false`，但**全文件没有任何地方读取 `isExtend`**。
  `DoExtend`（`L68` / `L131` / `L138`）的签名里也没有这个参数。
  也就是说「隐含边延伸」这个功能**从来就不存在**，只是 UI 上有一个能点的开关。
- filter 比 trim 窄：`LINE,LWPOLYLINE,ARC`（trim 还有 `ELLIPSE,CIRCLE,SPLINE,XLINE`），
  同样的图在两个命令下行为不一致。
- `L3` 跨命令导入 `getHurdleSelectionPoints` 自 `./m_mx_trim`。

### 5.5 偏移有效但设不了方位和距离（🐞 已确认）

`src/command/m_mx_offset.ts`

- 方向 + 距离**共用同一个 prompt**：默认走 `通过点(T)` 模式，`dist = pt.distanceTo(basePoint)`。
  位置决定一切，数值无法指定。
- `dist` 是模块级 `let`（`L8`），**永不重置**，上一次的值会静默沿用。
- 点在图元正上时 `dist === 0` → `L93` / `L126` 静默 `return`，无任何提示。

---

## 6. 其它已确认缺陷（不属于你报的范围，但同样真实）

| # | 位置 | 问题 | 状态 |
|---|---|---|---|
| 6.1 | `plugins/mxcad/index.ts:38` | `if (mode === "st") { mode === "2d-st"; }` ——赋值写成了比较，**永不生效**。`mode="st"` 会带着非法值进 `locateFile`，wasm 路径直接 404 | 🐞 |
| 6.2 | `public/mxUIConfig.json` 5 个分组图标 | 批注 `pizhu`、绘制 `huitu`、**编辑 `xiugai`**、测量 `celiang`、工具 `gongju` ——这 5 个名字在 `src/assets/icons/iconfont.js`（90 个 symbol）里**全部不存在**。分组图标全部渲染成空白 | 🐞 |
| 6.3 | `command/m_mx_polyline.ts:69-75` | `window.addEventListener("keydown"/"keyup", ...)`（Ctrl 调线宽）**永远不移除**，且每进一次命令就多挂一对 | 🐞 |
| 6.4 | `pages/home/hooks/useRunCmdOperationBtnList.ts:38` | `MxFun.listenForCommandLineInput(...)` 无 `onBeforeUnmount` / 无退订，跨编辑器实例泄漏 | 🐞 |
| 6.5 | `command/m_mx_trim.ts:47` | 裸表达式语句 `isExtend` ——既无作用也无意义 | 🐞 |
| 6.6 | `command/m_mx_trim.ts:115` | `isByWindow = true` 后仅 `continue`，**没有任何地方读取 `isByWindow`**（窗交分支靠 `getPoint` 的第二个返回值间接走） | 🐞 |
| 6.7 | `command/m_mx_chamfer.ts:39-40` | `typeof x !== "number"` 守卫死代码（见 §5.2） | 🐞 |
| 6.8 | `pages/home/index.vue:469 / 507 / 516` | `createMxCAD()` 有三个调用点（协同/分享/普通），任何「引擎初始化后做 X」的逻辑都得改三处。命令注册排空若挂在这里，漏一处就失效 | ⚠️ |
| 6.9 | `docs/archive/plans/mobile-pc-cad-gap-analysis.md:65-69` | 把 偏移/倒角/圆角/修剪/延伸 标为 🟢 已实现 ——**结论已过期** | ℹ️ |

---

## 7. 需要你的领域知识才能定的（❓）

以下每一项我都查了 `node_modules/mxcad/dist/mxcad.d.ts`（447KB）、
`mxdraw/dist/mxdraw.esm.js`（1.5MB）、`mxcad/package.json`，
线上文档 `https://mxcad.github.io/mxcad_docs/` 返回 **404**，
GitHub repo `https://github.com/mxcad/mxcad_docs.git`（package.json 里的 homepage/repository）
同样打不开。`MxCpp.mxcadassemblyimp` 在 d.ts 里是 `any`，
所以 `MxDrawTrimAssist` / `MxDrawExtendAssist` / `MxCADAssist.MxFillet` / `MxChamfer`
的真实签名**在本地无从查证**——它们全是 WASM 绑定，只暴露在二进制里。

---

## 8. 需要你回答的问题

**Q1 — 你测的是哪套构建？**（决定 Q2-Q3 的排查方向）
你说「倒角能倒、偏移能偏」，但按当前源码，这 4 个命令应该**全都**是静默 no-op
（原因见 §0）。所以想确认：
- (a) 你是在**当前 develop 分支跑起来的**（`pnpm dev` / 本地 build）上测的？
- (b) 还是在**线上部署的构建**上测的？
- (c) 还是记错了，其实是「点按钮有反应（出命令行提示）」而不是「真的画出了图元」？

这个区别很关键：如果是 (c)，那「有反应」可能是引擎的 `未知命令` 提示而不是命令真的执行了。

---

**Q2 — 数字输入你想走哪条路？**（§4 + 附录 A）
移动端现在完全没有输入数字的通道。三个候选方案在附录 A，我倾向 **A（关键词点选）**。
- 如果你知道 `MxFun.setCommandLineInputData` 能吃数字串，就走 **B**（体验最好）。
- 如果接受参数面板（弹 van-popup 先填距离/角度再执行），走 **C**。

---

**Q3 — 延伸的「隐含边」模式还要不要留？**
`m_mx_extend.ts` 和 `m_mx_trim.ts` 里都有一个「边(E) → 隐含边延伸模式」的开关，
但 `DoExtend` / `DoTrim` 都没有这个入参，`isExtend` 写了从来不读——**这个功能从来没存在过**。
mxcad 的 `MxDrawExtendAssist` 上有没有别的 API 能开隐含边延伸？
如果没有，我建议把这个开关从提示里删掉（留着一个点了没反应的开关是坏 UX）。

---

**Q4 — `?sup_mul_touch=true` 是不是漏了入口？**
`MobileCommandOperationSupportsMultipoint` 这个多点触控开关只认 URL 参数，
全仓没有任何代码会带这个参数，也没有 UI 入口。默认是单点触控。
这是故意的（先做单点，多点后置）还是漏了？

---

**Q5 — 圆角半径为 0 时的默认行为？**
AutoCAD 的 FILLET 在半径为 0 时确实什么都不做。现在移动端首次使用 `radius=0`，
所以点「圆角」必然空转，除非先按 `R` 设半径。
要改成「半径为 0 时先弹半径提示」吗？这会让命令多一步交互，但不用手记 R 这个关键词。

---

## 附录 A：给命令加参数的候选方案（供 Q1 选用）

| 方案 | 做法 | 优点 | 风险 |
|---|---|---|---|
| **A. 关键词点选（零新 UI）** | 模仿 `m_mx_offset` 的「通过点」模式，加一个 `通过点(P)` 关键词，`radius = 点到角点的距离` | 零新增组件、和现有代码同构、`MxCADUiPrEntity`/`setUserDraw` 已有现成用法 | 精度靠手点；`MxCADUiPrDist` 在触屏上的真实返回值语义未经真机验证 |
| **B. 数字键盘注入** | 用 `MxFun.setCommandLineInputData(str, 13)` 把**数字串**（而非单个字母）塞进引擎命令行 | 复用现有关键词桥；能精确输入 | `setCommandLineInputData` 是否接受非字母串、`MxCADUiPrDist` 是否会消化它——**均为未验证假设**，官方文档 404 无法确认 |
| **C. 命令前参数面板** | 点工具栏按钮先弹 `van-popup`（距离 + 方向/角度），确定后再 `callCommand` | UX 最清晰、完全可控 | 要给 4+ 个命令各写一份面板；参数持久化（localStorage）也要一起定 |

**我倾向 A**：不赌未验证的引擎行为，且和现有代码同构。但如果你知道 B 在 mxcad 里是可行的，B 的体验明显更好。

---

## 附录 B：本轮用到的静态证据位置

| 证据 | 位置 |
|---|---|
| 排队分支 + 无排空 | `dist/js/index.e13e0263.js` offset 267587：`let I5=[];const ve=(e,t)=>{Xo.state.MxFun!==null?xe.addCommand(e,t):I5.push({cmd:e,fun:t})}`；`I5.pop(` 全包 0 命中 |
| 命令体在包里但未注册 | 同文件 `"m_mx_offset"` @506391、`"m_mx_trim"` @501409、`"m_mx_fillet"` @517923、`"m_mx_chamfer"` @529321、`"m_mx_extend"` @503634 |
| `setMxFun` 全仓仅 1 处 | `mxdraw.esm.js` @1294319：`store.commit("setMxFun",e)`，位于 `_load(t)` 的 `window.MxUiMain` 赋值闭包内 |
| 命令表是模块级 JS 对象 | `mxdraw.esm.js`：`i.addCommand=function(t,e,n){null==n&&(n=MxCommandFlag.MCRX_CMD_MODAL);var r=t.toUpperCase();... a[r]={fun:e,cmd:t,flag:n}}` |
| 未知命令的引擎行为 | `mxdraw.esm.js` `runCmd`：`console.log(m.MxFun.formatString('未知命令"{0}"',e))` 或 `MxUiVue.acutPrintf('未知命令"{0}。\n命令:',e)` 后 `return false` |
| `init_mxcad` 的触发时机 | `mxcad.es.js` @1127298：`MxFun.setIniset(...)` 与 `mxCadObj.mxdraw.setMouseMiddlePan(...)` **之后**才 `mxCadObj.callEvent("init_mxcad", mxCadObj)` |
| 引擎原生命令仅 13 个 | `mxdraw.esm.js` `addCommand("` 全部命中 |

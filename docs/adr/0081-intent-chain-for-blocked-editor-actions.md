# 意图链：编辑器动作被前置阻塞后跨登录中断可恢复

**Status**: accepted

用户在 CAD 编辑器点「分享」（`Mx_Share`）时，如果当前图纸还没有云端节点，现状只弹一条 toast「请先保存图纸到云端后再分享」就返回失败——用户不知道自己该去哪、点哪个，意图到此中断。诉求不是只修这一个动作，而是「被前置阻塞的编辑器动作，哪怕中途要跳登录，也要保证用户的原始意图最终真实完成」，并且要能覆盖同类的其他分支。

排查后确认这不是一个交互问题，而是**三个各自成立但没串起来的既有机制之间的缺口**：登录闸门只能挡住不能恢复、另存为成功后不回写会话、编辑器重建有严格时序且已有 owner。

## 现状事实

1. **分享失败是无出口的 toast**。`ShareCommand`（`frontend/src/services/mxcadManager/cmd/shareCommand.ts`）在 `currentFileId` 为空时 `globalShowToast('请先保存图纸到云端后再分享')` 并返回失败。没有可操作入口。

2. **`Mx_SaveToCloud` 只是 `Mx_Save` 的别名转发**。`saveToCloud.ts` 只有一行 `MxFun.sendStringToExecute('Mx_Save')`；建档语义全在 `SaveCommand` 与 `saveFile.ts`。

3. **「保存到云端」对有云端节点的文档是静默的，对本地文档是有交互的**。`saveFile.ts` 按 `parentId` / `libraryKey` / `projectId` 三分派，三者皆空（新建空白图纸的 `currentFileInfo = { fileId:'', parentId:null, projectId:null }`）落到最后一行 `showSaveAsDialog`——用户必须选目录、命名。所以「登录后自动运行 Mx_SaveToCloud」的真实含义是「自动弹出另存为面板」，不是无感保存。

4. **另存为成功后当前编辑器的会话不指向新节点（根因缺口）**。`useExportModals.handleSaveAsSuccess` 上传完成后只问「是否在新标签页中打开」，全程不写会话。全仓 `setCurrentFileInfo` 仅 3 个调用点，全在 `drawingSession/session.ts` 的 `openSession`/reset。后果：本地文档另存为建了新节点 → 当前编辑器 `currentFileId` 仍是空串 → 重新跑 `Mx_Share` **再次失败**。这条链路在现有代码下数学上走不完。

5. **登录闸门是单向的**。`useLoginGate`（注释标为 A8 唯一 owner）把 return URL 构造、`showMxCAD(false)`、抑制标志全收敛了，但它是「未登录则不放行」——没有恢复路径。

6. **编辑器重建有严格时序且已有 owner**。`useFileOpenGuard` 在 `isAuthenticated` 变化时已跑 `reloadCurrentFile()`，其内部走 `waitForDocumentLoaded` 等 `OPEN_COMPLETE`；引擎同一时刻只能打开一个文档，时序错会锁死首次打开的 `hideLoading`（`mxcadInstanceManager.waitForDocumentLoaded` 注释有详细记录）。续跑必须挂在这个锚点上，不能挂「登录成功」事件之后。

7. **已有一条未成体系的先例**。`pendingVipPurchase` 写 sessionStorage → Login 页读走 + 清掉 + `setTimeout(100)` 派发 `QUOTA_GUIDE_EVENT`。结构上就是待办意图，但没有抽成机制、没有前置概念、没有失败语义。

8. **移动端是另一套形态**。`useMenu.ts` 的 `Mx_Share` 发 `CustomEvent('mxcad-share-current')`、`Mx_SaveToCloud` 是 `saveToCloudTrigger.value++`，没有 `currentFileId` 判据，也没有 `CommandRegistry`。

## 决策

### D1 — 命名为「意图链」，声明式而非命令式

**意图链（Intent Chain）** = 用户声明的一个动作 + 一串前置条件。前置不满足时挂起链，前置满足后按序续跑，直至原始动作真实执行。

与登录闸门的边界：闸门是「未登录则不放行」的**单向**阻止，无恢复路径；意图链是**可恢复**的阻止。二者是上下游——意图链的 `auth` 前置会调用闸门，闸门不感知链。CONTEXT.md 新增「意图链」词条并与既有「登录闸门」语义划清。

### D2 — 前置类型只有两个：`auth` 与 `cloud-existence`

**关键：这两个前置不是因果关系。** `ShareCommand` 缺 `fileId` 的提示语说「请先保存到云端」而不是「请登录」——缺云端节点不是未登录的直接推论：登录用户在游客模式下新建图纸再分享，缺的是云端节点而非登录态。判定顺序：先 `auth`（未登录无法建档），已登录但无云端节点才走 `cloud-existence` 前置（弹「是否保存到云端后分享」确认），**不必跳登录**。

**明确不纳入**：协同 `local` 来源降级（`useCollabActions` 判 `!currentFileId` 时不是拒绝而是显式降级为 `sourceType='local'`，语义不同）、导出配额/VIP 门控（已有 `QUOTA_GUIDE_EVENT` 独立闭环）。把它们拉进来会把机制做成万能管道。

### D3 — 载体：sessionStorage 单键，纯状态机进 `@cloudcad/platform`

状态机（前置判定、挂起/续跑、覆盖语义、失败后保留意图）是纯逻辑，但 `@cloudcad/platform` 的既定纪律是**吃参数不读全局存储**（`auth/permissions.ts`、`billing/membership.ts` 均有此约束）。因此状态机把存储当**依赖注入的 port**（`get`/`set`/`remove` 传参），两端各自传自己的 sessionStorage adapter。符合 platform 准入四条：纯函数/纯数据、不绑框架、不绑端、重复已成立（PC 与移动端两份同构需求，命中「同一能力在 ≥3 个文件重复实现」反模式的预防线）。

必绑端的副作用留在端侧薄 adapter：`MxFun.sendStringToExecute`、Vue `ref.value++`、React `useEffect`、`showMxCAD`。**不新起共享 UI 包**。

选 sessionStorage 而非 hash：移动端 URL 形态固定 `base?query#path`、业务参数在 hash 之前（ADR-0070），往 hash 塞业务状态与该约束直接冲突；且 hash 会被 `history.replaceState`、书签、分享污染。sessionStorage 天然单 tab 生效、关 tab 即失效，正是意图链要的语义。redirect 参数只负责把人带回 `/cad-editor`。

**不加 `ttl` 字段**：session 生命周期本身就是过期语义，再叠加时钟字段是双重语义。

数据结构：

```ts
interface IntentChain {
  id: string;
  action: { type: 'Mx_Share' } & Record<string, unknown>;
  preconditions: Array<'auth' | 'cloud-existence'>;
  resumeAfter: 'document-loaded';   // 续跑锚点，枚举
  state: 'active' | 'consumed';     // consumed 而非直接删：便于失败后重试同一条
}
```

单键存一条活跃链，新同类意图**覆盖**旧链（后发生的用户意图优先），覆盖动作幂等。

### D4 — 续跑锚点：`document-loaded`，挂在 `useFileOpenGuard`

挂 `useFileOpenGuard` 的 `isAuthenticated` 变化 effect，不挂 Login 页。`useFileOpenGuard` 已是「登录成功 → 恢复编辑器」的唯一 owner，且已持有文档加载完成判据。Login 页只负责把人带回去，不参与链执行。

与 `pendingVipPurchase` 走 Login 页不同：那是纯 UI 提示，无引擎时序依赖。

### D5 — 失败语义：链不回滚但保留原始意图

续跑中某一步失败（保存被权限拒、引擎失败）→ 明确报错，原始意图保持可重试但**不自动重试**。自动重试一个可能因业务原因被拒的动作会形成打扰循环。用户此时手动点分享按钮即重新触发完整链路。

### D6 — 本地文档的会话回填（唯一改变用户可见行为的决策）

本地/新建文档走「保存」时产出是**另存为 → 新节点**，不是「同一个文档上了云」。要让链走通，必须把新节点回填进当前会话（`setCurrentFileInfo` + store `currentFileId`），链才能拿到 `fileId` 继续分享。

回填**不需要重新打开文档**：另存为上传的 blob 就是 `saveCurrentDrawingToBlob` 的当前内容，引擎里的图纸与新节点内容已一致，回填只是修正会话指针。成本低。

**范围硬约束**：回填只在链上下文启用，必须加在另存为成功回调的**链分支**内，不得改全局另存为语义——现状「另存为 = 建议开新标签」是既有行为，全局改掉会把不相关场景一起拖下水。

这同时修正了 `ShareCommand` 提示语的语义错误：原提示「请先保存图纸到云端后再分享」对本地文档不成立，因为另存为创建的是**另一个节点**。

### D7 — 登录拦截复用 `useLoginGate.requireLogin(label)`，不新建组件

文案用动作名（如「保存并分享」）。理由：`useLoginGate` 的注释明确写它是「闸门唯一 owner（A8）」，已收敛 return URL 构造 / `showMxCAD(false)` / 抑制标志。新造「保存到云端确认框 + 登录框」两层组合就是第二份 LoginGate。

### D8 — 重跑 `Mx_Share` 不二次确认

续跑成功后直接开分享面板。用户已经完整走过「确认保存到云端」，再问一次是同一意图的重复确认。

## 测试边界

引擎黑盒（`MxFun`）单测不了，分三层：

1. **platform 纯状态机单测**（主力）：前置判定 / 挂起 / 续跑 / 覆盖语义 / 失败后保留意图的全部分支。
2. **两端 adapter 单测**：只断言副作用——发对了事件、写了 sessionStorage、调了对的登录入口。
3. **链路冒烟手动验**：未登录 Share → 登录 → 自动另存为 → 分享面板自动开。不进 CI（引擎黑盒 + 登录态），写成 checklist 交部署验证。

## 三层影响

- **前端**：PC（React 19）+ 移动端（Vue 3）各一套 adapter，先 PC 后移动端，分两个 PR。
- **API SDK**：零改动。分享与保存的建档都是既有端点，不新增 DTO。
- **后端 / 数据库**：零改动，无 migration。

## 代价与已知未做

- **不实现 `state: 'consumed'`（对 D3 数据结构的偏离）**：ADR 原设计让成功消费后置 `consumed` 而非直接删键，理由是「便于失败后重试同一条」。落地后确认这条理由不成立——失败路径本就不删链（只有成功分支清键），而 D5 已定「不自动重试、用户手动点分享即重新触发完整链路」；D6 回填一旦生效，`currentFileId` 已存在，重跑分享根本不需要链记录就能直接分享。保留 `consumed` 只能提供一个没有消费者的读路径，按仓库「无消费者代码删或标注」反模式不予实现。代价是链成功后 sessionStorage 无痕迹，无法从存储侧追溯「这次分享是链续跑出来的」——审计需求若出现，应落在分享动作本身的埋点而非链载体上。
- **续跑时跳过「保存到云端并分享」确认框**：`beginShareChain` 里已登录无云端节点会弹确认，但 `resumeShareChain` 在 `cloud-existence` 仍阻塞时直接派发 `Mx_SaveToCloud`，不再弹确认。这不是漏实现——用户已在登录闸门看到「保存并分享」的 label 并完成了登录动作，按 D8「重跑不二次确认」，再问一次是同一意图的重复确认；而 D4 的冒烟路径（未登录 Share → 登录 → 自动另存为 → 分享面板自动开）也要求这一步无感。副作用是「自动弹出另存为面板」在每次 `document-loaded` 锚点触发时会重演一次，直到用户完成或放弃。
- **双端 adapter 的重复面**：核心判定收敛到 platform，但 `MxFun.sendStringToExecute` vs `ref.value++` 的差异两端各写一份，这是 ADR-0070 准入规则下的既定代价。
- **移动端的分享前置语义更弱**：`useMenu.ts` 的 `Mx_Share` 目前连 `currentFileId` 判据都没有，落地时要先补判据，否则「链」在移动端没有可判的前置。**本轮（PC PR）未落移动端**：`Mx_Share` 在移动端是无条件 `dispatchEvent('mxcad-share-current')` → `home/index.vue` 的 `handleShareCurrent` 直接 `showShareCurrent = true`，全链路没有任何前置判据，要接链得先给它造出「无云端节点」的判据与新失败分支——那是独立于本机制的行为变更，不是接线。移动端 adapter 是第二个 PR 的工作，platform 层（`intentChain/chain.ts`）已按 ADR-0070 准入规则写成两端可用形态，届时只需补一个 Vue adapter（`sessionStorage` port + `saveToCloudTrigger.value++` 分发 + 登录闸门 trigger），状态机零改动。
- **本地文档会话回填的边界风险**：若未来另存为成功回调被复用于其他非链场景，链分支必须保持可辨识（建议以链 id 判定而非布尔开关）。
- **不做**：不引入 TTL、不做通用「待办动作」管道（不合并 `pendingVipPurchase`）、不做协同 `local` 降级的救援、不做导出配额门控的合并。

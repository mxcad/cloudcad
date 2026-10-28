# agent-browser 参考

独立 Rust CLI（0.27.0），自带 Chromium 经 CDP 驱动。命令 `agent-browser`（本机二进制在 `/d/nodejs/agent-browser`，以实际安装位置为准）。

## 核心循环

1. `agent-browser --session <name> open <url>` — 开页（自带浏览器，无需另起）
2. `agent-browser --session <name> snapshot -i` — 拿带 ref（@eN）的页面快照
3. `agent-browser --session <name> fill @eN <value>` / `click @eN` — 按 ref 操作
4. 操作后**重新 `snapshot -i`**（DOM 变了 ref 会重排）

## 关键规则

- **每个 session 独立**：`--session admin` / `--session user` 是各自独立的浏览器实例、独立 ref 空间、独立登录态。
- **ref 按 session + snapshot 分配**：只 `open` 不 `snapshot` 就 `fill @eN` → `Unknown ref`。**每个 session 操作前必须先 snapshot**（实测踩坑：user session 只 open 没 snapshot，fill 全报 Unknown ref，登录失败停在 /login）。
- **跨 session 不能复用 ref**：admin session 的 @e14 在 user session 不存在。

## 选择器与点击（2026-10-23 受控实验结论）

- **`click` 对 onClick 按钮和 submit 按钮都有效**（CDP 合成点击是真实 click 事件，实测 target 落到按钮/其子 span，React onClick 正常触发、导航正常发生）。早期「onClick 按钮必须 eval」是误诊，全部失败源于选择器 bug。
- **选择器三坑**：
  1. **XPath 不可用**（v0.27.0）：`click "//button[...]"` 恒 `Element not found`。只用 `@eN` ref 或 CSS 选择器（`fill "#email" "..."`、`click "#submit"` 均可）。
  2. **ref 提取必须精确匹配按钮行**：快照首行 generic 卡片的 name 含整页文本，`grep '按钮文本'` 会先匹配到卡片 → 点中卡片中心（实测落到密码输入框）。正确：`grep 'button "按钮文本"' snap.txt | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/^ref=/@/'`。
  3. **结构性 DOM 变化（步骤切换/模态框/跳转）后重新 `snapshot`**；原地重渲染后旧 ref 仍有效。
- **submit 按钮空表单不触发提交**：先 fill 字段再点。
- **`eval` 的 `element.click()` 是兜底**：`agent-browser eval "[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'X')?.click()"`——按钮在快照里认不出或 click 连败时用；驱动真实 UI，仍优于 curl。
- **checkbox 用 `check @eN`**，`click` 可能不 toggle。
- **CDP `click` 在「目标被 overlay/modal 覆盖」时静默 no-op、不报错**（2026-10-26 实测）：症状与选择器 bug 一模一样——`click @eN` 返回 `✓ Done` 但目标毫无反应，而 `element.click()` 能成功（合成 click 绕过命中测试）。真因是坐标处有更高层元素吃了鼠标事件（Vant `van-popup`/`van-dialog`/`van-overlay`，z-index 2001）。排查命中链：
  ```
  agent-browser eval "var el=<目标>; var r=el.getBoundingClientRect(); var h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); h.tagName+'.'+h.className"
  ```
  **正解是先关掉覆盖层，别用 eval 绕过去**。案例：移动端登录页会自动弹 guest 通知 `van-dialog.notice-dialog`（「知道了」按钮）盖住「手机登录」tab —— `click @e21` 两次静默失败，命中链是 `.notice-dialog > .notice-body > p.notice-text`；点掉通知后同一 ref 立即正常。**注意**：弹层若由异步 API 拉回，出现晚于首帧，首个 snapshot 里看不到它——「点了没反应」时必须重新 snapshot 复核是否多出 `dialog`。

## 登录态持久化

- `agent-browser --session <name> state save <file>` — 存 cookie + localStorage（如 `e2e/.auth/agent-admin.json`）
- `agent-browser --session <name> --state <file> open <url>` — 载入登录态，免重登
- 判定存没存对：真实登录态文件 ~几 KB（含 token / cookie）；停在登录页的空态 ~几百字节。
- **`state save <path>` 的 path 是相对「当前工作目录」的**——cwd 不同会落到不同目录（实测：admin 态存到仓库根 `e2e/.auth/`，user 态用绝对路径存到 `packages/frontend/e2e/.auth/`，两处不一致）。**统一用绝对路径存 state**，避免登录态散落在意想不到的地方。

## 等待

- `agent-browser wait --load networkidle` ❌ 本仓库禁用（CAD + 协同 WebSocket 永活跃，实测空等 28s）。
- 用固定 `waitForTimeout` 或等特定元素，给足预算（渲染 30s / CAD 编辑器 60s）。

## 多角色协同

- 开多个 session（admin / user-a / user-b），各自登录（**各自 snapshot 后**再填），各自 `state save`。
- 协同场景：A 建文件 → B 打开同一文件 → 验证双向同步。

## 移动端模拟（测 frontend_mobile）

- `agent-browser set device "iPhone 14"` — 切到手机形态（移动视口 + 手机 UA + touch + isMobile）。其他设备：`"Pixel 7"`、`"iPad"` 等。
- **`set device` 是「浏览器设置」命令，必须先 `open` 起会话再设**——无打开的页面时 `set device` 会**挂起不返回**（2026-10-26 实测，`--session x set device "iPhone 14"` 无任何输出、进程不退出，须 kill）。正确顺序：`open <url>` → `set device "iPhone 14"` → snapshot。
- **移动端是 hash 路由（`createWebHashHistory`），URL 形态是 `http://localhost:7001/#/login`**——`open http://localhost:7001/login` 会被解析成 path=`/login`、hash=空 → vue-router 命中根路径重定向到 `/shell`（游客 CAD 编辑器），**根本不进登录页**（最终 URL `/login#/shell`）。测移动端务必带 `/#/`。
- 测移动端流程：先 `open` 再 `set device`，之后 snapshot / 操作照常。
- 测完 PC 再测移动（或反之）时，记得 `set device` 切换形态——Vant 组件按移动视口布局，用桌面宽视口测移动端布局会错乱。
- **移动端登录页会自动弹 guest 系统通知 `van-dialog.notice-dialog`（z-index 2001）**，盖住登录表单中部（含「手机登录」tab）。通知内容来自 `notices` 表，异步拉回所以首个 snapshot 可能看不到。**开测前先重新 snapshot 找 `dialog` 并点「知道了」关掉**，否则后续 `click` 会静默 no-op（见上「CDP click 被 overlay 覆盖」）。

### 移动端实测补充（2026-10-27，7001 全流程验证）

- **`open`/任何 agent-browser 命令的输出绝不能接管道（`| tail` / `| grep` 直读命令输出）**：session 守护进程持有 stdout/stderr 管道句柄、进程不退出，管道对端 `tail` 等 EOF 永不返回 → 命令永久挂起（实测 `open ... | tail -5` 挂 70s+ 直到 kill）。**一律 `> /tmp/<名>.log 2>&1` 重定向到文件再 `cat`**。注意：`grep`/`cat` 快照**文件**（已落盘）不受影响，坏的只是「直接管道读 agent-browser 命令输出」。
- **移动端 CDP `click @eN` 比 PC 更容易静默 no-op**：关掉 guest 通知、ref 是当前 snapshot 的「立即登录」（enabled 无 disabled 属性），`click @e12` 仍返回 `✓ Done` 但 URL 不变、无 token、无错误。**一律用 eval 的 `element.click()` 兜底**（`eval "[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='立即登录')?.click(); 'done'"` 实测直达 `/shell`）；填表用 CSS 选择器（`fill 'input[placeholder="请输入用户名、邮箱或手机号"]' "..."`），实测能更新 Vue v-model（依赖按钮随即启用）。
- **guest 系统通知 dialog 每次 `open`（含重开 /shell）都会重新弹出**，不是仅登录页首帧一次；换页再 open 又弹。操作前统一先 eval 点「知道了」，别假设只弹一次。
- **登录成功后 `state save` 真实登录态文件 ~5KB**（含 accessToken/refreshToken）；停在登录页的空态文件仅几百字节——用文件体积判「存没存对」。

### 移动端 CAD 编辑器页 about:blank 崩溃（2026-10-27 受控实验定案）

- **现象**：`open http://localhost:7001/#/shell`（CAD 编辑器页）后，**无任何交互**，页面约 20-40s 随机变 `about:blank`（CDP session 崩溃，`localStorage` 读取 SecurityError）。
- **根因隔离（受控实验）**：同 session、同设备模拟（iPhone 14），`/login`（**无** CAD Canvas）→ **90s 稳定不崩**；`/shell`（**有** Canvas）→ **~30s 必崩**。⇒ 崩溃由 **CAD Canvas / WebGL 渲染**（mxcad 引擎在 headless + SwiftShader 软 GL 下崩溃）驱动，**时间驱动、非交互触发、非设备模拟、非应用 bug**。带 Canvas 的页面才是触发源。
- **影响**：任何涉及 CAD 编辑器的移动端交互测试都受限于崩溃窗口（每次 open 后约 5-40s 不稳定），跨命令交互不可靠。
- **可靠应对（子代理实测有效）**：
  1. **用 `async eval` 单次调用完成整个交互流程**（点击+填值+提交在同一步内，DB 验证同一步做），跨命令交互在崩溃窗口内不可靠。
  2. 页面崩溃后 `open` 重试；每个功能在崩溃窗口内完成。
  3. **双轨验证**：浏览器 UI 呈现 + `curl` 后端闭环（拿验证码 Redis、验 token、查 DB）——UI 只证明「用户看到什么/导航到哪」，后端闭环证明「业务真实成功」。崩溃时 UI 断言退化、后端断言仍可靠。
- **判据（区分「工具崩」与「应用 bug」）**：`eval "location.href"` 变 `about:blank` 且无捕获 JS 错误 → 工具/环境问题；若停在原 URL 但有业务报错 → 查应用。
- 测完记得 `agent-browser close --all` 清 session 守护进程（否则残留 daemon 占资源）。

### 移动端登录态与 PC cookie 冲突（2026-10-27 实测）

- **移动端登录态只存 `localStorage`**（`accessToken`/`refreshToken`/`user`），**不靠 cookie**。
- **测移动端禁止 `state load` 一个含 PC cookie（`auth_token`，localhost 域）的 state 文件**：移动端检测到 PC 登录 cookie 会触发「跳回 PC 端」逻辑（`packages/frontend_mobile/src/utils/navigateBack.ts` `getPcBaseUrl()` → 8000），整页跳去 PC、移动端测不下去。**测移动端必须用纯移动端登录**（7001 登录页真实登录后 `state save`），再 `state load` 该移动端 state。若误载 PC state 导致跳 PC，重 `open 7001` + 重登录即可。

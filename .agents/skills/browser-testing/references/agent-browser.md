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

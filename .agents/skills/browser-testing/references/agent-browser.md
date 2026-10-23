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
- 测移动端流程：先 `set device`，再 `open http://localhost:7001/...`，之后 snapshot / 操作照常。
- 测完 PC 再测移动（或反之）时，记得 `set device` 切换形态——Vant 组件按移动视口布局，用桌面宽视口测移动端布局会错乱。

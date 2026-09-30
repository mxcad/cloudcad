# @cloudcad/platform — 跨端公共层

PC / 移动端（以及未来的 App、Electron、平板）共用的**纯函数与纯数据**。一份实现，只改一处。

## 为什么存在

两端是不同 UI 栈（React 19 / Vue 3），但很多**非 UI 的业务语义是同一个**：设备判定、跨端 URL 协议、认证凭证搬运。这些东西过去在两端各写一份，结果是同一判定跑出两种正则、同一协议两端各写一半，改了这头忘了那头。

这个包就是那个"只改一处"的地方。

> 建立本包与 PC↔移动端 URL 互通的完整决策理由（为什么不塞进 `@cloudcad/contracts`、为什么不改路由模式、哪些方案被否决）见 [`docs/adr/0070-platform-package-and-pc-mobile-url-interop.md`](../../docs/adr/0070-platform-package-and-pc-mobile-url-interop.md)。本文件只讲"怎么往里加东西"。

## 准入规则（四条全满足才允许进）

1. **纯函数 / 纯数据**：无 IO（网络、文件、剪贴板、localStorage 读写不算读，见下）、无副作用、无 `await` 不可省的异步。
2. **不绑框架**：不 import React / Vue / 任何 UI 库，不含 JSX、不含组件。
3. **不绑端**：不直接读 `navigator` / `window` / `document` / `localStorage` 等具体端 API。**所有探测函数必须吃参数**（例如 `isMobileByUA(ua: string)`），让 App 端传自己的 UA、Electron 传 `process.platform` 都能复用；只允许极薄的 `currentXxx()` 适配函数读一次端 API 并直接透传。
4. **重复已成立**：两端确实有 ≥2 份实现，或是一处两端都必须遵守的**共享契约**（例如 PC 拼参数、移动端解析参数）。

不满足就不进，就地留在端包。宁可包小一点，不要变成杂物间。

## 禁止

- 任何 React / Vue / DOM 渲染逻辑
- 任何 API 调用（走各端的 `@cloudcad/api-sdk`）
- 任何状态管理（Zustand / Pinia / 模块级可变变量）
- 任何 i18n 文案（文案留在各端语言文件，避免一个包要维护 8 份语言文件）
- 任何需要 Node 运行时能力的东西（这类契约已归 `@cloudcad/contracts`）

## 迁移方式

**渐进式，一次只迁一处**。每发现一处两端重复，就：

1. 在本包加纯函数；
2. 两端的旧实现改为调用它（旧文件可保留为薄适配或删除）；
3. 跑两端 `type-check` + 各自测试。

**不做一次性大迁移**——那会制造无意义的整文件 diff。

## 现有内容

| 模块 | 导出 |
|---|---|
| `src/env/device.ts` | `MOBILE_UA_PATTERN` / `WECHAT_UA_PATTERN` / `DESKTOP_WIDTH_THRESHOLD`（1024，宽屏豁免线）/ `isMobileByUA` / `isWechatByUA` / `isTouchDevice(maxTouchPoints)` / `shouldUseMobilePresentation(env)` / `currentUA()`（唯一读端 API 的适配函数）/ `DeviceEnv` |
| `src/env/auth-transfer.ts` | `AUTH_TRANSFER_QUERY`（参数名常量，含 `_redirect`）/ `buildAuthTransferQuery` / `parseAuthTransferQuery` / `authTransferParamNames`（吃参数，不读 `location`）+ 4 个类型 |
| `src/routes/match.ts` | `compilePathPattern` / `splitPathname` / `matchPathPattern` / `renderPathPattern` / `PathSegment`——零依赖路径 pattern 匹配器（`:param` 占位，段数必须完全相等才算命中） |
| `src/routes/aliases.ts` | `ROUTE_ALIASES`（PC→移动端）/ `MOBILE_TO_PC_ALIASES`（反向）/ `NON_MAPPABLE_PC_PREFIXES`（桌面管理端等不可映射前缀）——**跨端 URL 互通的单一事实源** |
| `src/routes/resolve.ts` | `resolveMobileRoute` / `resolvePcPath` / `isMappableRoute` / `parseSearch` + `ResolvedRoute` |

`src/index.ts` 是唯一的 barrel，所有导出从它转出。

## 加新东西的流程

四步，一步不多：

1. **先 grep 两端是否真的重复**。只有一端用的逻辑留端包；两端都有、或是两端必须共同遵守的契约，才进本包。
2. **写纯函数**。需要读端 API 的，把值做成参数（`f(ua: string)`），另加一个 `currentXxx()` 薄适配读一次并透传——调用方永远可以绕过适配直接传值，这也是测试好写的原因。
3. **两端旧实现改为调用它**，旧代码删掉或留成薄适配。不要留"暂时共存"的双轨（ADR-0026 的 expand-contract 教训：扩的同时排收尾票）。
4. **在 `src/index.ts` 补导出**，两端跑 type-check + 测试。

### 两个已踩过的坑（写路由相关代码必读）

**① 两端路由参数名必须同名。** `renderPathPattern` 按参数名取值，正向（PC params → 移动端 pattern）与反向（移动端 params → PC pattern）都依赖同名；不同名会渲染出**空路径段**（`/shell/file/project/`），静默失败、不报错。

审计命令：

```bash
grep -rn "params\." packages/frontend_mobile/src/pages/shell/sub-pages/*.vue
```

**② 移动端 URL 形态固定 `base?query#path`。** 业务参数在 **hash 之前**（`/mxcad_mobile/?fileId=x&v=3#/shell`），因为移动端 `useFileLoader` 读的是 `window.location.search`。改形态前必须先确认移动端读取位置未变。

衍生约束：版本号 `?v=` 的更新**不能**用 `router.replace({ query })`（v 会落到 hash 之后读不到），必须 `history.replaceState(null, '', url.pathname + url.search)`。

**③ PC 手动打开移动端不传 `markRedirect`。** `_redirect=1` 的语义是"桌面端**自动**跳转"，移动端 `useUser.ts` 看到它会**关闭自身标签页**。手动新标签打开带上它，刚开的页面会自己关掉。

## 门禁

```bash
pnpm --filter @cloudcad/platform type-check
```

本包**没有构建步骤**——`package.json` 的 `exports` 直指 `./src/index.ts`，两端 Vite 直接吃 TS 源码。`tsconfig.json` 的 `lib` 必须含 `DOM`，且**不要用 `DOM.Iterable`**：本包源码会被消费端一起 type-check，移动端 tsconfig 的 lib 不含 `DOM.iterable`，用 `for...of URLSearchParams` 会在移动端编译失败。

测试放在消费端包内（PC 前端 `src/lib/platform.spec.ts`、`src/utils/mobileRedirect.spec.ts`、移动端 `src/utils/pcTarget.spec.ts`），本包不引入测试基建——一个纯函数包不值得多装一套 vitest。

## 与 `@cloudcad/contracts` 的分工

两个都是"跨包共享的纯逻辑"，但域不同（ADR-0070 有完整对比表）：

- **`@cloudcad/contracts`** = 后端 ↔ 后端（DI token + mxcad 引擎参数翻译）。有 `pnpm --filter @cloudcad/contracts scan:purity` 门禁禁 `process`/`globalThis`，因为要被 Node 侧消费；有 tsc→dist 构建步骤。
- **`@cloudcad/platform`** = 前端 ↔ 前端（设备判定 + 跨端 URL 协议 + 凭证搬运）。无纯度门禁（允许 `currentUA()` 读 `navigator`）；无构建。

塞错方向会立刻撞门禁或让后端包依赖前端语义，方向反了。


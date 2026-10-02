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

判定第 4 条时的边界：**只要两端各有一份就够**（不必凑满三处），但**新增函数必须同时接线两端**，不要先造函数、两端适配后补——那样函数会长期只有一个消费端，等于没收敛。

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
| `src/env/auth-transfer.ts` | `AUTH_TRANSFER_QUERY`（参数名常量，含 `_redirect`）/ `buildAuthTransferQuery`（PC 拼参数）/ `parseAuthTransferQuery`（移动端解析）/ `authTransferParamNames`（供消费后从 URL 剥离，**两端都必须调它而不是手写删除清单**）+ 4 个类型 |
| `src/routes/match.ts` | `compilePathPattern` / `splitPathname` / `matchPathPattern` / `renderPathPattern` / `PathSegment`——零依赖路径 pattern 匹配器（`:param` 占位，段数必须完全相等才算命中）。**内部机制，不经 barrel 导出** |
| `src/routes/aliases.ts` | `ROUTE_ALIASES`（PC→移动端）/ `MOBILE_TO_PC_ALIASES`（反向）/ `NON_MAPPABLE_PC_PREFIXES`（桌面管理端等不可映射前缀）——**跨端 URL 互通的单一事实源** |
| `src/routes/resolve.ts` | `resolveMobileRoute` / `resolvePcPath` / `isMappableRoute` / `parseSearch` + `ResolvedRoute` |
| `src/share/expiry.ts` | `SHARE_EXPIRATION_VALUES`（6 档预设→秒）/ `SHARE_EXPIRATION_DEFAULT`（弹窗默认档位，初始化与重置同引；类型排除 `immediate`）/ `SHARE_CUSTOM_DAYS_MIN` / `SHARE_CUSTOM_DAYS_MAX`（自定义天数合法区间，端侧输入框 min/max 提示同源）/ `SHARE_CUSTOM_DAYS_DEFAULT`（自定义天数默认值）/ `detectShareExpiration`（反推选中项，**只有 custom 分支带天数**）/ `computeExpiresAtIso` / `computeExpiresInSeconds`（custom 天数统一过上下界钳制：NaN 回落默认、±∞ 钳到边界）/ `isShareExpired` / `ShareExpirationOption` / `ShareExpirationDetection` |
| `src/billing/price.ts` | `orderAmountCents` / `originalAmountCents` / `centsToYuan`（金额单位「分」，公式与后端 `BillingService.createOrder` 一致） |
| `src/billing/quota.ts` | `usagePercent`（total 非正→0，封顶 100）/ `resolveQuotaValue`（档位配置优先，缺键回落 registry 默认值，ADR-0043） |
| `src/files/name-rules.ts` | `checkFileName(name, maxLength?)` / `FileNameCheckResult` / `FileNameReason`（`empty`/`too_long`/`illegal_chars`/`control_chars`/`reserved_name`/`dot_edges`） |
| `src/legal/placeholder.ts` | `resolvePlaceholders(text, vars)`——`{{双花括号}}` 品牌占位符替换，未知占位符原样保留（漏项可见） |
| `src/auth/password-strength.ts` | `scorePasswordStrength` / `PasswordStrengthScore`（`0\|1\|2\|3\|4` 字面量联合，标签与颜色留端包） |
| `src/format/relative.ts` | `relativeTime`（纯结构 `tier`+`unit`+`value`，文案留端包）+ 2 个类型 |
| `src/format/bytes.ts` | `formatBytes`（B~TB，`parseFloat(toFixed(2))` 去尾零，空/0→`-`） |
| `src/format/date.ts` | `formatDate` / `formatDateTime` / `formatDateTimeWithSeconds`——**固定 ISO-like 格式，locale 无关**；空与非法一律→`''` |
| `src/errors/classify.ts` | `isAbortError` / `isPermissionError` / `isServerError`（两端并集判定，文案留端包） |
| `src/transfer/policy.ts` | `evaluateCrossProjectTransfer`（6 域矩阵 + 库-move 预判，后端仍是最终裁决）+ 7 个类型 |

`src/index.ts` 是唯一的 barrel，所有**产品接口**从它转出。**`src/routes/match.ts` 的路径 pattern 编译/匹配不经 barrel 导出**——它是 `resolve.ts` 的内部机制，需要它的测试按模块路径直接导入（`from './routes/match'`）。判定标准：调用端需要它才能工作就导出，只有本包内部或本包测试需要就不导出。

## 加新东西的流程

四步，一步不多：

1. **先 grep 两端是否真的重复**：

   ```bash
   grep -rn "<函数名或特征实现>" packages/frontend/src packages/frontend_mobile/src
   ```

   只有一端用的逻辑留端包；两端都有、或是两端必须共同遵守的契约，才进本包。
2. **写纯函数**。需要读端 API 的，把值做成参数（`f(ua: string)`），另加一个 `currentXxx()` 薄适配读一次并透传——调用方永远可以绕过适配直接传值，这也是测试好写的原因。
3. **两端旧实现改为调用它**，旧代码删掉或留成薄适配。不要留"暂时共存"的双轨（ADR-0026 的 expand-contract 教训：扩的同时排收尾票）。
4. **在 `src/index.ts` 补导出 + 在 `src/` 加 spec**（本包内 `*.spec.ts`），跑门禁。

### 三个已踩过的坑（写路由相关代码必读）

**① 两端路由参数名必须同名。** `renderPathPattern` 按参数名取值，正向（PC params → 移动端 pattern）与反向（移动端 params → PC pattern）都依赖同名；不同名会渲染出**空路径段**（`/shell/file/project/`），静默失败、不报错。

审计命令：

```bash
grep -rn "params\." packages/frontend_mobile/src/pages/shell/sub-pages/*.vue
```

**② 移动端 URL 形态固定 `base?query#path`。** 业务参数在 **hash 之前**（`/mxcad_mobile/?fileId=x&v=3#/shell`），因为移动端 `useFileLoader` 读的是 `window.location.search`。改形态前必须先确认移动端读取位置未变。

衍生约束：版本号 `?v=` 的更新**不能**用 `router.replace({ query })`（v 会落到 hash 之后读不到），必须 `history.replaceState(null, '', url.pathname + url.search)`。

**③ PC 手动打开移动端不传 `markRedirect`。** `_redirect=1` 的语义是"桌面端**自动**跳转"，移动端 `useUser.ts` 看到它会**关闭自身标签页**。手动新标签打开带上它，刚开的页面会自己关掉。

## 尚未收敛、不属本包范围

PC 端仍有 11 处页面级 `toLocaleString()` / `toLocaleDateString()`（`ShareDialog`、`ShareTable`、`IpBlacklistPage`、`IpWhitelistPage`、`SecurityAccessAttemptPage`、`SystemMonitorPage/ConversionQueueTab`、`ui/calendar`、`UserManagement/MembershipManageModal`、`constants/share.ts` 的 `formatExpiryDate`，及 2 处 spec 内期望串），与 `format/date.ts` 的固定 ISO-like 口径并存。

这不是漏收敛，是**口径本身未定**：`format/date.ts` 的注释已写明「如需保留本地化，可在此把 `datePart`/时间部分换成 `toLocaleString(locale, opts)`（locale 作参数传入）」——即两端对「日期是否跟随界面语言」没有一致结论。本包只收敛**已经两端对齐**的那部分，不会去动这些调用点，也不会为它们造第二个 formatter。

要给这些点定口径，先改 `docs/adr/0070-*` 或新增 ADR 说明产品决定，再决定是走 `format/date.ts` 还是保留 `toLocaleString`。在此之前它们是端包内的事。

## 门禁

```bash
pnpm --filter @cloudcad/platform type-check   # tsc --noEmit
pnpm --filter @cloudcad/platform test         # vitest run
```

两条都跑。CI（`.github/workflows/ci.yml` 的 platform 步骤）依次执行 type-check 与 test。

本包**没有构建步骤**——`package.json` 的 `exports` 直指 `./src/index.ts`，两端 Vite 直接吃 TS 源码。`tsconfig.json` 的 `lib` 必须含 `DOM`，且**不要用 `DOM.iterable`**：本包源码会被消费端一起 type-check，移动端 tsconfig 的 lib 不含 `DOM.iterable`，用 `for...of URLSearchParams` 会在移动端编译失败。

## 与 `@cloudcad/contracts` 的分工

两个都是"跨包共享的纯逻辑"，但域不同（ADR-0070 有完整对比表）：

- **`@cloudcad/contracts`** = 后端 ↔ 后端（DI token + mxcad 引擎参数翻译）。有 `pnpm --filter @cloudcad/contracts scan:purity` 门禁禁 `process`/`globalThis`，因为要被 Node 侧消费；有 tsc→dist 构建步骤。
- **`@cloudcad/platform`** = 前端 ↔ 前端（设备判定 + 跨端 URL 协议 + 凭证搬运 + 跨端业务口径）。无纯度门禁（允许 `currentUA()` 读 `navigator`）；无构建。

塞错方向会立刻撞门禁或让后端包依赖前端语义，方向反了。

### 测试放哪

本包的测试就在本包内：`src/**/*.spec.ts`（12 个文件、66 例）。纯函数不引入额外测试基建——`vitest` 作为 devDependency 与 `typescript` 并列，不需要 config 文件（默认包含 `src/**/*.spec.*`）。

消费端包内**不再重复**测试本包的纯函数，只测端侧适配层与自己的接线：

- PC `packages/frontend/src/utils/mobileRedirect.spec.ts`——测薄适配是否正确调用本包（PC 侧无本包函数级 spec，本包 spec 是唯一归属）。
- 移动端 `src/utils/pcTarget.spec.ts`、`src/utils/transferPolicy.spec.ts`——同理。

判断标准：如果一个用例删掉本包的对应 spec 后仍然必要（它断言的是端侧行为、i18n 映射或参数拼装），放端包；如果它断言的是本包函数对某输入的返回值，放本包。重复的删掉端包那份。

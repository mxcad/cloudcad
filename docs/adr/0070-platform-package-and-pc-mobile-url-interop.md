# @cloudcad/platform 跨端公共层 + PC ↔ 移动端 URL 互通方案

**Status**: accepted

用户报了两类问题：一是在 PC 端的路径跳到移动端时，两端路由参数不一致——"别人复制了浏览器路径给其他人，其他人通过这个访问到手机对应的界面"，应该语义等价；二是移动端很多操作（尤其登录、切版本）会重新加载浏览器 URL，观感像是整个应用重启。

排查后发现这不是两个独立 bug，而是一组**同一根因**的症状：跨端语义在两端各写一份，没有单一事实源。

## 问题

### 1. 互通只覆盖 CAD 编辑器一个场景

PC 的自动跳移动端（`frontend/src/App.tsx`）只在 `pathname === '/' || startsWith('/cad-editor')` 时触发，翻译逻辑只把 `/cad-editor/:fileId` 转成 `?fileId=`。所以 `/projects`、`/personal-space`、`/library`、`/member-center`、`/profile`、`/shares` 在手机上打开**不跳移动端**，直接渲染 PC 桌面版外壳。这就是"应该有很多地方都是这样的才对"缺的部分。

### 2. 分享链接存在双向死链

后端生成 `/cad-editor/{fileId}?shareToken={token}`（`backend/src/share/share.service.ts`），两端都能打开。但移动端"复制链接"自己生成 `${origin}/share/${id}`（`ShareCurrentPopup.vue`、`ShareManagePage.vue`），而 PC 路由表只有 `/shares`（管理页）没有 `/share/:token`，移动端路由表也没有——**这条链接任何一端都打不开**。

### 3. 判定误命中 + 不检查登录态

`isMobile.ts` 只有一条 UA 正则 `android|iphone|ipad|ipod|webos`：iPad 桌面版 Safari、浏览器设备模拟、含这些片段的 WebView 全部命中。开关 `isAutomaticJumpToMobilePage` 在 `myServerConfig.json` 默认 `true`，PC 端没有任何 env 可关。`getMobileRedirectUrl` 不检查登录态，guest 也会跳。另外渲染前预检与 `MobileRouteGuard` 两处独立触发，首次加载重复 fetch 配置并重复 replace。

### 4. 移动端"整页重载"的真凶不在登录链路

登录主链路其实没有重载：`authSession.applyAuthResponse` → `authNavigate.navigateAfterAuth` → `router.replace(target)`，移动端全库零 `location.reload`、零 `location.replace`。真凶是版本历史：`useVersionHistory.openHistoricalVersion` 用 `window.location.href = currentUrl.toString()` 整站重载，hash 路由下会销毁并重建 WebGL 引擎实例。另外 PC 侧登出（`useAuthActions.ts`）也是无条件 `window.location.href` 整页重载，而 token 失效场景（`tokenRefresh.ts`）已经有 SPA 优先 + 整页降级的模式，登出应该对齐。

### 5. 移动端守卫与状态机刷新语义不一致

`router/index.ts` 的 `hasValidToken()` 纯看 JWT exp、同步判定、不 await 刷新。`accessToken` 过期但 `refreshToken` 有效时直接弹 `/login`。冷启动最典型：`useAuthState.initFromStorage()` 的静默刷新还没回来，守卫已判完——用户观感是"刚登录就被踢回登录页"。

### 6. 跨端判定与协议各写一半

设备判定在 PC（`utils/isMobile.ts`）与移动端各写一份正则；跨端认证凭证搬运协议（PC 拼 query 参数、移动端解析同名参数）两端各写一半，中间没有共享常量，改一边忘另一边就是静默失效。

## 决策

### 一、新增 `@cloudcad/platform` 跨端公共层

新增 `packages/platform`，装 PC 与移动端（以及未来的 App、Electron、平板）共用的**纯函数与纯数据**。一份实现，只改一处。

**为什么不塞进 `@cloudcad/contracts`**（ADR-0069）：

| 维度 | `@cloudcad/contracts` | `@cloudcad/platform` |
|---|---|---|
| 域 | 后端 ↔ 后端间的契约（DI token + 引擎参数翻译） | 前端 ↔ 前端间的跨端逻辑 |
| 门禁 | `scan:purity`（禁 `process`/`globalThis`/IO，因为要被 Node 侧消费） | 无纯度门禁（允许极薄的 `currentUA()` 读 `navigator`） |
| 构建 | tsc → dist，consumer 吃 dist | 无构建，Vite 直接吃 TS 源码 |
| 消费者 | backend / conversion-service | PC / 移动端 |

塞进 contracts 会撞纯度门禁（路由翻译需要 `window.location`），且会让后端包依赖前端语义，方向反了。两个包各自的准入标准与禁止清单在各自 README，不互相借用。

**准入四条（全满足才允许进）**：

1. **纯函数 / 纯数据**：无 IO、无副作用。
2. **不绑框架**：不 import React / Vue / 任何 UI 库，不含 JSX 与组件。
3. **不绑端**：不直接读 `navigator` / `window` / `document` / `localStorage`。**所有探测函数必须吃参数**（`isMobileByUA(ua: string)`），让 App 传自己的 UA、Electron 传 `process.platform` 都能复用；只允许极薄的 `currentXxx()` 适配函数读一次端 API 并直接透传。
4. **重复已成立**：两端确实有 ≥2 份实现，或是一处两端都必须遵守的**共享契约**。

不满足就不进，就地留在端包。**宁可包小一点，不要变成杂物间。**

禁止：React/Vue/DOM 渲染、API 调用（走各端 `@cloudcad/api-sdk`）、状态管理、i18n 文案（一个包维护 8 份语言文件不可接受）、需要 Node 运行时能力的东西（归 contracts）。

**迁移方式：渐进式，一次只迁一处。** 发现一处重复 → 本包加纯函数 → 两端旧实现改为调用它 → 跑两端 type-check + 测试。**不做一次性大迁移**，那会制造无意义的整文件 diff。

当前内容见 `packages/platform/README.md`（`env/device`、`env/auth-transfer`、`routes/{match,aliases,resolve}`）。

### 二、语义等价 + 双向翻译层（不改路由模式）

评估过三种方案，选"语义等价 + 双向翻译层"：

- **不做路由同形**。两端是不同 UI 栈（React 19 / Vue 3）、不同部署 base（`/` vs `/mxcad_mobile/`）、不同路由模式（history / hash）。强行同形会把"这条 URL 渲染哪端"的决定权交给运行时 UA 分支，等于让客户端指纹决定路由语义，还要同步改 nginx SPA fallback 与后端微信回调契约，回归面大得多。
- **不改后端**。后端分享 URL 生成、微信回调（`/profile#wechat_result=`）契约都不动。
- **不变量**：URL 表达业务语义，端由部署位置 + 翻译层决定。两端 UI 路由表可继续独立演进。

### 三、映射表是单一事实源

`packages/platform/src/routes/aliases.ts` 的 `ROUTE_ALIASES` 与 `MOBILE_TO_PC_ALIASES` 是跨端 URL 互通的**唯一事实源**，两端各自只留薄适配层：PC `utils/mobileRedirect.ts`、移动端 `utils/pcTarget.ts`。

新增一条互通关系只改这张表一处，两端适配层零改动。

**铁律：两端路由参数名必须同名。** `renderPathPattern` 按参数名取值，正向（PC params → 移动端 pattern）与反向（移动端 params → PC pattern）**都**依赖同名；不同名会渲染出空路径段（`/shell/file/project/`），静默失败。

实际踩过：曾把映射表里的 mobilePath 改成 `/shell/file/project/:id`，正解是反过来改移动端路由声明为 `:projectId`（连带 `ProjectDetailPage` / `ProjectRolesPage` 的 `route.params.id`）。

审计命令：

```bash
grep -rn "params\." packages/frontend_mobile/src/pages/shell/sub-pages/*.vue
```

**已知降级（表内注释标明）**：PC 的 `:nodeId` 是文件夹定位语义（`useFileSystem` 的 folder mode），不是"打开 CAD 文件"（后者用 `?fileId=`）。移动端尚未消费 `?nodeId=`，落到项目根/个人空间根而不进入该节点。`?domain=personal` 已消费（`FileBrowserPage` 用它设初始 Tab）。

### 四、移动端 URL 形态固定 `base?query#path`

移动端的**业务参数在 hash 之前**（`/mxcad_mobile/?fileId=x&v=3#/shell`），因为 `useFileLoader` 读的是 `window.location.search`。这条约定写在 `mobileRedirect.ts` 头部注释里，改 URL 形态前必须先确认移动端读取位置未变。

**衍生约束**：版本号 `?v=` 的更新**不能**用 `router.replace({ query })`（v 会落到 hash 之后读不到），必须 `history.replaceState(null, '', url.pathname + url.search)`（与 `stores/editor.ts` 的 `resetNewFile` 同口径）。

### 五、双向逃生入口

两端各留一个逃生口，共用各自方向的翻译出口：

- **移动端 → PC**：壳菜单「用电脑端打开」+ 404 兜底页「用电脑端打开」，共用 `utils/pcTarget.ts` 的 `buildPcUrlForPath`。
- **PC → 移动端**：顶栏 `MobileOpenButton`，复用 `buildMobileRedirectUrl`（与自动跳转同一个出口，不另写翻译）。不可映射路径或配置开关关闭时不渲染。

**陷阱：PC 侧手动打开不传 `markRedirect`。** `_redirect=1` 的语义是"桌面端**自动**跳转"，移动端 `useUser.ts` 看到它之后会**关闭自身标签页**。手动新标签打开带上该标记，刚开的页面会自己关掉。

### 六、消灭整页重载

两处整页重载收敛为 SPA 优先：

- **跳登录**：`useAuthActions` 登出、`quotaUpgradeGuide`、`vipFeatureGuide` 各写一份 `window.location.href = '/login?redirect=…'`（≥3 份即缺陷），收敛为 `tokenRefresh.ts` 的 `buildLoginUrl()` + `navigateSpaOrReload()` + `redirectToLogin()`，整页降级集中在一个点。
- **移动端版本历史**：`openHistoricalVersion` 改 `history.replaceState` + `openDrawing()`（"打开图纸"唯一出口），不重载应用、不重建 WebGL。

整页重载会重建 CAD 编辑器 WebGL 上下文 → 白屏闪烁。

**注**：utils 文件直接从 `@/config/tokenRefresh` 取而非 `clientSetup` 门面——`clientSetup` 会拉整个客户端初始化链，徒增循环依赖风险。

### 七、守卫异步刷新

`router/index.ts` 的同步 `hasValidToken()` 改为异步 `hasValidAuth()`：先 exp 判定，不过则 `withTimeout(refreshTokensOnce(), 4000)` 刷新一次再判。

三个必需件：

1. **超时必须有**。`@hey-api` 生成的 client 与 `apiConfig` 的 fetch 覆写都无内置 timeout，挂住的刷新会让 vue-router 导航永久 pending。
2. **结果按会话缓存**。网络错误时 token 被保留，无缓存则每次导航都挂一次等待。
3. **缓存成 promise 而非 boolean**。in-flight 期间并发导航共享同一 promise；boolean latch 会出现在刷新还没返回时就抢先弹登录页。

缓存经 `onSessionChanged` 重置（`clearSession` 确定性失败会清 token 并通知，天然收敛）。刷新走 `apiConfig.refreshTokensOnce` 唯一出口（与 fetch 层 401 刷新共享 in-flight 去重，不重复消费轮换制 refresh token）。

依赖方向：`apiConfig` 不 import router，router → apiConfig 无环（import router 的只有 `main.ts` 与 `utils/authNavigate.ts`）。

## 后果

### 正面

- 跨端互通从 1 个场景扩到映射表列出的全部可映射路径，两端共用一份表。
- 分享链接死链消除（移动端改消费后端 `shareInfo.url` 同源形态）。
- 登录/登出/切版本全程无整页重载。
- 误判为移动端的桌面用户有逃生口（收紧判定：宽屏 ≥1024px 豁免 + iPad 桌面模式排除 + `shouldUseMobilePresentation`）。

### 代价

- 新增一个包（第 10 个 workspace 包），多一处准入标准要人守。
- 映射表是隐式契约：两端参数名必须同名，但类型系统不强制，靠注释 + 审计命令守。
- 移动端守卫从同步变异步，导航要等一个最多 4s 的判定。

### 后续工作（未做，已留报）

1. `?nodeId=` 文件夹钻取：移动端需按节点建面包屑，映射表注释已标为已知降级。
2. `useFileLoader.getFileIdFromUrl` 内 `pathname.match(/^\/cad-editor\/([^/]+)$)` 是死分支（移动端部署在 `/mxcad_mobile/` 下，pathname 永不匹配）。函数本身有消费者，只该删那一分支。
3. `public/mxServerConfig.json` 的 `isAutomaticJumpToDesktopPage` 零代码消费（仅 config 声明）。删运维配置开关属产品决策，未擅动。
4. 分享链接改形态后，已复制在外的旧 `/share/{id}` 链接本来就是死的，不存在回归面；但需确认后端 `shareInfo.url` 对移动端字段齐全（`fileId` + `shareToken` 二者皆需）。

## 否决的方案

- **路由同形**（两端都用同一套 path）：见上文，会把路由语义决定权交给 UA 指纹，且要动 nginx 与后端回调契约。
- **映射表放 `@cloudcad/contracts`**：会撞 `scan:purity` 门禁（路由翻译需要 `window.location`），且让后端包依赖前端语义，方向反了。
- **映射表落两份**（`frontend/src/lib/` + `frontend_mobile/src/utils/` 各一份 + fixture 测试锁一致性）：多一份就违背本 ADR 的初衷，且已有 `@cloudcad/platform` 承接。
- **守卫里同步判定 + 让状态机先 await 刷新**：冷启动路径上守卫先于状态机执行，等不到。

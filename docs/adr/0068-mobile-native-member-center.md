# 移动端原生会员中心：购买 / 续费 / 升级 / 支付 / 退款全在移动端完成

**Status**: accepted

移动端「个人中心 → 管理会员」此前是**整页跳到 PC 端 `/member-center`**：用户在手机上点一下就被扔到一个桌面版网页，支付走浏览器外跳，完成支付再靠 redirect 参数回跳——移动端没有任何属于自己的会员界面。本次把这层占位换成移动端原生实现，能力完全对标 PC（档位对比 / 购买续费升级 / 微信支付 / 订单记录 / 退款申请），交互按移动端重做。

## 关键前提：后端零改动

摸排结论是本次能纯前端落地的原因，值得记下：

- 后端 `billing` / `vip` 控制器**没有任何 UA 或设备校验**，也无移动端专属接口；所有端点 PC 与移动端共用。
- 下单 `redirectUrl` 只是后端原样存库回传，不校验域名，因此移动端可传自己的回跳地址。
- 无 APP 支付、无小程序支付、无支付宝、无优惠码、无订阅制——PC 只有微信一种渠道，移动端不需要引入第二套支付实现。
- `runtimeConfig.paymentEnabled` 的 `isPublic: false`，前端无法预判开关状态，故不做「开关关闭时隐藏入口」的 UI 分支，改为下单失败时落到支付弹窗的 error 态（后端 403 文案原样透出）。
- `/vip/tiers/registry` **实际需登录**（早期摸排误判为 public，已纠正）；它和其余 4 个端点一起放进登录态页面。

## 决策

### D1 页面挂在 `/shell` 子页，不改 App.vue

移动端 `App.vue` **没有顶层 `router-view`**，直接渲染 `<Shell />` 并对认证页做 `v-else-if` 全屏覆盖层（ADR-0062）。因此在 `/shell` 的 children 下新增 `{ path: 'member', name: 'MemberCenter' }`，页面用 `subpage-overlay` 形态呈现，返回走 `router.back()`。同步登记 `shellStack.ts` 的 `ShellPageName` + `pageMap`，并把 `/shell/member` 加入 `AUTH_REQUIRED_PREFIXES`。

**不**在底部导航或 ActionSheet 加「会员」入口：入口保持单一（个人中心 → 管理会员），避免为低频功能占常驻位置。

### D2 交易类型按 UA 分流：MWEB / NATIVE

| 环境 | 交易类型 | 交互 |
|---|---|---|
| 微信内置浏览器（UA 含 `MicroMessenger`） | `MWEB` | 后端返回 `redirectUrl`，整页 `window.location.href` 跳微信支付页 |
| 系统浏览器 | `NATIVE` | 后端返回 `codeUrl`，页面内 `qrcode` 生成二维码，微信扫码支付 |

`JSAPI` 需要 openid，后端未打通，不使用；也不尝试按微信授权码换 openid（超出范围且后端无对应接口）。

`isWechatBrowser(ua)` / `pickTradeType(ua)` 是纯函数，入参默认取 `navigator.userAgent` 便于测试。

### D3 MWEB 回跳结果恢复：补上 PC 没实现的缺口

PC 端在回跳 URL 上写了 `?paymentReturn=1`（`PlanSelectOverlay.tsx`），但全仓没有任何读取点——回跳后成功/失败状态实际只靠「跳转前已注册的轮询」兜底，一旦页面重载（移动端浏览器跳转后常见）就丢失。移动端改为 **`localStorage` 持久化待支付上下文**：

- 跳走前 `savePendingPayment({ orderNo, tradeType, vipTierId, durationPricingId })`，key 为 `pendingPayment`；
- 页面 `onMounted` 调 `resumePending()`，按持久化的 `orderNo` 重建订单占位对象并进入 `awaiting` 态继续轮询——**回跳即自动恢复**，不依赖任何 URL 参数；
- 支付成功后 `clearPendingPayment()`。

持久化函数全部 `try/catch` 吞异常（存储不可用或脏 JSON 时静默降级），且读取时把非 `MWEB` 的 `tradeType` 归一为 `NATIVE`，避免脏数据把流程引到错误分支。

### D4 查单轮询 5s × 120

`POLL_INTERVAL_MS = 5000`、`POLL_MAX_ATTEMPTS = 120`（10 分钟），与 PC `WechatPayButton` 的口径一致。`awaiting` 态下轮询 `billingControllerQueryOrder`，命中 `SUCCEEDED` 走 `handlePaid()`；轮询上限到达只停在 `awaiting` 并允许「我已支付」手动触发一次查询，不判失败——支付超时由后端 `@Cron('0 */2 * * *')` 关单，前端不抢先下结论。`onUnmounted` 清理定时器。

### D5 支付成功必须 patch `localStorage.user`

移动端编辑器的 VIP 门控（导出下载 / 转换频率判定）读的是 `localStorage.user` 里的会员字段，不是接口响应。因此 `handlePaid()` 在重拉 `usersControllerGetProfile` 后额外把 4 个会员字段（`membershipTierLevel` / `membershipTier` / `membershipExpiresAt` / `isVip`）写回 `localStorage.user` 并刷新 `useUser()`，否则支付成功的用户仍会被编辑器拦截，直到下次登录。

### D6 计价与展示口径

- 金额全链路单位为**分**，展示统一走 `centsToYuan()`（`toFixed(2)`），禁止组件内自行除 100。
- 应付金额前端自算：`Math.round(baseMonthlyPrice * multiplierBps / 10000 * months)`——与 PC 及后端计价公式一致；下单后以后端返回的金额为准展示。
- 当前档位判定 `tiers.find(t => t.level === membership.membershipTierLevel ?? 0)`，与 PC 完全一致；套餐弹窗中低于当前档位的卡置 `disabled`（不隐藏，用户能看到全档位）。
- 配额回落语义与后端 ADR-0043 一致：档位 `configs` 优先 → registry `defaultValue` → 0。存储用量百分比按 `used/total`，>90% 红色、>70% 橙色、否则主题色。

### D7 数据契约本地声明

`@cloudcad/api-sdk` 对 billing/vip 的响应类型多为 `unknown`，且这些端点不属于本次改动，重新生成 SDK 只影响后端 DTO 的下游。因此 `src/utils/billing.ts` 本地声明 `BillingOrder` / `OrdersPage` / `VipTier` / `DurationPricing` / `ConfigRegistryEntry` / `RefundApplication` / `QuotaInfo` 等类型，与后端 DTO 逐字段对齐。后端契约变更时需同步这两处，属三层联动检查项。

## 页面结构

`src/pages/shell/sub-pages/MemberCenterPage.vue`（单页，分区渲染）：

1. **会员状态卡**（渐变绿卡）：档位名 / 到期日（永久会员显示「永久有效」）/ ≤7 天到期预警；免费用户按钮「立即开通会员」，VIP 用户「续费」「升级」（两者都开同一个套餐弹窗，与 PC 行为一致）。
2. **会员权益**：3 个静态项 + 1 个动态的转换频率项；每项可展开边界说明与举例；存储项带进度条。
3. **档位对比**：CSS grid 表格，当前档位高亮，横向滚动。
4. **订单记录**：分页 20，状态 tag；`PENDING` 行显示「去支付」（续付走 `billingControllerRepayOrder`）；`SUCCEEDED` 且无审核中退款显示「申请退款」，驳回后显示「重新申请退款」；退款备注原样展示。
5. **套餐选择**底部弹窗（92% 高度）：时长 chips + 档位卡 + 应付金额 + 去支付。
6. **支付**底部弹窗（76%）：订单摘要 + `creating / qr / awaiting / success / error` 五态。
7. **退款**底部弹窗（46%）：`van-field type=textarea maxlength=500 show-word-limit` + danger 提交。

编排逻辑在 `src/composables/useMemberCenter.ts`：`loadAll()` 用 `Promise.all` 并行拉 5 个端点，单个区块失败独立降级（仅 profile 失败才设页面级错误），不整页崩。

## 回归防护

- `packages/frontend_mobile/src/utils/billing.spec.ts`：26 例，覆盖 UA 分流、计价公式与四舍五入、分转元、排序不改入参、配额三级回落、用量百分比、退款状态判定（审核中阻断 / 驳回可重申）、日期格式化、待支付持久化（含脏数据与存储不可用）。
- 全量 `pnpm test`：16 文件 131 例全绿；`pnpm type-check` 18 错全部为预存（`MxToolbarItem` 未声明 / `import.meta.env` 类型缺失等，均在本改动 diff 之外）；`pnpm build` 产出 `MemberCenterPage` chunk 正常。
- i18n：73 个新键四语言齐（zh-CN / zh-TW / en-US / ko-KR），占位符一致性全量校验通过。

## 遗留（后续排票）

- **未加导航入口**：仅个人中心可达，见 D1。若后续要做全局入口（底部导航或 ActionSheet），需重评布局。
- **壳应用 `?auto=1` 自动下单（ADR-0066）不适用于移动端**：那是 EXE 桌面端的静默下单入口，移动端有显式套餐选择，不接入。
- **`上传图纸` 的 ko-KR 译文为「시트 업로드」**（시트 = 纸张/表格，应为 도면），是预存的机翻遗留（i18n id 2614，不属本次新增键），未在本次范围内修改。
- 支付失败 / 取消的微信支付侧状态不做前端处理：用户回跳后仍在 `awaiting`，靠轮询与「我已支付」兜底。

## 关联

- ADR-0062（移动端 Shell 架构）——D1 沿用其「无顶层 router-view + 认证覆盖层」结构，子页走 `/shell` children。
- ADR-0017（VIP 等级 + 键值对配额配置）/ ADR-0043（限制与配额）——D6 的档位与配额回落语义直接复用。
- ADR-0025（VIP 升级按价差折算）——升级计价的后端实现，移动端只按同一公式展示。
- ADR-0066（EXE 自动下单购买）——同为会员购买链路，但面向桌面端，移动端不接入。
- ADR-0067（文件队列）——同期移动端/前端改造，编号相邻。

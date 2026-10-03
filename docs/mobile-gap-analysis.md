# 移动端 vs PC 端功能差距清单（Mobile Gap Tracker）

> 初版 2026-09-10（4 域逐文件通读）；**2026-10-01 全面重审**：逐条对照当前代码更新状态，
> 新增「§0 platform 包收敛」区——目标不只是补齐功能，而是把两端重复的功能逻辑/函数收进
> `@cloudcad/platform` 单一实现，保证功能一致且以后差异只改一处（准入四条见包 README）。
>
> 每条：`ID / 缺口 / PC 参照 / 移动端做法 / 优先级 / 状态`。
>
> **状态图例**：⬜ 未开始 | 🚧 进行中 | ✅ 已完成 | ⏸ 待用户确认 | ➖ 不适用/排除（附说明）
>
> **范围**：只对照**普通用户**功能；管理员功能（用户/角色管理、审计日志、系统监控、
> IP 访问控制、运营统计、支付管理、通知管理、运行时配置、字体库 `SYSTEM_FONT_READ`、
> 公共资源库 `LIBRARY_*_MANAGE`）不纳入。

## 移动端 UI/UX 转译原则（所有条目通用）

| PC 形态 | 移动端做法 |
|---|---|
| 右键菜单 | 长按 500ms ActionSheet + 列表行 ellipsis 按钮 |
| 模态对话框 | 底部弹窗 `van-popup position=bottom`（复用现有 panel 样式） |
| 键盘快捷键（Ctrl+A/Shift 多选/框选） | 无等价，功能入口放菜单/ActionSheet；多选=长按进多选模式 |
| 拖拽上传/拖拽移动 | 点按上传；「移动到文件夹」ActionSheet + 文件夹选择弹窗 |
| hover 行内按钮 | 列表行常驻 ellipsis 按钮 |
| 表格列排序 | 排序 ActionSheet / van-dropdown-menu |
| Dashboard 首页 | ➖ 移动端入口=文件浏览器（A-30） |
| 新标签页打开 | ➖ 不适用（触屏无多标签），ActionSheet 提供「打开文件所在位置」 |

---

## §0. platform 包收敛清单（2026-10-01 新增，本台账最高优先级）

> 目标：两端重复的**非 UI 业务语义**收进 `@cloudcad/platform`（纯函数/纯数据、不绑框架、
> 不绑端、重复已成立）。收敛后两端各自只剩薄适配（i18n 文案、UI 形态留在端包）。
> 迁移方式：渐进式，一次一处；每处 = platform 加纯函数 → 两端改调用 → 两端 type-check+测试。

| ID | 逻辑 | 现状拷贝（实测） | platform 目标 | 状态 |
|---|---|---|---|---|
| P-01 | 分享有效期：预设值表 + 检测现有有效期 → 预设 + 计算 expiresAt（ISO）/ expiresIn（秒）+ 是否过期 | **3 份**：PC `constants/share.ts`（EXPIRATION_VALUES/detectExpiration/computeExpiresAt/isExpired）；移动端 `ShareManagePage.vue`（expiresIn()/computeRenewExpiresAt()/formatExpiryDate/状态判定）；移动端 `ShareCurrentPopup.vue`（expiresIn()/expirationItems/formatExpiry） | `src/share/expiry.ts`：`SHARE_EXPIRATION_VALUES`（秒，纯数据）+ `detectShareExpiration(expiresAt, now?)` + `computeExpiresAtIso(option, customDays, now?)` + `computeExpiresInSeconds(option, customDays, now?)` + `isShareExpired(expiresAt, now?)`。文案（「永不过期」等）留端包 | ✅ 2026-10-01：PC `constants/share.ts` 变薄适配（保留 i18n 标签/日期格式化）；移动端两 Vue 的 expiresIn/computeRenewExpiresAt/状态判定全改调用；顺带修 PC detectExpiration 无 NaN 兜底、custom 天数无 ≥1 钳制两处 |
| P-02 | 会员计价：订单金额（分）= round(月价×multiplierBps×月数/10000)、原价、分→元 | **2 份**：PC `utils/priceUtils.ts`（calculatePriceInCents/calculateOriginalPriceInCents/centsToYuan/formatYuan）；移动端 `utils/billing.ts`（orderAmountCents/centsToYuan，公式注释同后端 BillingService.createOrder） | `src/billing/price.ts`：`orderAmountCents(baseMonthlyPrice, multiplierBps, months)` + `originalAmountCents(baseMonthlyPrice, months)` + `centsToYuan(cents)`（加 `Number.isFinite` 兜底，取移动端更稳的版本） | ✅ 2026-10-01：PC `priceUtils.ts` 变薄适配（formatYuan 保留，入参是元非分）；移动端 `billing.ts` 保留对象签名包装后委托 |
| P-03 | 微信 UA 检测 | **3 份重复 + platform 已有 1 份**：platform `env/device.ts` `isWechatByUA(ua)`/`WECHAT_UA_PATTERN` 已存在；PC `hooks/billing/useVipOffering.ts:53` 内联 `/MicroMessenger/i`；移动端 `utils/browserDetect.ts` 整文件就是它；移动端 `utils/billing.ts:141` `WECHAT_RE` 又一份 | 不新增——PC/移动端 3 处改为调用 platform `isWechatByUA`（移动端 `browserDetect.ts` 变薄适配 `isWechatByUA(currentUA())`，或直接删文件改调用点） | ✅ 2026-10-01：PC `detectTradeType` 改 `isWechatByUA`+`isMobileByUA`（移动正则顺带补了 webos）；移动端 `browserDetect.ts`/`billing.ts` 均改委托 |
| P-04 | 存储用量百分比（total≤0→0、clamp 0-100） | **3 份**：移动端 `utils/billing.ts` `usagePercent(used,total)`；移动端 `composables/useProfileData.ts:100-105` 内联（后端 usagePercent 缺失时前端算）；PC `MemberCenter.tsx:742-758` 内联 `Math.min(usagePercent??0,100)` | `src/billing/quota.ts`：`usagePercent(used, total)`（与 P-02 同模块） | ✅ 2026-10-01：三处全接线——移动端 `billing.ts` 委托、`useProfileData.ts` 回落路径委托（后端值优先语义保留）、PC `MemberCenter.tsx` 改由 used/total 计算（与后端 storage-info.service 同公式，缺 usagePercent 时从 0 变为真实值=顺带修） |
| P-05 | 档位配额值解析（档位配置优先，缺键回落 registry 默认值，非数字归零） | **语义不一致**：移动端 `utils/billing.ts` `resolveQuotaValue(configs,key,registry)` 有 registry 回落（注释引 ADR-0043 与后端 MembershipService 一致）；PC `utils/tierConfigUtils.ts` `formatConfigValue` 直接 `Number(v)\|\|0` **无回落**——同一档位在两端可能显示不同配额 | `src/billing/quota.ts`：`resolveQuotaValue(configs, key, registry?)`（移动端语义为准，PC 改调用后两端显示对齐=顺带修一致性 bug）。i18n 格式化（「{size}GB」等）留端包 | ✅ 2026-10-01：移动端 `billing.ts` 委托；PC `tierConfigUtils.ts` formatConfigValue/Short 加可选 registry 参数走 platform，3 个调用点（MemberCenter×2 + PlanSelectOverlay）传 registry。残留：PC `MemberCenter.getEffectiveConfig`（转换窗口值）是「0=未设置→回落」的业务规则非展示格式化，语义与 platform 不同，未动（需产品裁定 0 值语义） |
| P-06 | 法务文本品牌占位符解析（`{{entityName}}` 等双花括号 → 品牌实体） | **PC 独有**：`lib/legalText.ts` `resolveLegalText(text, language, support)`——纯替换核心 + 品牌实体映射。移动端无合规页（见 §H），但一旦做合规页必须同源 | `src/legal/placeholder.ts`：`resolvePlaceholders(text, vars)` 通用纯函数（未知占位符原样保留语义保留）；品牌实体映射（getBrandLegalNames）留端包 appConfig | ✅ 2026-10-01（随 §H 一起做）：PC `legalText.ts` 变薄适配（15/15 spec 绿）；移动端 `languages/legal/index.ts` 用同一实现解析 5 种占位符 |
| P-07 | 文件大小格式化 | **显示口径不一致**：PC `components/ui/FileSize.tsx` `formatFileSize`（log 选单位 B~TB、2 位小数、空→'-'）；移动端 `composables/useNodeFormatter.ts` `formatSize`（仅 B/KB/MB、1 位小数） | ✅ 2026-10-01：platform `formatBytes(bytes)`（`src/format/bytes.ts`，纯计算：log 选单位 B~TB、`parseFloat(toFixed(2))` 去尾零、空/0→'-'，单位符号为通用记号非 i18n）；**决策**：统一 PC 主口径（B~TB、2 位小数去尾零、'-'）；**实收 4 份**（§0 原记 2 份，扫描发现 PC `ExternalReferencePanel.tsx:31` 另有一份分叉本地副本 B~GB/1 位小数/空→'--'）：PC `FileSize.tsx` formatFileSize 变薄适配（保留 toBytes/fromBytes/FileSizeInput 输入组件，非跨端重复）+ PC `fileUtils.ts` 重导出（不变，仍指向 FileSize.tsx）+ PC `ExternalReferencePanel.tsx` 删本地副本改引 platform（'--'→'-'、1→2 位小数、补 TB）+ 移动端 `formatSize` 变薄适配（B/KB/MB→B~TB、1→2 位小数去尾零）；PC `fileUtils.spec` 补 TB 用例、移动端 `useNodeFormatter.spec` 补 formatSize 用例；PC 37/37 绿、移动端 4/4 绿、platform/PC type-check 0 错。**第三轮（收敛后复审）再收 2 处**：PC `SystemMonitorPage/components/CacheSummaryCards.tsx` 本地 `formatBytes`（B~GB/0→'0 B'）改引 platform（0→'-'、去尾零统一，`SystemMonitorPage.spec` 断言 '1.00 MB'→'1 MB'）；PC `utils/tierConfigUtils.ts` 本地 `formatBytes` 收敛后零调用者，按死代码规则删除 | ✅ |
| P-08 | 编辑器菜单配置（命令覆盖） | **两份数据**：PC `public/ini/myUiConfig.json`（tab/cmd/list 结构，196 命令，经 config-service 下发）；移动端 `public/mxUIConfig.json`（headerMenuData 结构，55 命令）。引擎 UI 模式不同，结构不同名，不能直接合并 | ✅ 2026-10-01 裁定+审计：不合并数据（结构不同名、引擎 UI 模式不同）；命令覆盖审计完成（§E E-30~E-33）——E-30 查证**非真缺口**（移动端「选中实体浮层工具栏」useEditObjectToolbar 已覆盖修改类命令，触控正解，台账原「菜单未挂」判断过时）；E-31（剪贴板/选择）/E-32（DWG 对比）/E-33（属性面板）为**移动端功能补缺**（低/中优），非 platform 收敛，转 §E 独立跟踪 | ✅ |
| P-09 | 文件名合法性校验（空/长度 255/非法字符/控制字符/Windows 保留名/首尾点） | **2 份逐字节同规则**：PC `utils/fileUtils.ts` `validateFolderName`；移动端 `utils/validateName.ts`（注释自认「移植 PC」） | `src/files/name-rules.ts`：`checkFileName(name) → { valid, reasonCode }`（reasonCode 枚举，i18n 文案留端包各自映射）；两端改调用 | ✅ 2026-10-01：platform `checkFileName`（6 reasonCode，判定顺序=空→长度→非法→控制→保留名→首尾点）；PC `validateFolderName` + 移动端 `validateName` 均变薄适配（switch reasonCode→本端 i18n，规则逐字节等价已核对 HEAD）；新增移动端 `validateName.spec.ts` 10 例（锁 6 reasonCode 契约 + 适配映射）；移动端全量 469/469 绿、PC `fileUtils.spec.ts` 34/34 绿、platform/PC type-check 0 错 |
| P-10 | 跨项目转移/粘贴预判（六域矩阵：出向 `transferOut*` / 入向 `transferIn*` / 设置缺失保守拒绝） | **2 份核心相同但已分叉**：PC `lib/crossProjectPaste.ts` `evaluateCrossProjectTransfer`（id+rootKind 入参、`TRANSFER_BLOCK_REASONS` 枚举 key、返回含 `crossProject`）；移动端 `utils/transferPolicy.ts` `evaluateCrossProjectTransfer`（`TransferRoot` 入参、中文 reasonKey+`reasonParams`、**多一条「源为库且 move 恒拒绝」**——PC 该规则在 UI 层 `onMove=!isLibraryMode` 而非预判层） | ✅ 2026-10-01：platform `evaluateCrossProjectTransfer({operation,source:{id,domain},target:{id,domain},sourceSettings,targetSettings}) → {allowed,crossProject,reason?}`（`src/transfer/policy.ts`，6 域矩阵 + 库-move 预判 + null 保守拒绝，reason 为 `TransferBlockReason` 枚举）；**决策**：①库-move 禁令收进预判层（两端统一；PC 原 UI 层 `onMove=!isLibraryMode` 保留为按钮禁用，预判层补同规则成双重守卫）；②入参统一为 `{id,domain}`（两端各自薄适配、公共 API 不变：PC 映射 kebab `personal-space`→camel `personalSpace` + 保留空 id 短路，移动端 `TransferRoot`→`{id,domain}`）；③reason 统一为枚举（两端映射→本端 i18n 源串）；PC `crossProjectPaste.ts` + 移动端 `transferPolicy.ts` 均变薄适配（删各自 6 域/`operationAllows`/`modeAllows` 逻辑）；PC 新增 i18n 键 1000133「不能从资源库移出文件」（idMap+4 ts——PC 原无库-move 预判、现经 platform 可达故必须补）；PC `crossProjectPaste.spec` 15/15 + 移动端 `transferPolicy.spec` 11/11 绿、双端 type-check 0 错（移动端预存错全在并发会话 auth 页）；移动端 i18n 5 条 reason 源串已补（idMap 3659-3663 + 4 ts，翻译对齐 PC 1000127-1000133；**zh-TW/ko-KR 为 CRLF 行尾**须 `\r\n` 匹配，idMap/zh-CN/en-US 为 LF）| ✅ |
| P-11 | API 错误分类谓词（`isAbortError` / `isServerError` / `isPermissionError`） | **2 份实现不一致**：PC `utils/errorHandler.ts`（`isAborted` 标志 / `message==='canceled'`）；移动端 `utils/errorHandler.ts`（`name==='AbortError'` / `msg.includes('aborted')` 等，判定更宽）+ `classifyApiError` 已委托 `apiError.errorKind` 单一出口 | ✅ 2026-10-01：platform `isAbortError`/`isPermissionError`/`isServerError`（`src/errors/classify.ts`，纯谓词，**并集更宽**：isAbort=标志+axios code+name+message 子串任一命中；permission=403（status/statusCode/response.status + isPermissionError 标志）；server=500-599（同三源））；**决策**：取并集（任一端命中特征都算命中，消灭跨端边界不一致）；移动端 3 谓词变薄适配（`classifyApiError`/`apiConfig` 消费方零改动）+ PC `isAbortError`/`isServerError` 变薄适配；**残留**：PC `isAuthError`（401+403，语义≠permission=403）与 `isNetworkError` 是 PC 独有**死代码**（全仓无消费者），非本次 3 谓词之一，未动（AGENTS.md 死代码只提不删）；PC `errorHandler.spec` 2 例 + 移动端 `errorHandler.spec` 6 例锁并集契约、移动端 `apiConfig.spec` 5/5 绿、platform/PC type-check 0 错 | ✅ |
| P-12 | 日期/时间格式化（`formatDateTime` / `formatDate` / `formatTime`） | **2 份显示口径不一致**（同 P-07）：PC `utils/dateUtils.ts`（Intl 多语言、含秒/相对时间/ISO 互转）；移动端 `composables/useNodeFormatter.ts` `formatTime` + `utils/billing.ts` `formatDate/formatDateTime` | ✅ 2026-10-01：platform `formatDate`/`formatDateTime`/`formatDateTimeWithSeconds`（`src/format/date.ts`，纯计算，**固定 ISO-like 格式** `YYYY-MM-DD[ HH:mm[:ss]]`、locale 无关、空/无效→''）；**决策**：统一为固定格式（纯/确定/可排序/无歧义，适合审计·操作·版本历史时间戳；移动端本即固定格式故零改动，PC 由 Intl 本地化改固定——**产品可改**，如需本地化把 platform `datePart` 换 `toLocaleString(locale,opts)` 即可、端包不动）；PC `formatDateTime`/`formatDateTimeWithSeconds`/`formatDate` 变薄适配（`formatTime` 是 PC 独有 time-only `HH:mm`、无移动端对应，未收敛仍走 Intl）+ 移动端 `billing.ts` `formatDateTime`/`formatDate` 变薄适配（行为不变）；PC `dateUtils.spec` 重写（固定格式 + `formatTime` 仍本地化 + 无效→''）14/14 绿、移动端 `billing.spec` 26/26 零改动绿；platform/PC type-check 0 错。**第三轮（收敛后复审）再收 4 处 PC 页面级残留**：`utils/fileUtils.ts` formatDate（zh-CN Intl，原即日期+时间）改重导出 dateUtils `formatDateTime`（FileItemInfo/OperationHistoryModal 消费，spec 无效值断言 'Invalid Date'→''）；`pages/AuditLogPage/constants.ts` formatDate（含秒）改 `formatDateTimeWithSeconds`（表格 + CSV 导出同口径，固定格式更利于 Excel 排序）；`FontLibrary/hooks/useFontLibrary.ts`、`Profile/ProfileInfoTab.ts` 本地 formatDate 改 `formatDateTime`（Profile 空/无效保留 '-' 显示）；`dateUtils.formatDate`（date-only）此前零调用者，保留作 date-only 场景唯一出口 | ✅ |
| P-13 | 相对时间格式化（「X分钟前 / X小时前 / X天前」） | **3 份分叉**：PC `utils/dateUtils.ts` `getRelativeTime`（刚刚/分/时/天 4 档 + 回落绝对日期，转换面板用）；PC `utils/fileUtils.ts` `formatRelativeTime`（刚刚/分/时/**昨天**/天/周/月/年 8 档，文件列表用）；移动端 `composables/useNodeFormatter.ts` `formatTime`（刚刚/分/**HH:MM 时钟时刻**/天/周/月/年，<24h 走时钟） | ✅ 2026-10-01：platform `relativeTime(input, now?) → { tier:'just_now' } \| { tier:'amount'; unit; value }`（`src/format/relative.ts`，纯计算 分/时/天/周/月/年，<60s→just_now，未来/负值归 just_now）；**决策**：粒度取并集（分/时/天/周/月/年），<24h 统一「X小时前」（弃 HH:MM 时钟档 + 弃「昨天」特例 + 弃绝对日期回退——2/3 实现本就走「X年前」无回退）；PC `getRelativeTime`+`formatRelativeTime` + 移动端 `formatTime` 均变薄适配（switch unit→本端文案，PC 走 `t()`、移动端保留硬编码中文——该文案本非 i18n）；PC `dateUtils.spec` 更新（周/月/年档）+ `fileUtils.spec` 新增 `formatRelativeTime` 2 例 + 移动端新增 `useNodeFormatter.spec` 3 例；PC 53/53 绿、移动端 3/3 绿、platform/PC type-check 0 错（移动端 type-check 预存错全在并发会话 auth 页）。**第三轮（收敛后复审）发现第 4 份分叉**：`components/modals/VersionHistoryModal.tsx` 组件内联相对时间（刚刚/分/时/**昨天**/天前/绝对日期回落，含动态 `t(`${n}分钟前`)` 键）改走 `dateUtils.getRelativeTime`——按已裁定决策弃「昨天」特例与绝对日期回落，≥7 天显示「X周前/X月前」（行为变化属决策内） | ✅ |
| P-14 | 密码强度打分（长度≥8 / 大小写齐 / 含数字 / 含特殊字符 → 0-4） | **3 份逐字节同**：PC `pages/Profile/hooks/usePasswordProfile.ts` `getPasswordStrength`；PC `pages/Register/index.tsx` `getPasswordStrength`（PC 内重复）；移动端 `utils/authValidation.ts` `getPasswordStrength`（注释自认「与 PC 同评分口径」） | `src/auth/password-strength.ts`：`scorePasswordStrength(password) → 0-4`（纯打分）；标签（「太弱」等 i18n）与颜色（PC 硬编码 hex / 移动端 CSS token）留端包按 score 映射 | ✅ 2026-10-01：三处均改薄适配（委托 platform 打分，保留本端 label/color）；移动端 `authValidation.spec.ts` +3 例锁 0-4 契约（16/16）；移动端全量 472/472 绿、PC type-check 0 错 |

> **穷尽扫描结论（2026-10-01，三轮）**：
> - 第一轮 `utils`/`lib`/`composables` 全量比对 → P-01~P-09 可干净收敛（P-09 完成）；P-10~P-12 分叉需产品裁定。
> - 第二轮扩到 `hooks`/`pages`/`constants`/`stores`/组件内联 → 又找到 **P-14 密码强度打分**（3 份逐字节同，已完成）+ **P-13 相对时间**（3 份分叉，⏸）。
> - 第三轮（收敛落地后的 codebase-design 复审，按「同名函数全仓 grep」补扫）→ 前两轮漏掉 PC 页面级残留 **7 处**：绝对日期时间 5 处（fileUtils/AuditLogPage/constants/FontLibrary/ProfileInfoTab，P-12）+ 字节 2 处（CacheSummaryCards 收、tierConfigUtils 死删，P-07）+ 相对时间 1 处（VersionHistoryModal 组件内联，P-13 第 4 份）——已全部收敛/删除（见各行「第三轮」注）。**教训**：收敛完成≠穷尽，「同名函数全仓 grep（含 pages/components 内联与死代码）」应作为每轮收敛的收尾动作。
> - **排除（不满足准入四条，绑 Web 端/非纯）**：`clipboard.ts`（读写 `navigator.clipboard`/`document.execCommand`+DOM）、`hashUtils.ts`（`FileReader` + PC 独有 LRU 已分叉）、`tokenUtils.ts`/`authSession.ts`（`localStorage`/`sessionStorage` IO + 结构分叉）、`download.ts` `triggerBlobDownload`（DOM `<a>` 下载）、`notificationEvents.ts` `globalShowToast` 等（DOM CustomEvent 总线）。
> - **排除（关注点不同 / 实现路径不同，非重复）**：`permissionUtils.ts`（PC 异步 API 权限判定）vs `projectPermissions.ts`（移动端纯权限分组/依赖）、`versionHistory.ts`（PC 纯展示转换 `toVersionDisplayList`/`extractUserNote`，移动端无对应）vs `useVersionHistory.ts`（composable）、文件类型分类（PC 后端 `node.extension`+emoji vs 移动端 `extractExtension`+Vue 组件、无 CAD 常量）、`auditActionTemplates.ts`/`useProjectAuditLog.ts`（i18n 文案模板留端包）、搜索（两端均框架+API 绑定）。

**收敛纪律**：
- 每处收敛完成后在本表勾 ✅ 并注明提交；两端旧实现**删掉或留成薄适配**，不留双轨（ADR-0026 expand-contract 教训）。
- platform 包禁止 i18n 文案——凡带 `t()` 的函数只收敛「纯判定/纯计算」部分，文案映射留在端包。
- 门禁：`pnpm --filter @cloudcad/platform test` + `pnpm --filter @cloudcad/platform type-check` + 两端 type-check + 两端测试。platform 自带 vitest 套件（2026-10-01 起：12 spec / 62 例，覆盖全部 14 模块，`share/expiry` 全量含 NaN 回归；PC 原 `lib/platform.spec.ts` 已迁入包内 `src/platform.spec.ts`，移动端 2 个纯 platform 契约 spec（`utils/relativeTime.spec.ts`、`utils/errorHandler.spec.ts`，经适配层透传测 platform 接口）并入包内对应 spec 后删除，CI 已加 platform 测试步骤）——端侧 spec 只测本端适配层（i18n 映射/SDK），不再重复测 platform 接口。

**收尾票（contract 阶段，未排期）**：

- **T-01 双轨改名层收敛**（expand-contract 的 contract 步）：收敛期两端保留了纯改名的一行透传包装（删减测试不通过——删掉只是改 import），约 60 调用点。收尾动作 = 调用方直引 `@cloudcad/platform`，本地文件只留端特有内容（i18n 标签/locale 格式/数据契约）：
  - PC `utils/priceUtils.ts`：`calculatePriceInCents`/`calculateOriginalPriceInCents`/`centsToYuan`（保留 `formatYuan`，端特有）；
  - PC `constants/share.ts`：`detectExpiration`/`computeExpiresAt`/`isExpired`（保留 `getExpirationLabels`/`formatExpiryDate`，i18n+locale）；
  - PC `utils/dateUtils.ts`：`formatDate`/`formatDateTime`/`formatDateTimeWithSeconds`（保留 `formatTime`/`getRelativeTime`/ISO 互转，locale+i18n+端特有）；
  - 移动端 `utils/billing.ts`：`orderAmountCents`/`centsToYuan`/`resolveQuotaValue`/`usagePercent`/`formatDateTime`/`formatDate`（保留数据契约/`pickTradeType`/退款续付判定/待支付存储/排序）。
  - 不做：移动端 `browserDetect.ts` `isWechatBrowser()` 是 platform README 明确允许的「极薄 currentXxx() 透传」（探测函数吃参数不读 navigator），属设计非债务。
  - 前提：platform 接口名稳定（它已是单一事实源，改名只会发生在包内）；gh 登录后补 GitHub issue 跟踪。

---

## A. 文件浏览器 FileBrowserPage（/shell/file）

### P0 安全/数据

- [x] **A-01 节点权限门控**：✅（2026-10-01 重审：项目卡片/管理菜单已按 `memberControllerGetUserProjectPermissions` 门控；文件项级 canEdit/canDelete 门控仍部分依赖后端 403 透传，可接受）
- [x] **A-02 删除前权限校验 + 彻底删除选项**：✅ 删除走回收站（permanently:false）+ 回收站内「彻底删除」二次确认（红字）

### P1 高频日常

- [x] **A-03 单条目操作菜单**：✅ 列表行 ellipsis + 网格角标 + 长按；菜单=打开/格式转换下载(文件)|打包下载(文件夹)/分享/版本历史/重命名/移动/复制/删除
- [x] **A-04 重命名**：✅ `RenameNodePopup`（保留扩展名 + validateName）
- [x] **A-05 移动/复制（单条 + 批量 + 跨项目）**：✅ `NodeFolderPicker` + 六域矩阵预判（useCrossProjectTransfer）+ 跨项目 move 二次确认
- [x] **A-06 下载格式转换**：✅ `DownloadFormatPopup`（dwg/dxf/pdf 走异步任务队列，mxweb/original 同步直下）
- [x] **A-10 排序控件**：✅ 排序 ActionSheet（修改时间/创建时间/名称/大小）
- [x] **A-11 项目筛选 Tab**：✅ chips（全部/我创建的/我加入的）
- [x] **A-19 全选**：✅ 多选栏「全选/取消全选」（当前已加载页）
- [x] **A-22 多文件上传**：✅ input multiple + `runUploadPool`（并发 2，逐文件 toast）
- [x] **A-29a 单条目剪贴板复制/剪切**：✅ 2026-10-01 两页单条目 ActionSheet 补「复制到剪贴板」「剪切」（与「移动到…/复制到…」语义区分对齐 PC），handler 写 `useFileSystemClipboard`（cut/copy 模式）+ toast；`fileSystemClipboard.spec.ts` 新增
- [x] **A-29b 搜索结果「打开所在位置」**：✅ 2026-10-01 文件夹命中点按改为**进入该文件夹**（`router.push({path:'/shell/file/project/:id', query:{folderId: 节点id}})`，不再只跳项目根丢位置）；文件/文件夹命中**长按**（500ms 手势，与项目卡片同套）弹 ActionSheet「打开所在位置」→ 定位**父文件夹**（`query:{folderId: parentId}`，对齐 PC open_file_location）。ProjectDetailPage `initFileList` 消费 `route.query.folderId` 走 `loadRootNode(override)`（面包屑无法还原——ancestorPath 无 id，留空）；底层 `loadRootNode` override 机制已有 composable spec 覆盖。高亮（PC `?highlight=`）移动端未做（列表无高亮滚动机制，留待后续）

### P2 体验/信息密度

- [x] **A-07 批量下载任务体系**：✅ `useBatchDownload` + `BatchDownloadPanel`（3s 轮询）
- [x] **A-08 文件夹下载**：✅ 打包下载 → zip 任务
- [x] **A-12 项目卡片信息**：✅ 2026-10-01 网格项目根卡片补描述（2 行截断 `.grid-desc`）+ 成员数（`{count} 个成员` 新键 3657）；FileListItem 加 `description`/`memberCount` 映射。**真实封面缩略图留待**：移动端无项目封面数据源（`/file-system/nodes/{id}/thumbnail` 仅文件），需后端补项目封面端点后再做
- [x] **A-13 配额进度条**：✅ 项目详情页配额条（B-15）；个人空间无配额概念（对齐 PC，PC 个人空间也不显示）
- [x] **A-14 加载更多失败重试条**：✅
- [x] **A-15 手动刷新**：✅ 下拉刷新
- [x] **A-16 视图模式持久化**：✅ `useViewMode`（personal/project 各自记住）
- [x] **A-20 回收站**：✅ 第 3 个 tab（项目列表/个人空间/具体项目三 scope 下拉 + 恢复/彻底删除/清空 + 扩展名筛选）
- [x] **A-23 新建项目支持描述**：✅ `ProjectEditPopup`（名称+描述，编辑入口在卡片菜单/详情页管理菜单）
- [x] **A-24 名称合法性校验**：✅ `validateName`（→ 见 P-09 收敛）
- [x] **A-25 转换失败徽标**：✅ 2026-10-01 UnifiedFileList 网格+清单均加 `isFailed`（`!isFolder && fileStatus==='FAILED'`）红标「转换失败」（复用 i18n 866）；FileListItem 加 `fileStatus` 映射
- [x] **A-27 版本历史入口（文件项级）**：✅ `VersionHistoryPopup`（显式 target，选中版本 `?v=` 打开）
- [x] **A-28 文件项分享入口**：✅ `ShareCurrentPopup`（有效期/二维码/已有分享/撤销）

### P3 大块/低价值

- [x] **A-09 搜索高级筛选**：✅ `FileFilterPopup`（格式/大小/时间区间；回收站仅格式）
- [➖] **A-17 每页条数选择器**：➖ 无限滚动为主
- [➖] **A-18 面包屑路径可编辑重命名**：➖ 桌面形态
- [➖] **A-21 撤销/重做命令栈**：➖ PC 命令栈形态（fileSystemUndoRedoStore），移动端有回收站兜底，不做
- [x] **A-26 外部参照管理**：✅（被动形态）打开图纸时检测缺失参照 → `ExternalRefUploadPopup` 上传（PC 是 FileItem hover 主动入口 + 打开时被动检测；移动端保留被动入口，交互形态不同但能力覆盖）
- [➖] **A-30 Dashboard 首页**：➖ 移动端入口定位=文件浏览器（2026-09-10 已裁定）

---

## B. 项目详情 ProjectDetailPage（/shell/file/project/:id）

### P0 安全/数据

- [x] **B-01 搜索框**：✅ / **B-02 分页**：✅ / **B-03 move/copy 接线**：✅
- [x] **B-04 成员自我保护**：✅ isSelf 不渲染操作区 / **B-05 成员管理权限门控**：✅ PROJECT_MEMBER_MANAGE
- [➖] **B-06 改角色后刷新自身权限**：⏸ 2026-10-01 查证**非真缺口**，不改代码。两端角色下拉都禁用自改（移动端 `ProjectDetailPage.vue:1162` `v-if="... && !isSelf(m)"`；PC `MembersModal.tsx:818` `disabled={!canManageMembers || isSelf}`），故「改角色后自身权限变化」在 UI 上不可能发生——改的是**别人**的角色，自身权限不变，`loadProjectPermissions()` 恒返回同值（加了是 no-op + 每次改角色多发一次请求）。唯一真实场景「转让所有权后自身权限变」已在移动端 `onTransferOwnership`（`ProjectDetailPage.vue:717`）`Promise.all([loadMembers(), loadProjectPermissions()])` 覆盖。PC `MembersModal.tsx:305-313` 的 re-check 同样是防御性代码（自改被禁）

### P1 高频

- [x] **B-07 转让项目所有权**：✅ 成员行「转让」按钮 → `projectActions.transferOwnership` + 成功后重载成员+权限
- [x] **B-08 成员真实头像 + 邮箱展示**：✅ 2026-10-01 ProjectDetailPage memberRows 加 `avatar`；`m.avatar` 有值用 `van-image`（`avatarErrors` Set 逐 id @error 回落 `user-o`），`m.email` 有值渲染副行（无则不渲染，无占位）
- [x] **B-09 按角色筛选成员**：✅ 2026-10-01 ProjectDetailPage 成员列表头加角色筛选下拉（`roleFilterOptions` 含所有角色含所有者，稳定 computed 防 DropdownMenu 递归）；`filteredMemberRows` 按 `projectRoleId` 过滤 + 人数联动 + 筛空态「没有符合条件的成员」（新键 3655/3656）
- [➖] **B-10 精细化错误文案**：➖ 2026-10-03 关闭（低优，排票见文末「待排票」）——move/copy 已透传后端错误（transferErrorMessage）；成员操作失败兜底 `移除失败`（`ProjectDetailPage.vue:356`）是硬编码中文且 idMap 无此键。修它需加 i18n 键 + 动 `ProjectDetailPage.vue`，该文件正被并发会话修改，本轮不碰
- [x] **B-11 项目改名/改描述**：✅ ProjectEditPopup
- [x] **B-12 删除项目**：✅ 管理菜单「删除项目」→ useProjectActions.remove（确认+回退）
- [x] **B-15 配额用量条**：✅
- [x] **B-16 文件重命名 / B-17 移动复制 / B-18 下载格式 / B-19 版本历史 / B-20 手动刷新**：✅

### P2

- [x] **B-21 批量下载对话框**：✅
- [x] **B-13 角色模板管理**：✅ `ProjectRolesPage.vue`（独立路由 /roles）
- [x] **B-14 项目操作历史**：✅ `ProjectAuditLogPopup`（三桶分组+定位：文件打开图纸/文件夹跳父目录）

---

## C. 分享管理 ShareManagePage（/shell/share）

### P0

- [x] **C-01 撤销二次确认**：✅（token 传参修复已随 Batch 6 落地）

### P1

- [x] **C-02 修改有效期（续期）**：✅ 9 档（2h/6h/12h/1d/3d/7d/自定义/永不过期/立即过期）（→ P-01 收敛；创建弹窗曾 8 档不含「立即过期」，见 C-11/C-12，**Batch 20 C-37 已补齐为九档**）
- [x] **C-10 二维码**：✅ 创建面板内嵌 160px + 列表项「查看二维码」
- [x] **C-06 创建时间字段**：✅ / **C-07 URL 展示 + 打开**：✅
- [x] **C-16 状态判定修正**：✅ 客户端 expiresAt 判定（→ P-01 收敛 isShareExpired）

### P2

- [x] **C-03 多选 + 批量撤销**：✅ 2026-10-01 长按进多选（500ms 手势，与文件列表/项目卡片同套）+ 点按切换选中（纯 CSS 圆圈勾选指示，不依赖 vant 图标名）+ 底部操作栏「取消/全选/批量撤销」；批量撤销=逐个 `shareControllerRevokeShare` 循环 + 成功/失败计数 toast（对齐 PC `handleBatchRevoke`，后端无批量端点）；多选时隐藏 FAB
- [x] **C-04 排序**：✅ 2026-10-01 ShareManagePage 筛选条右侧加排序按钮（ActionSheet 选字段：创建时间/有效期/次数，同字段切方向↑↓）；`sortBy`/`sortOrder` 走服务端 `shareControllerListShares`（API 原生支持），watch 变化回第一页重拉；「次数」新键 3658
- [x] **C-05 分页/加载更多**：✅ 2026-10-01 `loadShares(append)` page 累加 + `shareHasMore`（total/pageSize 推算，后端 ShareListResponseDto 无 totalPages）+ 列表 `@scroll` 触底加载 + 底条（加载中/没有更多了）；keyword/filter 变化回第一页
- [x] **C-11 自定义天数**：✅ 2026-10-01 续期弹窗补「自定义天数」档 + 天数输入（1-365 钳制，`computeExpiresAtIso(option, days)` 走 platform）；`openRenewPopup` 改用 `detectShareExpiration` 反推初始档+天数（对齐 PC EditExpiryModal）。**注**：移动端创建弹窗的 `customDays` 原是死代码（模板从未渲染 custom 档/输入框）；2026-10-03 补齐（见 C-17），创建弹窗九档已与 PC ShareDialog 对齐（`immediate` 见 C-37）
- [x] **C-12 「立即过期」选项**：✅ 2026-10-01 续期弹窗补「立即过期」档（`computeExpiresAtIso` 返回 now-1s，后端视为已过期）；创建弹窗当时未加，当时判定「PC 因共用 ExpirationPicker 才显示，属 PC 小瑕疵」——**该判定已被 C-37 推翻**：PC 创建流程确实提供九档，属移动端真实差距，Batch 20 已补
- [x] **C-13 复制成功行内反馈**：✅ 2026-10-03 与 C-27 重复合并关闭——C-27（Batch 17）的 `useShareLinkCopy`（`copiedKey` + 按钮行内 ✓ 2s）已对齐 PC `copiedToken`；Batch 18 又补第 6 个复制点（WorkCard 协同分享二维码面板，见 C-29）。本条不再单独跟踪
- [x] **C-14 加载失败底条**：✅ 2026-10-01 `loadMoreFailed` 与整页 `error` 分离——翻页失败保留已加载列表、底条「加载失败，点击重试」（重跑当前页不重复追加）；首屏失败才整页错误态
- [x] **C-15 空态「清除搜索」**：✅ 2026-10-01 搜索无结果时文案改「未找到相关分享」+「清除搜索」按钮（清空 keyword）；无关键词时保持「暂无分享」+「新建分享」

### P3

- [x] **C-08 新建分享文件选择器**：✅ 双 scope（personal_space+all_projects）并集去重 + 搜索 + 加载更多 + 错误可重试（2026-10-01 修复恒空问题）
- [x] **C-09 批量分享**：✅ 2026-10-03 选择器改多选（`selectedFileIds` 数组 + 勾选）+ `useShareCreate.createShares` 逐文件循环（同一 expiresIn、失败隔离）+ 结果列表逐项复制；全成功自动关弹窗（对齐 PC），部分失败停留结果视图供排查。实时进度见 C-20

### Batch 15（2026-10-03 分享细节对齐 PC，7 项）

- [x] **C-17 创建弹窗补「自定义天数」档**：✅ ShareCurrentPopup + ShareManagePage 创建弹窗都补 `custom` 档 + 天数输入（`clampCustomDays` 1-365，实时钳制，`computeExpiresInSeconds` 走 platform）；`formatExpirationDisplay` 签名扩 `'custom' | 'immediate'` 标签
- [x] **C-18 已有分享列表补链接 + 复制**：✅ ShareCurrentPopup 已有分享行对齐 PC ShareDialog 列表视图（链接 + 复制 + 有效期 + 撤销）；复制收敛为 `copyShareUrl` 唯一出口（创建结果与已有分享共用，失败回落 ShareLinkSheet 手动复制）
- [x] **C-19 删死分支 + 修正列表 key**：✅ `:key="item.id"` → `item.token`（`getFileShares` 不返回 id，原 key 恒 undefined）；删 `usedCount`「已访问 N 次」分支（该端点不返回此字段）+ 删「已过期」徽标（服务端 `AND: [{ OR: [expiresAt:null, expiresAt>now] }]` 已过滤过期项，判定恒 false）+ 删 `FileShareItem` 的 `id`/`name`/`usedCount` 字段与 `isShareExpired` 导入
- [x] **C-20 批量创建实时进度**：✅ `createShares` 加 `onProgress(done, total)`（不传行为不变），ShareManagePage 按钮显示「正在生成分享链接... (done/total)」；`useShareCreate.spec.ts` +2 例（含失败项也计进度，与 PC `batchResults.length` 语义一致）
- [x] **C-21 错误文案走 `errMsg` 唯一出口**：✅ `errMsg` 补裸字符串直通（SDK `res.error` 常是字符串，原实现会塌成兜底文案或打印 `[object Object]`）；ShareCurrentPopup 创建/撤销、ShareManagePage 全失败提示、useShareCreate 逐文件错误全部改走 `errMsg(e, fallback)`；`apiError.spec.ts` +2 断言
- [x] **C-22 撤销确认文案统一**：✅ 两处入口统一为「撤销后该分享链接将立即失效，确定撤销？」（原 ShareCurrentPopup 用「对方将无法继续访问该图纸」）
- [x] **C-23 已有分享错误态/空态**：✅ 加载失败不再静默吞掉 → 错误态 + 「重试」（对齐 PC `listError`）；无分享 → 「还没有分享过这个文件」（对齐 PC 空态，新键 3722）
- [x] **C-24 分享搜索防抖**：✅ ShareManagePage `keyword` 变化 300ms 防抖 + 代次守卫（与文件选择器 `fileKeyword` 同套模式），避免逐键重拉列表
- [x] **C-25 二维码尺寸统一 160**：✅ QR 弹窗 200→160（与创建成功面板内嵌、PC ShareDialog QRCodeSVG 一致），删掉冗余的 `.qr-image--inline` 覆盖；`background: #fff` → `var(--van-white)`
- [x] **C-26 分享链接相对路径**：✅ 2026-10-03 后端 4 个 share 端点（create/list/file/update）返回的 `url` 一律是相对 path，裸 path 粘进浏览器会被当成搜索词、扫码打不开。绝对化规则收敛进 `@cloudcad/platform` 的 `toShareUrl(path, origin)`（纯函数、幂等、兼容已绝对化 / 协议相对 / 尾部斜杠），两端各配一个只供 origin 的薄出口（PC `src/utils/shareUrl.ts`、移动端 `src/utils/shareUrl.ts`）。移动端在 4 个**数据边界**一次性绝对化（列表 map / `useShareCreate` 结果 / 创建成功 / 已有分享 map）→ 覆盖 10 个下游消费点（复制 / 二维码 / 打开 / 展示）；PC 5 处手写 `` ${origin}${path} `` 全部改走共享出口。**复查结论**：PC 的列表行复制本来就是绝对化（`handleCopyItem` 内部已前置 origin），此前台账「PC 不自洽」的说法有误，PC 无行为变更，只是换成共享规则
- [x] **C-27 复制成功行内反馈**：✅ 2026-10-03 对齐 PC `copiedToken` 图标变 ✓ 2s。收敛出 `useShareLinkCopy`（移动端唯一复制出口，同时替换 ShareManagePage `copyLinkWithFallback` 与 ShareCurrentPopup `copyShareUrl` 两份逐字重复实现）：`copiedKey` 用 url 本身当键，5 个复制按钮用「copiedKey === 自己的 url」判定，连续复制复用同一定时器，卸载时清定时器；5 例 spec 覆盖成功/连续/失败回落/空 url/卸载

### Batch 18（2026-10-03 分享/协同收尾，3 项 + 1 项查证非差距）

- [x] **C-29 WorkCard 协同分享复制绕过了唯一出口（P1）**：✅ C-27 收敛时漏掉的第 6 个复制点——`WorkCard.vue` 仍直接 `copyText()` + 自持 `showLinkSheet`/`linkSheetUrl` 两份回落 refs + 成功 toast（即「一份逐字重复实现」仍在）。改为调 `useShareLinkCopy`，二维码面板复制按钮加行内 ✓（`copiedKey === display.shareUrl`，与 ShareManagePage 三个复制点同判据）。`handleCopy` 从 9 行降到 3 行，删除该文件的本地回落逻辑；成功文案统一为 `已复制链接`（原「分享链接已复制」仅此文件用，键 1515 留在词表不再引用，不删——词表删除留给下次词表维护）
- [x] **C-30 WorkCard 5 处硬编码中文未走 `t()`（P1）**：✅ `分享`×2、`退出`、`加入`×2 包 `t()`。键 2644（分享）/742（退出）复用，`加入` 为新键 **3731**（四语：加入/加入/Join/참여）——**与 PC `CollabWorkCard.tsx:126-141` 逐字一致**（PC 也用 `t('分享')`/`t('退出')`/`t('加入')`）。移动端原本连英文用户都看到中文「加入」
- [➖] **C-28 分享列表日期格式（查证非差距，不改代码）**：➖ 台账原以为移动端 `toLocaleDateString()` 违反「日期走唯一出口」。查证后**不是差距**：PC `constants/share.ts` 的 `formatExpiryDate` 与 `ShareTable.tsx` 的 createdAt 列**同样**是 `toLocaleDateString()`，移动端逐字对齐 PC。只把移动端换成 platform `formatDate`（固定 ISO-like）会让两端显示口径不一致（`2026-10-03` vs `2026/10/3`），与「补齐差距」方向相反。正确归属=**跨端共用的本地化日期口径问题**，需 PC + 移动端同改（4 处）。P-12 的 platform 固定格式决策只覆盖审计/版本/文件时间戳，未覆盖分享。**2026-10-03 裁定：维持现状（两端一致即无差距）**——分享列表是「读一眼」的展示场景，跟随设备 locale 的本地化日期是正常 UX；只有审计/版本/文件历史这类需要排序或复制进 Excel 的时间戳才值得用固定格式（P-12 的场景）。不动任何代码，不再排票
- [x] **Batch 18 台账清尾**：✅ 关闭 C-13（与 C-27 重复合并）、D-10（台账「跳 PC /member-center」**过时**——`openMemberCenter` 已直达原生 `/shell/member`，ADR-0068）、G-04（2026-09-10 已裁定，标记 ⏸→➖）；重写 G-02 为可执行流程（`pnpm i18nCompile` 禁止运行，改手工加键 + 四语一致性校验）；G-05 确认为常驻验收纪律；排票 B-10 / P-08 自动化 / Batch 6b / G-03。§C 与 §K 已无 ⬜/⏸ 遗留
- [x] **C-31 WorkCard 简化版缺 `isJoined` 分支（P1 功能 bug）**：✅ `CooperatePopup.vue` 的「当前图纸」组用 `:show-footer="false"` 渲染 `WorkCard`，该模板的按钮块**没有** `isJoined ? 退出 : 加入` 分支，恒渲染「加入」。已在协同中的用户点它会触发第二次 `joinWork()`（`stores/collab.ts:336-360` 同 id 加入不退出、但仍是重新发一次 `cooperate.joinWork()`），并先弹一次「未保存更改」确认。补分支（与 PC `CollabWorkCard.tsx:126-149` 的 `isJoined ? 退出 : 加入` 一致），并给该调用点补 `@exit="handleExitWork"`——此前只监听 `@join`，即便加了按钮点了也是空的。`mapWorkToDisplay` 一直正确产出 `isJoined`/`work`，模板层之前只是没消费
- [x] **C-32 `t()` 里做模板插值，永不命中词表（P1 国际化）**：✅ `t(\`创建协同失败，错误码: ${errorCode}\`)`、`t(\`退出协同失败，错误码: ${ret}\`)`、`t(\`图纸 ${id}...\`)`、`t(\`项目 ${id}...\`)` 都是先插值再查表 → 必然 miss，非中文用户看到中文原文。改为「只国际化前缀」的既有正确写法（同文件 `:432` 的 `加入协同失败，错误码:` 与 PC `useCollabActions.ts:219/386` 同构）。新键 **3732**「创建协同失败，错误码: 」、**3733**「退出协同失败，错误码: 」、**3734**「项目」（四语；zh-TW 沿用同族键 3725 的「協作」、ko-KR 沿用 3725 的「협업」以保持三条错误文案成组）；`图纸` 复用既有键 3693 不新增。全仓审计：`grep -rn "t(\`" src` 后移动端仅剩 1 处同类（`mobileUploadService.ts:195`，非本域且属并发会话文件，见文末排票）
- [x] **C-33 创建成功面板不能撤销分享（P2 体验差距）**：✅ PC `ShareDialog.tsx:793-809` 的成功视图是「撤销分享 + 完成」双按钮；移动端 `ShareManagePage.vue` 的成功视图只有二维码/复制/有效期，想撤销得先关弹窗再回列表找行。补一个 `success-revoke` 按钮（复用既有键 1880「撤销分享」+ `delete-o`，红色 10% 底沿用文件内 `#ff4444` 系），走既有 `onRevokeShare(token)`，成功后清 `createdResults` 回选择态（该链接已失效）。`onRevokeShare` 因此由 void 改为 `Promise<boolean>` 供调用方判定。**`ShareCurrentPopup.vue` 刻意不改**：它的成功视图正下方就是「已有分享」列表且 `handleCreate` 已刷新该列表（`:170`），新分享在一屏内就有撤销按钮，不存在此差距
- [x] **C-34 单条撤销不检查 SDK error 包，失败也报「已撤销」（P1 正确性）**：✅ 本仓 SDK 默认 `responseStyle`（非 `'data'`）下失败**不抛**而是回 `{ error, request, response }`，所以 `await shareControllerRevokeShare(...)` 后不检查 `res.error` 就会把 404/无权限报成成功、且刷新列表后该分享仍在。同文件批量撤销（`:322-324`）与 `ShareCurrentPopup.handleRevoke`（`:204`）都检查了，唯独单条 `onRevokeShare` 漏。补检查（全仓 135 处 `res.error` 判定为既定写法）

### Batch 20（2026-10-03 分享/协同细节对齐 PC，6 项 + 1 项查证非差距）

- [x] **C-35 协同卡片参与者头像上限 5→8（P2）**：✅ `WorkCard.vue` 的 `slice(0, 5)` / `> 5` / `length - 5` 三处改 8，对齐 PC `CollabWorkCard.tsx` 的 `linkUserData.slice(0, 8)`（PC 同法 `+{length - 8}`）。移动端此前只显示 5 个，8 人协同时第 6-8 人被折叠成「+3」
- [x] **C-36 在线人数只有数字无文案（P2）**：✅ `WorkCard.vue` 的徽标补 `{{ t('在线') }}`，对齐 PC `CollabWorkCard.tsx` 的 `{onlineCount}{t('在线')}`——移动端原本只有一个裸数字 + 绿点，语义要靠猜。保留绿点（移动端活跃指示），数字与文案间留半角空格（PC 是紧贴，`3Online`/`3온라인` 会读成单词；半角空格对 zh/zh-TW 无副作用）。新键 **3735**（在线/線上/Online/온라인，四语对齐 PC idMap 896）
- [x] **C-37 创建弹窗缺第 9 档「立即过期」（P2，与 C-12 结论相反——已改）**：✅ PC 的 `ExpirationPicker.tsx` 由 `ShareDialog`（创建）与 `EditExpiryModal`（续期）**共用**，`getExpirationLabels()` 返回九档且 `immediate` 在内，所以 PC 创建时也能选「立即过期」（`computeExpiresInSeconds('immediate')` → 1 秒，后端视为已过期）。移动端两处创建入口都只给八档，与续期弹窗（九档）不一致。补法：①`ShareManagePage.vue` 创建弹窗 chips 数组补 `'immediate'`（插在 `custom` 与 `never` 之间，与同页续期弹窗同序）；②`ShareCurrentPopup.vue` 同补。**顺带收敛**：`ShareCurrentPopup.vue` 自己复制了一份本地 `type Expiration = '2h'|...`（漏 `immediate`），是 platform `ShareExpirationOption` 的重复清单，直接删掉改用平台类型（≥2 份重复清单即缺陷）。三处 `ref(SHARE_EXPIRATION_DEFAULT)` 推断出的窄联合补显式 `ref<ShareExpirationOption>`——不加类型，补了档位后模板回写即 `TS2322`。平台 `computeExpiresAtIso`/`computeExpiresInSeconds` 对 `immediate` 已有定义（now-1s / 1 秒），创建链路零改动即通
- [x] **C-38 创建成功面板有效期只显示日期（P2）**：✅ PC `ShareDialog.tsx:784-790` 的成功提示用 `toLocaleString()`（含时分），移动端用 `formatExpiryDate` 的 `toLocaleDateString()`，选「1 小时」时看不出到点。**只改创建成功这一处**：新增 `formatCreatedExpiry()`（`toLocaleString()`），列表行仍走 `formatExpiryDate`（`toLocaleDateString()`）——PC 也是同样分档（`constants/share.ts:73` 用 date-only，成功视图用 full），全局替换反而造出新的不一致。空值仍显示「永不过期」（PC 成功视图在 `expiresAt` 为空时整个提示不渲染，移动端显示文案更明确，属刻意的移动端差异）
- [➖] **C-39 分享列表无「共 N 项」总数（查证非差距，不改代码）**：➖ 原判断依据「PC 有总数」不成立：PC `Pagination.tsx` 的 `simple`/`full` 两种布局都只渲染箭头/页码/跳页/页大小，**从不渲染总数文本**——「共 N 项」在 `Pagination.tsx:112` 只是一行死注释。移动端分享列表是无限滚动（无页码条），PC 是分页表格，交互形态本就不同。台账已按「不是差距」结案；附带发现「共 {count} 项」（键 3345）在四语里都存着中文原文，属下方新发现的未翻译债务
- [➖] **C-40 PC `Pagination` 为「共 N 项」预留了 60px 宽度却从不渲染（PC 侧缺陷，非移动端差距，只记录）**：➖ C-39 查证时顺手发现：`Pagination.tsx:35` 的 `TOTAL_TEXT_W = 60` 只被 `:112` 的宽度预算消费，全文件无任何渲染分支用它——每条分页栏恒定浪费 60px 横向空间。这是 PC 侧的死预算（可能是总数功能做过又被删、预算没跟着删），不在本次移动端对齐范围，不动 PC 代码，仅登记备查
- [x] **P1-3 移动端最后一处 `t(\`...\`)` 整串进词表（P1 国际化，C-32 收尾）**：✅ `mobileUploadService.ts:195` 的 `t(\`上传失败: ${file.name}\`)` → `` `${t('上传失败')}: ${file.name}` `，复用既有键 2619（`上传失败`，非中文用户此前看到中文）。至此全仓 `t(\`...\`)` 内插值缺陷归零
- [x] **G-07 i18n 词表完整性回归 spec（新增，把 Batch 19 踩过的坑变成门禁）**：✅ 新增 `src/languages/messages/catalog.spec.ts`（4 例）：idMap 键唯一且值为数字、四语言 id 集合与 idMap 双向对齐且无重复 id、新增键（≥3732）在 en-US/ko-KR 必须已翻译、不得出现空白文案（`t()` 会回 falsy 静默降级成中文源码串）。Batch 19 手工加键时两次把 idMap 弄成非法 JSON（末条无尾逗号、1412 条分隔符独占一行），都是靠跑测试才发现的。移动端无 `@vue/test-utils`，组件级回归不可行，故回归落在 store/service/词表这些可单测层

### C-B 后端/SDK 评估（2026-10-03，无缺口）

- [x] SDK 有 7 个 share 方法（Create/List/GetFileShares/Resolve/ResolveNode/Revoke/Update），PC 与移动端**消费集合完全相同**（各 6 个，2026-10-03 grep `sdk.gen.ts` + 两端源码核实）；`shareControllerResolveShare`（返回 `ResolveShareResponseDto` 分享元数据，与 `ResolveShareNode` 的文件信息相对）**两端零消费者**→ 不接线（无消费者代码不新增抽象，与 §K K-B 同口径）
- [x] 后端 `share.controller.ts` 的 `GET :token` 与 `GET :token/node` 均 `@Public()`（分享落地页免登录），`DELETE :token` 走 `@ApiBearerAuth()`（撤销需登录）——两端鉴权语义一致，移动端无缺口
- [x] 后端 4 个 share 端点（create/list/file/update）返回的 `url` 一律是相对 path，绝对化规则已收敛进 platform `toShareUrl`（见 C-26），前端↔SDK↔后端三层一致性闭环
- [x] 三层影响面：本批（Batch 15~18）未改任何 DTO/Controller/schema，api-sdk 无需重生成

---

## D. 个人中心 ProfilePage（/shell/profile）

### P1 高频

- [x] **D-01 头像展示 + 上传**：✅ / **D-06 密码强度条 + 忘记密码入口**：✅
- [x] **D-10 会员购买/续费/升级入口**：✅ 2026-10-03 关闭「待确认」——台账旧记「跳 PC /member-center」**已过时**：`openMemberCenter()`（`ProfilePage.vue:300`）`router.push('/shell/member')` 直达原生 `MemberCenterPage`（ADR-0068，购买/续费/升级/退款全在移动端完成），与 PC 无差距
- [x] **D-11 会员到期预警**：✅ / **D-12 存储配额用量**：✅

### P2

- [x] **D-02 账号元信息 / D-03 已验证标记 / D-05 邮箱手机解绑 / D-07 设置密码引导 / D-08 改密后重新登录 / D-14 验证码 6 位 / D-15 密码可见性**：✅
- [➖] **D-16 deactivated 态细化**：➖ 不适用（已裁定）

### P3

- [x] **D-04 微信绑定/解绑/冲突接管**：✅（2026-10-01 重审：整页跳转 + `#wechat_result` 回传 + 接管确认，runtimeConfig.wechatEnabled 门控）
- [x] **D-09 注销账户（冷静期）**：✅ `useProfileDeactivate`（动态验证方式含微信授权 + 30 天警告 + 确认勾选）
- [x] **D-13 订单历史/继续支付/申请退款**：✅ MemberCenterPage 内（订单列表 + 续付 + 退款申请/状态）
- [x] **D-17 原生认证流程**：✅ 移动端已有原生登录/注册/忘记密码/邮箱手机验证页（ADR-0062 旧设计已演进）
- [x] **D-18 登出行为**：✅ 站内 guest 态 + 登录引导（useLoginPrompt）
- [x] **D-19（2026-10-01 重审新增）修改用户名/昵称**：✅（用户名每月 3 次限制提示已有）

---

## E. 首页编辑器 + 图纸库/图块库（home）

### P0 数据风险

- [x] **E-22 从库打开图纸前未保存更改确认**：✅

### P1 高频

- [x] **E-01 编辑器菜单补 5 项 / E-02 本地另存为 / E-07 分享当前图纸 / E-23 缓存戳 updatedAt**：✅
- [➖] **E-17 库面包屑 / E-09 库内新建文件夹**：⏸ 库扁平模型限制（Batch 6b，与 all-files 决策冲突待确认）
- [x] **E-08 库内文件上传 / E-10 库内重命名 / E-11 库内删除 / E-13 库内下载 / E-19 当前文件高亮 / E-20 库空态 CTA / E-21 库加载失败保留列表 / E-28 MXWEB 导出**：✅
- [➖] **E-12 库内移动/复制**：⏸ Batch 6b（需层级视图）

### P2

- [x] **E-03 打印**：✅ 已被现有「导出 PDF」完整覆盖——移动端无物理打印机，「打印=输出 PDF」；现有链路（顶部菜单「导出」→「导出 PDF」（VIP 门控）→ 引擎出 mxweb → 后端 `POST /public-file/convert` 转 PDF → 下载，`exportService.exportDrawing('pdf')`）即 Mx_PrintDialog 等价实现。无需新增菜单/命令；若需 PC 式页尺寸预设（A4/A3）扩展 `PdfOptionsPopup.vue` 即可
- [x] **E-04 撤销/重做**：✅ 顶栏本有撤销（Mx_Undo）；补重做按钮（Mx_Redo，引擎内建命令——mxdraw dist 已验证 `addCommand("Mx_Redo")` 注册）。图标暂用 `huitui1`（移动端 iconfont 无 PC 的 `qianjin`/前进图标），待视觉核验后按需替换
- [x] **E-05 插入表格**：✅ `mxUIConfig.json`「绘制」组加「插入表格」→ Mx_InsertTable（引擎派发，同 E-31 机制）。i18n 新增「插入表格」键 3677。回归测试 `menuCommands.spec.ts`
- [x] **E-06 视图子菜单**：✅ `mxUIConfig.json` 新增「视图」组（窗口缩放 Mx_WindowZoom / 视区平移 Mx_Pan / 顺时针旋转90度 Mx_Plan90CW / 逆时针旋转90度 Mx_Plan90CCW / 自定义旋转角度 Mx_Plan，引擎派发）。PC 的 3 层嵌套（窗口缩放/视区旋转带子菜单）拍平为 2 层（移动端 toolbarData 仅支持组→list）。i18n 新增 6 键（视图 3671 / 窗口缩放 3672 / 视区平移 3673 / 顺时针旋转90度 3674 / 逆时针旋转90度 3675 / 自定义旋转角度 3676）。回归测试 `menuCommands.spec.ts`
- [x] **E-15 库列表视图 + 切换 / E-16 库分页尾标**：✅ **E-15** `LibraryPanel.vue` 加网格/清单视图切换（header 加 mode-toggle，照抄 `UnifiedFileList.vue` A-16 模式；清单行=小缩略图+名称+日期；`useViewMode('library_drawing'/'library_block')` 按库域持久化）。i18n 新增 2 键（网格视图 3688 / 列表视图 3689）。**E-16** 分页尾标既有实现已覆盖（`LibraryPanel.vue` 「没有更多了」+ load-more spinner + 失败重试条，IntersectionObserver 驱动），无需开发
- [x] **E-18 库多选 + 批量操作栏**：✅
- [x] **E-24 「当前图纸已被删除」警告横幅**：✅ 移动端 home/index.vue 加持久横幅（绑定 editor store `isCurrentFileDeleted`；useSave 保存时远程探测 DELETED/404 置位，对齐 PC session.ts `notifyNodesDeleted` 语义）。文案复用已有 i18n 键 1584，无新增键
- [x] **E-25 版本历史体验**：✅ `VersionHistoryPopup.vue`：①**相对时间**——`formatDate`（绝对时间）改 `formatRelativeTime`，口径收敛到 `@cloudcad/platform relativeTime`（与 PC 共用），i18n 新增 7 键（刚刚 3680 / {n}分钟前 3681 / {n}小时前 3682 / {n}天前 3683 / {n}周前 3684 / {n}个月前 3685 / {n}年前 3686）；②**预热提示**——选中版本后保持弹窗显示 spinner+「正在准备历史版本文件，请稍候...」（键 3687），`await openHistoricalVersion`（含转换）完成后再关弹窗（简化版预热：复用既有文件加载/转换流程，未实现 PC 的 warmup=1 显式轮询——移动端 openDrawing 已内含转换，UI 层补「准备中」态即可）。回归测试 `menuCommands.spec.ts`
- [x] **E-26 外部参照面板（查看/下载/替换已有参照）**：✅ 2026-10-01 重评估推翻旧「高复杂单独立项」判断——PC 全链路纯后端 HTTP API（零引擎调用），移动端 SDK 函数全部已存在，难度中偏低、纯前端可落地。新增：①**service 层** `extRefManageService.ts`（双场景统一出口：公开=publicFileController* / 节点=mxcadExternalRefController*+mxcadFileAccessController*；`fetchExtRefList` 列全部参照并逐项标 exists、公开场景带 10×2s 重试等 preloading 就绪；`getExtRefImageUrl`/`getExtRefDrawingUrl` 拼查看 URL（公开直连带缓存打散 / 节点鉴权 blob）；`downloadExtRef` 取 blob 落盘；`replaceExtRef` 分片上传 1MB/片对齐既有逻辑）；②**面板** `ExternalRefManagePopup.vue` + `showExternalReferenceManagePopup.ts`（列全部参照含已存在与缺失，每行 查看/替换/下载，缺失行 上传，头部统计+刷新，节点场景按 `canManageExternalRef` 权限门控上传/替换按钮；图片查看走 `showImagePreview`、图纸查看走 `openMxWeb` 就地打开+`useOpenGuard` 未保存守卫）；③**接线** `useFileLoader.ts` 的 `checkFileExternalRefs`/`checkPublicFileExternalRefs` 由「仅提示缺失」升级为「弹管理面板」（预取列表传入避免二次拉取，无参照静默跳过）。附带：`triggerBlobDownload` 收敛为唯一出口 `utils/download.ts`（原散在 exportService/libraryOperationService 两份副本改导入）。i18n 新增 12 键（查看 3690 / 替换 3691 / 下载 3692 / 图纸 3693 / 暂无外部参照文件 3694 / 共 {count} 个文件 3695 / ，{count} 个缺失 3696 / 所有文件已处理 3697 / 还有 {count} 个文件未处理 3698 / 打开外部参照失败 3699 / 外部参照下载失败 3700 / 正在上传外部参照... 3701），复用既有键（管理外部参照 3039 / 关闭 2297 / 图片 1046 / 上传 2613 / 刷新 1832 / 下载成功 2287 / 下载失败 2288 / 上传失败 2619 / 外部参照上传完成 3260）。回归测试 `extRefManageService.spec.ts`（17 例：列表双场景/查看 URL 双场景/下载双场景/替换分片+节点+失败）。**已知降级**：图纸「查看」移动端就地打开 mxweb（替换当前图纸），非 PC 的新标签页——移动端无多窗口，打开后需重新打开原图
- [x] **E-27 另存为成功后「打开新图纸」**：✅ 对齐 PC `useExportModals.handleSaveAsSuccess`。`SaveAsSheet.vue` 的 `success` emit 补 `targetType`/`libraryType`（原只传 nodeId/fileName）；`home/index.vue` `onSaveAsSuccess` 接住后弹 `showConfirmDialog`（「打开新图纸」/「{fileName} 已保存成功，是否打开？」），确认后 `openDrawing({ source: 'node'|'library', libraryKey?, nodeId })`（库域走 library 源避免走错 API），失败 toast。i18n 新增 2 键（打开新图纸 3678 / 消息 3679），复用既有「打开」/「关闭」/「打开文件失败」。回归测试 `menuCommands.spec.ts`
- [x] **E-30（2026-10-01 重审新增）修改类命令菜单缺失**：✅ 已由「选中实体浮层工具栏」覆盖（useEditObjectToolbar.ts：删除/复制/移动/旋转/镜像/颜色，选中即现、点空白消失）——移动端触控交互正解（选中实体→浮层），非 mxUIConfig 菜单；m_mx_copy/move/rotate/mirror 命令均已注册并挂该浮层。台账原「菜单未挂」判断过时
- [x] **E-31（2026-10-01 重审新增）剪贴板/选择命令**：✅ `mxUIConfig.json` 新增「剪贴板」组（复制 Mx_Copy / 粘贴 Mx_PasteClip / 剪切 Mx_CutClip / 删除 Mx_Erase / 全部选择 Mx_select_all）。均为**引擎命令**，走既有 `useFooterToolbar.onClick → callCommand`（`MxFun.sendStringToExecute`）派发——与 PC 同一机制（PC 源码零前端命令文件，纯引擎派发），故**无需新命令文件**。i18n 复用既有键（复制 802 / 粘贴 3608 / 剪切 1053 / 删除 813 / 全部选择 711），仅新增组名「剪贴板」键 3670。回归测试 `menuCommands.spec.ts`
- [x] **E-32（2026-10-01 重审新增）DWG 对比**：✅ `mxUIConfig.json`「工具」组加「图纸比对」→ Mx_CompareDWG（引擎派发，同上机制）。i18n 新增「图纸比对」键 3664。回归测试 `menuCommands.spec.ts`
- [x] **E-33（2026-10-01 重审新增）样式/属性面板**：✅ `mxUIConfig.json` 新增「样式」组（颜色 Mx_Color / 线型 Mx_Linetype / 文字样式 Mx_Style / 标注样式 Mx_Dimstyle / 对象特性 Mx_Properties，引擎派发）。i18n 组名「样式」复用既有键 792，新增 5 键（颜色 3665 / 线型 3666 / 文字样式 3667 / 标注样式 3668 / 对象特性 3669）。回归测试 `menuCommands.spec.ts`
  - 注：E-31/E-32/E-33 引擎自带面板（属性/颜色/线型/比对等）为引擎默认 UI，移动端渲染效果待真机视觉核验（触控可用性）；命令派发与菜单/i18n 已落地
  - 附带发现（未修，既有漂移）：header 菜单「导出」「协同」两标签不在 idMap，非中文语言下回退显示中文原文——独立 i18n 缺口，非本次范围

### Batch 6 记录（2026-09-11）

（保留历史记录：新增 2 文件 + 修改 6 文件；i18n 管线坑=mxUIConfig.json 文案必须手工写进 translates/messages/mxUIConfig.json 并分配 $id；附赠修复撤销分享传 id 致 404）

---

## F. 字体库 —— ➖ 排除（2026-10-01 重审）

PC `FontLibrary` 需 `SYSTEM_FONT_READ` 权限=管理员功能，按本次范围（只对照普通用户）排除。
原 F-01~F-05 条目作废。

---

## H. 合规页（2026-10-01 重审新增）

- [x] **H-01 隐私政策/用户协议页 + 入口**：✅ 2026-10-01 移动端新增 `/legal/privacy`、`/legal/terms` 路由 + `pages/legal/LegalPage.vue`；正文 `languages/legal/`（privacy/terms 各 5 语言，占位符经 platform `resolvePlaceholders` 解析，见 P-06）；LoginPage 底部 + RegisterPage 协议链接均接入
- [x] **H-02 注册页协议勾选**：✅ 2026-10-01 RegisterPage 补「我已阅读并同意《用户协议》《隐私政策》」勾选，未勾选注册按钮禁用（对齐 PC `agreedToTerms` 必填）

---

## I. 认证流程（2026-10-01 重审：已对齐，记录备查）

- 登录：账号（用户名/邮箱/手机号+密码）+ 手机验证码 + 微信（整页跳转+事务轮询，client='mobile'）——两端一致 ✅
- 注册：唯一性预检（用户名/邮箱/手机号）+ 邮箱验证一步完成注册 + 微信 tempToken 携带——两端一致 ✅
- 邮箱/手机验证页、忘记密码/重置密码——移动端原生页已覆盖 ✅
- MFA：仅管理员（AdminMfaSetup），普通用户无 MFA——范围外 ✅
- 设备授权/会话转移（/device、/session-transfer）：桌面 EXE 专属，移动端不适用 ➖

---

## K. 实时协同（CooperatePopup + useCooperate/collab store）—— 2026-10-03 新增，Batch 16 全部完成

> 后端契约前提：协同**没有 REST 面**。`/api/cooperate` 是 http-proxy 到黑盒协同进程，
> SDK 只有 `MxCooperate` 一个客户端。移动端实际只用其中 4 个方法
> （`createWork`/`getWorks`/`joinWork`/`exitWork`），`onEvent`/`getStatus`/`init` 两端零消费者
> （2026-10-03 grep 核实）。故本轮所有差距都是纯前端层，后端无缺口可修。

### K-01 协同中离开/切页无二次确认（P0 数据风险）
- [x] 协同中打开新文件 / 新建文件会静默退出当前协同会话。新增 `confirmExitCollaborationIfNeeded()`
  （useCooperate 唯一出口，非协同态直接放行），接到 `useOpenGuard.guardBeforeOpen()` 之首——
  一处覆盖全部 4 个打开图纸入口（壳内文件打开、命令打开、另存为打开、外部参照打开），
  另单独接 `home/index.vue` 的 `handleNewFile`。对齐 PC「先问退出协同、再问未保存」的顺序。
  新键 3726 / 3727

### K-02 分享进入的协同会话 sourceType 判不出来（P0）
- [x] editor store 补 `fromShare` 标志（`setFromShare` + `resetFileState` 清零），
  `index.vue` 的 shareToken 分支置位；collab.ts 的 sourceType 判定链补
  `else if (s.fromShare) sourceType = 'share'`，排在 `fromCollabShare` 之前

### K-03 未登录可发起协同（P1）
- [x] `createWork` / `joinWork` 都先校验 `userData`，未登录 `showToast(t('请先登录'))` 并返回；
  同时删掉 `userData?.id || ''` 的**空创建者**路径（原实现会让协同以空 creator 建出来）

### K-04 轮询无保护（P1）
- [x] `fetchWorks(showLoading, force)` 加 in-flight 守卫（`fetchingRef`，`force=true` 才覆盖——
  内部调用改 `fetchWorks(false, true)`）；轮询间隔 8s→30s；`document.hidden` 时跳过

### K-05 成员名不解析（P1）
- [x] `resolveNames` 原被 `if (filtered.length > 0)` 包住，列表为空时永远不触发；改无条件调用

### K-06 会话同步逻辑两处重复（P1）
- [x] `syncSessionFromWorkData(workId)` 收敛为唯一出口（getWorks → parseWorkData → v===3 →
  回写 fileId/projectId/fileName/libraryKey）；`useCollabAutoJoin` 里逐字重复的 14 行删除

### K-07 joinWork 解锁点单一（P2）
- [x] `joinWork` 订阅引擎 `openFileComplete`：收到就清 safetyTimer，并起一个 2s 兜底
  **只释放 `connecting`/`joiningWorkId`/`joiningLockRef`**（不动 `joinResolved`、不动会话状态）。
  刻意不做「openFileComplete 就算加入成功」——SDK 回调丢失会让 `connecting` 永久卡住

### K-08 移动端协同分享链接拼成死链（P0，跨端）
- [x] 移动端是 hash 路由，`window.location.pathname` 恒为 `/`，原实现拼出
  `https://host/?collabWorkId=1` 会命中 PC 的受保护兜底路由 → 跳登录/仪表盘且丢 query。
  改用固定 base `${window.location.origin}/cad-editor`（与 PC `CollabShareModal` 同一 base）

### K-09 列表加载失败静默（P2）
- [x] 新增 `fetchError` 状态 + 空列表错误态（warning 图标 + 「加载失败，请重试」+「请检查实时协同服务后重试」+ 重试按钮）；
  未挂载时拉取走强制刷新

### K-10 新建协同弹窗误报保存成功（P2）
- [x] 未保存提示确认后 `await nextTick()` 再复核 `isModified`，用
  `finishUnsaved(res.success && !isModified)` 判定，不再无条件报成功

### K-11 WorkCard 缺二维码 + 硬编码（P2）
- [x] 「分享协同」弹二维码面板（`QRCode.toDataURL(url, { width: 160, margin: 1 })` +
  只读输入框 + 复制，失败回落 ShareLinkSheet）；5 处 `#fff` → `var(--van-white)`；
  「暂无参与者」硬编码 → `t()`（新键 3724）

### K-12 错误码文案 i18n 泄漏（P2）
- [x] `t(\`加入协同失败，错误码: ${iRet}\`)` 永远不会命中（JS 先插值再交给 `t()`）；
  改为只国际化前缀 `t('加入协同失败，错误码: ') + iRet`（与 PC 拼法一致，新键 3725）。
  `useCollabAutoJoin` 里同一句**连 `t()` 都没有**，一并修

### K-13 当前图纸分组条件过严（P2）
- [x] `currentFileWorks.length > 0 && currentWorkId === null` → 去掉 `currentWorkId === null`
  （已在协同中时该分组整体消失）

### K-B 后端/SDK 评估（无缺口）
- [x] 协同无 REST 端点，SDK 面为 `MxCooperate` 7 方法；移动端消费 4 个，`onEvent`/`getStatus`/`init` 两端零消费者 → 不接线（无消费者代码不新增抽象）
- [x] PC 的显式「退出协同」也没有未保存守卫，且退出后本地文档保持打开 → 移动端明确退出路径不加守卫，只对**被动退出**（打开新文件）加确认
- [x] 三层一致性：本轮未改任何 DTO/Controller/schema，api-sdk 无需重生成

---

## G. 跨切面

- [x] **G-01 UnifiedFileList ellipsis 死控件**：✅ 已并入 A-03
- [➖] **G-02 新增文案 i18n**：➖ 2026-10-03 重写——**`pnpm i18nCompile`（`voerkai18n compile -t`）不可信，禁止运行**（`-t` 只是「启用 typescript」，不是翻译/抽取；实测会静默把 idMap + 4 语言重建成「HEAD 减 89 键」且零报错，见 Batch 17 事故注）。当前唯一可靠流程：①把新键手工追加到 `idMap.json` + 4 个 `messages/*.ts`（末条目无尾逗号、文件以 `}` 结尾；值里的双引号必须 `\"` 转义——键 3728 曾因 en-US/ko-KR 未转义致 `TS1005` 全量红）；②校验四语 entries 数一致 + 可 JSON 解析 + id 无重复 + 四语 id 集合一致；③`vue-tsc --noEmit`。mxUIConfig.json 菜单文案仍手工写 translates（坑记录见 Batch 6）
- [➖] **G-03 集成测试/单测**：➖ 2026-10-03 排票（见文末「待排票」）——未成为硬门禁。Batch 15~18 的实际做法是「改逻辑的条目带 spec（`useShareCreate`/`apiError`/`useShareLinkCopy`/platform `share/url`），纯 UI 文案条目不带」，是否升为强制规则需用户裁定
- [➖] **G-04 PC 通知中心孤儿代码**：➖ 已裁定（2026-09-10），Batch 18 只把状态标记从 ⏸ 改为 ➖——维持保留 + 如实保留 4 个 type-check 错误（无消费者、后端从未存在）
- [x] **G-05（2026-10-01 新增）platform 收敛回归**：✅ 2026-10-03 确认为常驻验收纪律（非一次性任务）——每处 P-xx 收敛后，两端 type-check + 测试 + `pnpm --filter @cloudcad/platform type-check` 全绿才算完成。Batch 17（platform `toShareUrl`）与 Batch 18 均已按此口径收尾
- [x] **G-06（2026-10-03 新增）移动端 `vite build` 必须在包目录内执行**：✅ 查证记录（非差距，是工具坑）。`pnpm --filter frontend_mobile build` 与 `pnpm -C packages/frontend_mobile build` **都会 ENOENT**：`@voerkai18n/plugins` 的 `getLanguageDir()` 用 `process.env.INIT_CWD`（pnpm 置为用户调用 pnpm 的目录=仓库根）而非 vite 的项目目录，`getSettingsFromPackageJson` 只在仓库根 `package.json` 找 `voerkai18n` 配置（无）→ 回落 `getDefaultLanguageDir()` → `<仓库根>/languages`（因为仓库根无 `src/`），`autoCreate:true` 顺手建了那个空目录（`.gitignore:174-175` 已登记此产物并忽略），随后读 `<仓库根>/languages/messages/idMap.json` 必 ENOENT。正确跑法=**先 `cd packages/frontend_mobile` 再 `pnpm build`**（INIT_CWD 变成包目录 → 命中 `src/languages`）。已验证该方式构建成功。**注意**：AGENTS.md 的「关键命令」表写的是 `pnpm build`（仓库根），对移动端不可用；根治需给 `@voerkai18n/plugins` 的 `i18nPlugin({})` 传绝对 `location`（依赖库 `@voerkai18n/utils` 的 `getLanguageDir` 用 INIT_CWD 而非项目目录，属库缺陷，本轮不改）

---

## 实施批次规划（2026-10-01 更新）

| 批次 | 内容 | 说明 |
|---|---|---|
| Batch 1~6 | 见上方各条 ✅ 记录 | 2026-09-10 ~ 09-11 已完成 |
| Batch 7（platform 收敛·一） | P-01 有效期 + P-02 计价 + P-03 微信UA + P-09 名称校验（四处纯函数，风险低） | ✅ 2026-10-01 完成：platform 加纯函数 → 两端改调用 → 双端 type-check + 测试全绿 |
| Batch 8（platform 收敛·二） | P-04 usagePercent + P-05 resolveQuotaValue（顺带修两端配额显示不一致） | ✅ 2026-10-01 完成：同 Batch 7 流程，两端配额显示对齐 |
| Batch 14（platform 收敛·三） | P-14 密码强度打分（3 份逐字节同：PC `usePasswordProfile` + PC `Register` + 移动端 `authValidation`） | ✅ 2026-10-01 完成：platform `scorePasswordStrength`（纯打分 0-4）→ 三处薄适配（保留本端 label/color）+ 移动端 spec +3 例；移动端 472/472 绿、双端 type-check 0 错 |
| Batch 9（缺口修复·文件） | A-29a 单条目剪贴板复制/剪切 + A-29b 搜索结果打开所在位置 + B-06 改角色刷新自身权限 | ✅ 2026-10-01 完成：A-29a 单条目 ActionSheet 补复制/剪切；A-29b 文件夹命中进入该文件夹 + 长按「打开所在位置」定位父文件夹；B-06 查证非真缺口（两端禁自改角色，转让已覆盖）不改代码 |
| Batch 10（缺口修复·分享） | C-05 分页 + C-03 批量撤销 + C-11/C-12 续期补自定义/立即过期 + C-14 加载失败底条 + C-15 清除搜索 | ✅ 2026-10-01 完成：ShareManagePage 分页/滚动加载 + 长按多选批量撤销 + 续期弹窗补自定义天数/立即过期（detectShareExpiration 反推初始值）+ 翻页失败底条 + 空态清除搜索；12 新 i18n 键（3643-3654）四语 + idMap |
| Batch 11（合规） | H-01 合规页+入口 + H-02 注册勾选 + P-06 占位符解析 | ✅ 2026-10-01 完成：移动端 `/legal/*` 路由 + LegalPage + 登录/注册入口 + 注册勾选，正文走 platform `resolvePlaceholders` |
| **Batch 12（编辑器菜单）** | ✅ E-04 撤销/重做 + E-30 修改类命令 + E-24 删除警告横幅 | ✅ 2026-10-01 完成：E-04 顶栏补重做按钮（Mx_Redo，引擎已验证支持，图标 huitui1 待视觉核验）；E-30 查证已由「选中实体浮层工具栏」覆盖（useEditObjectToolbar）非真缺口；E-24 加持久删除横幅（绑定 isCurrentFileDeleted，复用 i18n 键 1584）。home/index.vue 单文件；459/459 绿 |
| Batch 13（体验补强） | ✅ A-12 项目卡片（描述+成员数，封面留待）+ A-25 转换失败徽标 + B-08 成员头像/邮箱 + B-09 角色筛选 + C-04 分享排序 | ✅ 2026-10-01 完成 5 项（4 文件 + 5 新 i18n 键 3655-3658 四语）；459/459 绿。C-09 批量分享已在 **Batch 15** 完成；**E-26 外部参照面板补全**（引擎参照查看/下载/替换）仍单独立项 |
| Batch 6b（库层级视图） | E-09/E-12/E-17 | ⏸ 与 all-files 决策冲突待确认 |
| Batch 15（分享细节对齐） | C-17 创建弹窗自定义天数 + C-18 已有分享链接/复制 + C-19 删死分支 + C-20 批量进度 + C-21 errMsg 唯一出口 + C-22 撤销文案统一 + C-23 错误态/空态 + C-24 搜索防抖 + C-25 二维码 160 | ✅ 2026-10-03 完成：ShareCurrentPopup/ShareManagePage/useShareCreate/apiError 共 4 文件；`errMsg` 补裸字符串直通（修 `[object Object]` 与错误塌成兜底）；`createShares` 加 `onProgress`（不传行为不变）；新增 i18n 键 3721/3722 四语 |
| Batch 16（实时协同对齐） | K-01~K-13 全 13 项（详见 §K） | ✅ 2026-10-03 完成：useCooperate/useCollabAutoJoin/useOpenGuard/useEditorState/collab.ts/editor.ts/CooperatePopup/WorkCard/index.vue 共 9 文件；新增 i18n 键 3723-3727 四语。最大产出=K-01 一处 `guardBeforeOpen` 覆盖 4 个打开入口 + K-08 修跨端死链。**后端无缺口**（协同是 http-proxy 黑盒，无 REST 面） |
| Batch 17（分享链接绝对化 + 复制反馈） | C-26 `toShareUrl` 收敛进 platform + 两端薄出口（移动端 4 边界覆盖 10 消费点、PC 5 处手写拼接换共享规则）+ C-27 `useShareLinkCopy` 行内反馈 | ✅ 2026-10-03 完成：platform `share/url.ts` + spec + barrel；PC `utils/shareUrl.ts` + ShareDialog ×4 + useShareActions；移动端 `utils/shareUrl.ts` + `useShareLinkCopy`（+5 例 spec）+ ShareManagePage/ShareCurrentPopup/useShareCreate。**门禁**：platform 13/76 绿、PC type-check 0 错 + share specs 19/19、移动端 vue-tsc 0 错 + 68 文件/633 用例绿 + `vite build` 成功。**⚠ i18n 事故**：`pnpm i18nCompile`（`voerkai18n compile -t`）会把 `idMap.json` 连同 4 个语言文件一起重建成「HEAD 减去尾部 89 个键」的状态（丢 1412 + 3633-3720，含批量下载/回收站/跨项目转移/分享撤销等文案），且不补本轮新键。已 `git show HEAD:` 逐文件恢复后**手工**追加 3721-3727 四语（1181/1182 条，四语 id 集合完全一致）；**此工具当前不可信，勿再跑**，i18n 键须手工加或在工具修复后统一跑 |
| Batch 18（分享/协同收尾） | C-29 WorkCard 协同分享复制收敛进 `useShareLinkCopy` + 行内 ✓ + C-30 WorkCard 5 处硬编码中文包 `t()`（新键 3731）+ C-28 查证非差距 + 台账清尾 | ✅ 2026-10-03 完成：`WorkCard.vue` 删本地 `copyText` + 两份回落 refs 改调 `useShareLinkCopy`（`copiedKey === display.shareUrl` 行内 ✓）；`分享`×2/`退出`/`加入`×2 包 `t()`，**与 PC `CollabWorkCard.tsx` 三个按钮文案逐字一致**。C-13 由 C-27 覆盖故合并；D-10 查证为台账过时（`router.push('/shell/member')` 直达原生 MemberCenterPage）；G-02 重写（compile 工具不可信，改手工加键 + 四语校验）；G-04/G-05 状态归位；B-10/P-08 自动化/Batch 6b/G-03 排票见文末；C-28 查证非差距（后续裁定维持现状）。**门禁**：移动端 `vue-tsc --noEmit` 0 错 + vitest 70 文件 / 647 用例全绿 | 
| Batch 19（分享/协同收口） | C-31 WorkCard 简化版补 isJoined 分支 + `@exit` / C-32 `t()` 内模板插值改前缀式（新键 3732-3734）/ C-33 创建成功面板补撤销 / C-34 单条撤销补 `res.error` 检查 | ✅ 2026-10-03 完成：`WorkCard.vue` + `CooperatePopup.vue` + `stores/collab.ts` + `ShareManagePage.vue` 共 4 文件，另加 i18n 3 键四语（3732/3733/3734，1188 条四语 id 集合一致）。C-31 是真功能 bug（已在协同中点「加入」→ 重复 joinWork + 误弹未保存确认）；C-32/C-34 是正确性缺陷（非中文用户看到中文错误码文案 / 撤销失败报成功）。C-33 只做 ShareManagePage（ShareCurrentPopup 一屏内已有撤销入口，见 C-33 说明）。**门禁**：移动端 `vue-tsc --noEmit` 0 错 |
| Batch 20（分享/协同细节对齐 PC） | C-35 头像上限 5→8 / C-36 在线数补「在线」文案 / C-37 创建弹窗补第 9 档「立即过期」（两处入口 + 删重复类型）/ C-38 创建成功有效期含时分 / C-39 分页总数查证非差距 / C-40 PC 死预算记录 / P1-3 最后一处 `t(\`...\`)` / G-07 词表回归 spec | ✅ 2026-10-03 完成：`WorkCard.vue` + `ShareManagePage.vue` + `ShareCurrentPopup.vue` + `services/mobileUploadService.ts` 共 4 文件 + i18n 1 键四语（3735，1189 条四语 id 集合一致）+ 新增 `catalog.spec.ts`（4 例）。C-37 推翻 C-12 旧判定（PC 创建确实九档）；C-39 推翻原排票依据（PC 从不渲染总数）；G-07 把 Batch 19 手工加键两次弄坏 idMap 的坑固化成门禁。**门禁**：移动端 `vue-tsc --noEmit` 0 错、vitest 71 文件/651 例全绿、`vite build` 成功 |
| ⏸ 待确认 | P-08 编辑器菜单审计自动化（命令覆盖已人工审计完成，门禁待建）/ Batch 6b 库层级视图 / G-03 测试覆盖率门禁 / **P1-2 分享状态筛选（后端契约变更）** / **i18n 未翻译债务（en-US 89 条 / ko-KR 90 条）** | 需用户裁定（明细见文末「待排票」） |

---

## 待排票（Batch 20 收尾，2026-10-03）

以下为已查证但**不进 Batch 20** 的项。本仓台账无 issue 编号约定，故在此集中登记而非散落在各处 ⏸ 标记里：

| 项 | 内容 | 为什么不进本批 | 前置条件 |
|---|---|---|---|
| **B-10 精细化错误文案** | 成员操作失败兜底 `移除失败`（`ProjectDetailPage.vue:356`）是硬编码中文且 idMap 无此键 | 低优；且 `ProjectDetailPage.vue` 正被并发会话修改，动它必冲突 | 与 G-02 的 i18n 流程改造一并处理 |
| **P-08 菜单审计自动化** | 命令覆盖已人工审计完成（E-30~E-33 结论见 §E），但审计靠手工 grep，无门禁；引擎 ini 双源结构不同名（PC `myUiConfig.json` 196 命令 vs 移动端 `mxUIConfig.json` 55 命令） | 需先裁定审计范围与判定标准（能否合并两份数据本身就是 P-08 的结论：不能） | 用户裁定 |
| **Batch 6b 库层级视图** | E-09 库内新建文件夹 / E-12 库内移动复制 / E-17 库面包屑 | 与 all-files 决策冲突，属产品形态取舍而非技术差距 | 用户裁定 |
| **G-03 测试覆盖率门禁** | 「每条 P0/P1 修复带回归测试」未成为硬门禁；Batch 15~20 实际做法=改逻辑的条目带 spec、纯 UI 文案条目不带（Batch 20 例外地给 i18n 词表加了 spec，见 G-07） | 是否升为强制规则影响后续所有批次的工作量 | 用户裁定 |
| **P1-2 分享状态筛选需后端契约变更** | 移动端「全部/有效/已过期」是纯客户端过滤（`ShareManagePage.vue:493` 只过滤已加载的页），`shareHasMore` 由服务端 `total` 推导（未过滤总数，故过滤后会出现「还能加载但已无有效项」），全选计数按过滤后计——三处口径不一致。正确修需要 list 端点支持 status 查询参数 | 涉及后端 DTO/Controller → SDK 重生成 → 两端联动，属三层一致性的完整改动，半修（只改客户端）会掩盖问题 | 后端契约变更 + SDK 重生成 + 两端同改 |
| **i18n 未翻译债务（en-US 89 条 / ko-KR 90 条）** | 英文 89 条、韩文 90 条仍是中文原文（en-US：id 3260-3479 区间为主；ko-KR 另含 3099），非中文用户在这些界面看到中文。G-07 的 spec 只钉住「新增键必须翻译」，存量债务靠它挡不住 | 批量补 179 条翻译是纯文案工作、与「分享/协同对齐」无关，且需要人工校对质量（不能靠机器翻一遍就提交） | 用户裁定是否排批量翻译批次 |
| **C-40 PC `Pagination` 60px 死预算** | `Pagination.tsx:35` 的 `TOTAL_TEXT_W = 60` 只被 `:112` 宽度预算消费，全文件无渲染分支使用，每条分页栏恒定浪费 60px 横向空间 | PC 侧改动，超出「移动端向 PC 补齐」的方向 | PC 侧单独排票 |
| **P2-PC 侧自身不一致（非移动端差距）** | `ShareTable.tsx:196` 的 `window.open(item.url, '_blank')` 直接用相对 path（同文件复制按钮走 `shareUrl()` 绝对化，见 C-26）；移动端两处是一致的 | 修它属 PC 侧改动，超出「移动端向 PC 补齐」的方向——这是 PC 的 bug | PC 侧单独排票 |
| **C-38 残留：创建成功提示无「有效期至」前缀** | PC `ShareDialog.tsx:786` 用 `t('有效期至: {date}').replace(...)` 拼成完整句子；移动端成功提示是「clock 图标 + 日期」，没有「有效期至」文字 | 图标已承担指示作用，成功面板纵向空间紧；且 `有效期至` 不是现有键，加它需要四语新键 | 与批量翻译批次一并处理 |

> 已关闭无需再排票：G-04（PC 通知中心孤儿代码，2026-09-10 已裁定保留）、C-13（与 C-27 重复合并）、D-10（台账过时，现状已与 PC 对齐）、**C-28（2026-10-03 裁定维持现状——分享日期两端都用本地化日期，一致即无差距；固定格式的适用域是审计/版本/文件历史这类需排序或导出的时间戳，不含分享列表；如未来要改，须 PC + 移动端 4 处同改）**、**P1-3 与 P2 六项（Batch 20 已做，见 §C Batch 20；其中「移动端列表无分页总数」经 C-39 查证为台账原判断有误——PC 从不渲染总数文本）**。

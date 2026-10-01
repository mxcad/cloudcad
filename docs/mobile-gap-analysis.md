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
- [ ] **B-10 精细化错误文案**：🚧 部分——move/copy 已透传后端错误（transferErrorMessage）；成员操作仍 `e?.message || '移除失败'`（后端 i18n 消息已透传，可接受，低优）
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

- [x] **C-02 修改有效期（续期）**：✅ 7 档 + 永不过期（→ P-01 收敛；PC 另有「自定义天数/立即过期」见 C-11/C-12）
- [x] **C-10 二维码**：✅ 创建面板内嵌 160px + 列表项「查看二维码」
- [x] **C-06 创建时间字段**：✅ / **C-07 URL 展示 + 打开**：✅
- [x] **C-16 状态判定修正**：✅ 客户端 expiresAt 判定（→ P-01 收敛 isShareExpired）

### P2

- [x] **C-03 多选 + 批量撤销**：✅ 2026-10-01 长按进多选（500ms 手势，与文件列表/项目卡片同套）+ 点按切换选中（纯 CSS 圆圈勾选指示，不依赖 vant 图标名）+ 底部操作栏「取消/全选/批量撤销」；批量撤销=逐个 `shareControllerRevokeShare` 循环 + 成功/失败计数 toast（对齐 PC `handleBatchRevoke`，后端无批量端点）；多选时隐藏 FAB
- [x] **C-04 排序**：✅ 2026-10-01 ShareManagePage 筛选条右侧加排序按钮（ActionSheet 选字段：创建时间/有效期/次数，同字段切方向↑↓）；`sortBy`/`sortOrder` 走服务端 `shareControllerListShares`（API 原生支持），watch 变化回第一页重拉；「次数」新键 3658
- [x] **C-05 分页/加载更多**：✅ 2026-10-01 `loadShares(append)` page 累加 + `shareHasMore`（total/pageSize 推算，后端 ShareListResponseDto 无 totalPages）+ 列表 `@scroll` 触底加载 + 底条（加载中/没有更多了）；keyword/filter 变化回第一页
- [x] **C-11 自定义天数**：✅ 2026-10-01 续期弹窗补「自定义天数」档 + 天数输入（1-365 钳制，`computeExpiresAtIso(option, days)` 走 platform）；`openRenewPopup` 改用 `detectShareExpiration` 反推初始档+天数（对齐 PC EditExpiryModal）。**注**：移动端创建弹窗的 `customDays` 原是死代码（模板从未渲染 custom 档/输入框），本次只补续期弹窗；创建弹窗补 custom 档留待后续（PC ShareDialog 有，属另一缺口）
- [x] **C-12 「立即过期」选项**：✅ 2026-10-01 续期弹窗补「立即过期」档（`computeExpiresAtIso` 返回 now-1s，后端视为已过期）；创建弹窗不加（新建即过期无意义，PC 因共用 ExpirationPicker 才显示，属 PC 小瑕疵）
- [ ] **C-13 复制成功行内反馈**：⬜ PC copiedToken 该行图标变 ✓ 2s；移动端仅 toast（可接受，低优）
- [x] **C-14 加载失败底条**：✅ 2026-10-01 `loadMoreFailed` 与整页 `error` 分离——翻页失败保留已加载列表、底条「加载失败，点击重试」（重跑当前页不重复追加）；首屏失败才整页错误态
- [x] **C-15 空态「清除搜索」**：✅ 2026-10-01 搜索无结果时文案改「未找到相关分享」+「清除搜索」按钮（清空 keyword）；无关键词时保持「暂无分享」+「新建分享」

### P3

- [x] **C-08 新建分享文件选择器**：✅ 双 scope（personal_space+all_projects）并集去重 + 搜索 + 加载更多 + 错误可重试（2026-10-01 修复恒空问题）
- [ ] **C-09 批量分享**：⏸ 留待（高复杂，2026-10-01 评估）PC 文件选择器可多选 → 逐个生成 + (done/total) 进度；移动端选择器单选（selectedFileId 单值）。修：选择器加多选（长按/勾选）+ 逐个创建 + 进度汇总——涉及选择器交互重构，单独立项

---

## D. 个人中心 ProfilePage（/shell/profile）

### P1 高频

- [x] **D-01 头像展示 + 上传**：✅ / **D-06 密码强度条 + 忘记密码入口**：✅
- [x] **D-10 会员购买/续费/升级入口**：✅（跳 PC /member-center 整页；移动端已有完整会员中心见 §E 之外的 MemberCenterPage——**待确认**：D-10 的「跳 PC」降级方案是否应改为直接进移动端 MemberCenterPage，2026-10-01 重审发现移动端已有完整会员页，此降级可能已过时）
- [x] **D-11 会员到期预警**：✅ / **D-12 存储配额用量**：✅

### P2

- [x] **D-02 账号元信息 / D-03 已验证标记 / D-05 邮箱手机解绑 / D-07 设置密码引导 / D-08 改密后重新登录 / D-14 验证码 6 位 / D-15 密码可见性**：✅
- [➖] **D-16 deactivated 态细化**：➖ 不适用（已裁定）

### P3 / 待确认

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

## G. 跨切面

- [x] **G-01 UnifiedFileList ellipsis 死控件**：✅ 已并入 A-03
- [ ] **G-02 新增文案 i18n**：⬜ 所有新 UI 文本走 `t()` → extract+compile；mxUIConfig.json 菜单文案手工写 translates（坑记录见 Batch 6）
- [ ] **G-03 集成测试/单测**：⬜ 每条 P0/P1 修复带回归测试
- [ ] **G-04 PC 通知中心孤儿代码**：⏸ 维持保留 + 如实保留 4 个 type-check 错误（2026-09-10 裁定，无消费者、后端从未存在）
- [ ] **G-05（2026-10-01 新增）platform 收敛回归**：每处 P-xx 收敛后，两端 type-check + 测试 + `pnpm --filter @cloudcad/platform type-check` 全绿才算完成

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
| Batch 13（体验补强） | ✅ A-12 项目卡片（描述+成员数，封面留待）+ A-25 转换失败徽标 + B-08 成员头像/邮箱 + B-09 角色筛选 + C-04 分享排序 | ✅ 2026-10-01 完成 5 项（4 文件 + 5 新 i18n 键 3655-3658 四语）；459/459 绿。**C-09 批量分享 / E-26 外部参照面板补全** 属高优复杂项（选择器多选+逐个创建+进度 / 引擎参照查看下载替换），单独立项后续做 |
| Batch 6b（库层级视图） | E-09/E-12/E-17 | ⏸ 与 all-files 决策冲突待确认 |
| ⏸ 待确认 | D-10 会员入口改走移动端 MemberCenterPage？/ P-08 编辑器菜单审计自动化 | 需用户裁定 |

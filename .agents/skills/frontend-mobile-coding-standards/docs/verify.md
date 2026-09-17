# 提交前验证

## 移动端

```bash
cd packages/frontend_mobile
pnpm type-check    # vue-tsc --noEmit
pnpm build         # vite build（含 i18n 编译）
```

## i18n 变更后

```bash
pnpm i18n:extract      # 1. 提取新文本（必须跑完，见下「i18n 变更后的硬要求」）
pnpm i18nAutoTranslate # 2. 自动翻译
pnpm i18n:compile      # 3. 编译产物（可提交！见下）
```

## i18n 变更后的硬要求

1. **三步一个都不能省**。只跑 `extract` 不跑 `compile` → `messages/*.ts` 与 `idMap.json` 停在旧快照，约 973/1195 个引用文件 type-check 直接报红，看起来像"改坏了全局"，其实是没编译。
2. **跑完三步要核对产物真的更新了**。`extract` 会 SKIP 掉翻译字段已被预填为源文的键（工具视为"已翻译"），所以"输出全 SKIP"不等于"没写入"——但也不等于"编译过了"，最后一步 `compile` 必须执行，否则 `messages/*.ts` 里看不到新键。
3. **手写 `mxUIConfig.json` 的 `$id` 必须避开 `default.json` 已用区间**。撞号会让 `extract` 崩在 `ReferenceError: logsets is not defined`（工具按 id 建索引，撞号时索引为 undefined）——报错位置完全不像 i18n，务必先按这个方向查。新增前 `grep` 两边 json 的最大 id，接着往后编。
4. **备份文件带 `.bak.` 中缀**（如 `default.json.bak.20260917.json`）。根 `.gitignore` 的 i18n 规则只匹配 `*.bak.*.json`，翻译配置的 glob 是 `["*.json", "!*.bak*.json"]`；命名不合规的备份会被当正式翻译参与编译、并被提交进 git。

## 重复实现扫描（横切平台能力门禁）

新增工具函数或组件前，先按**底层 API 名**确认是否已有实现。以下命令应返回 0 行（出口文件已排除）：

```bash
cd packages/frontend_mobile
grep -rn "navigator\.clipboard\|document\.execCommand" src --include="*.ts" --include="*.vue" \
  | grep -v "\.spec\.\|\.test\.\|api-sdk/" \
  | grep -v "clipboard\.ts"
```

有命中 = 存在绕过唯一出口的内联调用，必须改为调用 `src/utils/clipboard.ts`；两级降级都失败时弹出 `components/ShareLinkSheet.vue` 让用户手动选中复制。**门禁必须带"牙齿"**：去掉 `grep -v "clipboard\.ts"` 应能看到命中（本仓为 5 行），否则说明扫描本身是空匹配、不可信。

## 绝对禁止提交的内容

- 未通过 type-check 的代码
- 手动修改的 `api-sdk/` 自动生成文件
- 会员/支付代码里出现 `fetch()` 直调后端（必须走 `@cloudcad/api-sdk` 的 `billingController*` / `vipController*`）；或改动交易类型分流（MWEB/NATIVE 按 UA 判定，见 ADR-0068）

> **注意：编译后的 i18n 产物必须提交，不是禁止项。** `src/languages/messages/*.ts`、`paragraphs/*.ts`、`messages/idMap.json`、`translates/messages/*.json`（含 `api.json`）全部由 `git ls-files` 追踪，`.gitignore` 对 i18n 只忽略 `*.bak.*.json` 备份。**不提交 = 线上/下一份 clone 跑起来看到占位文案或简体中文**（非目标语言用户直接看中文）。i18n 变更后务必 `git add packages/frontend_mobile/src/languages/`。

## 会员/支付改动额外检查

- 后端 billing/vip 端点无移动端专属接口，改动前先确认是否属于后端契约变更（须三层联动）
- 金额全链路单位为「分」，展示必须经 `centsToYuan()` 转元
- 支付成功后须 patch `localStorage.user` 的 4 个会员字段（编辑器 VIP 门控数据源）
- MWEB 跳转前须 `savePendingPayment()`，`onMounted` 的 `resumePending()` 负责回跳恢复

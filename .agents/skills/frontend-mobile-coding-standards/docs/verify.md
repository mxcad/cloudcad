# 提交前验证

## 移动端

```bash
cd packages/frontend_mobile
pnpm type-check    # vue-tsc --noEmit
pnpm build         # vite build（含 i18n 编译）
```

## i18n 变更后

```bash
pnpm i18n:extract    # 提取新文本
pnpm i18nAutoTranslate  # 自动翻译
pnpm i18n:compile    # 编译
```

## 绝对禁止提交的内容

- 未通过 type-check 的代码
- 编译后的 i18n 文件（`languages/*.js`）— 应在构建时生成
- 手动修改的 `api-sdk/` 自动生成文件
- 会员/支付代码里出现 `fetch()` 直调后端（必须走 `@cloudcad/api-sdk` 的 `billingController*` / `vipController*`）；或改动交易类型分流（MWEB/NATIVE 按 UA 判定，见 ADR-0068）

## 会员/支付改动额外检查

- 后端 billing/vip 端点无移动端专属接口，改动前先确认是否属于后端契约变更（须三层联动）
- 金额全链路单位为「分」，展示必须经 `centsToYuan()` 转元
- 支付成功后须 patch `localStorage.user` 的 4 个会员字段（编辑器 VIP 门控数据源）
- MWEB 跳转前须 `savePendingPayment()`，`onMounted` 的 `resumePending()` 负责回跳恢复

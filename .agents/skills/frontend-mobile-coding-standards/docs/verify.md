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
- 任何计费/支付相关的 UI 或交互代码（移动端不实现计费功能）

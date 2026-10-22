# 后端 i18n 死键审计与处置清单

> 本文件由 `packages/backend/scripts/scan-i18n-dead-keys.cjs` 生成，改完接线后重跑即可刷新：
> `node packages/backend/scripts/scan-i18n-dead-keys.cjs`。下表数字是生成时刻的快照。

## 结论

后端 i18n 目录共 491 个叶子键，**0 个零引用（0%）**。零引用 ≠ 都是垃圾：下面的分类决定是「修代码」还是「直接删」——接线错若被当冗余删掉，缺陷会被永久盖住，比留着死键更难查。

### 处置进度

| # | 动作 | 影响键数 | 状态 |
|---|---|---|---|
| 1 | 修 `user-status.service.ts` 的两个验证文案表（`getPrerequisiteError` / `getVerifyFailedError`）+ `email-code-verification.strategy.ts` | 13 | ✅ 已完成 |
| 2 | **DTO 装饰器的 `message` 改函数式 i18n**（参照 `password-reset.dto.ts`：`message` 写成 `(args) => I18nContext.current()?.t(...) ?? 中文兜底`） | 46 | ⬜ 剩余项 |
| 3 | `mx-version-control.provider.ts` 收敛到 `I18nContext`（20 处 `this.i18nService.t()`） | 3 | ✅ 已完成 |
| 4 | 整节全死：接线 `error.version_control_extra` 3 + `error.library` 1；确认 `error.policy` 5 / `error.seed` 10 / `error.public_file_extra` 1 为真废弃 | 20 | ✅ 已完成 |
| 5 | 删 ALIAS / LOG_ONLY / DOC_ONLY / ORPHAN | 109 | ✅ 已完成 |

> 步骤 2 的机制更正：早期清单写「修 `CustomValidationPipe.exceptionFactory`」，但 DTO 已经直接产出内联中文 `message:` 字符串，异常工厂拿到的已是成品文案，在那里接 i18n 是 no-op。唯一可行的落点是装饰器本身——class-validator 0.14.4 支持函数式 message（`cjs/validation/ValidationUtils.js` 的 `replaceMessageSpecialTokens` 会对函数求值）。

> 删除前须复核：扫描器靠 `keyRe()` 的 `(?![\w.])` 断言区分「真死」与「被更长活键遮蔽」，但**删除动作本身不受这份判据保护**。复核时要把「扫描器/审计脚本在散文里点出键名」的说明性引用与真实调用分开统计——否则只会看到扫描器自己，误判为可删。

---

## 扫描口径（可复现）

- 键范围：四语齐全（zh-CN / en-US / zh-TW / ko-KR）的叶子键，排除动态构造节 `error.project_member`、`error.mxcad_engine_extra`（键名由代码拼接，不可静态枚举）。
- 语料：830 个后端文件 + 1634 个其余文件；排除 `translations/`、`dist/`、`node_modules/`、`.pnpm/` 与一次性迁移脚本 `migrate-i18n.mjs`。
- 死键判据：全点路径（如 `error.file.conversion_failed`）经 `keyRe()` 的 `(?![\w.])` 边界断言在语料中零命中。

### 假阳性陷阱（本次踩过的，重跑时勿再踩）

1. **不排掉 `migrate-i18n.mjs` 会全错**——它自带「中文 → 键」映射表，是唯一的其他引用者。
2. **按子串匹配会骗过精确匹配**：`size_exceeded` 出现在 `error.file_extra.size_exceeded_with_name` 里，导致 `error.public_file.size_exceeded` 被误判为活。必须用全点路径。
3. **按「行包含子串」匹配会误判**：2 字文案（「未登录」「删除成功」）命中大量无关注释。必须在**字符串字面量内**匹配。
4. **Swagger `@ApiResponse`/`@ApiProperty` 的描述与 example 不是运行时文案**，不计缺陷；`@ApiResponse(` 的开括号常在字面量上方两行，检测窗口要够宽。
5. **`impact:` / `description:` / `example:` / `unit:` 等元数据字段**同理不是用户文案（实例：runtime-config 配置项的 impact 说明）。
6. **`logger.` / `console.` 文案**面向运维不面向用户，不算 i18n 缺陷。
7. **仓库有两套 i18n 访问器**：`I18nContext.current()?.t()`（801 处，标准）与 `this.i18nService.t()`（20 处，全在 `mx-version-control.provider.ts`）。别名检测必须同时认两者，否则该文件的死键会被误判成接线错。
8. **别名判断要用 ±3 行窗口**：`I18nContext.current()?.t(...)` 常写成多行，`.t(` 落在字面量的下一行，只看本行会漏判。
9. **键匹配不能用 `String.includes`**：`error.user.verification_failed` 会被 `error.user.verification_failed_default` 包含而误判为「活」。全仓有 18 组这种前缀遮蔽对，裸 includes 让它们全部漏检。本脚本用 `keyRe()` 加 `(?![\w.])` 边界断言。

## 分类统计

| 分类 | 数量 | 处置 |
|---|---|---|

## 整节全死的节



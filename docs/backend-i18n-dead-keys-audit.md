# 后端 i18n 死键审计与处置清单

> 本文件由 `packages/backend/scripts/scan-i18n-dead-keys.cjs` 生成，改完接线后重跑即可刷新：
> `node packages/backend/scripts/scan-i18n-dead-keys.cjs`。下表数字是生成时刻的快照。

## 结论

后端 i18n 目录共 482 个叶子键，**60 个零引用（12%）**。零引用 ≠ 都是垃圾：下面的分类决定是「修代码」还是「直接删」——接线错若被当冗余删掉，缺陷会被永久盖住，比留着死键更难查。

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
- 语料：820 个后端文件 + 1631 个其余文件；排除 `translations/`、`dist/`、`node_modules/`、`.pnpm/` 与一次性迁移脚本 `migrate-i18n.mjs`。
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
| MECHANISM_GAP | 46 | 机制缺失：整节未接线，修机制而非逐键 |
| HARDCODED | 9 | 接线错：面向用户的文案硬编码，逐键排票 |
| HARDCODED_WEAK | 5 | 疑似接线错：命中少，需人工确认 |

## MECHANISM_GAP（46）

> 机制缺失：整节未接线，修机制而非逐键

### validation（46）

- `validation.phone_must_be_string` — 手机号必须是字符串
  - validation 整节 46/46 键全死
- `validation.phone_invalid` — 请输入有效的中国大陆手机号
  - validation 整节 46/46 键全死
- `validation.role_id_must_be_string` — 角色ID必须是字符串
  - validation 整节 46/46 键全死
- `validation.password_must_be_string` — 密码必须是字符串
  - validation 整节 46/46 键全死
- `validation.code_must_be_string` — 验证码必须是字符串
  - validation 整节 46/46 键全死
- `validation.wechat_verification_must_be_string` — 微信验证必须是字符串
  - validation 整节 46/46 键全死
- `validation.email_invalid` — 请输入有效的邮箱地址
  - validation 整节 46/46 键全死
- `validation.username_must_be_string` — 用户名必须是字符串
  - validation 整节 46/46 键全死
- `validation.username_required` — 用户名不能为空
  - validation 整节 46/46 键全死
- `validation.username_min_length` — 用户名至少3个字符
  - validation 整节 46/46 键全死
- `validation.username_max_length` — 用户名最多20个字符
  - validation 整节 46/46 键全死
- `validation.username_pattern` — 用户名只能包含字母、数字和下划线
  - validation 整节 46/46 键全死
- `validation.password_required` — 密码不能为空
  - validation 整节 46/46 键全死
- `validation.password_min_length` — 密码至少8个字符
  - validation 整节 46/46 键全死
- `validation.password_max_length` — 密码最多50个字符
  - validation 整节 46/46 键全死
- `validation.nickname_must_be_string` — 昵称必须是字符串
  - validation 整节 46/46 键全死
- `validation.nickname_max_length` — 昵称最多50个字符
  - validation 整节 46/46 键全死
- `validation.wechat_token_must_be_string` — 微信临时 Token 必须是字符串
  - validation 整节 46/46 键全死
- `validation.login_account_must_be_string` — 登录账号必须是字符串
  - validation 整节 46/46 键全死
- `validation.login_account_required` — 登录账号不能为空
  - validation 整节 46/46 键全死
- `validation.refresh_token_must_be_string` — 刷新Token必须是字符串
  - validation 整节 46/46 键全死
- `validation.refresh_token_required` — 刷新Token不能为空
  - validation 整节 46/46 键全死
- `validation.email_required` — 邮箱不能为空
  - validation 整节 46/46 键全死
- `validation.phone_required` — 手机号不能为空
  - validation 整节 46/46 键全死
- `validation.email_format_invalid` — 邮箱格式不正确
  - validation 整节 46/46 键全死
- `validation.phone_format_invalid` — 手机号格式不正确
  - validation 整节 46/46 键全死
- `validation.email_or_phone_required` — 必须提供邮箱或手机号
  - validation 整节 46/46 键全死
- `validation.code_required` — 验证码不能为空
  - validation 整节 46/46 键全死
- `validation.code_length` — 验证码必须是6位
  - validation 整节 46/46 键全死
- `validation.code_digit` — 验证码必须是6位数字
  - validation 整节 46/46 键全死
- `validation.confirm_password_must_be_string` — 确认密码必须是字符串
  - validation 整节 46/46 键全死
- `validation.confirm_password_required` — 确认密码不能为空
  - validation 整节 46/46 键全死
- `validation.passwords_mismatch` — 两次输入的密码不一致
  - validation 整节 46/46 键全死
- `validation.current_password_must_be_string` — 当前密码必须是字符串
  - validation 整节 46/46 键全死
- `validation.new_password_must_be_string` — 新密码必须是字符串
  - validation 整节 46/46 键全死
- `validation.new_password_min_length` — 新密码至少 6 个字符
  - validation 整节 46/46 键全死
- `validation.new_password_required` — 新密码不能为空
  - validation 整节 46/46 键全死
- `validation.password_min_length_6` — 密码至少 6 个字符
  - validation 整节 46/46 键全死
- `validation.code_must_be_string_wechat` — code 必须是字符串
  - validation 整节 46/46 键全死
- `validation.code_required_wechat` — code 不能为空
  - validation 整节 46/46 键全死
- `validation.state_must_be_string` — state 必须是字符串
  - validation 整节 46/46 键全死
- `validation.state_required` — state 不能为空
  - validation 整节 46/46 键全死
- `validation.phone_verified_must_be_boolean` — phoneVerified 必须是布尔值
  - validation 整节 46/46 键全死
- `validation.email_verified_must_be_boolean` — emailVerified 必须是布尔值
  - validation 整节 46/46 键全死
- `validation.config_value_required` — 配置值不能为空
  - validation 整节 46/46 键全死
- `validation.search_keyword_max_length` — 搜索关键词最长200个字符
  - validation 整节 46/46 键全死

## HARDCODED（9）

> 接线错：面向用户的文案硬编码，逐键排票

### error.file（5）

- `error.file.conversion_failed` — 文件转换失败
  - packages/backend/src/public-file/public-file.controller.ts:407, packages/backend/src/public-file/public-file.service.ts:248, packages/backend/src/public-file/public-file.service.ts:271, packages/backend/src/public-file/public-file.service.ts:484
- `error.file.format_unsupported` — 不支持的文件格式
  - packages/backend/src/mxcad/save/save-as.service.ts:241
- `error.file.upload_failed` — 文件上传失败
  - packages/backend/src/fonts/fonts.service.ts:259
- `error.file.upload_file_not_found` — 上传文件不存在
  - packages/backend/src/mxcad/save/save-as.service.ts:437
- `error.file.version_history_not_found` — 历史版本目录不存在
  - packages/backend/src/mxcad/core/mxcad-version-history.service.ts:497
### error.file_extra_v2（1）

- `error.file_extra_v2.file_not_found_or_no_path` — 文件不存在或没有 path
  - packages/backend/src/mxcad/infra/thumbnail.controller.ts:205
### error.public_file（2）

- `error.public_file.file_not_found` — 文件不存在
  - packages/backend/src/backup/backup.service.ts:350, packages/backend/src/mxcad/core/mxcad-version-history.service.ts:193, packages/backend/src/mxcad/infra/thumbnail-generation.service.ts:182, packages/backend/src/mxcad/infra/thumbnail.controller.ts:205, packages/backend/src/mxcad/save/save-as.service.ts:437
- `error.public_file.conversion_failed` — 文件转换失败
  - packages/backend/src/public-file/public-file.controller.ts:407, packages/backend/src/public-file/public-file.service.ts:248, packages/backend/src/public-file/public-file.service.ts:271, packages/backend/src/public-file/public-file.service.ts:484
### error.version_control（1）

- `error.version_control.fetch_success` — 获取成功
  - packages/backend/src/version-control/providers/http-version-control.provider.ts:204, packages/backend/src/version-control/providers/http-version-control.provider.ts:257, packages/backend/src/version-control/version-control.controller.ts:154

## HARDCODED_WEAK（5）

> 疑似接线错：命中少，需人工确认

### error.auth（1）

- `error.auth.user_not_found` — 用户不存在
  - 短文案5字仅 1 处命中，需人工确认: packages/backend/src/auth/services/mfa.service.ts:62
### error.cache（1）

- `error.cache.user_not_found` — 用户不存在
  - 短文案5字仅 1 处命中，需人工确认: packages/backend/src/auth/services/mfa.service.ts:62
### error.file（1）

- `error.file.submit_success` — 提交成功
  - 短文案4字仅 1 处命中，需人工确认: packages/backend/src/version-control/providers/http-version-control.provider.ts:118
### error.mxcad（1）

- `error.mxcad.refresh_success` — 刷新成功
  - 短文案4字仅 1 处命中，需人工确认: packages/backend/src/cache-architecture/controllers/cache-monitor.controller.ts:311
### error.version_control（1）

- `error.version_control.submit_success` — 提交成功
  - 短文案4字仅 1 处命中，需人工确认: packages/backend/src/version-control/providers/http-version-control.provider.ts:118

## 整节全死的节

- `validation` — 46/46 键


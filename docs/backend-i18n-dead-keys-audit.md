# 后端 i18n 死键审计与处置清单

> 本文件由 `packages/backend/scripts/scan-i18n-dead-keys.cjs` 生成，改完接线后重跑即可刷新：
> `node packages/backend/scripts/scan-i18n-dead-keys.cjs`。下表数字是生成时刻的快照。

## 结论

后端 i18n 目录共 591 个叶子键，**169 个零引用（29%）**。但零引用 ≠ 都是垃圾——真正需要改代码的只有 25 个（14%），其余是纯冗余（50）与机制缺口（66）。

### 处置优先级

| # | 动作 | 影响键数 | 收益 |
|---|---|---|---|
| 1 | **修 `user-status.service.ts` 的两个验证文案表**（`getPrerequisiteError` / `getVerifyFailedError`，各约 6 行）+ `email-code-verification.strategy.ts:39` | 13 | 一处改动收掉 13 个死键；账号验证失败文案目前对非中文用户完全无效 |
| 2 | **修 `CustomValidationPipe.exceptionFactory` 接 i18n** | 46 | `validation` 整节从未接线，DTO 校验文案永远走 class-validator 默认英文 |
| 3 | **`mx-version-control.provider.ts` 收敛到 `I18nContext`**（全仓唯一还在用 `this.i18nService.t()` 的文件，20 处） | 3 | 消灭第二套 i18n 访问模式 |
| 4 | 处理其余整节全死的节（`error.policy` 5 / `error.seed` 10 / `error.version_control_extra` 3 / `error.library` 1 / `error.public_file_extra` 1） | 20 | 逐个判断「机制缺失」还是「真废弃」 |
| 5 | **前 4 步完成后再删** ALIAS / LOG_ONLY / DOC_ONLY / ORPHAN | 89 | 必须后置：修好接线后部分键会变活，顺序反了会删错 |

**不要一次性删 181 个。** 死键分两类：真废弃（删是纯收益）与**接线错**（代码路径存在但文案绕过了 i18n，键因此被孤立）。批量删除会把接线错一并盖掉，让缺陷更难查。

---

## 扫描口径（可复现）

- 键范围：四语齐全（zh-CN / en-US / zh-TW / ko-KR）的叶子键，排除动态构造节 `error.project_member`、`error.mxcad_engine_extra`（键名由代码拼接，不可静态枚举）。
- 语料：820 个后端文件 + 1630 个其余文件；排除 `translations/`、`dist/`、`node_modules/`、`.pnpm/` 与一次性迁移脚本 `migrate-i18n.mjs`。
- 死键判据：全点路径（如 `error.auth.not_logged_in`）作为子串在语料中零命中。

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
| MECHANISM_GAP | 62 | 机制缺失：整节未接线，修机制而非逐键 |
| HARDCODED | 9 | 接线错：面向用户的文案硬编码，逐键排票 |
| HARDCODED_WEAK | 5 | 疑似接线错：命中少，需人工确认 |
| ALIAS | 51 | 冗余别名：文案已被另一活键翻译，可直接删 |
| LOG_ONLY | 1 | 仅日志使用：非面向用户，可直接删 |
| DOC_ONLY | 1 | 仅 Swagger 描述：非运行时文案，可直接删 |
| ORPHAN | 40 | 疑真废弃：全仓无踪迹 |

## MECHANISM_GAP（62）

> 机制缺失：整节未接线，修机制而非逐键

### error.policy（5）

- `error.policy.unknown_type` — 未知的策略类型
  - error.policy 整节 5/5 键全死
- `error.policy.config_validation_failed` — 策略配置验证失败
  - error.policy 整节 5/5 键全死
- `error.policy.config_not_found` — 策略配置不存在
  - error.policy 整节 5/5 键全死
- `error.policy.invalid_time_format` — 无效的时间格式
  - error.policy 整节 5/5 键全死
- `error.policy.invalid_time_value` — 无效的时间值
  - error.policy 整节 5/5 键全死
### error.public_file_extra（1）

- `error.public_file_extra.conversion_failed_detail` — 文件转换失败: {error}
  - error.public_file_extra 整节 1/1 键全死
### error.seed（10）

- `error.seed.my_drawings` — 我的图纸
  - error.seed 整节 10/10 键全死
- `error.seed.public_drawing_library` — 公共图纸库
  - error.seed 整节 10/10 键全死
- `error.seed.public_block_library` — 公共图块库
  - error.seed 整节 10/10 键全死
- `error.seed.public_drawing_description` — 公共 CAD 图纸资源
  - error.seed 整节 10/10 键全死
- `error.seed.public_block_description` — 公共 CAD 图块资源
  - error.seed 整节 10/10 键全死
- `error.seed.system_admin` — 系统管理员
  - error.seed 整节 10/10 键全死
- `error.seed.user_prefix` — 用户
  - error.seed 整节 10/10 键全死
- `error.seed.monthly_membership` — 月度会员
  - error.seed 整节 10/10 键全死
- `error.seed.half_year_membership` — 半年会员
  - error.seed 整节 10/10 键全死
- `error.seed.yearly_membership` — 年度会员
  - error.seed 整节 10/10 键全死
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

## ALIAS（51）

> 冗余别名：文案已被另一活键翻译，可直接删

### error.auth（2）

- `error.auth.not_logged_in` — 未登录
  - 文案已被另一活键 i18n 化（4 处兜底串），本键冗余可直接删: packages/backend/src/auth/jwt.strategy.executor.ts:160, packages/backend/src/file-system/controllers/download.controller.ts:301, packages/backend/src/mxcad/save/mxcad-save.service.ts:76, packages/backend/src/mxcad/save/save.controller.ts:160
- `error.auth.phone_network_limit` — 当前网络发送次数已达上限，请稍后再试
  - 文案已被另一活键 i18n 化（1 处兜底串），本键冗余可直接删: packages/backend/src/auth/services/sms/sms-verification.service.ts:241
### error.cache（1）

- `error.cache.project_not_found` — 项目不存在
  - 文案已被另一活键 i18n 化（15 处兜底串），本键冗余可直接删: packages/backend/src/file-operations/node-trash.service.ts:385, packages/backend/src/file-operations/node-trash.service.ts:969, packages/backend/src/file-operations/project-crud.service.ts:572, packages/backend/src/file-operations/project-crud.service.ts:597
### error.file（17）

- `error.file.node_not_found` — 文件节点不存在
  - 文案已被另一活键 i18n 化（1 处兜底串），本键冗余可直接删: packages/backend/src/file-system/controllers/download.controller.ts:103
- `error.file.parent_must_be_folder` — 父节点必须是文件夹
  - 文案已被另一活键 i18n 化（2 处兜底串），本键冗余可直接删: packages/backend/src/file-operations/node-copy-move.service.ts:143, packages/backend/src/file-operations/node-copy-move.service.ts:328
- `error.file.name_illegal_chars` — 文件名包含非法字符
  - 文案已被另一活键 i18n 化（4 处兜底串），本键冗余可直接删: packages/backend/src/common/utils/file-utils.ts:158, packages/backend/src/mxcad/external-ref/ext-ref-validator.service.ts:56, packages/backend/src/public-file/public-file.controller.ts:240, packages/backend/src/public-file/public-file.service.ts:178
- `error.file.path_invalid` — 无效的文件路径
  - 文案已被另一活键 i18n 化（9 处兜底串），本键冗余可直接删: packages/backend/src/common/utils/file-utils.ts:284, packages/backend/src/mxcad/infra/mxcad-file-access.controller.ts:49, packages/backend/src/mxcad/infra/mxcad-file-access.controller.ts:69, packages/backend/src/mxcad/infra/mxcad-file-access.controller.ts:134
- `error.file.no_access_drawing` — 无权限访问该图纸
  - 文案已被另一活键 i18n 化（1 处兜底串），本键冗余可直接删: packages/backend/src/mxcad/external-ref/external-ref.controller.ts:230
- `error.file.permission_verification_failed` — 权限验证失败
  - 文案已被另一活键 i18n 化（1 处兜底串），本键冗余可直接删: packages/backend/src/mxcad/external-ref/external-ref.controller.ts:240
- `error.file.size_exceeded` — 文件大小超出限制
  - 文案已被另一活键 i18n 化（2 处兜底串），本键冗余可直接删: packages/backend/src/mxcad/external-ref/ext-ref-validator.service.ts:91, packages/backend/src/public-file/public-file.controller.ts:250
- `error.file.save_success` — 保存成功
  - 文案已被另一活键 i18n 化（3 处兜底串），本键冗余可直接删: packages/backend/src/mxcad/save/mxcad-save.service.ts:270, packages/backend/src/mxcad/save/save-as.service.ts:344, packages/backend/src/mxcad/save/save-as.service.ts:535
- `error.file.delete_success` — 删除成功
  - 文案已被另一活键 i18n 化（4 处兜底串），本键冗余可直接删: packages/backend/src/file-operations/node-trash.service.ts:1186, packages/backend/src/users/services/user-status.service.ts:173, packages/backend/src/users/services/user-status.service.ts:174, packages/backend/src/version-control/providers/mx-version-control.provider.ts:754
- `error.file.thumbnail_upload_success` — 缩略图上传成功
  - 文案已被另一活键 i18n 化（1 处兜底串），本键冗余可直接删: packages/backend/src/mxcad/infra/thumbnail.controller.ts:222
- `error.file.history_conversion_failed` — 历史版本文件转换失败
  - 文案已被另一活键 i18n 化（2 处兜底串），本键冗余可直接删: packages/backend/src/mxcad/core/mxcad-version-history.service.ts:746, packages/backend/src/mxcad/core/mxcad-version-history.service.ts:772
- `error.file.fetch_history_failed` — 获取历史版本文件失败
  - 文案已被另一活键 i18n 化（1 处兜底串），本键冗余可直接删: packages/backend/src/mxcad/core/mxcad-version-history.service.ts:246
- `error.file.copy_image_failed` — 图片文件拷贝失败
  - 文案已被另一活键 i18n 化（1 处兜底串），本键冗余可直接删: packages/backend/src/mxcad/external-ref/external-ref.controller.ts:289
- `error.file.node_not_found_in_tree` — 节点不存在
  - 文案已被另一活键 i18n 化（30 处兜底串），本键冗余可直接删: packages/backend/src/file-operations/file-operations.service.ts:43, packages/backend/src/file-operations/node-copy-move.service.ts:98, packages/backend/src/file-operations/node-copy-move.service.ts:106, packages/backend/src/file-operations/node-copy-move.service.ts:130
- `error.file.search_unsupported_scope` — 不支持的搜索范围
  - 文案已被另一活键 i18n 化（1 处兜底串），本键冗余可直接删: packages/backend/src/file-system/search/search.service.ts:180
- `error.file.download_format_unsupported` — 不支持的下载格式
  - 文案已被另一活键 i18n 化（1 处兜底串），本键冗余可直接删: packages/backend/src/file-system/file-download/format-policy.ts:76
- `error.file.converted_file_not_found` — 转换后的文件不存在
  - 文案已被另一活键 i18n 化（3 处兜底串），本键冗余可直接删: packages/backend/src/file-system/file-download/file-download-export.service.ts:439, packages/backend/src/file-system/file-download/file-download-export.service.ts:763, packages/backend/src/mxcad/external-ref/external-ref.service.ts:84
### error.file_extra_v2（3）

- `error.file_extra_v2.thumbnail_query_failed` — 查询缩略图失败
  - 文案已被另一活键 i18n 化（1 处兜底串），本键冗余可直接删: packages/backend/src/mxcad/infra/thumbnail.controller.ts:97
- `error.file_extra_v2.thumbnail_upload_failed` — 上传缩略图失败
  - 文案已被另一活键 i18n 化（2 处兜底串），本键冗余可直接删: packages/backend/src/mxcad/infra/thumbnail.controller.ts:213, packages/backend/src/mxcad/infra/thumbnail.controller.ts:234
- `error.file_extra_v2.uploaded_file_not_found` — 上传的文件不存在
  - 文案已被另一活键 i18n 化（1 处兜底串），本键冗余可直接删: packages/backend/src/mxcad/infra/thumbnail.controller.ts:174
### error.font（5）

- `error.font.upload_failed` — 上传字体失败
  - 文案已被另一活键 i18n 化（2 处兜底串），本键冗余可直接删: packages/backend/src/fonts/fonts.service.ts:274, packages/backend/src/fonts/fonts.service.ts:275
- `error.font.name_invalid` — 无效的文件名
  - 文案已被另一活键 i18n 化（4 处兜底串），本键冗余可直接删: packages/backend/src/common/utils/file-utils.ts:114, packages/backend/src/fonts/fonts.service.ts:289, packages/backend/src/fonts/fonts.service.ts:357, packages/backend/src/fonts/fonts.service.ts:503
- `error.font.delete_failed` — 删除字体失败
  - 文案已被另一活键 i18n 化（1 处兜底串），本键冗余可直接删: packages/backend/src/fonts/fonts.service.ts:338
- `error.font.download_failed` — 下载字体失败
  - 文案已被另一活键 i18n 化（1 处兜底串），本键冗余可直接删: packages/backend/src/fonts/fonts.service.ts:405
- `error.font.size_exceeded` — 文件大小超出限制
  - 文案已被另一活键 i18n 化（2 处兜底串），本键冗余可直接删: packages/backend/src/mxcad/external-ref/ext-ref-validator.service.ts:91, packages/backend/src/public-file/public-file.controller.ts:250
### error.general（3）

- `error.general.missing_project_id` — 缺少项目ID参数
  - 文案已被另一活键 i18n 化（2 处兜底串），本键冗余可直接删: packages/backend/src/audit/project-audit.guard.ts:51, packages/backend/src/common/guards/require-project-permission.guard.ts:158
- `error.general.no_repository_access` — 没有访问该资源库的权限
  - 文案已被另一活键 i18n 化（4 处兜底串），本键冗余可直接删: packages/backend/src/common/guards/require-project-permission.guard.ts:178, packages/backend/src/file-operations/node-trash.service.ts:565, packages/backend/src/file-system/file-permission/file-system-permission.service.ts:87, packages/backend/src/ownership/strategies/library-permission.strategy.ts:37
- `error.general.no_permission_for_action` — 没有权限执行此操作
  - 文案已被另一活键 i18n 化（10 处兜底串），本键冗余可直接删: packages/backend/src/common/guards/require-project-permission.guard.ts:143, packages/backend/src/common/guards/require-project-permission.guard.ts:219, packages/backend/src/file-operations/project-crud.service.ts:98, packages/backend/src/file-system/file-permission/file-system-permission.service.ts:101
### error.mxcad（2）

- `error.mxcad.missing_upload_file` — 缺少上传文件
  - 文案已被另一活键 i18n 化（1 处兜底串），本键冗余可直接删: packages/backend/src/mxcad/upload/mxcad-upload.controller.ts:193
- `error.mxcad.preload_data_not_found` — 预加载数据不存在
  - 文案已被另一活键 i18n 化（1 处兜底串），本键冗余可直接删: packages/backend/src/public-file/public-file.controller.ts:333
### error.node（5）

- `error.node.parent_not_found` — 父节点不存在
  - 文案已被另一活键 i18n 化（5 处兜底串），本键冗余可直接删: packages/backend/src/file-operations/node-copy-move.service.ts:130, packages/backend/src/file-operations/node-copy-move.service.ts:315, packages/backend/src/file-operations/node-trash.service.ts:522, packages/backend/src/file-operations/project-crud.service.ts:172
- `error.node.target_parent_not_found` — 目标父节点不存在
  - 文案已被另一活键 i18n 化（2 处兜底串），本键冗余可直接删: packages/backend/src/file-operations/node-copy-move.service.ts:130, packages/backend/src/file-operations/node-copy-move.service.ts:315
- `error.node.not_found_in_tree` — 节点不存在
  - 文案已被另一活键 i18n 化（30 处兜底串），本键冗余可直接删: packages/backend/src/file-operations/file-operations.service.ts:43, packages/backend/src/file-operations/node-copy-move.service.ts:98, packages/backend/src/file-operations/node-copy-move.service.ts:106, packages/backend/src/file-operations/node-copy-move.service.ts:130
- `error.node.not_found_or_no_parent` — 节点不存在或没有父节点
  - 文案已被另一活键 i18n 化（1 处兜底串），本键冗余可直接删: packages/backend/src/file-system/file-tree/file-tree.service.ts:1400
- `error.node.sort_unsupported` — 不支持的排序字段
  - 文案已被另一活键 i18n 化（5 处兜底串），本键冗余可直接删: packages/backend/src/file-operations/project-crud.service.ts:281, packages/backend/src/file-operations/project-crud.service.ts:400, packages/backend/src/file-system/file-tree/file-tree.service.ts:513, packages/backend/src/file-system/file-tree/file-tree.service.ts:1203
### error.public_file（2）

- `error.public_file.name_contains_illegal_chars` — 文件名包含非法字符
  - 文案已被另一活键 i18n 化（4 处兜底串），本键冗余可直接删: packages/backend/src/common/utils/file-utils.ts:158, packages/backend/src/mxcad/external-ref/ext-ref-validator.service.ts:56, packages/backend/src/public-file/public-file.controller.ts:240, packages/backend/src/public-file/public-file.service.ts:178
- `error.public_file.path_invalid` — 无效的文件路径
  - 文案已被另一活键 i18n 化（9 处兜底串），本键冗余可直接删: packages/backend/src/common/utils/file-utils.ts:284, packages/backend/src/mxcad/infra/mxcad-file-access.controller.ts:49, packages/backend/src/mxcad/infra/mxcad-file-access.controller.ts:69, packages/backend/src/mxcad/infra/mxcad-file-access.controller.ts:134
### error.role（5）

- `error.role.create_failed` — 创建项目角色失败
  - 文案已被另一活键 i18n 化（2 处兜底串），本键冗余可直接删: packages/backend/src/roles/project-roles.service.ts:269, packages/backend/src/roles/project-roles.service.ts:274
- `error.role.fetch_failed` — 获取项目角色失败
  - 文案已被另一活键 i18n 化（2 处兜底串），本键冗余可直接删: packages/backend/src/roles/project-roles.service.ts:540, packages/backend/src/roles/project-roles.service.ts:544
- `error.role.fetch_list_failed` — 获取项目角色列表失败
  - 文案已被另一活键 i18n 化（2 处兜底串），本键冗余可直接删: packages/backend/src/roles/project-roles.service.ts:692, packages/backend/src/roles/project-roles.service.ts:696
- `error.role.fetch_system_failed` — 获取系统项目角色失败
  - 文案已被另一活键 i18n 化（2 处兜底串），本键冗余可直接删: packages/backend/src/roles/project-roles.service.ts:724, packages/backend/src/roles/project-roles.service.ts:728
- `error.role.assign_permissions_failed` — 分配角色权限失败
  - 文案已被另一活键 i18n 化（2 处兜底串），本键冗余可直接删: packages/backend/src/roles/project-roles.service.ts:830, packages/backend/src/roles/project-roles.service.ts:835
### error.storage（2）

- `error.storage.path_illegal_chars` — 路径包含非法字符
  - 文案已被另一活键 i18n 化（4 处兜底串），本键冗余可直接删: packages/backend/src/common/utils/file-utils.ts:86, packages/backend/src/storage/local-storage.provider.ts:70, packages/backend/src/storage/local-storage.provider.ts:105, packages/backend/src/storage/local-storage.provider.ts:109
- `error.storage.is_directory_not_file` — 路径是目录而非文件
  - 文案已被另一活键 i18n 化（2 处兜底串），本键冗余可直接删: packages/backend/src/fonts/fonts.service.ts:379, packages/backend/src/storage/local-storage.provider.ts:217
### error.user（3）

- `error.user.email_required_field` — 邮箱验证已启用，邮箱为必填项
  - 文案已被另一活键 i18n 化（1 处兜底串），本键冗余可直接删: packages/backend/src/users/services/user-crud.service.ts:78
- `error.user.create_error` — 用户创建失败
  - 文案已被另一活键 i18n 化（1 处兜底串），本键冗余可直接删: packages/backend/src/auth/impl/providers/local-auth.provider.ts:144
- `error.user.project_owner_role_missing` — PROJECT_OWNER 角色不存在
  - 文案已被另一活键 i18n 化（3 处兜底串），本键冗余可直接删: packages/backend/src/file-operations/project-crud.service.ts:127, packages/backend/src/roles/project-roles.service.ts:171, packages/backend/src/users/services/user-crud.service.ts:200
### error.version_control（1）

- `error.version_control.delete_success` — 删除成功
  - 文案已被另一活键 i18n 化（4 处兜底串），本键冗余可直接删: packages/backend/src/file-operations/node-trash.service.ts:1186, packages/backend/src/users/services/user-status.service.ts:173, packages/backend/src/users/services/user-status.service.ts:174, packages/backend/src/version-control/providers/mx-version-control.provider.ts:754

## LOG_ONLY（1）

> 仅日志使用：非面向用户，可直接删

### error.cache（1）

- `error.cache.unsupported_level` — 不支持的缓存级别
  - 仅出现在日志文案里（2 处，面向运维非用户），本键可删: packages/backend/src/cache-architecture/services/multi-level-cache.service.ts:406, packages/backend/src/cache-architecture/services/multi-level-cache.service.ts:428

## DOC_ONLY（1）

> 仅 Swagger 描述：非运行时文案，可直接删

### error.auth（1）

- `error.auth.email_not_registered` — 该邮箱未注册
  - 仅出现在 Swagger @Api* 描述里（1 处，API 文档非运行时文案），本键可删: packages/backend/src/auth/auth.controller.ts:416

## ORPHAN（40）

> 疑真废弃：全仓无踪迹

### error.auth（6）

- `error.auth.email_already_registered` — 邮箱已被注册
- `error.auth.username_already_taken` — 用户名已被使用
- `error.auth.phone_not_registered` — 该手机号未注册
- `error.auth.account_disabled_cannot_reset` — 账号已被禁用，无法重置密码
- `error.auth.token_storage_failed` — Token存储失败
- `error.auth.password_expiring_soon` — 您的密码即将到期，建议尽快修改
### error.conversion_task（1）

- `error.conversion_task.task_lost` — 转换任务已丢失（服务可能已重启），请重新打开图纸
### error.file（9）

- `error.file.not_found_source` — 未找到源图纸
- `error.file.duplicate_name` — 同名文件/文件夹已存在
- `error.file.batch_download_project_unknown` — 无法确定节点所属项目
- `error.file.path_validation_failed` — 路径验证失败，无法安全删除
- `error.file.recycle_item_not_found` — 未找到要操作的回收站项目
- `error.file.no_recycle_permission` — 没有权限操作项目 {projectId} 的回收站
- `error.file.source_drawing_not_found` — 源图纸节点不存在
- `error.file.quota_cannot_be_negative` — 存储配额不能为负数
- `error.file.node_not_found_or_no_path` — 文件节点不存在或没有 path 字段
### error.file_extra（5）

- `error.file_extra.extension_forbidden_detail` — 禁止上传 {extension} 类型文件
- `error.file_extra.magic_number_failed_detail` — 文件魔数验证失败: {error}
- `error.file_extra.filename_validation_failed` — 文件名验证失败: {error}
- `error.file_extra.filename_sanitize_failed_detail` — 文件名清理失败: {error}
- `error.file_extra.source_drawing_not_exist` — 源图纸节点不存在: {id}
### error.file_extra_v2（1）

- `error.file_extra_v2.download_failed_detail` — 文件下载失败: {error}
  - 同节 5/7 死（过半）
### error.font（2）

- `error.font.file_not_found` — 字体文件不存在
  - 同节 7/10 死（过半）
- `error.font.executable_forbidden` — 禁止上传的可执行文件类型
  - 同节 7/10 死（过半）
### error.general（2）

- `error.general.operation_failed` — 业务处理失败
  - 同节 5/6 死（过半）
- `error.general.server_busy` — 服务器繁忙，请稍后重试
  - 同节 5/6 死（过半）
### error.mxcad（5）

- `error.mxcad.missing_params_filename` — 缺少必要参数: fileName
- `error.mxcad.context_params_empty` — 上下文参数不能为空
- `error.mxcad.missing_node_id` — 缺少节点ID（nodeId），无法创建文件系统节点
- `error.mxcad.cannot_determine_parent_id` — 无法确定父节点ID
- `error.mxcad.not_found_source` — 未找到源图纸
### error.mxcad_extra（2）

- `error.mxcad_extra.upload_local_failed` — 上传到本地失败: {error}
- `error.mxcad_extra.upload_failed_detail` — 上传失败: {error}
### error.role（3）

- `error.role.in_use_cannot_delete` — 角色正在使用中，无法删除
- `error.role.system_default_cannot_delete` — 无法删除系统默认角色
- `error.role.name_conflict` — 项目角色名已存在
### success（4）

- `success.save_as_success` — 另存成功
- `success.cache_warmup_complete` — 缓存预热完成: {success}/{total} 个策略成功
- `success.cache_warmup_failed` — 缓存预热失败: {error}
- `success.password_set_or_changed` — 密码{action}成功，请重新登录

## 整节全死的节

- `error.policy` — 5/5 键
- `error.public_file_extra` — 1/1 键
- `error.seed` — 10/10 键
- `validation` — 46/46 键


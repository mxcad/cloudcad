///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { RuntimeConfigDefinition } from './runtime-config.types';

/**
 * 运行时配置项定义列表 —— 全后端配置元数据的唯一事实源。
 *
 * ## 取值三层优先级（见 RuntimeConfigService.resolveValue）
 *   1. `runtime` —— 用户在运行时配置页显式修改的值（DB 行 `updatedBy` 非空）
 *   2. `env`     —— `.env` 中的值（部署期注入，`envKey` 声明对应变量名）
 *   3. `default` —— 此处 `defaultValue`
 *
 * `.env` 因此是「部署期默认值层」而非被替换掉：私有化客户仍可在 .env 注入
 * 定制，不进 DB、无需迁移脚本；用户在页面上改过的值优先级更高。
 *
 * ## 收录原则（什么进、什么不进）
 * - **进**：运行期语义、改了不该重启即生效。
 *   **通道凭据是「无秘密」的唯一例外（ADR-0082）**：SMTP 密码/短信/微信/支付凭据
 *   可经 `secret` 输入类型进 DB（通道主密钥 `CHANNEL_ENCRYPTION_KEY` 加密落库、
 *   掩码回读、永不返回明文），且其通道开关受「配置完整 + 通道测试通过」门禁约束；
 *   通道主密钥本身留在 env。
 * - **不进**：
 *   1. 主密钥与进程间共享密钥（JWT/数据库/Redis/TOTP/PII 密钥、
 *      BACKEND_JWT_SECRET/INTERNAL_SERVICE_SECRET/CONVERSION_SERVICE_SECRET）——
 *      存 DB 等于摊进明文 pg_dump 备份与运维 UI，比 env 更差；进程间共享密钥由兄弟
 *      进程从自己的 env 读取，架构上不可能进 DB（ADR-0082 D1）；
 *   2. 启动期必需（DATABASE_URL、端口、CORS、MXCAD_*_PATH、FILES_DATA_PATH）
 *      —— 运行时配置存在 DB 里，读它之前必须先连上 DB；
 *   3. 部署身份（部署根路径、PM2、备份远端主机）；
 *   4. 前端构建期（VITE_*）。
 * - **不进（重要）**：构造期一次性读取、改了必须重启才生效的配置。此类配置若收录
 *   会变成「填了没反应」的陷阱字段，因此保持 env + 重启语义，UI 上不假装热生效。
 *   （通道配置例外，ADR-0082：通道客户端随配置变更热重建。）
 *
 * ## 元数据字段
 * - `tier`     显示档位（仅展示分层，不是权限/安全边界）：
 *              `user` 客户运维无需系统知识即可改；
 *              `admin` 系统管理员日常运维基线（备份、告警邮件、清理与归档、审计留存、开关）；
 *              `advanced` 需懂内部实现才敢改的阈值（各接口限流、压缩级别、文件锁参数）。
 * - `category` 页面分组：前端只登记有配置项的分类，碎分类合并后不留空壳入口
 * - `input`    类型感知输入元数据，前端渲染控件、后端 validateValue 同源校验
 * - `impact`   改了会怎样（面向操作员，比 description 具体）
 * - `dangerous` 改动需二次确认。只标记「改错会直接造成拒绝服务或解除安全防护」的阈值：
 *              各限流/锁定的次数阈值（`*Max`、`accountLockFailThreshold`），以及账号锁定的
 *              计数窗口与锁定时长（三者是一套，改一个不改另一个会互相抵消）。
 *              其余窗口长度字段不标记（配套关系写在 impact 里），避免二次确认泛滥。
 * - `hot`      是否即时生效；`false` = 需刷新页面或重启服务
 * - `envKey`   底层 env 变量名（部署期默认值层）
 * - `requires` 开关依赖声明（ADR-0082）：布尔键为 true 时列出的键必须同为 true。
 *              更新路径（单键 set / 重置 / profile 批量应用）按拒绝式门禁强制，
 *              已存在的遗留不一致由一致性检测上报。只在布尔键之间声明。
 */
export const RUNTIME_CONFIG_DEFINITIONS: RuntimeConfigDefinition[] = [
  // ───────────────────────── 品牌与客服 ─────────────────────────
  {
    key: 'brandProfile',
    type: 'json',
    category: 'brand',
    description:
      '品牌档案（动态结构），整块覆盖前端内置默认值。' +
      '固定字段已全部拆为独立配置项（brandTitle、brandSubtitle、brandTagline、brandLogo、' +
      'supportEmail、supportPhone、supportHours、docsUrl、brandCopyrightLine、brandCopyrightYear、' +
      'brandCopyrightHolder、brandLegalProductName、brandLegalProductShortName），' +
      '单项优先于此处同名字段；此处只剩必须嵌套的动态结构：legal.identities（多主体/多语言）' +
      '与 apps（多端品牌）。PC 与移动端都消费同一份。',
    defaultValue: {},
    isPublic: true,
    tier: 'user',
    impact:
      '保存后 PC（BrandContext）与移动端（启动期与配置快照）即刻生效；字段缺失时回退到前端内置默认品牌，' +
      '需清空某字段请从 JSON 中删除该键（不支持空串清空，前端校验会拒绝）。' +
      'legal.identities / apps 的「恢复默认」是删除整个条目，与固定路径字段语义不同。',
  },
  {
    key: 'supportEmail',
    type: 'string',
    category: 'brand',
    description: '客服邮箱',
    defaultValue: '',
    isPublic: true,
    tier: 'user',
    input: { maxLength: 200, allowNull: true, placeholder: 'support@example.com' },
    impact: '客服弹框与忘记密码页展示的联系方式；优先级高于品牌档案中的 support.email。',
  },
  {
    key: 'supportPhone',
    type: 'string',
    category: 'brand',
    description: '客服电话',
    defaultValue: '',
    isPublic: true,
    tier: 'user',
    input: { maxLength: 200, allowNull: true, placeholder: '400-123-4567' },
    impact: '客服弹框展示的联系电话；优先级高于品牌档案中的 support.phone。',
  },
  {
    key: 'docsUrl',
    type: 'string',
    category: 'brand',
    description: '帮助文档地址（「实时协同只支持私有化部署」提示里的「查看文档」链接）',
    defaultValue: '',
    isPublic: true,
    tier: 'user',
    input: { maxLength: 200, allowNull: true, placeholder: 'https://help.mxdraw.com/' },
    impact:
      'PC 与移动端「实时协同」提示里的「查看文档」链接地址，两端刷新页面后生效；' +
      '优先级高于品牌档案（brandProfile）里的 docsUrl 字段，留空时回落到品牌档案 / /brand/config.json / 内置默认值。',
  },
  {
    key: 'brandTitle',
    type: 'string',
    category: 'brand',
    description: '品牌标题（浏览器页签标题 + 认证页品牌名）',
    defaultValue: '',
    isPublic: true,
    tier: 'user',
    input: { maxLength: 200, allowNull: true, placeholder: '梦想网页CAD实时协同平台' },
    impact:
      'PC 与移动端的应用标题（页签标题、认证页品牌名）。' +
      '留空时回落到品牌档案（brandProfile）里的 title 字段 → /brand/config.json → 内置默认值；' +
      '「恢复默认」清空的是本项，回落目标不是内置默认值而是整块里可能存在的值。',
  },
  {
    key: 'brandSubtitle',
    type: 'string',
    category: 'brand',
    description: '侧边栏品牌副标题',
    defaultValue: '',
    isPublic: true,
    tier: 'user',
    input: { maxLength: 200, allowNull: true, placeholder: 'CAD 协同平台' },
    impact:
      'PC 侧边栏品牌副标题（移动端无对应展示位）。' +
      '留空时回落到品牌档案（brandProfile）里的 subtitle 字段 → /brand/config.json → 内置默认值；' +
      '「恢复默认」清空的是本项，回落目标不是内置默认值而是整块里可能存在的值。',
  },
  {
    key: 'brandTagline',
    type: 'string',
    category: 'brand',
    description: '品牌标语（tagline，登录/认证页展示）',
    defaultValue: '',
    isPublic: true,
    tier: 'user',
    input: { maxLength: 200, allowNull: true, placeholder: '留空不显示' },
    impact:
      'PC 登录/认证页的品牌标语（移动端无对应展示位）。' +
      '留空时回落到品牌档案（brandProfile）里的 tagline 字段 → /brand/config.json → 内置默认值（空串）；' +
      '「恢复默认」清空的是本项，回落目标不是内置默认值而是整块里可能存在的值。',
  },
  {
    key: 'brandLogo',
    type: 'string',
    category: 'brand',
    description: 'Logo URL（浏览器 favicon + 认证页 Logo）',
    defaultValue: '',
    isPublic: true,
    tier: 'user',
    input: { maxLength: 200, allowNull: true, placeholder: '/logo.png' },
    impact:
      'PC 与移动端的 Logo（favicon、认证页 Logo）。' +
      '留空时回落到品牌档案（brandProfile）里的 logo 字段 → /brand/config.json → 内置默认值；' +
      '「恢复默认」清空的是本项，回落目标不是内置默认值而是整块里可能存在的值。',
  },
  {
    key: 'brandCopyrightLine',
    type: 'string',
    category: 'brand',
    description: '版权行模板（页脚版权行，支持 {year} / {appName} 占位符）',
    defaultValue: '',
    isPublic: true,
    tier: 'user',
    input: {
      maxLength: 200,
      allowNull: true,
      placeholder: '© {year} {appName}. All rights reserved.',
    },
    impact:
      'PC 与移动端页脚版权行模板，{year} / {appName} 占位符按版权年份与应用名解析。' +
      '留空时回落到品牌档案（brandProfile）里的 copyrightLine 字段 → /brand/config.json → 内置默认值；' +
      '「恢复默认」清空的是本项，回落目标不是内置默认值而是整块里可能存在的值。',
  },
  {
    key: 'brandCopyrightYear',
    type: 'string',
    category: 'brand',
    description: '版权年份（版权行 {year} 占位符的取值）',
    defaultValue: '',
    isPublic: true,
    tier: 'user',
    input: { maxLength: 200, allowNull: true, placeholder: '2026' },
    impact:
      'PC 与移动端版权行 {year} 占位符的取值。' +
      '留空时回落到品牌档案（brandProfile）里的 copyrightYear 字段 → /brand/config.json → 内置默认值；' +
      '「恢复默认」清空的是本项，回落目标不是内置默认值而是整块里可能存在的值。',
  },
  {
    key: 'brandCopyrightHolder',
    type: 'string',
    category: 'brand',
    description: '版权持有方（法务条款与页脚展示）',
    defaultValue: '',
    isPublic: true,
    tier: 'user',
    input: {
      maxLength: 200,
      allowNull: true,
      placeholder: 'Chengdu Dreamkaide Technology Co., Ltd.',
    },
    impact:
      'PC 与移动端法务条款/页脚展示的版权持有方。' +
      '留空时回落到品牌档案（brandProfile）里的 copyrightHolder 字段 → /brand/config.json → 内置默认值；' +
      '「恢复默认」清空的是本项，回落目标不是内置默认值而是整块里可能存在的值。',
  },
  {
    key: 'brandLegalProductName',
    type: 'string',
    category: 'brand',
    description: '法务产品全称（法务条款正文；留空用内置按语言值）',
    defaultValue: '',
    isPublic: true,
    tier: 'user',
    input: { maxLength: 200, allowNull: true, placeholder: '留空用内置按语言值' },
    impact:
      'PC 与移动端法务条款正文的产品全称（单值，各语言共用）。' +
      '留空时回落到品牌档案（brandProfile）里的 legal.productName 字段 → 内置按语言值；' +
      '「恢复默认」清空的是本项，回落目标不是内置默认值而是整块里可能存在的值。',
  },
  {
    key: 'brandLegalProductShortName',
    type: 'string',
    category: 'brand',
    description: '法务产品短名（i18n 文案插值，如「创建账户，开始使用 {shortName}」）',
    defaultValue: '',
    isPublic: true,
    tier: 'user',
    input: { maxLength: 200, allowNull: true, placeholder: 'CloudCAD' },
    impact:
      'PC 与移动端 i18n 文案插值用的产品短名。' +
      '留空时回落到品牌档案（brandProfile）里的 legal.productShortName 字段 → 内置默认值；' +
      '「恢复默认」清空的是本项，回落目标不是内置默认值而是整块里可能存在的值。',
  },
  {
    key: 'supportHours',
    type: 'string',
    category: 'brand',
    description: '客服服务时间（客服弹框展示）',
    defaultValue: '',
    isPublic: true,
    tier: 'user',
    input: { maxLength: 200, allowNull: true, placeholder: '周一至周五 9:00-18:00' },
    impact:
      'PC 客服弹框展示的服务时间（移动端无对应展示位）。' +
      '留空时回落到品牌档案（brandProfile）里的 support.hours 字段 → /brand/config.json → 内置默认值；' +
      '「恢复默认」清空的是本项，回落目标不是内置默认值而是整块里可能存在的值。',
  },

  // ───────────────────────── 邮件（通道 mail，ADR-0082 #495）─────────────────────────
  {
    key: 'mailEnabled',
    type: 'boolean',
    category: 'alert',
    subgroup: 'mail-channel',
    description: '邮件服务开关',
    defaultValue: false,
    isPublic: true,
    tier: 'user',
    dangerous: true,
    // 通道开关：开启要求 SMTP 配置完整 + 通道测试通过（硬阻断，无绕过）
    channelSwitch: 'mail',
    impact: '关闭后所有邮件发送（注册/验证码/告警通知/找回密码）全部停止。',
  },
  {
    key: 'smtpHost',
    type: 'string',
    category: 'alert',
    subgroup: 'mail-channel',
    description: 'SMTP 服务器主机',
    defaultValue: 'smtp.gmail.com',
    isPublic: false,
    tier: 'admin',
    envKey: 'MAIL_HOST',
    channel: 'mail',
    input: { maxLength: 200, placeholder: 'smtp.example.com' },
    impact: '邮件发送使用的 SMTP 服务器；UI 值清空后回落 .env MAIL_HOST / 默认值。',
  },
  {
    key: 'smtpPort',
    type: 'number',
    category: 'alert',
    subgroup: 'mail-channel',
    description: 'SMTP 服务器端口',
    defaultValue: 587,
    isPublic: false,
    tier: 'admin',
    envKey: 'MAIL_PORT',
    channel: 'mail',
    input: { min: 1, max: 65535, step: 1 },
    impact: '常用端口：587（STARTTLS）/ 465（SSL）。',
  },
  {
    key: 'smtpSecure',
    type: 'boolean',
    category: 'alert',
    subgroup: 'mail-channel',
    description: 'SMTP 安全连接（SSL 直连）',
    defaultValue: false,
    isPublic: false,
    tier: 'admin',
    envKey: 'MAIL_SECURE',
    channel: 'mail',
    impact: 'true = SSL 直连（通常配 465 端口）；false = STARTTLS（通常配 587 端口）。',
  },
  {
    key: 'smtpUser',
    type: 'string',
    category: 'alert',
    subgroup: 'mail-channel',
    description: 'SMTP 账号（服务器免认证可留空）',
    defaultValue: '',
    isPublic: false,
    tier: 'admin',
    envKey: 'MAIL_USER',
    channel: 'mail',
    input: { maxLength: 200, allowNull: true },
    impact: 'SMTP 认证账号；中继服务器免认证时留空。',
  },
  {
    key: 'smtpPassword',
    type: 'string',
    category: 'alert',
    subgroup: 'mail-channel',
    description: 'SMTP 密码',
    defaultValue: '',
    isPublic: false,
    tier: 'admin',
    envKey: 'MAIL_PASS',
    channel: 'mail',
    input: { secret: true, allowNull: true },
    impact: '加密落库、管理端只回掩码；UI 值清空后回落 .env MAIL_PASS。',
  },
  {
    key: 'smtpFrom',
    type: 'string',
    category: 'alert',
    subgroup: 'mail-channel',
    description: '发件人（From，形如 名称 <email@example.com>）',
    defaultValue: 'CloudCAD <noreply@cloudcad.com>',
    isPublic: false,
    tier: 'admin',
    envKey: 'MAIL_FROM',
    channel: 'mail',
    input: { maxLength: 200 },
    impact: '所有出站邮件的 From 头；模板中的客服联系方式也展示此值。',
  },
  {
    key: 'requireEmailVerification',
    type: 'boolean',
    category: 'account',
    subgroup: 'registration',
    description: '强制邮箱验证',
    defaultValue: false,
    isPublic: true,
    tier: 'admin',
    impact: '开启后未验证邮箱的用户无法完成需要邮箱的功能；配合 mailEnabled 使用。',
    dangerous: true,
    requires: ['mailEnabled'],
  },
  {
    key: 'refundNotifyEmails',
    type: 'string',
    category: 'alert',
    subgroup: 'alert-policy',
    description: '退款申请通知邮箱（多个用逗号分隔）',
    defaultValue: '',
    isPublic: false,
    tier: 'admin',
    input: { maxLength: 500, allowNull: true, placeholder: 'a@example.com,b@example.com' },
    impact: '退款申请通知的收件人；为空时不发送退款通知邮件，退款流程本身不受影响。',
  },

  // ───────────────────────── 短信 ─────────────────────────
  {
    key: 'smsEnabled',
    type: 'boolean',
    category: 'alert',
    subgroup: 'sms-channel',
    description: '短信服务开关',
    defaultValue: false,
    isPublic: true,
    tier: 'user',
    dangerous: true,
    // 通道开关：开启要求短信配置完整 + 通道测试通过（硬阻断，无绕过）
    channelSwitch: 'sms',
    impact: '关闭后手机验证码登录、验证码发送全部停止。',
  },
  {
    key: 'smsProvider',
    type: 'string',
    category: 'alert',
    subgroup: 'sms-channel',
    description: '短信服务商',
    defaultValue: 'mock',
    isPublic: false,
    tier: 'admin',
    envKey: 'SMS_PROVIDER',
    channel: 'sms',
    input: {
      options: [
        { value: 'aliyun', label: '阿里云' },
        { value: 'tencent', label: '腾讯云' },
        { value: 'mock', label: 'Mock（开发测试）' },
      ],
    },
    impact: '决定使用哪组凭据键；切换后对应服务商的凭据需通过通道测试。',
  },
  {
    key: 'aliyunSmsAccessKeyId',
    type: 'string',
    category: 'alert',
    subgroup: 'sms-channel',
    description: '阿里云 AccessKey ID',
    defaultValue: '',
    isPublic: false,
    tier: 'admin',
    envKey: 'ALIYUN_ACCESS_KEY_ID',
    channel: 'sms',
    input: { maxLength: 200, secret: true, allowNull: true },
    impact: 'smsProvider=aliyun 时必填；加密落库、管理端只回掩码。',
  },
  {
    key: 'aliyunSmsAccessKeySecret',
    type: 'string',
    category: 'alert',
    subgroup: 'sms-channel',
    description: '阿里云 AccessKey Secret',
    defaultValue: '',
    isPublic: false,
    tier: 'admin',
    envKey: 'ALIYUN_ACCESS_KEY_SECRET',
    channel: 'sms',
    input: { maxLength: 200, secret: true, allowNull: true },
    impact: 'smsProvider=aliyun 时必填；加密落库、管理端只回掩码。',
  },
  {
    key: 'aliyunSmsSignName',
    type: 'string',
    category: 'alert',
    subgroup: 'sms-channel',
    description: '阿里云短信签名',
    defaultValue: '',
    isPublic: false,
    tier: 'admin',
    envKey: 'ALIYUN_SMS_SIGN_NAME',
    channel: 'sms',
    input: { maxLength: 100, allowNull: true },
    impact: 'smsProvider=aliyun 时发送必填（探测凭据不需要）。',
  },
  {
    key: 'aliyunSmsTemplateCode',
    type: 'string',
    category: 'alert',
    subgroup: 'sms-channel',
    description: '阿里云短信模板 CODE',
    defaultValue: '',
    isPublic: false,
    tier: 'admin',
    envKey: 'ALIYUN_SMS_TEMPLATE_CODE',
    channel: 'sms',
    input: { maxLength: 100, allowNull: true },
    impact: 'smsProvider=aliyun 时发送必填（探测凭据不需要）。',
  },
  {
    key: 'aliyunSmsRegionId',
    type: 'string',
    category: 'alert',
    subgroup: 'sms-channel',
    description: '阿里云短信服务地域',
    defaultValue: 'cn-hangzhou',
    isPublic: false,
    tier: 'admin',
    envKey: 'ALIYUN_SMS_REGION_ID',
    channel: 'sms',
    input: { maxLength: 100 },
    impact: '短信服务地域 ID，默认 cn-hangzhou。',
  },
  {
    key: 'tencentSmsSecretId',
    type: 'string',
    category: 'alert',
    subgroup: 'sms-channel',
    description: '腾讯云 SecretId',
    defaultValue: '',
    isPublic: false,
    tier: 'admin',
    envKey: 'TENCENT_SECRET_ID',
    channel: 'sms',
    input: { maxLength: 200, secret: true, allowNull: true },
    impact: 'smsProvider=tencent 时必填；加密落库、管理端只回掩码。',
  },
  {
    key: 'tencentSmsSecretKey',
    type: 'string',
    category: 'alert',
    subgroup: 'sms-channel',
    description: '腾讯云 SecretKey',
    defaultValue: '',
    tier: 'admin',
    isPublic: false,
    envKey: 'TENCENT_SECRET_KEY',
    channel: 'sms',
    input: { maxLength: 200, secret: true, allowNull: true },
    impact: 'smsProvider=tencent 时必填；加密落库、管理端只回掩码。',
  },
  {
    key: 'tencentSmsAppId',
    type: 'string',
    category: 'alert',
    subgroup: 'sms-channel',
    description: '腾讯云短信 SDK AppID',
    defaultValue: '',
    isPublic: false,
    tier: 'admin',
    envKey: 'TENCENT_SMS_APP_ID',
    channel: 'sms',
    input: { maxLength: 100, allowNull: true },
    impact: 'smsProvider=tencent 时必填（短信控制台「SDK AppID」，形如 1400xxxxxx）。',
  },
  {
    key: 'tencentSmsSignName',
    type: 'string',
    category: 'alert',
    subgroup: 'sms-channel',
    description: '腾讯云短信签名',
    defaultValue: '',
    isPublic: false,
    tier: 'admin',
    envKey: 'TENCENT_SMS_SIGN_NAME',
    channel: 'sms',
    input: { maxLength: 100, allowNull: true },
    impact: 'smsProvider=tencent 时发送必填（探测凭据不需要）。',
  },
  {
    key: 'tencentSmsTemplateCode',
    type: 'string',
    category: 'alert',
    subgroup: 'sms-channel',
    description: '腾讯云短信模板 ID',
    defaultValue: '',
    isPublic: false,
    tier: 'admin',
    envKey: 'TENCENT_SMS_TEMPLATE_CODE',
    channel: 'sms',
    input: { maxLength: 100, allowNull: true },
    impact: 'smsProvider=tencent 时发送必填（探测凭据不需要）。',
  },
  {
    key: 'tencentSmsRegion',
    type: 'string',
    category: 'alert',
    subgroup: 'sms-channel',
    description: '腾讯云短信服务地域',
    defaultValue: 'ap-guangzhou',
    isPublic: false,
    tier: 'admin',
    envKey: 'TENCENT_SMS_REGION',
    channel: 'sms',
    input: { maxLength: 100 },
    impact: '短信服务地域，默认 ap-guangzhou。',
  },
  {
    key: 'requirePhoneVerification',
    type: 'boolean',
    category: 'account',
    subgroup: 'registration',
    description: '强制手机号验证',
    defaultValue: false,
    isPublic: true,
    tier: 'admin',
    impact: '开启后未验证手机号的用户受限；配合 smsEnabled 使用。',
    dangerous: true,
    requires: ['smsEnabled'],
  },

  // ───────────────────────── 用户 ─────────────────────────
  {
    key: 'allowRegister',
    type: 'boolean',
    category: 'account',
    subgroup: 'registration',
    description: '用户注册开关',
    defaultValue: true,
    isPublic: true,
    tier: 'user',
    impact: '关闭后注册页隐藏、注册接口拒绝；已注册用户不受影响。',
    dangerous: true,
  },
  {
    key: 'allowAutoRegisterOnPhoneLogin',
    type: 'boolean',
    category: 'account',
    subgroup: 'registration',
    description: '手机验证码登录时自动注册',
    defaultValue: false,
    isPublic: false,
    tier: 'admin',
    impact: '开启后新手机号验证码登录即自动建号，无需填写用户名密码。',
  },
  {
    key: 'userCancelGraceDays',
    type: 'number',
    category: 'account',
    subgroup: 'registration',
    description: '注销冷静期天数：期间重新登录自动取消注销，逾期需联系客服恢复',
    defaultValue: 7,
    isPublic: true,
    tier: 'user',
    input: { min: 1, max: 365, step: 1, unit: '天' },
    impact: '用户提交注销后，在冷静期内重新登录即可自动撤销；天数越短，误注销后越难自助恢复。',
    dangerous: true,
  },
  {
    key: 'userCleanupEnabled',
    type: 'boolean',
    category: 'maintenance',
    subgroup: 'data-retention',
    description: '是否启用过期用户数据自动清理',
    defaultValue: true,
    isPublic: false,
    tier: 'admin',
    dangerous: true,
    impact: '关闭后注销冷静期到期的用户数据不再自动清理，DB 持续膨胀。',
  },

  // ───────────────────────── 微信 ─────────────────────────
  {
    key: 'wechatEnabled',
    type: 'boolean',
    category: 'account',
    subgroup: 'login-methods',
    description: '微信登录开关',
    defaultValue: false,
    isPublic: true,
    tier: 'user',
    // 通道开关：开启要求微信配置完整 + 通道测试通过（硬阻断，无绕过）
    channelSwitch: 'wechat',
    impact: '开启后登录页出现微信扫码入口；需先在服务端配置微信开放平台凭证。',
    dangerous: true,
  },
  {
    key: 'wechatAppId',
    type: 'string',
    category: 'account',
    subgroup: 'login-methods',
    description: '微信开放平台 AppID',
    defaultValue: '',
    isPublic: false,
    tier: 'admin',
    envKey: 'WECHAT_APP_ID',
    channel: 'wechat',
    input: { maxLength: 100, allowNull: true },
    impact: '微信登录必填；开放平台「应用管理」中的 AppID。',
  },
  {
    key: 'wechatAppSecret',
    type: 'string',
    category: 'account',
    subgroup: 'login-methods',
    description: '微信开放平台 AppSecret',
    defaultValue: '',
    isPublic: false,
    tier: 'admin',
    envKey: 'WECHAT_APP_SECRET',
    channel: 'wechat',
    input: { maxLength: 200, secret: true, allowNull: true },
    impact: '微信登录必填；加密落库、管理端只回掩码。',
  },
  {
    key: 'wechatAutoRegister',
    type: 'boolean',
    category: 'account',
    subgroup: 'login-methods',
    description:
      '微信登录自动创建账号（开启后无需填写用户名密码，类似手机验证码登录）',
    defaultValue: false,
    isPublic: true,
    tier: 'admin',
    impact: '开启后微信授权即自动建号，无法强制补填用户名密码。',
    requires: ['wechatEnabled'],
  },

  // ───────────────────────── 文件 ─────────────────────────
  {
    key: 'maxFileSize',
    type: 'number',
    category: 'file',
    description: '文件上传大小限制 (MB)',
    defaultValue: 100,
    isPublic: true,
    tier: 'user',
    input: { min: 1, max: 50000, step: 1, unit: 'MB' },
    impact: '超过该大小的文件上传会被拒绝；保存后同会话内即时生效，其他已打开页面刷新后生效。',
  },
  {
    key: 'fontMaxFileSize',
    type: 'number',
    category: 'file',
    description: '字体上传大小限制 (MB)',
    defaultValue: 50,
    isPublic: false,
    tier: 'admin',
    input: { min: 1, max: 5000, step: 1, unit: 'MB' },
    impact: '超过该大小的字体文件会被拒绝上传，可能影响依赖大字体库的图纸正常显示。',
  },
  {
    key: 'extRefMaxFileSize',
    type: 'number',
    category: 'file',
    description: '外部参照上传大小限制 (MB)',
    defaultValue: 100,
    isPublic: false,
    tier: 'admin',
    input: { min: 1, max: 50000, step: 1, unit: 'MB' },
    impact: '外部参照（被引用图纸）单个文件上限；超出会被拒绝，调大会增加磁盘占用与打开时的引用加载时间。',
  },

  // ───────────────────────── 存储清理 ─────────────────────────
  {
    key: 'storageCleanupEnabled',
    type: 'boolean',
    category: 'maintenance',
    subgroup: 'storage-trash',
    description: '是否启用过期存储文件自动清理',
    defaultValue: true,
    isPublic: false,
    tier: 'admin',
    dangerous: true,
    impact: '关闭后删除操作遗留的孤立文件永不被回收，磁盘持续增长。',
  },
  {
    key: 'storageCleanupDelayDays',
    type: 'number',
    category: 'maintenance',
    subgroup: 'storage-trash',
    description: '过期存储文件清理延迟天数',
    defaultValue: 30,
    isPublic: false,
    tier: 'admin',
    input: { min: 1, max: 365, step: 1, unit: '天' },
    impact: '删除操作产生孤立文件后，等待多少天才可被清理回收。',
    dangerous: true,
  },
  {
    key: 'trashCleanupEnabled',
    type: 'boolean',
    category: 'maintenance',
    subgroup: 'storage-trash',
    description: '是否启用回收站文件自动清理',
    defaultValue: true,
    isPublic: false,
    tier: 'admin',
    dangerous: true,
    impact: '关闭后回收站文件永不被清理，用户误删后无法回收的空间持续累积。',
  },
  {
    key: 'trashCleanupDelayDays',
    type: 'number',
    category: 'maintenance',
    subgroup: 'storage-trash',
    description: '回收站文件清理延迟天数',
    defaultValue: 30,
    isPublic: false,
    tier: 'admin',
    input: { min: 1, max: 365, step: 1, unit: '天' },
    impact: '文件进入回收站后停留该天数被永久删除；设为 1 天时用户几乎没有恢复窗口。',
    dangerous: true,
  },
  {
    key: 'orphanCleanupEnabled',
    type: 'boolean',
    category: 'maintenance',
    subgroup: 'storage-trash',
    description: '是否启用孤儿文件自动清理',
    defaultValue: true,
    isPublic: false,
    tier: 'admin',
    dangerous: true,
    impact: '关闭后磁盘上已无数据库记录的孤儿文件不再自动清理，长期堆积会持续占用磁盘。',
  },
  // orphanCleanupDelayDays 刻意不收录：storageCleanupService.cleanupOrphans() 检出即删、
  // 没有「标记后延迟 N 天」的两阶段机制，收录该字段会让 UI 承诺一个不成立的行为。
  {
    key: 'lockCleanupEnabled',
    type: 'boolean',
    category: 'maintenance',
    subgroup: 'storage-trash',
    description: '是否启用过期文件锁自动清理',
    defaultValue: true,
    isPublic: false,
    tier: 'admin',
    dangerous: true,
    impact: '关闭后崩溃进程遗留的文件锁永不清理，文件将长期处于「被锁定」无法编辑。',
  },
  {
    key: 'diskMonitorEnabled',
    type: 'boolean',
    category: 'maintenance',
    subgroup: 'cache-disk',
    description: '是否启用磁盘状态监控',
    defaultValue: true,
    isPublic: false,
    tier: 'admin',
    impact: '关闭后不再采集磁盘空间并告警，磁盘写满时不会有任何提示，备份与转换可能直接失败。',
  },

  // ───────────────────────── 缓存任务 ─────────────────────────
  {
    key: 'cacheCleanupEnabled',
    type: 'boolean',
    category: 'maintenance',
    subgroup: 'cache-disk',
    description: '是否启用缓存清理/统计/健康检查定时任务',
    defaultValue: true,
    isPublic: false,
    tier: 'admin',
    impact: '关闭后 Redis 缓存不自动清理，key 数量与内存持续增长。',
  },
  {
    key: 'cacheMonitorEnabled',
    type: 'boolean',
    category: 'maintenance',
    subgroup: 'cache-disk',
    description: '是否启用缓存监控性能数据清理定时任务',
    defaultValue: true,
    isPublic: false,
    tier: 'admin',
    impact: '关闭后缓存命中与延迟等监控数据不再自动清理，指标记录会持续增长。',
  },

  // ───────────────────────── 审计与运维任务 ─────────────────────────
  {
    key: 'auditCleanupEnabled',
    type: 'boolean',
    category: 'audit',
    description: '是否启用审计日志自动清理',
    defaultValue: true,
    isPublic: false,
    tier: 'admin',
    dangerous: true,
    impact: '关闭后审计日志永不删除；等保要求的日志留存上界靠它控制，长期不删会撑爆磁盘。',
  },
  {
    key: 'auditRetentionDays',
    type: 'number',
    category: 'maintenance',
    subgroup: 'data-retention',
    description: '审计日志保留天数',
    defaultValue: 183,
    isPublic: false,
    tier: 'admin',
    envKey: 'AUDIT_RETENTION_DAYS',
    // #322 之前只认 AUDIT_LOG_RETENTION_DAYS（configuration.ts 至今仍同时兼容两个名字）；
    // 不给别名，存量按合规要求配置了 730 天的部署会被静默收紧回 183 天。
    envAliases: ['AUDIT_LOG_RETENTION_DAYS'],
    input: { min: 7, max: 3650, step: 1, unit: '天' },
    impact: '早于该天数的审计日志由定时任务删除。等保 2.0 要求日志留存不少于 6 个月（183 天）。',
    dangerous: true,
  },
  {
    key: 'auditArchiveEnabled',
    type: 'boolean',
    category: 'audit',
    description: '超期审计日志先归档留存再删除（关闭则到期直接删除）',
    defaultValue: false,
    isPublic: false,
    tier: 'admin',
    envKey: 'AUDIT_ARCHIVE_ENABLED',
    dangerous: true,
    impact:
      '关闭时到期审计日志直接从数据库删除、不归档留存，不满足等保 8.4.3.3/8.1.4.3 的日志留存要求。开启后先按月导出 CSV + SHA-256 清单，全部落盘成功才删库。',
  },
  {
    key: 'taskRunRetentionDays',
    type: 'number',
    category: 'maintenance',
    subgroup: 'data-retention',
    description: '后台任务执行记录的保留天数',
    defaultValue: 180,
    isPublic: false,
    tier: 'admin',
    envKey: 'TASK_RUN_RETENTION_DAYS',
    input: { min: 7, max: 3650, step: 1, unit: '天' },
    impact: '早于该天数的任务执行记录由定时任务删除，仅用于运维排查历史任务的留存窗口。',
  },
  {
    key: 'batchDownloadCleanupEnabled',
    type: 'boolean',
    category: 'file',
    description: '是否启用批量下载过期 ZIP 与 DB 记录自动清理',
    defaultValue: true,
    isPublic: false,
    tier: 'admin',
    impact: '关闭后已过期但尚未清理的批量下载压缩包会一直留在磁盘上。',
  },
  {
    key: 'backupEnabled',
    type: 'boolean',
    category: 'backup',
    description: '是否启用数据库定时备份（每日全量 pg_dump）',
    defaultValue: true,
    isPublic: false,
    tier: 'admin',
    envKey: 'BACKUP_ENABLED',
    dangerous: true,
    impact: '关闭后不再有自动数据库备份，数据库损坏将无恢复途径。',
  },
  {
    key: 'backupKeepLocal',
    type: 'number',
    category: 'backup',
    description: '本地保留最近几次备份（超出自动清理最旧的）',
    defaultValue: 14,
    isPublic: false,
    tier: 'admin',
    envKey: 'BACKUP_KEEP_LOCAL',
    input: { min: 1, max: 200, step: 1, unit: '份' },
    impact: '份数越小占用磁盘越少，但可回退的时间窗口越短。每次备份完成后按此值轮转清理。',
  },
  {
    key: 'backupDrillEnabled',
    type: 'boolean',
    category: 'backup',
    description: '是否启用月度恢复演练（临时库恢复 + 行数校验）',
    defaultValue: true,
    isPublic: false,
    tier: 'admin',
    envKey: 'BACKUP_DRILL_ENABLED',
    impact: '关闭后不再验证备份能否真正恢复；备份文件可能早已损坏却无人发现。',
  },
  {
    key: 'billingCronEnabled',
    type: 'boolean',
    category: 'billing',
    description: '是否启用计费定时任务（会员降级/超时订单关闭）',
    defaultValue: true,
    isPublic: false,
    tier: 'admin',
    impact: '关闭后会员到期不自动降级、超时订单不自动关闭。',
    dangerous: true,
  },
  {
    key: 'batchDownloadEnabled',
    type: 'boolean',
    category: 'file',
    description: '批量下载功能开关（C 端默认关闭，防资源滥用）',
    defaultValue: false,
    isPublic: true,
    tier: 'admin',
    // 与 freeExportDownloadEnabled 同理：出厂默认值按 variant 由打包期写 .env
    // （ADR-0078 D2），私有部署内网环境不需要「防资源滥用」的默认关闭。
    envKey: 'BATCH_DOWNLOAD_ENABLED',
    impact: '开启后用户可发起批量打包下载，占用磁盘与带宽。',
    dangerous: true,
  },
  {
    key: 'fileZipCompressionLevel',
    type: 'number',
    category: 'file',
    description: '批量下载 ZIP 压缩级别（0=仅存储，9=最高压缩）',
    defaultValue: 1,
    isPublic: false,
    tier: 'advanced',
    envKey: 'FILE_LIMIT_ZIP_COMPRESSION_LEVEL',
    input: { min: 0, max: 9, step: 1 },
    impact: '级别越高包越小但打包越慢、CPU 越高。每个下载任务开始时读取，即时生效。',
  },

  // ───────────────────────── 告警邮件 ─────────────────────────
  {
    key: 'alertEmailEnabled',
    type: 'boolean',
    category: 'alert',
    subgroup: 'alert-policy',
    description: '是否启用告警邮件通知（P0 实时 / P1 聚合 / P2 日报）',
    defaultValue: false,
    isPublic: false,
    tier: 'admin',
    envKey: 'ALERT_EMAIL_ENABLED',
    impact: '关闭后磁盘/备份/任务失败等告警只落库不发邮件，故障要等人登录后台才发现。',
    // 告警邮件实际走 SMTP 发送，此前未声明依赖导致「邮件服务关着、告警照发」的反向偏离
    requires: ['mailEnabled'],
  },
  {
    key: 'alertEmailTo',
    type: 'string',
    category: 'alert',
    subgroup: 'alert-policy',
    description: '告警邮件收件人（多个用英文逗号分隔）',
    defaultValue: '',
    isPublic: false,
    tier: 'admin',
    envKey: 'ALERT_EMAIL_TO',
    impact: '收件人为空时告警邮件一封都不会发送（等同关闭），告警只会留在后台告警列表。',
  },
  {
    key: 'alertEmailFailEscalate',
    type: 'number',
    category: 'alert',
    subgroup: 'alert-policy',
    description: '告警邮件连续失败多少次后升级为 P0 告警',
    defaultValue: 5,
    isPublic: false,
    tier: 'admin',
    envKey: 'ALERT_EMAIL_FAIL_ESCALATE',
    input: { min: 1, max: 100, step: 1, unit: '次' },
    impact: 'SMTP 故障时，达到该次数会主动 raise 一条 P0 告警提醒检查邮件通道；设太大等于邮件坏了没人知道。',
  },
  {
    key: 'alertEmailP1WindowMinutes',
    type: 'number',
    category: 'alert',
    subgroup: 'alert-policy',
    description: 'P1 告警按来源聚合的窗口分钟数',
    defaultValue: 15,
    isPublic: false,
    tier: 'admin',
    envKey: 'ALERT_P1_WINDOW_MINUTES',
    input: { min: 1, max: 1440, step: 1, unit: '分钟' },
    impact: '同一来源的 P1 告警在窗口内合并成一封邮件；窗口越长打扰越少，但单封邮件覆盖的问题范围越大。',
  },
  {
    key: 'alertEmailP2DailyHour',
    type: 'number',
    category: 'alert',
    subgroup: 'alert-policy',
    description: 'P2 告警日报发送时间（几点，24 小时制）',
    defaultValue: 9,
    isPublic: false,
    tier: 'admin',
    envKey: 'ALERT_P2_DAILY_HOUR',
    input: { min: 0, max: 23, step: 1, unit: '时' },
    impact: '每日该整点发送前一天 P2 告警汇总；当天无前日告警则不发送。',
  },

  // ───────────────────────── 告警 Webhook（ADR-0082 三期 #506） ─────────────────────────
  {
    key: 'alertWebhookEnabled',
    type: 'boolean',
    category: 'alert',
    subgroup: 'webhook-channel',
    description: '是否启用告警 Webhook 通知（钉钉/企业微信/飞书等，body 结构由模板决定）',
    defaultValue: false,
    isPublic: false,
    tier: 'admin',
    envKey: 'ALERT_WEBHOOK_ENABLED',
    // 通道开关：开启要求 URL 已配置 + 通道测试通过（硬阻断，无绕过）
    channelSwitch: 'webhook',
    impact: '关闭后告警不再推送到 Webhook（告警邮件不受影响），故障要等人登录后台才发现。',
  },
  {
    key: 'alertWebhookUrl',
    type: 'string',
    category: 'alert',
    subgroup: 'webhook-channel',
    description: '告警 Webhook 地址（钉钉/企业微信机器人或任意接收 POST JSON 的端点）',
    defaultValue: '',
    isPublic: false,
    tier: 'admin',
    envKey: 'ALERT_WEBHOOK_URL',
    channel: 'webhook',
    input: { maxLength: 500 },
    impact: 'URL 为空时 Webhook 通道不发送任何告警（等同关闭），告警只会留在后台告警列表。',
  },
  {
    key: 'alertWebhookTemplate',
    type: 'string',
    category: 'alert',
    subgroup: 'webhook-channel',
    description:
      '告警 Webhook body 模板（占位符 {{message}}/{{level}}/{{source}}/{{timestamp}}/{{detail}}）',
    // 默认 = 钉钉/企业微信兼容的 text 消息结构（与 webhook.service 的 DEFAULT_TEMPLATE 同源）
    defaultValue:
      '{"msgtype":"text","text":{"content":"[{{level}}] {{source}} {{timestamp}}\\n{{message}}\\n{{detail}}"}}',
    isPublic: false,
    tier: 'admin',
    envKey: 'ALERT_WEBHOOK_TEMPLATE',
    channel: 'webhook',
    input: { maxLength: 2000, allowNull: true },
    impact: '按目标平台调整 body 结构（飞书 msg_type / Slack 顶层 text 等）；留空用默认模板。',
  },

  // ───────────────────────── 安全：模式 ─────────────────────────
  {
    key: 'securityMode',
    type: 'string',
    category: 'security',
    subgroup: 'mode-mfa',
    description:
      '安全模式。secure = 完全遵循等保三级；normal = 本地/测试部署，便利高于一切。',
    defaultValue: 'normal',
    isPublic: true,
    tier: 'admin',
    dangerous: true,
    input: {
      options: [
        { value: 'normal', label: '普通模式（便利优先）' },
        { value: 'secure', label: '安全模式（等保三级）' },
      ],
    },
    impact:
      '仅切换标记本身不改变任何安全项的实际生效值——切换到某模式必须走 profile 批量应用，' +
      '否则会出现「界面显示已切安全模式、实际仍是弱值生效」的静默偏离。' +
      '本项不要手工修改，用「应用安全模式」入口切换。',
    profiles: { secure: 'secure', normal: 'normal' },
  },

  {
    key: 'adminLoginEntry',
    type: 'string',
    category: 'account',
    subgroup: 'login-methods',
    description:
      '管理员登录入口形态。ISOLATED = 管理员只能走专用入口，普通登录入口拒绝；' +
      'MERGED = 管理员与普通用户共用登录入口。',
    defaultValue: 'MERGED',
    isPublic: false,
    tier: 'advanced',
    dangerous: true,
    input: {
      options: [
        { value: 'ISOLATED', label: '隔离入口（管理员专用入口）' },
        { value: 'MERGED', label: '合并入口（与普通用户共用）' },
      ],
    },
    impact:
      '仅影响普通登录入口是否接受管理员：ISOLATED 时管理员凭一次普通入口尝试会被拒' +
      '（防枚举同文案，不签发 token、不触发注销恢复等写库副作用）；MERGED 时管理员可走任一入口，' +
      '会话仍携带 DB 实时角色，改密到期/TOTP 锁定等管理员级拦截不受影响。' +
      '专用入口两种形态下都可用。仅管理员登录时读取，普通用户请求不产生额外查询。',
    profiles: { secure: 'ISOLATED', normal: 'MERGED' },
  },

  // ───────────────────────── 安全：接口限流 ─────────────────────────
  {
    key: 'rateLimitPublicMax',
    type: 'number',
    category: 'security',
    subgroup: 'rate-limit',
    description: '公开接口每窗口最大请求数（按 IP）',
    defaultValue: 100,
    isPublic: false,
    tier: 'advanced',
    dangerous: true,
    envKey: 'RATE_LIMIT_PUBLIC_MAX',
    input: { min: 1, max: 100000, step: 1, unit: '次' },
    impact: '公开接口（未登录）同一 IP 每窗口超过该次数返回 429。过低会误伤正常使用。',
    profiles: { secure: 100, normal: 10000 },
  },
  {
    key: 'rateLimitPublicWindowMs',
    type: 'number',
    category: 'security',
    subgroup: 'rate-limit',
    description: '公开接口限流窗口长度',
    defaultValue: 60000,
    isPublic: false,
    tier: 'advanced',
    envKey: 'RATE_LIMIT_WINDOW_MS',
    input: { min: 1000, max: 86400000, step: 1000, unit: 'ms' },
    impact: '未登录接口的统计窗口长度；需与「公开接口每窗口最大请求数」配合理解，改小会让阈值更快被触发。',
  },
  {
    key: 'rateLimitAuthMax',
    type: 'number',
    category: 'security',
    subgroup: 'rate-limit',
    description: '已登录接口每窗口最大请求数（按 IP）',
    defaultValue: 300,
    isPublic: false,
    tier: 'advanced',
    dangerous: true,
    envKey: 'RATE_LIMIT_AUTH_MAX',
    input: { min: 1, max: 1000000, step: 1, unit: '次' },
    impact: '已登录用户按 IP 的请求上限；设太小正常操作也会被限流，设太大等于放开限制。',
    profiles: { secure: 300, normal: 100000 },
  },
  {
    key: 'rateLimitLoginMax',
    type: 'number',
    category: 'security',
    subgroup: 'rate-limit',
    description: '登录失败次数上限（按 IP 统计，同一出口 IP 共用额度）',
    defaultValue: 30,
    isPublic: false,
    tier: 'advanced',
    envKey: 'RATE_LIMIT_LOGIN_MAX',
    input: { min: 1, max: 10000, step: 1, unit: '次' },
    impact: '超过该次数的登录被限流，是防暴力破解的第一道闸。调太松会降低安全性。',
    dangerous: true,
    profiles: { secure: 30, normal: 1000 },
  },
  {
    key: 'rateLimitLoginWindowMs',
    type: 'number',
    category: 'security',
    subgroup: 'rate-limit',
    description: '登录失败次数上限的统计窗口（按 IP 统计）',
    defaultValue: 900000,
    isPublic: false,
    tier: 'advanced',
    envKey: 'RATE_LIMIT_LOGIN_WINDOW_MS',
    input: { min: 60000, max: 86400000, step: 60000, unit: 'ms' },
    impact: '登录接口按 IP 统计的窗口长度；须与「登录接口每窗口最大尝试次数（按账号/IP）」配套调整。',
  },
  {
    key: 'mfaEnforceEnabled',
    type: 'boolean',
    category: 'security',
    subgroup: 'mode-mfa',
    description:
      '强制管理员启用 TOTP 双因素。开启后：未绑定者登录被锁定至绑定页、已绑定者登录必须带动态码；关闭时 TOTP 完全不生效（默认关闭，含已绑定者也无需动态码）',
    defaultValue: false,
    isPublic: false,
    tier: 'admin',
    dangerous: true,
    impact:
      '关闭后管理员可仅凭密码登录（等保 2.0 8.1.4.1(d) 要求双因素）。' +
      'admin-auth 与 jwt.strategy 均每次读取，改完即生效。',
    profiles: { secure: true, normal: false },
  },
  // ───────────────────────── 安全：口令策略 ─────────────────────────
  // 以下项在 password-policy.service 的 assertPasswordPolicy() /
  // getPasswordChangeStatus() 中**每次调用时读取**（经 Redis 缓存），改完即生效。
  // 原先这 4 项在构造期一次性快照 configService，改不了不重启；已改惰性读取后收录。
  {
    key: 'passwordPolicyMinLength',
    type: 'number',
    category: 'security',
    subgroup: 'password-policy',
    description: '设置口令时的最小长度',
    defaultValue: 10,
    // isPublic：前端（登录/注册/改密/首启表单）经 /runtime-config/public 读取生效值
    // 动态渲染口令要求提示，杜绝前端写死文案与策略失同步（2026-10-20）
    isPublic: true,
    tier: 'admin',
    dangerous: true,
    envKey: 'PASSWORD_POLICY_MIN_LENGTH',
    input: { min: 0, max: 64, step: 1, unit: '位' },
    impact:
      '仅约束设置口令的入口（注册/改密/重置/管理员创建），存量口令不追溯校验。' +
      '每次设密时读取，改完即生效；调太小会显著降低抗暴力破解能力。',
    profiles: { secure: 10, normal: 6 },
  },
  {
    key: 'passwordPolicyMinCategories',
    type: 'number',
    category: 'security',
    subgroup: 'password-policy',
    description:
      '设置口令时至少需要的字符类别数（小写、大写、数字、特殊字符四类计），0 = 不要求类别构成',
    defaultValue: 3,
    // isPublic：同 passwordPolicyMinLength，前端动态渲染口令要求提示
    isPublic: true,
    tier: 'admin',
    dangerous: true,
    input: { min: 0, max: 4, step: 1, unit: '类' },
    impact:
      '0 表示纯数字口令（如 8 位数字）也能通过；1-4 依次为至少含一类至四类。' +
      '每次设密时读取，改完即生效。',
    profiles: { secure: 3, normal: 0 },
  },
  {
    key: 'passwordPolicyWeakCheckEnabled',
    type: 'boolean',
    category: 'security',
    subgroup: 'password-policy',
    description: '启用内置常见弱口令黑名单校验',
    defaultValue: true,
    isPublic: false,
    tier: 'admin',
    dangerous: true,
    impact:
      '关闭后不再拦截 123456、password、admin123! 等常见弱口令，任何长度与类别合规的口令都能通过。' +
      '每次设密时读取，改完即生效。',
    profiles: { secure: true, normal: false },
  },
  {
    key: 'passwordPolicyChangeIntervalDays',
    type: 'number',
    category: 'security',
    subgroup: 'password-policy',
    description: '管理员口令强制更换周期（天），0 = 永不强制',
    defaultValue: 180,
    isPublic: false,
    tier: 'admin',
    dangerous: true,
    envKey: 'PASSWORD_POLICY_MAX_AGE_DAYS',
    input: { min: 0, max: 3650, step: 1, unit: '天' },
    impact:
      '仅 ADMIN 角色生效（普通用户不做周期判定，体验优先）。0 表示永不因到期强制改密，' +
      '但仍受「首登未改密」判定影响。每次登录时读取，改完即生效。',
    profiles: { secure: 180, normal: 0 },
  },
  {
    key: 'passwordPolicyExpiringSoonDays',
    type: 'number',
    category: 'security',
    subgroup: 'password-policy',
    description: '距到期多少天开始软提示（仅提示，不拦截）',
    defaultValue: 14,
    isPublic: false,
    tier: 'admin',
    input: { min: 0, max: 365, step: 1, unit: '天' },
    impact:
      '配合「口令强制更换周期」使用：进入该窗口后管理员看到改密提醒但不被锁定。' +
      '必须小于更换周期才有意义；0 = 不提示。每次登录时读取，改完即生效。',
  },
  {
    key: 'passwordPolicyChangeEnforceEnabled',
    type: 'boolean',
    category: 'security',
    subgroup: 'password-policy',
    description:
      '启用管理员定期更换/首登未改密的强制改密（关闭时仅显示标记、不锁定）',
    defaultValue: false,
    isPublic: false,
    tier: 'admin',
    dangerous: true,
    envKey: 'PASSWORD_POLICY_CHANGE_ENFORCE_ENABLED',
    impact:
      '仅 ADMIN 角色生效。开启后：口令到期或首登未改密的管理员被锁定，只能走改密入口；' +
      '关闭时判定仍计算但不拦截。每次登录与每次 token 校验时读取，改完即生效。' +
      '默认关闭，与 mfaEnforceEnabled 一致；切换安全模式会开启。',
    profiles: { secure: true, normal: false },
  },
  {
    key: 'passwordPolicyHistoryCheckEnabled',
    type: 'boolean',
    category: 'security',
    subgroup: 'password-policy',
    description: '启用口令历史校验（禁止近期用过的口令）',
    defaultValue: false,
    isPublic: false,
    tier: 'admin',
    dangerous: true,
    impact:
      '预留项：口令历史存储与校验尚未实现，当前无论填什么值都不生效。' +
      '实现后才会声明 secure/normal 目标值并纳入模式切换（等保 8.1.4.1 要求）。',
  },

  // ───────────────────────── 安全：账号锁定与业务限流 ─────────────────────────
  // 以下 8 + 3 项在 account-rate-limit.service 的 getConfig()/getLockConfig() 中
  // **每次检查时读取**，因此迁移后天然热生效，无需重启。
  {
    key: 'loginRateLimitMax',
    type: 'number',
    category: 'security',
    subgroup: 'rate-limit',
    description: '登录失败次数上限（按账号统计，每个账号独立额度）',
    defaultValue: 30,
    isPublic: false,
    tier: 'advanced',
    envKey: 'AUTH_RATE_LIMIT_LOGIN_MAX',
    input: { min: 1, max: 10000, step: 1, unit: '次' },
    impact: '每窗口内同一账号超过该次数的登录尝试被限流。每次检查时读取，即时生效。',
    dangerous: true,
    profiles: { secure: 30, normal: 500 },
  },
  {
    key: 'loginRateLimitWindowSeconds',
    type: 'number',
    category: 'security',
    subgroup: 'rate-limit',
    description: '登录失败次数上限的统计窗口（按账号统计）',
    defaultValue: 60,
    isPublic: false,
    tier: 'advanced',
    envKey: 'AUTH_RATE_LIMIT_LOGIN_WINDOW_SECONDS',
    input: { min: 10, max: 86400, step: 10, unit: '秒' },
    impact: '登录失败按账号统计的窗口长度；与按 IP 的登录限流是两套独立机制，改一个不影响另一个。',
  },
  {
    key: 'passwordResetRateLimitMax',
    type: 'number',
    category: 'security',
    subgroup: 'rate-limit',
    description: '找回密码重置每窗口最大次数',
    defaultValue: 5,
    isPublic: false,
    tier: 'advanced',
    dangerous: true,
    envKey: 'AUTH_RATE_LIMIT_PASSWORD_RESET_MAX',
    input: { min: 1, max: 10000, step: 1, unit: '次' },
    impact: '单个手机号/邮箱在窗口内最多可提交几次密码重置；过小会挡住真实用户，过大等于放开被撞库重置。',
    profiles: { secure: 5, normal: 100 },
  },
  {
    key: 'passwordResetRateLimitWindowSeconds',
    type: 'number',
    category: 'security',
    subgroup: 'rate-limit',
    description: '找回密码重置限流窗口长度',
    defaultValue: 3600,
    isPublic: false,
    tier: 'advanced',
    envKey: 'AUTH_RATE_LIMIT_PASSWORD_RESET_WINDOW_SECONDS',
    input: { min: 60, max: 86400, step: 60, unit: '秒' },
    impact: '密码重置次数的统计窗口长度。',
  },
  {
    key: 'registerRateLimitMax',
    type: 'number',
    category: 'security',
    subgroup: 'rate-limit',
    description: '注册接口每窗口最大尝试次数',
    defaultValue: 5,
    isPublic: false,
    tier: 'advanced',
    dangerous: true,
    envKey: 'AUTH_RATE_LIMIT_REGISTER_MAX',
    input: { min: 1, max: 10000, step: 1, unit: '次' },
    impact: '单个 IP 在窗口内的注册次数上限；过小会挡住批量导入，过大等于放开批量注册。',
    profiles: { secure: 5, normal: 100 },
  },
  {
    key: 'registerRateLimitWindowSeconds',
    type: 'number',
    category: 'security',
    subgroup: 'rate-limit',
    description: '注册限流窗口长度',
    defaultValue: 3600,
    isPublic: false,
    tier: 'advanced',
    envKey: 'AUTH_RATE_LIMIT_REGISTER_WINDOW_SECONDS',
    input: { min: 60, max: 86400, step: 60, unit: '秒' },
    impact: '注册次数的统计窗口长度。',
  },
  {
    key: 'orderCreateRateLimitMax',
    type: 'number',
    category: 'security',
    subgroup: 'rate-limit',
    description: '下单接口每窗口最大次数（防刷第三方 API 配额）',
    defaultValue: 10,
    isPublic: false,
    tier: 'advanced',
    dangerous: true,
    envKey: 'AUTH_RATE_LIMIT_ORDER_CREATE_MAX',
    input: { min: 1, max: 10000, step: 1, unit: '次' },
    impact: '下单次数上限，窗口内超出后无法下单（用于保护第三方支付配额）。',
  },
  {
    key: 'orderCreateRateLimitWindowSeconds',
    type: 'number',
    category: 'security',
    subgroup: 'rate-limit',
    description: '下单限流窗口长度',
    defaultValue: 3600,
    isPublic: false,
    tier: 'advanced',
    envKey: 'AUTH_RATE_LIMIT_ORDER_CREATE_WINDOW_SECONDS',
    input: { min: 60, max: 86400, step: 60, unit: '秒' },
    impact: '下单次数的统计窗口长度。',
  },
  {
    key: 'accountLockFailThreshold',
    type: 'number',
    category: 'security',
    subgroup: 'account-lock',
    description: '触发账号锁定所需的连续失败次数',
    defaultValue: 10,
    isPublic: false,
    tier: 'advanced',
    envKey: 'AUTH_LOCK_FAIL_THRESHOLD',
    input: { min: 3, max: 100, step: 1, unit: '次' },
    impact: '同一账号在窗口内失败达到该次数即被锁定。调太低会把正常输错的用户锁住。',
    dangerous: true,
    profiles: { secure: 10, normal: 100 },
  },
  {
    key: 'accountLockWindowSeconds',
    type: 'number',
    category: 'security',
    subgroup: 'account-lock',
    description: '账号锁定的失败计数窗口',
    defaultValue: 900,
    isPublic: false,
    tier: 'advanced',
    envKey: 'AUTH_LOCK_WINDOW_SECONDS',
    input: { min: 60, max: 86400, step: 60, unit: '秒' },
    impact: '统计登录失败的窗口长度；窗口内失败达到阈值即锁定账号。',
    dangerous: true,
  },
  {
    key: 'accountLockDurationSeconds',
    type: 'number',
    category: 'security',
    subgroup: 'account-lock',
    description: '账号被锁定后的锁定时长（期间即使密码正确也拒绝）',
    defaultValue: 1800,
    isPublic: false,
    tier: 'advanced',
    envKey: 'AUTH_LOCK_DURATION_SECONDS',
    input: { min: 60, max: 86400, step: 60, unit: '秒' },
    impact: '账号被锁定后的锁定时长，期间即使密码正确也无法登录；设太大会让账号长时间不可用。',
    dangerous: true,
    profiles: { secure: 1800, normal: 60 },
  },
  {
    key: 'smsDailyLimitPerPhone',
    type: 'number',
    category: 'security',
    subgroup: 'rate-limit',
    description: '单个手机号每日短信发送上限',
    defaultValue: 10,
    isPublic: false,
    tier: 'advanced',
    envKey: 'SMS_DAILY_LIMIT_PER_PHONE',
    input: { min: 1, max: 200, step: 1, unit: '次/日' },
    impact: '超过后该手机号当日无法再收到验证码，直接控制短信费。',
    dangerous: true,
  },
  {
    key: 'smsHourlyLimitPerIp',
    type: 'number',
    category: 'security',
    subgroup: 'rate-limit',
    description: '单个 IP 每小时短信发送上限',
    defaultValue: 20,
    isPublic: false,
    tier: 'advanced',
    envKey: 'SMS_HOURLY_LIMIT_PER_IP',
    input: { min: 1, max: 500, step: 1, unit: '次/时' },
    impact: '单个 IP 每小时最多发送短信条数，超出后验证码发不出，登录与找回密码会卡住。',
    dangerous: true,
  },

  // ───────────────────────── 配额：游客转换与免费导出 ─────────────────────────
  {
    key: 'conversionGuestWindowHours',
    type: 'number',
    category: 'billing',
    description: '游客图纸转换频率限制窗口（小时）',
    defaultValue: 2,
    isPublic: true,
    tier: 'admin',
    input: { min: 1, max: 720, step: 1, unit: '小时' },
    impact: '未登录游客转换次数的统计窗口长度；须与「游客每窗口内最多图纸转换次数」配套理解。',
  },
  {
    key: 'conversionGuestLimit',
    type: 'number',
    category: 'billing',
    description: '游客每窗口内最多图纸转换次数',
    defaultValue: 5,
    isPublic: true,
    tier: 'admin',
    input: { min: 1, max: 1000, step: 1, unit: '次' },
    impact: '未登录游客每窗口的转换次数上限，超出后需登录；设太大会放开匿名刷转换。',
  },
  {
    key: 'freeExportDownloadEnabled',
    type: 'boolean',
    category: 'billing',
    description: '免费用户（含游客）是否允许导出下载转换（mxweb 转其他格式）',
    defaultValue: true,
    isPublic: true,
    tier: 'admin',
    // 出厂默认放行：导出门控是商业策略而非等保项，新装即放开，安全模式才收敛（profiles.secure）。
    // 保留 envKey 供部署期注入定制——env 层优先于安装期写入的默认行，运维也可在配置页覆盖。
    envKey: 'FREE_EXPORT_DOWNLOAD_ENABLED',
    impact: '开启后免费用户可导出转换结果，会增加转换引擎负载。',
    dangerous: true,
    profiles: { secure: false, normal: true },
  },

  // ───────────────────────── 计费：支付通道（ADR-0082 三期 #505） ─────────────────────────
  {
    key: 'paymentEnabled',
    type: 'boolean',
    category: 'billing',
    description: '支付功能开关',
    defaultValue: false,
    isPublic: false,
    tier: 'admin',
    dangerous: true,
    // 通道开关：开启要求支付配置完整 + 通道测试通过（硬阻断，无绕过）
    channelSwitch: 'payment',
    impact: '开启后进入付费/会员下单流程；需先在服务端配置支付网关凭证。',
  },
  {
    key: 'paymentProvider',
    type: 'string',
    category: 'billing',
    description: '支付网关服务商',
    defaultValue: 'mock',
    isPublic: false,
    tier: 'admin',
    envKey: 'PAYMENT_PROVIDER',
    channel: 'payment',
    input: {
      options: [
        { value: 'wechat_pay', label: '微信支付' },
        { value: 'mock', label: 'Mock（开发测试）' },
      ],
    },
    impact: '决定使用哪组凭据键；切换后对应网关的凭据需通过通道测试。',
  },
  {
    key: 'wechatPayAppId',
    type: 'string',
    category: 'billing',
    description: '微信支付 AppID',
    defaultValue: '',
    isPublic: false,
    tier: 'admin',
    envKey: 'WECHATPAY_APPID',
    channel: 'payment',
    input: { maxLength: 100 },
    impact: 'paymentProvider=wechat_pay 时必填；商户平台「开发配置-AppID」。',
  },
  {
    key: 'wechatPayMchId',
    type: 'string',
    category: 'billing',
    description: '微信支付商户号',
    defaultValue: '',
    isPublic: false,
    tier: 'admin',
    envKey: 'WECHATPAY_MCHID',
    channel: 'payment',
    input: { maxLength: 100, allowNull: true },
    impact: 'paymentProvider=wechat_pay 时必填；商户平台「商户信息-商户号」。',
  },
  {
    key: 'wechatPayKey',
    type: 'string',
    category: 'billing',
    description: '微信支付 API 密钥（V2 签名密钥）',
    defaultValue: '',
    isPublic: false,
    tier: 'admin',
    envKey: 'WECHATPAY_KEY',
    channel: 'payment',
    input: { maxLength: 200, secret: true, allowNull: true },
    impact: 'paymentProvider=wechat_pay 时必填；加密落库、管理端只回掩码。',
  },
  {
    key: 'wechatPayNotifyUrl',
    type: 'string',
    category: 'billing',
    description: '微信支付异步回调地址',
    defaultValue: '',
    isPublic: false,
    tier: 'admin',
    envKey: 'WECHATPAY_NOTIFY_URL',
    channel: 'payment',
    input: { maxLength: 500, allowNull: true },
    impact: 'paymentProvider=wechat_pay 时必填；须为公网可达的 HTTPS 地址。',
  },
  // 证书文件路径（WECHATPAY_CERT_PATH/WECHATPAY_KEY_PATH）与 signType（WECHATPAY_SIGN_TYPE）
  // 按 ADR-0082 D7 留 env：文件内容无法用 UI 文本框填写，属部署身份性质。

  // ───────────────────────── 协同 ─────────────────────────
  {
    key: 'collaborationEnabled',
    type: 'boolean',
    category: 'collaboration',
    description: '实时协同功能开关（仅私有化部署可用）',
    defaultValue: true,
    isPublic: true,
    tier: 'user',
    impact: '开启后侧边栏出现「协同」入口；需已部署协同服务端。',
    dangerous: true,
  },
  {
    key: 'collaborationDomains',
    type: 'string',
    category: 'collaboration',
    description: '协同功能域名白名单（逗号分隔，仅这些域名可使用协同功能）',
    defaultValue: '',
    isPublic: true,
    tier: 'admin',
    input: { maxLength: 500, allowNull: true, placeholder: 'cad.example.com,portal.example.com' },
    impact: '留空则不做域名限制；填写后仅白名单内的访问域名可使用协同。',
  },

  // ───────────────────────── 安全：设备授权 ─────────────────────────
  // deviceAuthFrontendDomain 由 device 分类并入 security（碎分类不单独成组）。
  // oldSiteApiBase 刻意不收录：唯一消费者在 impl-mx 私有包（不在 backend/src，
  // 键登记完整性门禁扫不到），收录会给 OSS 包的用户一个改了没反应的字段；
  // 其默认值由 impl-mx 的 old-site-api-client.ts 自带。
  {
    key: 'deviceAuthFrontendDomain',
    type: 'string',
    category: 'account',
    subgroup: 'login-methods',
    description: '设备授权前端页面域名（用于构造 verification_uri_complete）',
    defaultValue: 'http://localhost:8000',
    isPublic: false,
    tier: 'admin',
    input: { maxLength: 300 },
    impact: '新设备登录时展示的授权确认页地址；填错会导致用户打不开授权页、无法完成设备登录。',
    dangerous: true,
  },

  // ─────────────────────────
  // 系统公告已迁到 notice-center 模块（notices 表 + SSE 实时推送），
  // 运行时配置不再暴露 systemNotice —— 留在这里会变成「填了没反应」的陷阱字段。
  // 存量 DB 行会成为惰性孤儿键（仍进 public 响应，但已无任何读取方），不做删行迁移，
  // 避免静默清掉某个部署环境正在生效的公告。
  //
  // 同类「死配置」同样刻意不收录（全仓零消费者，收录即陷阱）：
  //   PAGINATION_DEFAULT_PAGE_SIZE / PAGINATION_MAX_PAGE_SIZE
  //   TIMEOUT_RATE_LIMITER / TIMEOUT_DIRECTORY_ALLOCATOR
  //   UPLOAD_ALLOWED_TYPES / UPLOAD_MAX_SIZE
  //   FILE_LIMIT_MAX_PATH_LENGTH / FILE_LIMIT_MAX_DIRECTORY_DEPTH / FILE_LIMIT_MAX_HIERARCHY_DEPTH
  // CACHE_TTL_PERMISSION / CACHE_TTL_POLICY / CACHE_TTL_DEFAULT、
  // CACHE_L2_DEFAULT_TTL / CACHE_VERSION_MAX_AGE 连 env 读取方都没有，已彻底删除（Gitea #483）——
  // configuration.ts、app.config.ts 与 .env.example 三处一并移除。
  // 构造期一次性读取、改了必须重启才生效的配置（TIMEOUT_FILE_CONVERSION、
  // CACHE_TTL_*、FILE_LOCK_*、FILE_EXT_*、THUMBNAIL_*、UPLOAD_*）也不收录：
  // 它们在运行时配置里会有值但实际不生效，属于「填了没反应」的陷阱字段。
  // 这些项保持 env + 重启语义，由运维通过 .env 管理。
  // ─────────────────────────
];


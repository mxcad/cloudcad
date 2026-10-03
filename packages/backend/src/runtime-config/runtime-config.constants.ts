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
 * - **进**：运行期语义、无秘密、改了不该重启即生效。
 * - **不进**：
 *   1. 秘密（JWT/数据库/Redis/SMTP/短信/支付/TOTP/PII 密钥）—— 存 DB 等于摊进
 *      明文 pg_dump 备份与运维 UI，比 env 更差；
 *   2. 启动期必需（DATABASE_URL、端口、CORS、MXCAD_*_PATH、FILES_DATA_PATH）
 *      —— 运行时配置存在 DB 里，读它之前必须先连上 DB；
 *   3. 部署身份（部署根路径、PM2、备份远端主机）；
 *   4. 前端构建期（VITE_*）。
 * - **不进（重要）**：构造期一次性读取、改了必须重启才生效的配置。此类配置若收录
 *   会变成「填了没反应」的陷阱字段，因此保持 env + 重启语义，UI 上不假装热生效。
 *
 * ## 元数据字段
 * - `tier`     显示档位（user 客户运维可安全改 / admin 需系统理解 / advanced 需懂内部）
 * - `input`    类型感知输入元数据，前端渲染控件、后端 validateValue 同源校验
 * - `impact`   改了会怎样（面向操作员，比 description 具体）
 * - `dangerous` 改动需二次确认
 * - `hot`      是否即时生效；`false` = 需刷新页面或重启服务
 * - `envKey`   底层 env 变量名（部署期默认值层）
 */
export const RUNTIME_CONFIG_DEFINITIONS: RuntimeConfigDefinition[] = [
  // ───────────────────────── 品牌与客服 ─────────────────────────
  {
    key: 'brandProfile',
    type: 'json',
    category: 'brand',
    description:
      '品牌档案（标题/标语/Logo 路径/文档地址/版权/法务主体），整块覆盖前端内置默认值。客服邮箱/电话请用 supportEmail、supportPhone 项，此处 support 仅支持 hours（服务时间）。',
    defaultValue: {},
    isPublic: true,
    tier: 'user',
    impact:
      '保存后前端即刻生效（BrandContext 订阅公开配置）；字段缺失时回退到前端内置默认品牌，' +
      '需清空某字段请从 JSON 中删除该键（不支持空串清空，前端校验会拒绝）。',
  },
  {
    key: 'supportEmail',
    type: 'string',
    category: 'support',
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
    category: 'support',
    description: '客服电话',
    defaultValue: '',
    isPublic: true,
    tier: 'user',
    input: { maxLength: 200, allowNull: true, placeholder: '400-123-4567' },
    impact: '客服弹框展示的联系电话；优先级高于品牌档案中的 support.phone。',
  },

  // ───────────────────────── 邮件 ─────────────────────────
  {
    key: 'mailEnabled',
    type: 'boolean',
    category: 'mail',
    description: '邮件服务开关',
    defaultValue: false,
    isPublic: true,
    tier: 'user',
    dangerous: true,
    impact: '关闭后所有邮件发送（注册/验证码/告警通知/找回密码）全部停止。',
  },
  {
    key: 'requireEmailVerification',
    type: 'boolean',
    category: 'mail',
    description: '强制邮箱验证',
    defaultValue: false,
    isPublic: true,
    tier: 'admin',
    impact: '开启后未验证邮箱的用户无法完成需要邮箱的功能；配合 mailEnabled 使用。',
    dangerous: true,
  },
  {
    key: 'refundNotifyEmails',
    type: 'string',
    category: 'mail',
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
    category: 'sms',
    description: '短信服务开关',
    defaultValue: false,
    isPublic: true,
    tier: 'user',
    dangerous: true,
    impact: '关闭后手机验证码登录、验证码发送全部停止。',
  },
  {
    key: 'requirePhoneVerification',
    type: 'boolean',
    category: 'sms',
    description: '强制手机号验证',
    defaultValue: false,
    isPublic: true,
    tier: 'admin',
    impact: '开启后未验证手机号的用户受限；配合 smsEnabled 使用。',
    dangerous: true,
  },

  // ───────────────────────── 用户 ─────────────────────────
  {
    key: 'allowRegister',
    type: 'boolean',
    category: 'user',
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
    category: 'user',
    description: '手机验证码登录时自动注册',
    defaultValue: false,
    isPublic: false,
    tier: 'admin',
    impact: '开启后新手机号验证码登录即自动建号，无需填写用户名密码。',
  },
  {
    key: 'userCancelGraceDays',
    type: 'number',
    category: 'user',
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
    category: 'user',
    description: '是否启用过期用户数据自动清理',
    defaultValue: true,
    isPublic: false,
    tier: 'advanced',
    dangerous: true,
    impact: '关闭后注销冷静期到期的用户数据不再自动清理，DB 持续膨胀。',
  },

  // ───────────────────────── 微信 ─────────────────────────
  {
    key: 'wechatEnabled',
    type: 'boolean',
    category: 'wechat',
    description: '微信登录开关',
    defaultValue: false,
    isPublic: true,
    tier: 'user',
    impact: '开启后登录页出现微信扫码入口；需先在服务端配置微信开放平台凭证。',
    dangerous: true,
  },
  {
    key: 'wechatAutoRegister',
    type: 'boolean',
    category: 'wechat',
    description:
      '微信登录自动创建账号（开启后无需填写用户名密码，类似手机验证码登录）',
    defaultValue: false,
    isPublic: true,
    tier: 'admin',
    impact: '开启后微信授权即自动建号，无法强制补填用户名密码。',
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
    category: 'storage',
    description: '是否启用过期存储文件自动清理',
    defaultValue: true,
    isPublic: false,
    tier: 'advanced',
    dangerous: true,
    impact: '关闭后删除操作遗留的孤立文件永不被回收，磁盘持续增长。',
  },
  {
    key: 'storageCleanupDelayDays',
    type: 'number',
    category: 'storage',
    description: '过期存储文件清理延迟天数',
    defaultValue: 30,
    isPublic: false,
    tier: 'advanced',
    input: { min: 1, max: 365, step: 1, unit: '天' },
    impact: '删除操作产生孤立文件后，等待多少天才可被清理回收。',
    dangerous: true,
  },
  {
    key: 'trashCleanupEnabled',
    type: 'boolean',
    category: 'storage',
    description: '是否启用回收站文件自动清理',
    defaultValue: true,
    isPublic: false,
    tier: 'advanced',
    dangerous: true,
    impact: '关闭后回收站文件永不被清理，用户误删后无法回收的空间持续累积。',
  },
  {
    key: 'trashCleanupDelayDays',
    type: 'number',
    category: 'storage',
    description: '回收站文件清理延迟天数',
    defaultValue: 30,
    isPublic: false,
    tier: 'advanced',
    input: { min: 1, max: 365, step: 1, unit: '天' },
    impact: '文件进入回收站后停留该天数被永久删除；设为 1 天时用户几乎没有恢复窗口。',
    dangerous: true,
  },
  {
    key: 'orphanCleanupEnabled',
    type: 'boolean',
    category: 'storage',
    description: '是否启用孤儿文件自动清理',
    defaultValue: true,
    isPublic: false,
    tier: 'advanced',
    dangerous: true,
    impact: '关闭后磁盘上已无数据库记录的孤儿文件不再自动清理，长期堆积会持续占用磁盘。',
  },
  // orphanCleanupDelayDays 刻意不收录：storageCleanupService.cleanupOrphans() 检出即删、
  // 没有「标记后延迟 N 天」的两阶段机制，收录该字段会让 UI 承诺一个不成立的行为。
  {
    key: 'lockCleanupEnabled',
    type: 'boolean',
    category: 'storage',
    description: '是否启用过期文件锁自动清理',
    defaultValue: true,
    isPublic: false,
    tier: 'advanced',
    dangerous: true,
    impact: '关闭后崩溃进程遗留的文件锁永不清理，文件将长期处于「被锁定」无法编辑。',
  },
  {
    key: 'diskMonitorEnabled',
    type: 'boolean',
    category: 'storage',
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
    category: 'cache',
    description: '是否启用缓存清理/统计/健康检查定时任务',
    defaultValue: true,
    isPublic: false,
    tier: 'advanced',
    impact: '关闭后 Redis 缓存不自动清理，key 数量与内存持续增长。',
  },
  {
    key: 'cacheMonitorEnabled',
    type: 'boolean',
    category: 'cache',
    description: '是否启用缓存监控性能数据清理定时任务',
    defaultValue: true,
    isPublic: false,
    tier: 'advanced',
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
    category: 'audit',
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
    tier: 'advanced',
    envKey: 'AUDIT_ARCHIVE_ENABLED',
    dangerous: true,
    impact:
      '关闭时到期审计日志直接从数据库删除、不归档留存，不满足等保 8.4.3.3/8.1.4.3 的日志留存要求。开启后先按月导出 CSV + SHA-256 清单，全部落盘成功才删库。',
  },
  {
    key: 'taskRunRetentionDays',
    type: 'number',
    category: 'audit',
    description: '后台任务执行记录的保留天数',
    defaultValue: 180,
    isPublic: false,
    tier: 'advanced',
    envKey: 'TASK_RUN_RETENTION_DAYS',
    input: { min: 7, max: 3650, step: 1, unit: '天' },
    impact: '早于该天数的任务执行记录由定时任务删除，仅用于运维排查历史任务的留存窗口。',
  },
  {
    key: 'batchDownloadCleanupEnabled',
    type: 'boolean',
    category: 'system',
    description: '是否启用批量下载过期 ZIP 与 DB 记录自动清理',
    defaultValue: true,
    isPublic: false,
    tier: 'advanced',
    impact: '关闭后已过期但尚未清理的批量下载压缩包会一直留在磁盘上。',
  },
  {
    key: 'backupEnabled',
    type: 'boolean',
    category: 'backup',
    description: '是否启用数据库定时备份（每日全量 pg_dump）',
    defaultValue: true,
    isPublic: false,
    tier: 'advanced',
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
    tier: 'advanced',
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
    tier: 'advanced',
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
    category: 'system',
    description: '批量下载功能开关（C 端默认关闭，防资源滥用）',
    defaultValue: false,
    isPublic: true,
    tier: 'admin',
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
    description: '是否启用告警邮件通知（P0 实时 / P1 聚合 / P2 日报）',
    defaultValue: false,
    isPublic: false,
    tier: 'advanced',
    envKey: 'ALERT_EMAIL_ENABLED',
    impact: '关闭后磁盘/备份/任务失败等告警只落库不发邮件，故障要等人登录后台才发现。',
  },
  {
    key: 'alertEmailTo',
    type: 'string',
    category: 'alert',
    description: '告警邮件收件人（多个用英文逗号分隔）',
    defaultValue: '',
    isPublic: false,
    tier: 'advanced',
    envKey: 'ALERT_EMAIL_TO',
    impact: '收件人为空时告警邮件一封都不会发送（等同关闭），告警只会留在后台告警列表。',
  },
  {
    key: 'alertEmailFailEscalate',
    type: 'number',
    category: 'alert',
    description: '告警邮件连续失败多少次后升级为 P0 告警',
    defaultValue: 5,
    isPublic: false,
    tier: 'advanced',
    envKey: 'ALERT_EMAIL_FAIL_ESCALATE',
    input: { min: 1, max: 100, step: 1, unit: '次' },
    impact: 'SMTP 故障时，达到该次数会主动 raise 一条 P0 告警提醒检查邮件通道；设太大等于邮件坏了没人知道。',
  },
  {
    key: 'alertEmailP1WindowMinutes',
    type: 'number',
    category: 'alert',
    description: 'P1 告警按来源聚合的窗口分钟数',
    defaultValue: 15,
    isPublic: false,
    tier: 'advanced',
    envKey: 'ALERT_P1_WINDOW_MINUTES',
    input: { min: 1, max: 1440, step: 1, unit: '分钟' },
    impact: '同一来源的 P1 告警在窗口内合并成一封邮件；窗口越长打扰越少，但单封邮件覆盖的问题范围越大。',
  },
  {
    key: 'alertEmailP2DailyHour',
    type: 'number',
    category: 'alert',
    description: 'P2 告警日报发送时间（几点，24 小时制）',
    defaultValue: 9,
    isPublic: false,
    tier: 'advanced',
    envKey: 'ALERT_P2_DAILY_HOUR',
    input: { min: 0, max: 23, step: 1, unit: '时' },
    impact: '每日该整点发送前一天 P2 告警汇总；当天无前日告警则不发送。',
  },

  // ───────────────────────── 安全：接口限流 ─────────────────────────
  {
    key: 'rateLimitPublicMax',
    type: 'number',
    category: 'security',
    description: '公开接口每窗口最大请求数（按 IP）',
    defaultValue: 100,
    isPublic: false,
    tier: 'advanced',
    envKey: 'RATE_LIMIT_PUBLIC_MAX',
    input: { min: 1, max: 100000, step: 1, unit: '次' },
    impact: '公开接口（未登录）同一 IP 每窗口超过该次数返回 429。过低会误伤正常使用。',
  },
  {
    key: 'rateLimitPublicWindowMs',
    type: 'number',
    category: 'security',
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
    description: '已登录接口每窗口最大请求数（按 IP）',
    defaultValue: 300,
    isPublic: false,
    tier: 'advanced',
    envKey: 'RATE_LIMIT_AUTH_MAX',
    input: { min: 1, max: 1000000, step: 1, unit: '次' },
    impact: '已登录用户按 IP 的请求上限；设太小正常操作也会被限流，设太大等于放开限制。',
  },
  {
    key: 'rateLimitLoginMax',
    type: 'number',
    category: 'security',
    description: '登录失败次数上限（按 IP 统计，同一出口 IP 共用额度）',
    defaultValue: 5,
    isPublic: false,
    tier: 'admin',
    envKey: 'RATE_LIMIT_LOGIN_MAX',
    input: { min: 1, max: 10000, step: 1, unit: '次' },
    impact: '超过该次数的登录被限流，是防暴力破解的第一道闸。调太松会降低安全性。',
    dangerous: true,
  },
  {
    key: 'rateLimitLoginWindowMs',
    type: 'number',
    category: 'security',
    description: '登录失败次数上限的统计窗口（按 IP 统计）',
    defaultValue: 900000,
    isPublic: false,
    tier: 'admin',
    envKey: 'RATE_LIMIT_LOGIN_WINDOW_MS',
    input: { min: 60000, max: 86400000, step: 60000, unit: 'ms' },
    impact: '登录接口按 IP 统计的窗口长度；须与「登录接口每窗口最大尝试次数（按账号/IP）」配套调整。',
    dangerous: true,
  },
  {
    key: 'mfaEnforceEnabled',
    type: 'boolean',
    category: 'security',
    description:
      '强制管理员启用 TOTP 双因素。开启后：未绑定者登录被锁定至绑定页、已绑定者登录必须带动态码；关闭时 TOTP 完全不生效（默认关闭，含已绑定者也无需动态码）',
    defaultValue: false,
    isPublic: false,
    tier: 'admin',
    dangerous: true,
    impact:
      '关闭后管理员可仅凭密码登录（等保 2.0 8.1.4.1(d) 要求双因素）。' +
      'admin-auth 与 jwt.strategy 均每次读取，改完即生效。',
  },
  // 口令策略 4 项（passwordMinLength / passwordMaxAgeDays / passwordExpiringSoonDays /
  // passwordChangeEnforceEnabled）**刻意不收录**：password-policy.service 在构造期一次性
  // 读取 configService.get('passwordPolicy') 并固化到 readonly 字段，assertPasswordPolicy
  // 与 getPasswordChangeStatus 都是同步方法、后者被 jwt.strategy 每请求调用。
  // 迁入运行时配置需把这两个方法改成异步并 ripple 到 4 处调用点，属于对最热安全路径的
  // 结构性改造；且当前 env 值与这里若填的 defaultValue 完全一致，无行为缺陷。
  // 按文件头「构造期一次性读取 → 不收录」原则保持 env + 重启语义
  //（PASSWORD_POLICY_MIN_LENGTH / MAX_AGE_DAYS / EXPIRING_SOON_DAYS / CHANGE_ENFORCE_ENABLED）。

  // ───────────────────────── 安全：账号锁定与业务限流 ─────────────────────────
  // 以下 8 + 3 项在 account-rate-limit.service 的 getConfig()/getLockConfig() 中
  // **每次检查时读取**，因此迁移后天然热生效，无需重启。
  {
    key: 'loginRateLimitMax',
    type: 'number',
    category: 'security',
    description: '登录失败次数上限（按账号统计，每个账号独立额度）',
    defaultValue: 5,
    isPublic: false,
    tier: 'admin',
    envKey: 'AUTH_RATE_LIMIT_LOGIN_MAX',
    input: { min: 1, max: 10000, step: 1, unit: '次' },
    impact: '每窗口内同一账号超过该次数的登录尝试被限流。每次检查时读取，即时生效。',
    dangerous: true,
  },
  {
    key: 'loginRateLimitWindowSeconds',
    type: 'number',
    category: 'security',
    description: '登录失败次数上限的统计窗口（按账号统计）',
    defaultValue: 60,
    isPublic: false,
    tier: 'admin',
    envKey: 'AUTH_RATE_LIMIT_LOGIN_WINDOW_SECONDS',
    input: { min: 10, max: 86400, step: 10, unit: '秒' },
    impact: '登录失败按账号统计的窗口长度；与按 IP 的登录限流是两套独立机制，改一个不影响另一个。',
    dangerous: true,
  },
  {
    key: 'passwordResetRateLimitMax',
    type: 'number',
    category: 'security',
    description: '找回密码重置每窗口最大次数',
    defaultValue: 5,
    isPublic: false,
    tier: 'admin',
    envKey: 'AUTH_RATE_LIMIT_PASSWORD_RESET_MAX',
    input: { min: 1, max: 10000, step: 1, unit: '次' },
    impact: '单个手机号/邮箱在窗口内最多可提交几次密码重置；过小会挡住真实用户，过大等于放开被撞库重置。',
  },
  {
    key: 'passwordResetRateLimitWindowSeconds',
    type: 'number',
    category: 'security',
    description: '找回密码重置限流窗口长度',
    defaultValue: 3600,
    isPublic: false,
    tier: 'admin',
    envKey: 'AUTH_RATE_LIMIT_PASSWORD_RESET_WINDOW_SECONDS',
    input: { min: 60, max: 86400, step: 60, unit: '秒' },
    impact: '密码重置次数的统计窗口长度。',
  },
  {
    key: 'registerRateLimitMax',
    type: 'number',
    category: 'security',
    description: '注册接口每窗口最大尝试次数',
    defaultValue: 5,
    isPublic: false,
    tier: 'admin',
    envKey: 'AUTH_RATE_LIMIT_REGISTER_MAX',
    input: { min: 1, max: 10000, step: 1, unit: '次' },
    impact: '单个 IP 在窗口内的注册次数上限；过小会挡住批量导入，过大等于放开批量注册。',
  },
  {
    key: 'registerRateLimitWindowSeconds',
    type: 'number',
    category: 'security',
    description: '注册限流窗口长度',
    defaultValue: 3600,
    isPublic: false,
    tier: 'admin',
    envKey: 'AUTH_RATE_LIMIT_REGISTER_WINDOW_SECONDS',
    input: { min: 60, max: 86400, step: 60, unit: '秒' },
    impact: '注册次数的统计窗口长度。',
  },
  {
    key: 'orderCreateRateLimitMax',
    type: 'number',
    category: 'security',
    description: '下单接口每窗口最大次数（防刷第三方 API 配额）',
    defaultValue: 10,
    isPublic: false,
    tier: 'advanced',
    envKey: 'AUTH_RATE_LIMIT_ORDER_CREATE_MAX',
    input: { min: 1, max: 10000, step: 1, unit: '次' },
    impact: '下单次数上限，窗口内超出后无法下单（用于保护第三方支付配额）。',
  },
  {
    key: 'orderCreateRateLimitWindowSeconds',
    type: 'number',
    category: 'security',
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
    description: '触发账号锁定所需的连续失败次数',
    defaultValue: 10,
    isPublic: false,
    tier: 'admin',
    envKey: 'AUTH_LOCK_FAIL_THRESHOLD',
    input: { min: 3, max: 100, step: 1, unit: '次' },
    impact: '同一账号在窗口内失败达到该次数即被锁定。调太低会把正常输错的用户锁住。',
    dangerous: true,
  },
  {
    key: 'accountLockWindowSeconds',
    type: 'number',
    category: 'security',
    description: '账号锁定的失败计数窗口',
    defaultValue: 900,
    isPublic: false,
    tier: 'admin',
    envKey: 'AUTH_LOCK_WINDOW_SECONDS',
    input: { min: 60, max: 86400, step: 60, unit: '秒' },
    impact: '统计登录失败的窗口长度；窗口内失败达到阈值即锁定账号。',
    dangerous: true,
  },
  {
    key: 'accountLockDurationSeconds',
    type: 'number',
    category: 'security',
    description: '账号被锁定后的锁定时长（期间即使密码正确也拒绝）',
    defaultValue: 1800,
    isPublic: false,
    tier: 'admin',
    envKey: 'AUTH_LOCK_DURATION_SECONDS',
    input: { min: 60, max: 86400, step: 60, unit: '秒' },
    impact: '账号被锁定后的锁定时长，期间即使密码正确也无法登录；设太大会让账号长时间不可用。',
    dangerous: true,
  },
  {
    key: 'smsDailyLimitPerPhone',
    type: 'number',
    category: 'sms',
    description: '单个手机号每日短信发送上限',
    defaultValue: 10,
    isPublic: false,
    tier: 'admin',
    envKey: 'SMS_DAILY_LIMIT_PER_PHONE',
    input: { min: 1, max: 200, step: 1, unit: '次/日' },
    impact: '超过后该手机号当日无法再收到验证码，直接控制短信费。',
    dangerous: true,
  },
  {
    key: 'smsHourlyLimitPerIp',
    type: 'number',
    category: 'sms',
    description: '单个 IP 每小时短信发送上限',
    defaultValue: 20,
    isPublic: false,
    tier: 'admin',
    envKey: 'SMS_HOURLY_LIMIT_PER_IP',
    input: { min: 1, max: 500, step: 1, unit: '次/时' },
    impact: '单个 IP 每小时最多发送短信条数，超出后验证码发不出，登录与找回密码会卡住。',
    dangerous: true,
  },

  // ───────────────────────── 配额 ─────────────────────────
  {
    key: 'conversionGuestWindowHours',
    type: 'number',
    category: 'quota',
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
    category: 'quota',
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
    category: 'quota',
    description: '免费用户（含游客）是否允许导出下载转换（mxweb 转其他格式）',
    defaultValue: false,
    isPublic: true,
    tier: 'admin',
    impact: '开启后免费用户可导出转换结果，会增加转换引擎负载。',
    dangerous: true,
  },

  // ───────────────────────── 支付 ─────────────────────────
  {
    key: 'paymentEnabled',
    type: 'boolean',
    category: 'billing',
    description: '支付功能开关',
    defaultValue: false,
    isPublic: false,
    tier: 'admin',
    dangerous: true,
    impact: '开启后进入付费/会员下单流程；需先在服务端配置支付网关凭证。',
  },

  // ───────────────────────── 协同 ─────────────────────────
  {
    key: 'collaborationEnabled',
    type: 'boolean',
    category: 'collaboration',
    description: '实时协同功能开关（仅私有化部署可用）',
    defaultValue: false,
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

  // ───────────────────────── 系统与设备 ─────────────────────────
  // oldSiteApiBase 刻意不收录：全后端零消费者，收录等于给用户一个改了没反应的字段。
  {
    key: 'deviceAuthFrontendDomain',
    type: 'string',
    category: 'device',
    description: '设备授权前端页面域名（用于构造 verification_uri_complete）',
    defaultValue: 'http://localhost:3000',
    isPublic: false,
    tier: 'advanced',
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
  //   CACHE_TTL_PERMISSION / CACHE_TTL_POLICY / CACHE_TTL_DEFAULT
  //   CACHE_L2_DEFAULT_TTL / CACHE_VERSION_MAX_AGE
  //   UPLOAD_ALLOWED_TYPES
  //   FILE_LIMIT_MAX_PATH_LENGTH / FILE_LIMIT_MAX_DIRECTORY_DEPTH / FILE_LIMIT_MAX_HIERARCHY_DEPTH
  // 构造期一次性读取、改了必须重启才生效的配置（TIMEOUT_FILE_CONVERSION、
  // CACHE_TTL_*、FILE_LOCK_*、FILE_EXT_*、THUMBNAIL_*、UPLOAD_*）也不收录：
  // 它们在运行时配置里会有值但实际不生效，属于「填了没反应」的陷阱字段。
  // 这些项保持 env + 重启语义，由运维通过 .env 管理。
  // ─────────────────────────
];


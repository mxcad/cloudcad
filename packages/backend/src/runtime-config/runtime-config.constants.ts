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
 * 运行时配置项定义列表
 */
export const RUNTIME_CONFIG_DEFINITIONS: RuntimeConfigDefinition[] = [
  // 邮件配置
  {
    key: 'mailEnabled',
    type: 'boolean',
    category: 'mail',
    description: '邮件服务开关',
    defaultValue: false,
    isPublic: true,
  },
  {
    key: 'requireEmailVerification',
    type: 'boolean',
    category: 'mail',
    description: '强制邮箱验证',
    defaultValue: false,
    isPublic: true,
  },
  {
    key: 'refundNotifyEmails',
    type: 'string',
    category: 'mail',
    description: '退款申请通知邮箱（多个用逗号分隔）',
    defaultValue: '',
    isPublic: false,
  },

  // 短信配置
  {
    key: 'smsEnabled',
    type: 'boolean',
    category: 'sms',
    description: '短信服务开关',
    defaultValue: false,
    isPublic: true,
  },
  {
    key: 'requirePhoneVerification',
    type: 'boolean',
    category: 'sms',
    description: '强制手机号验证',
    defaultValue: false,
    isPublic: true,
  },

  // 客服配置
  {
    key: 'supportEmail',
    type: 'string',
    category: 'support',
    description: '客服邮箱',
    defaultValue: '',
    isPublic: true,
  },
  {
    key: 'supportPhone',
    type: 'string',
    category: 'support',
    description: '客服电话',
    defaultValue: '',
    isPublic: true,
  },

  // 文件配置
  {
    key: 'maxFileSize',
    type: 'number',
    category: 'file',
    description: '文件上传大小限制 (MB)',
    defaultValue: 100,
    isPublic: true,
  },
  {
    key: 'fontMaxFileSize',
    type: 'number',
    category: 'file',
    description: '字体上传大小限制 (MB)',
    defaultValue: 50,
    isPublic: false,
  },
  {
    key: 'extRefMaxFileSize',
    type: 'number',
    category: 'file',
    description: '外部参照上传大小限制 (MB)',
    defaultValue: 100,
    isPublic: false,
  },

  // 用户配置
  {
    key: 'allowRegister',
    type: 'boolean',
    category: 'user',
    description: '用户注册开关',
    defaultValue: true,
    isPublic: true,
  },
  {
    key: 'allowAutoRegisterOnPhoneLogin',
    type: 'boolean',
    category: 'user',
    description: '手机验证码登录时自动注册',
    defaultValue: false,
    isPublic: false,
  },

  // 微信配置
  {
    key: 'wechatEnabled',
    type: 'boolean',
    category: 'wechat',
    description: '微信登录开关',
    defaultValue: false,
    isPublic: true,
  },
  {
    key: 'wechatAutoRegister',
    type: 'boolean',
    category: 'wechat',
    description:
      '微信登录自动创建账号（开启后无需填写用户名密码，类似手机验证码登录）',
    defaultValue: false,
    isPublic: true,
  },

  // 存储清理配置
  {
    key: 'storageCleanupDelayDays',
    type: 'number',
    category: 'storage',
    description: '过期存储文件清理延迟天数',
    defaultValue: 30,
    isPublic: false,
  },
  {
    key: 'storageCleanupEnabled',
    type: 'boolean',
    category: 'storage',
    description: '是否启用过期存储文件自动清理',
    defaultValue: true,
    isPublic: false,
  },
  {
    key: 'trashCleanupDelayDays',
    type: 'number',
    category: 'storage',
    description: '回收站文件清理延迟天数',
    defaultValue: 30,
    isPublic: false,
  },
  {
    key: 'trashCleanupEnabled',
    type: 'boolean',
    category: 'storage',
    description: '是否启用回收站文件自动清理',
    defaultValue: true,
    isPublic: false,
  },
  {
    key: 'orphanCleanupDelayDays',
    type: 'number',
    category: 'storage',
    description: '孤儿文件清理延迟天数（标记后多少天可清理）',
    defaultValue: 7,
    isPublic: false,
  },
  {
    key: 'orphanCleanupEnabled',
    type: 'boolean',
    category: 'storage',
    description: '是否启用孤儿文件自动清理',
    defaultValue: true,
    isPublic: false,
  },
  {
    key: 'lockCleanupEnabled',
    type: 'boolean',
    category: 'storage',
    description: '是否启用过期文件锁自动清理',
    defaultValue: true,
    isPublic: false,
  },
  {
    key: 'diskMonitorEnabled',
    type: 'boolean',
    category: 'storage',
    description: '是否启用磁盘状态监控',
    defaultValue: true,
    isPublic: false,
  },

  // 后台任务开关（#210）
  {
    key: 'cacheCleanupEnabled',
    type: 'boolean',
    category: 'cache',
    description: '是否启用缓存清理/统计/健康检查定时任务',
    defaultValue: true,
    isPublic: false,
  },
  {
    key: 'cacheMonitorEnabled',
    type: 'boolean',
    category: 'cache',
    description: '是否启用缓存监控性能数据清理定时任务',
    defaultValue: true,
    isPublic: false,
  },
  {
    key: 'auditCleanupEnabled',
    type: 'boolean',
    category: 'system',
    description: '是否启用审计日志自动清理',
    defaultValue: true,
    isPublic: false,
  },
  {
    key: 'batchDownloadCleanupEnabled',
    type: 'boolean',
    category: 'system',
    description: '是否启用批量下载过期 ZIP 与 DB 记录自动清理',
    defaultValue: true,
    isPublic: false,
  },
  {
    key: 'billingCronEnabled',
    type: 'boolean',
    category: 'billing',
    description: '是否启用计费定时任务（会员降级/超时订单关闭）',
    defaultValue: true,
    isPublic: false,
  },
  {
    key: 'userCleanupEnabled',
    type: 'boolean',
    category: 'user',
    description: '是否启用过期用户数据自动清理',
    defaultValue: true,
    isPublic: false,
  },
  {
    key: 'backupEnabled',
    type: 'boolean',
    category: 'system',
    description: '是否启用数据库定时备份（每日全量 pg_dump）',
    defaultValue: true,
    isPublic: false,
  },
  {
    key: 'userCancelGraceDays',
    type: 'number',
    category: 'user',
    description: '注销冷静期天数：期间重新登录自动取消注销，逾期需联系客服恢复',
    defaultValue: 7,
    isPublic: true,
  },

  // 支付配置
  {
    key: 'paymentEnabled',
    type: 'boolean',
    category: 'billing',
    description: '支付功能开关',
    defaultValue: false,
    isPublic: false,
  },

  // 配额配置
  {
    key: 'conversionGuestWindowHours',
    type: 'number',
    category: 'quota',
    description: '游客图纸转换频率限制窗口（小时）',
    defaultValue: 2,
    isPublic: true,
  },
  {
    key: 'conversionGuestLimit',
    type: 'number',
    category: 'quota',
    description: '游客每窗口内最多图纸转换次数',
    defaultValue: 5,
    isPublic: true,
  },
  {
    key: 'freeExportDownloadEnabled',
    type: 'boolean',
    category: 'quota',
    description: '免费用户（含游客）是否允许导出下载转换（mxweb 转其他格式）',
    defaultValue: false,
    isPublic: true,
  },

  // 系统配置
  {
    key: 'systemNotice',
    type: 'string',
    category: 'system',
    description: '系统公告',
    defaultValue: '',
    isPublic: true,
  },

  // 协同配置
  {
    key: 'collaborationEnabled',
    type: 'boolean',
    category: 'collaboration',
    description: '实时协同功能开关（仅私有化部署可用）',
    defaultValue: false,
    isPublic: true,
  },
  {
    key: 'collaborationDomains',
    type: 'string',
    category: 'collaboration',
    description: '协同功能域名白名单（逗号分隔，仅这些域名可使用协同功能）',
    defaultValue: '',
    isPublic: true,
  },

  // 批量下载配置
  {
    key: 'batchDownloadEnabled',
    type: 'boolean',
    category: 'system',
    description: '批量下载功能开关（C 端默认关闭，防资源滥用）',
    defaultValue: false,
    isPublic: true,
  },

  // 旧官网集成
  {
    key: 'oldSiteApiBase',
    type: 'string',
    category: 'system',
    description: '旧官网 API 基础 URL（仅私有部署有效）',
    defaultValue: 'https://c.mxdraw3d.com/app',
    isPublic: false,
  },

  // 设备授权
  {
    key: 'deviceAuthFrontendDomain',
    type: 'string',
    category: 'device',
    description: '设备授权前端页面域名（用于构造 verification_uri_complete）',
    defaultValue: 'http://localhost:3000',
    isPublic: false,
  },

  // 安全合规：管理员 TOTP 双因素总开关（#415 等保 8.1.4.1(d)）
  {
    key: 'mfaEnforceEnabled',
    type: 'boolean',
    category: 'system',
    description:
      '强制管理员启用 TOTP 双因素。开启后：未绑定者登录被锁定至绑定页、已绑定者登录必须带动态码；关闭时 TOTP 完全不生效（默认关闭，含已绑定者也无需动态码）',
    defaultValue: false,
    isPublic: false,
  },
];

/**
 * 默认配置值映射
 */
export const DEFAULT_RUNTIME_CONFIGS = Object.fromEntries(
  RUNTIME_CONFIG_DEFINITIONS.map((def) => [def.key, def.defaultValue])
) as Record<string, string | number | boolean>;

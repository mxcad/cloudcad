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
    isPublic: true,
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

  // 存储配额配置（单位：GB）
  {
    key: 'userStorageQuota',
    type: 'number',
    category: 'storage',
    description: '个人空间存储配额 (GB)',
    defaultValue: 10, // 10GB
    isPublic: false,
  },
  {
    key: 'projectStorageQuota',
    type: 'number',
    category: 'storage',
    description: '项目存储配额 (GB)',
    defaultValue: 50, // 50GB
    isPublic: false,
  },
  {
    key: 'libraryStorageQuota',
    type: 'number',
    category: 'storage',
    description: '公共资源库存储配额 (GB)',
    defaultValue: 100, // 100GB
    isPublic: false,
  },
  {
    key: 'enforceStorageQuota',
    type: 'boolean',
    category: 'storage',
    description: '是否强制实施存储配额检查（开启后超配额无法上传）',
    defaultValue: true,
    isPublic: false,
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
];

/**
 * 默认配置值映射
 */
export const DEFAULT_RUNTIME_CONFIGS = Object.fromEntries(
  RUNTIME_CONFIG_DEFINITIONS.map((def) => [def.key, def.defaultValue])
) as Record<string, string | number | boolean>;

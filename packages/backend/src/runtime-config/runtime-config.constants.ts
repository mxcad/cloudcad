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
  RUNTIME_CONFIG_DEFINITIONS.map((def) => [def.key, def.defaultValue]),
) as Record<string, string | number | boolean>;

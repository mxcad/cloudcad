const path = require('path');

const PORT = process.env.CONFIG_SERVICE_PORT || 3002;
const SESSION_TTL = 30 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000;

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const BACKEND_DIR = path.join(PROJECT_ROOT, 'packages', 'backend');
const ENV_PATH = path.join(BACKEND_DIR, '.env');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const FRONTEND_DIST_DIR = path.join(__dirname, '..', '..', 'frontend', 'dist');
const RUNTIME_DIR = path.join(PROJECT_ROOT, 'runtime');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const PM2_HOME = path.join(DATA_DIR, 'pm2');
const ECOSYSTEM_PATH = path.join(RUNTIME_DIR, 'ecosystem.config.js');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

const INFRASTRUCTURE_SERVICES = ['postgresql', 'redis', 'cooperate'];

const PM2_SERVICES = [
  'postgresql',
  'redis',
  'cooperate',
  'config-service',
  'backend',
  'frontend',
];

const CONFIG_GROUPS = [
  {
    name: '服务配置',
    key: 'service',
    controllable: true,
    description: '修改后重启服务即可生效',
    items: [
      { key: 'PORT', label: '服务端口', type: 'number', sensitive: false },
      {
        key: 'FRONTEND_URL',
        label: '前端地址',
        type: 'text',
        sensitive: false,
      },
      {
        key: 'IMPL',
        label: '自定义认证实现模块路径',
        type: 'text',
        sensitive: false,
      },
    ],
  },
  {
    name: '安全配置',
    key: 'security',
    controllable: true,
    description: '修改后重启服务即可生效',
    items: [
      {
        key: 'JWT_SECRET',
        label: 'JWT 密钥',
        type: 'secret',
        sensitive: true,
        canGenerate: true,
      },
    ],
  },
  {
    name: '邮件配置',
    key: 'mail',
    controllable: true,
    description: '修改后重启服务即可生效',
    items: [
      { key: 'MAIL_HOST', label: 'SMTP 主机', type: 'text', sensitive: false },
      { key: 'MAIL_PORT', label: 'SMTP 端口', type: 'number', sensitive: false },
      { key: 'MAIL_SECURE', label: '启用 TLS', type: 'boolean', sensitive: false },
      { key: 'MAIL_USER', label: 'SMTP 用户', type: 'text', sensitive: false },
      {
        key: 'MAIL_PASSWORD',
        label: 'SMTP 密码',
        type: 'password',
        sensitive: true,
      },
      { key: 'MAIL_FROM', label: '发件人', type: 'text', sensitive: false },
    ],
  },
  {
    name: '数据库配置',
    key: 'database',
    controllable: false,
    description:
      '⚠️ 修改此项需同时修改 PostgreSQL 服务配置，否则会导致连接失败',
    items: [
      { key: 'DB_HOST', label: '数据库主机', type: 'text', sensitive: false },
      { key: 'DB_PORT', label: '数据库端口', type: 'number', sensitive: false },
      { key: 'DB_DATABASE', label: '数据库名称', type: 'text', sensitive: false },
      { key: 'DB_USERNAME', label: '数据库用户', type: 'text', sensitive: false },
      {
        key: 'DB_PASSWORD',
        label: '数据库密码',
        type: 'password',
        sensitive: true,
      },
    ],
  },
  {
    name: 'Redis 配置',
    key: 'redis',
    controllable: false,
    description: '⚠️ 修改此项需同时修改 Redis 服务配置，否则会导致连接失败',
    items: [
      { key: 'REDIS_HOST', label: 'Redis 主机', type: 'text', sensitive: false },
      { key: 'REDIS_PORT', label: 'Redis 端口', type: 'number', sensitive: false },
      {
        key: 'REDIS_PASSWORD',
        label: 'Redis 密码',
        type: 'password',
        sensitive: true,
      },
    ],
  },
];

module.exports = {
  PORT,
  SESSION_TTL,
  MAX_LOGIN_ATTEMPTS,
  LOCKOUT_TIME,
  PROJECT_ROOT,
  BACKEND_DIR,
  ENV_PATH,
  PUBLIC_DIR,
  FRONTEND_DIST_DIR,
  RUNTIME_DIR,
  DATA_DIR,
  PM2_HOME,
  ECOSYSTEM_PATH,
  BACKUP_DIR,
  INFRASTRUCTURE_SERVICES,
  PM2_SERVICES,
  CONFIG_GROUPS,
};

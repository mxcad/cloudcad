/**
 * @fileoverview 首次部署凭据备份 —— 在部署包根目录落一份明文 txt 保存随机生成的密码
 *
 * 背景：首次部署时数据库 / Redis / 管理员密码全部随机生成，只在终端一次性打印；
 * 用户没来得及复制（或被后续服务启动日志刷屏覆盖）就再也找不回来——数据库密码
 * 丢失只能重装 data/postgres。因此首次部署确认后，在根目录额外落一份人类可读的
 * DEPLOY-PASSWORDS.txt，作为终端之外唯一的找回入口。
 *
 * 刻意取舍（改动前请读）：
 * - 明文落盘 = 用安全性换可用性：面向非技术用户的「丢了找不回」代价高于文件泄露风险。
 *   非 Windows 收窄为 600（仅属主可读写）；Windows 无等价简易机制（ACL 需 PowerShell，不做）。
 * - 只在首次部署（.env 未置 PASSWORD_INITIALIZED）时写一次，**不做事后自动补写**：
 *   用户可能出于合规要求主动删除该文件，静默重建是错误行为。
 * - 任何写失败只告警不抛错：凭据备份失败不得中断生产部署。
 *
 * 依赖方向：lib 只 require 其他 lib。消费方 commands/setup-wizard.js。
 *
 * 运行：node --test runtime/scripts/lib/credentials.test.js
 */

const fs = require('fs');
const path = require('path');

const { PROJECT_ROOT, PORTS, IS_WINDOWS } = require('./context');
const { PRODUCT_NAME } = require('./branding');
const { displayWidth, log } = require('./logger');
const { getAdminLoginPath } = require('./admin-login');

// 文件名取 ASCII：中文文件名在 CP936 控制台与跨平台拷贝下都有编码风险
const CREDENTIAL_FILE_NAME = 'DEPLOY-PASSWORDS.txt';

const WIDTH = 60;
const TOP_LINE = '='.repeat(WIDTH);
const MID_LINE = '-'.repeat(WIDTH);

const REMINDERS = [
  '本文件包含明文密码，请妥善保管：勿上传网盘、勿发聊天记录、勿提交代码仓库。',
  '首次登录管理后台后请立即修改管理员密码。',
  '密码全部丢失时可从 packages/backend/.env 查看（DB_PASSWORD / REDIS_PASSWORD / ' +
    'INITIAL_ADMIN_PASSWORD）。',
  '确认密码已记录且不再需要时可删除本文件，删除不影响系统运行。',
];

/**
 * 凭据备份文件路径（部署包根目录）
 * @param {string} [root] 根目录，默认 PROJECT_ROOT；测试时指向沙箱目录
 * @returns {string}
 */
function credentialFilePath(root = PROJECT_ROOT) {
  return path.join(root, CREDENTIAL_FILE_NAME);
}

/**
 * 格式化为 `YYYY-MM-DD HH:mm:ss`（本地时区，不依赖 locale）
 * @param {Date} [date]
 * @returns {string}
 */
function formatDateTime(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ` +
    `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
  );
}

/**
 * 从最终生效的配置组装凭据条目（无值的项跳过，避免打印出空密码）
 * @param {Record<string,string>} updates writeFinalEnv 的写入项（含最终密码）
 * @param {Record<string,string>} envConfig 现有 .env 配置
 * @returns {Array<{label:string, value:string}>}
 */
function buildCredentialItems(updates, envConfig) {
  const cfg = envConfig || {};
  const u = updates || {};
  const host = (k, d) => cfg[k] || d;

  const items = [
    { label: '管理员账号', value: cfg.INITIAL_ADMIN_USERNAME || 'admin' },
    { label: '管理员密码', value: u.INITIAL_ADMIN_PASSWORD },
    {
      label: '数据库',
      value: `${host('DB_HOST', 'localhost')}:${host('DB_PORT', '5432')}/${host(
        'DB_DATABASE',
        'cloudcad'
      )}（用户 ${host('DB_USERNAME', 'postgres')}）`,
    },
    { label: '数据库密码', value: u.DB_PASSWORD },
    {
      label: 'Redis',
      value: `${host('REDIS_HOST', 'localhost')}:${host('REDIS_PORT', '6379')}`,
    },
    // Redis 允许无密码部署：空值表示无密码而非缺失
    { label: 'Redis 密码', value: u.REDIS_PASSWORD || '无密码' },
    {
      label: '管理员登录',
      value: `http://localhost:${cfg.FRONTEND_PORT || PORTS.frontend}${getAdminLoginPath()}`,
    },
    {
      label: '配置中心',
      value: `http://localhost:${host('CONFIG_SERVICE_PORT', '3002')}`,
    },
  ];

  return items.filter((item) => item.value !== undefined && item.value !== '');
}

/**
 * 渲染凭据备份文件内容（纯函数，无 IO）
 * @param {Array<{label:string, value:string}>} items
 * @param {{generatedAt?: string}} [meta]
 * @returns {string}
 */
function formatCredentialFile(items, { generatedAt } = {}) {
  const lines = [];
  lines.push(TOP_LINE);
  lines.push(`  ${PRODUCT_NAME} 首次部署凭据`);
  lines.push(`  生成时间：${generatedAt || formatDateTime()}`);
  lines.push(TOP_LINE);
  lines.push('');

  const padTo = items.reduce(
    (max, item) => Math.max(max, displayWidth(item.label)),
    0
  );
  for (const item of items) {
    lines.push(
      `  ${item.label}${' '.repeat(padTo - displayWidth(item.label))}  ${item.value}`
    );
  }

  lines.push('');
  lines.push(MID_LINE);
  lines.push('  ⚠ 重要提醒');
  REMINDERS.forEach((text, i) => {
    lines.push(`  ${i + 1}. ${text}`);
  });
  lines.push(MID_LINE);
  lines.push('');

  return lines.join('\n');
}

/**
 * 写入凭据备份文件（幂等覆盖：内容为当前生效配置的全量快照）
 *
 * 永不抛错——失败只告警并返回 ok:false，调用方无需 try/catch。
 * @param {Record<string,string>} updates writeFinalEnv 的写入项
 * @param {Record<string,string>} envConfig 现有 .env 配置
 * @param {{filePath?: string}} [options] 测试用注入路径
 * @returns {{ok: boolean, path: string}}
 */
function saveCredentialBackup(updates, envConfig, { filePath } = {}) {
  const target = filePath || credentialFilePath();
  try {
    const items = buildCredentialItems(updates, envConfig);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, formatCredentialFile(items), 'utf8');
    if (!IS_WINDOWS) {
      fs.chmodSync(target, 0o600);
    }
    log('green', `[✓] 凭据备份已保存：${target}`);
    return { ok: true, path: target };
  } catch (err) {
    log('yellow', `[!] 凭据备份写入失败（不影响部署）：${err.message}`);
    return { ok: false, path: target };
  }
}

module.exports = {
  CREDENTIAL_FILE_NAME,
  credentialFilePath,
  formatDateTime,
  buildCredentialItems,
  formatCredentialFile,
  saveCredentialBackup,
};

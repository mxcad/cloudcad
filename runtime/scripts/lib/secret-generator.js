/**
 * @fileoverview 密钥 / 口令生成与 .env 空白密钥填充 —— 单一事实源
 *
 * 2026-10-12 自 setup-offline.js 抽出（ADR-0074）：
 * - generateStrongPassword 此前在 setup-offline.js 与 commands/setup-wizard.js 各有一份
 *   逐字相同的副本（漂移风险）；
 * - Docker 一键部署包（ADR-0074）需要同一套 fillEmptySecrets，但不能整文件 require
 *   setup-offline.js（其依赖闭包拖进 PM2/pnpm 裸机部署链）。
 *
 * 本模块为纯函数层：仅依赖 node 内置 + config-updater（escapeEnvValue）；
 * 日志由调用方注入（logFn，缺省静默），不依赖 lib/logger 的彩色输出。
 *
 * 依赖方向铁律：lib 只允许 require 其他 lib 或独立模块，禁止 require commands。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { escapeEnvValue } = require('../config-updater');

/**
 * 首次部署默认管理员口令（简单口令分支）
 *
 * 有意不满足 #416 等保 8.1.4.1 复杂度要求（8 位纯数字，且命中弱口令黑名单）：
 * 部署目标用户是非技术人员，抄不下 16 位四类随机口令会被锁死在管理后台。
 * 代价由产品内横幅承接——ADMIN 且 passwordChangedAt===null 时提示「仍在首次部署
 * 初始密码」并给改密入口，把「默认弱口令」转成「部署即提示改密」的运营约束。
 *
 * 单一事实源：fillEmptySecrets（非交互兜底）与 setup-wizard（三分支默认）共用本常量，
 * 勿在别处硬编码。改这里即同步改两条路径。
 */
const DEFAULT_ADMIN_PASSWORD = '12345678';

/**
 * 生成长度为 64 的随机密钥（十六进制）
 */
function generateSecret() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 生成符合口令策略的强随机口令（#416 等保 8.1.4.1）：
 * 长度 16，覆盖小写/大写/数字/特殊字符四类（满足"四类至少三类"），
 * 随机生成不会命中弱口令黑名单。用于填充 INITIAL_ADMIN_PASSWORD。
 */
function generateStrongPassword() {
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  const special = '!@#$%^&*-_=+?';
  const all = lower + upper + digits + special;
  const rand = (chars) => chars[crypto.randomInt(chars.length)];
  // 保证四类各至少一个，其余随机补齐到 16 位
  const chars = [rand(lower), rand(upper), rand(digits), rand(special)];
  while (chars.length < 16) {
    chars.push(rand(all));
  }
  // Fisher-Yates 洗牌打散位置
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/**
 * 填充 .env 中空白的必填密钥（SESSION_SECRET、JWT_SECRET、PII_*、REDIS_PASSWORD、
 * INTERNAL_SERVICE_SECRET、INITIAL_ADMIN_PASSWORD）
 * 首次部署时自动生成随机密钥，避免生产环境校验报错；升级部署保留已有值
 * （正则只匹配空白行）。
 * @param {string} envFile - .env 文件路径
 * @param {Function} [logFn] - 调用方注入的日志函数（缺省静默）
 */
function fillEmptySecrets(envFile, logFn = () => {}) {
  if (!fs.existsSync(envFile)) return;
  let content = fs.readFileSync(envFile, 'utf8');
  const secrets = [
    'SESSION_SECRET',
    'JWT_SECRET',
    // #417 等保 8.1.4.8：PII 字段级加密密钥（users.phone/email 的 AES-GCM 加密 +
    // HMAC-SHA256 归一化索引）。首次部署自动生成两个独立密钥；升级部署保留已有值
    // （正则只匹配空白行），避免重启后密钥变化导致存量密文无法解密。
    'PII_ENCRYPTION_KEY',
    'PII_HMAC_KEY',
    // #419 等保 8.1.2.2：Redis requirepass 密码。生产必填（configuration.ts 校验），
    // 首次部署自动生成；升级部署保留已有值（避免 Redis 密码变化导致后端连不上）。
    'REDIS_PASSWORD',
    // #419 等保 8.1.2.2：storage/conversion 内部服务共享密钥（backend 出站带
    // X-Internal-Service-Secret 头，服务侧非 health 路由校验）。
    'INTERNAL_SERVICE_SECRET',
  ];
  let changed = false;
  for (const key of secrets) {
    const regex = new RegExp(`^${key}=[ \\t]*$`, 'm');
    if (regex.test(content)) {
      // escapeEnvValue：hex 密钥不含敏感字符原样写入，含敏感字符则加引号
      content = content.replace(
        regex,
        `${key}=${escapeEnvValue(generateSecret())}`
      );
      logFn(`  ✓ 自动生成 ${key}`);
      changed = true;
    }
  }
  // INITIAL_ADMIN_PASSWORD 必填无缺省，默认走简单口令 DEFAULT_ADMIN_PASSWORD
  // （有意放松 #416 等保 8.1.4.1 复杂度，理由与横幅承接见上方常量注释）。
  // 本函数是非交互兜底（离线安装 / docker 一键包），没有 stdin 可问 y/n，只能给默认值；
  // 有交互的部署路径（setup-wizard 三分支）可用 y 选强随机或 n 自定义。
  // 恒走 escapeEnvValue 通道：强随机口令含 # 时裸写会被 dotenv 当行内注释截断，
  // 简单口令不含敏感字符则原样返回，两条路径共用同一写法。
  const adminPasswordRegex = /^INITIAL_ADMIN_PASSWORD=[ \t]*$/m;
  if (adminPasswordRegex.test(content)) {
    content = content.replace(
      adminPasswordRegex,
      `INITIAL_ADMIN_PASSWORD=${escapeEnvValue(DEFAULT_ADMIN_PASSWORD)}`
    );
    logFn(
      `  ✓ 自动生成 INITIAL_ADMIN_PASSWORD（默认简单口令 ${DEFAULT_ADMIN_PASSWORD}，首次登录后请尽快修改）`
    );
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(envFile, content, 'utf8');
    logFn(`  ✓ 已填充 ${path.basename(envFile)} 中的空白密钥`);
  }
}

module.exports = {
  DEFAULT_ADMIN_PASSWORD,
  generateSecret,
  generateStrongPassword,
  fillEmptySecrets,
};

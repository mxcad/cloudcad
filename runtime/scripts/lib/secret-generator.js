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
  // #416 等保 8.1.4.1：INITIAL_ADMIN_PASSWORD 必填无缺省——首次部署生成符合策略的强随机口令
  // 强随机口令必含 !@#$%^&* 等特殊字符，必须走 escapeEnvValue 加引号：
  // 裸写时 dotenv 把 # 当行内注释，以 # 开头的口令解析为空值 → 后端首次启动
  // 创建管理员失败、进程管理器反复重启；# 在中间的口令被静默截断（用户拿到的 ≠ 实际）
  const adminPasswordRegex = /^INITIAL_ADMIN_PASSWORD=[ \t]*$/m;
  if (adminPasswordRegex.test(content)) {
    content = content.replace(
      adminPasswordRegex,
      `INITIAL_ADMIN_PASSWORD=${escapeEnvValue(generateStrongPassword())}`
    );
    logFn('  ✓ 自动生成 INITIAL_ADMIN_PASSWORD（强随机口令，请妥善保存）');
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(envFile, content, 'utf8');
    logFn(`  ✓ 已填充 ${path.basename(envFile)} 中的空白密钥`);
  }
}

module.exports = {
  generateSecret,
  generateStrongPassword,
  fillEmptySecrets,
};

/**
 * PII 字段级加密存量回填脚本（#417 等保三级 8.1.4.8）
 *
 * 背景：users 表新增 phoneEnc/phoneHmac/emailEnc/emailHmac 四列（双写阶段明文列保留）。
 * 存量行的派生列为空，须回填后才能切换读路径（登录/查重走 HMAC 列）。
 * 本脚本把明文 phone/email 加密写入派生列，并做三重校验：
 *   1. 存在性——phone/email 有值则派生列（Enc/Hmac）必须非空；
 *   2. 解密往返（#426 步骤②）——enc 非空时 decrypt(enc) 须等于明文（防密文损坏/密钥错位）；
 *   3. HMAC 一致性——存储索引须等于归一化明文的 HMAC（防索引与明文脱节）。
 *
 * 密钥错位自动恢复：派生列非空但校验失败（解密往返/HMAC 失配）= 密文是用与
 * 当前 .env 不同的密钥写的（同机多目录部署复用旧库、.env 密钥被重新生成等）。
 * 双写期明文列是事实源，脚本自动用当前密钥从明文重建该行的派生列并复验
 * （旧密文在当前密钥下本就不可解，重建不丢失信息），无需人工干预。
 * 仅当行无明文（派生列无从重建）时才报失败。
 *
 * 幂等 + 断点续传：重复执行只处理"有明文但派生列缺失/失配"的行（已一致行跳过），
 * 中断重跑自动续传剩余行；HMAC 稳定、密文因随机 IV 每次不同但均可解密，不产生脏数据。
 *
 * 为什么是 .js 而非 .ts：离线部署 `pnpm install --offline --prod` 只装生产依赖，
 * devDependencies（含 tsx）不装，离线 runtime Node 20 又不能原生跑 TS。故脚本用 .js，
 * 直接 require dist/ 编译产物（pii-crypto.service.js 是 CommonJS，依赖全是生产依赖），
 * 用 node 运行——node 在离线 runtime 里恒可用。crypto 逻辑单一事实源仍在
 * src/common/pii/pii-crypto.service.ts，本脚本不复制逻辑，只引用其编译产物。
 *
 * 使用方式（在 packages/backend 下）：
 * ```bash
 * # 干跑：只统计与校验，不写库
 * node scripts/pii-backfill.js --dry-run
 * # 正式回填
 * node scripts/pii-backfill.js
 * ```
 *
 * 部署顺序（生产）：先应用 migration（20260831000001）→ 用生产密钥跑本脚本 →
 * 校验通过后再部署切换了读路径的应用代码，避免存量用户登录/查重落空。
 *
 * 依赖 dist/：脚本 require('../dist/common/pii/pii-crypto.service')。部署包自带 dist/；
 * 本地开发若 dist/ 不存在，先 `pnpm --filter backend build`。
 */
'use strict';

const fs = require('fs');
const path = require('path');
// 显式按脚本位置加载 packages/backend/.env（与 cwd 无关）：离线部署链 runCommandWithProgress
// 以仓库根为 cwd 运行本脚本，裸 dotenv/config 会找仓库根的 .env（不存在）→ 环境变量缺失。
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@cloudcad/db');

// 依赖 dist/ 编译产物（离线部署包自带 dist/；本地开发若未构建须先 build）。
// 显式检查并给出清晰指引，避免裸 require 报 "Cannot find module" 难以定位。
const cryptoModulePath = path.join(
  __dirname,
  '..',
  'dist',
  'common',
  'pii',
  'pii-crypto.service.js'
);
if (!fs.existsSync(cryptoModulePath)) {
  console.error(`❌ 找不到 dist 编译产物: ${cryptoModulePath}`);
  console.error(
    '   部署包自带 dist/；本地开发请先执行: pnpm --filter backend build'
  );
  process.exit(1);
}
const {
  resolvePiiKey,
  normalizePhone,
  normalizeEmail,
  encryptPii,
  decryptPii,
  hmacIndex,
} = require('../dist/common/pii/pii-crypto.service');

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 100;

async function main() {
  // 密钥派生与 configuration.ts 完全一致（PII_* 未设置时回退 JWT 密钥）
  const jwtSecret = process.env.JWT_SECRET || 'dev-only-jwt-secret-change-me';
  const jwtRefreshSecret =
    process.env.JWT_REFRESH_SECRET || 'dev-only-jwt-refresh-secret-change-me';
  const encryptionKey = resolvePiiKey(
    process.env.PII_ENCRYPTION_KEY,
    jwtSecret
  );
  const hmacKey = resolvePiiKey(process.env.PII_HMAC_KEY, jwtRefreshSecret);
  console.log(
    `密钥来源: PII_ENCRYPTION_KEY=${process.env.PII_ENCRYPTION_KEY ? 'env' : 'fallback(JWT_SECRET)'}, PII_HMAC_KEY=${
      process.env.PII_HMAC_KEY ? 'env' : 'fallback(JWT_REFRESH_SECRET)'
    }`
  );

  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? '',
  });
  const prisma = new PrismaClient({ adapter });

  try {
    // 快速检测：无待回填行（phone/email 有值但派生列缺失）则跳过加密，但仍执行下方校验。
    // 升级部署已回填时跳过全量 update（脚本幂等），但解密往返/HMAC 校验恒执行（步骤②核心）。
    const missingCount = await prisma.user.count({
      where: {
        OR: [
          { phone: { not: null }, phoneHmac: null },
          { email: { not: null }, emailHmac: null },
        ],
      },
    });
    let phoneFilled = 0;
    let emailFilled = 0;

    if (missingCount === 0) {
      console.log(
        '✅ 无需回填：所有 phone/email 行均已有派生列（enc/hmac），直接执行校验'
      );
    } else {
      console.log(`待回填用户数（派生列缺失）: ${missingCount}`);

      // 断点续传（#426 步骤②）：只读"有明文但派生列缺失"的行——中断重跑时已回填行被跳过，
      // 只处理剩余未回填行，避免全表重复加密（脚本幂等，重复加密无害但浪费）。
      const users = await prisma.user.findMany({
        where: {
          OR: [
            { phone: { not: null }, phoneHmac: null },
            { email: { not: null }, emailHmac: null },
          ],
        },
        select: { id: true, phone: true, email: true },
      });

      for (let i = 0; i < users.length; i += BATCH_SIZE) {
        const batch = users.slice(i, i + BATCH_SIZE);
        if (!DRY_RUN) {
          await prisma.$transaction(
            batch.map((u) => {
              const data = {};
              if (u.phone) {
                data.phoneEnc = encryptPii(u.phone, encryptionKey);
                data.phoneHmac = hmacIndex(normalizePhone(u.phone), hmacKey);
              }
              if (u.email) {
                data.emailEnc = encryptPii(u.email, encryptionKey);
                data.emailHmac = hmacIndex(normalizeEmail(u.email), hmacKey);
              }
              if (Object.keys(data).length === 0) return Promise.resolve();
              return prisma.user.update({ where: { id: u.id }, data });
            })
          );
          process.stdout.write(
            `\r已回填 ${Math.min(i + BATCH_SIZE, users.length)}/${users.length}`
          );
        }
        for (const u of batch) {
          if (u.phone) phoneFilled++;
          if (u.email) emailFilled++;
        }
      }
      if (!DRY_RUN) console.log('\n');
    }

    // 校验 + 自动恢复：phone/email 有值的行，派生列（Enc/Hmac）须一一对应。
    //
    // 密钥错位自动恢复（#426 步骤②扩展）：派生列非空但校验失败（解密往返/HMAC
    // 失配）= 密文是用与当前 .env 不同的密钥写的（同机多目录部署复用旧库、
    // .env 密钥被重新生成等）。双写期明文列是事实源，脚本直接用当前密钥从明文
    // 重建派生列（旧密文在当前密钥下本就不可解，重建不丢失任何信息），重建后
    // 复验。仅当行无明文（派生列无从重建）时才报失败。
    const after = await prisma.user.findMany({
      select: {
        id: true,
        phone: true,
        email: true,
        phoneEnc: true,
        phoneHmac: true,
        emailEnc: true,
        emailHmac: true,
      },
    });

    // 字段有效性：派生列非空 + 解密往返一致 + HMAC 一致
    const phoneValid = (u) =>
      Boolean(u.phoneEnc) &&
      Boolean(u.phoneHmac) &&
      (() => {
        try {
          return decryptPii(u.phoneEnc, encryptionKey) === u.phone;
        } catch {
          return false;
        }
      })() &&
      hmacIndex(normalizePhone(u.phone), hmacKey) === u.phoneHmac;
    const emailValid = (u) =>
      Boolean(u.emailEnc) &&
      Boolean(u.emailHmac) &&
      (() => {
        try {
          return decryptPii(u.emailEnc, encryptionKey) === u.email;
        } catch {
          return false;
        }
      })() &&
      hmacIndex(normalizeEmail(u.email), hmacKey) === u.emailHmac;

    // 需重建的行（有明文但派生列缺失/失配）
    const stalePhone = [];
    const staleEmail = [];
    for (const u of after) {
      if (u.phone && !phoneValid(u)) stalePhone.push(u);
      if (u.email && !emailValid(u)) staleEmail.push(u);
    }

    // 自动重建：用当前密钥从明文重新加密派生列（密钥错位/密文损坏的统一恢复路径）
    if (stalePhone.length > 0 || staleEmail.length > 0) {
      const byId = new Map();
      for (const u of [...stalePhone, ...staleEmail]) {
        byId.set(u.id, { phone: u.phone, email: u.email });
      }
      console.log(
        `⚠️ 检测到 ${byId.size} 行派生列与当前密钥不一致（密钥错位或密文损坏），` +
          `自动从明文列重建: phone=${stalePhone.length}, email=${staleEmail.length}`
      );
      if (!DRY_RUN) {
        const phoneIds = new Set(stalePhone.map((u) => u.id));
        const emailIds = new Set(staleEmail.map((u) => u.id));
        const ids = [...byId.keys()];
        for (let i = 0; i < ids.length; i += BATCH_SIZE) {
          const batch = ids.slice(i, i + BATCH_SIZE);
          await prisma.$transaction(
            batch.map((id) => {
              const src = byId.get(id);
              const data = {};
              if (phoneIds.has(id)) {
                data.phoneEnc = encryptPii(src.phone, encryptionKey);
                data.phoneHmac = hmacIndex(normalizePhone(src.phone), hmacKey);
              }
              if (emailIds.has(id)) {
                data.emailEnc = encryptPii(src.email, encryptionKey);
                data.emailHmac = hmacIndex(normalizeEmail(src.email), hmacKey);
              }
              return prisma.user.update({ where: { id }, data });
            })
          );
        }
      }
    }

    // 复验（重建后重新读取；dry-run 时读的是重建前状态，用于展示待处理量）
    const recheck = await prisma.user.findMany({
      select: {
        phone: true,
        email: true,
        phoneEnc: true,
        phoneHmac: true,
        emailEnc: true,
        emailHmac: true,
      },
    });
    let recheckPhoneBad = 0;
    let recheckEmailBad = 0;
    for (const u of recheck) {
      if (u.phone && !phoneValid(u)) recheckPhoneBad++;
      if (u.email && !emailValid(u)) recheckEmailBad++;
    }
    const totalMismatch = recheckPhoneBad + recheckEmailBad;

    console.log('\n===== 回填结果 =====');
    console.log(`phone 填充: ${phoneFilled}  邮箱填充: ${emailFilled}`);
    if (stalePhone.length > 0 || staleEmail.length > 0) {
      console.log(
        `自动重建: phone=${stalePhone.length} 行, email=${staleEmail.length} 行` +
          (DRY_RUN ? '（dry-run 未写库）' : '（已写库）')
      );
    }
    console.log(
      `复验残留失配: phone=${recheckPhoneBad}, email=${recheckEmailBad}`
    );

    if (DRY_RUN) {
      console.log(
        `\n[dry-run] 未写库。待处理（派生列缺失/失配）: phone=${stalePhone.length}, email=${staleEmail.length}。确认无误后去掉 --dry-run 正式执行。`
      );
    } else if (totalMismatch > 0) {
      console.error(
        '❌ 校验失败：重建后仍存在派生列失配的行（该行无明文可重建，属数据异常）'
      );
      console.error('   请人工排查上述用户行的 phone/email 明文列是否缺失。');
      process.exitCode = 1;
    } else {
      console.log(
        '✅ 回填完成且校验通过：phone/email 与派生列一一对应，解密往返/HMAC 全部一致'
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('回填脚本执行失败:', err);
  process.exit(1);
});

/**
 * PII 明文列下线脚本（#426 步骤⑤ 收缩阶段）
 *
 * 背景：#417 双写阶段明文列 phone/email 保留至收缩阶段。本脚本在**所有用户已转换**
 * （phone/email 有值的行均有 enc/hmac 派生列）+ 读切换代码上线 + 观察期（7–30 天）后，
 * 安全下线明文列。
 *
 * ⚠️ 铁律（#426 五步法）：先建密文→再验密文→再切流量→最后才动明文，顺序绝不能反。
 * 任何时刻保证至少有一份可读正确数据。本脚本**绝不**直接 DELETE 或 UPDATE SET phone/email = NULL：
 *   - 置空用 `[REDACTED]` 占位（优于 NULL：防止应用误判"未填写"触发重新收集逻辑）；
 *   - 置空前先备份明文列（可回滚）；
 *   - DROP COLUMN 是最后一步（观察期后），且需显式 --yes 确认。
 *
 * 独立幂等脚本（手动执行，**不纳入部署自动流程**）：
 * Prisma migration 的 DROP COLUMN 一旦标记 applied 不会重跑，条件式 DROP 在后续部署会失效，
 * 故用独立脚本手动执行（见 #426 决策）。
 *
 * 为什么是 .js 而非 .ts：离线部署 `pnpm install --offline --prod` 只装生产依赖，
 * devDependencies（含 tsx）不装，离线 runtime Node 20 又不能原生跑 TS。故脚本用 .js，
 * 用 node 运行——node 在离线 runtime 里恒可用。
 *
 * 使用方式（在 packages/backend 下，须连生产库）：
 * ```bash
 * # 阶段 1：只读校验——确认所有用户已转换（enc/hmac 完整），不写库
 * node scripts/pii-offline-plaintext.js --phase verify
 *
 * # 阶段 2：备份明文列 + 置空为 [REDACTED]（可回滚：备份表保留）
 * node scripts/pii-offline-plaintext.js --phase backup-redact
 *
 * # 观察期（7–30 天）：确认登录/查重/审计导出无异常
 *
 * # 阶段 3：DROP COLUMN（观察期后，显式 --yes 确认）
 * node scripts/pii-offline-plaintext.js --phase drop-column --yes
 * ```
 *
 * 回滚：阶段 2 备份表 `users_pii_plaintext_backup` 保留置空前的明文，
 * 异常时可 `UPDATE users SET email = backup.email FROM ... WHERE backup.email IS NOT NULL` 恢复。
 */
'use strict';

const path = require('path');
// 显式按脚本位置加载 packages/backend/.env（与 cwd 无关，见 pii-backfill.js 注释）
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@cloudcad/db');

// --phase 的值是紧随其后的独立 argv 元素（--phase verify → argv 含 '--phase' 和 'verify' 两项），
// 须取 --phase 后面的值，而非判断 '--phase verify' 整串（后者恒 false，原 .ts 脚本的 bug）。
const phaseIdx = process.argv.indexOf('--phase');
const PHASE = phaseIdx >= 0 ? (process.argv[phaseIdx + 1] ?? '') : '';
const VALID_PHASES = ['verify', 'backup-redact', 'drop-column'];
const CONFIRMED = process.argv.includes('--yes');
const REDACT = '[REDACTED]';
const BACKUP_TABLE = 'users_pii_plaintext_backup';

async function main() {
  if (!PHASE || !VALID_PHASES.includes(PHASE)) {
    console.error(
      `无效或缺失的 --phase 参数（当前: ${PHASE || '空'}）。可选：verify（只读校验）/ backup-redact（备份+置空）/ drop-column（删列，需 --yes）`
    );
    process.exit(1);
  }

  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? '',
  });
  const prisma = new PrismaClient({ adapter });

  try {
    // 阶段 1：只读校验——所有 phone/email 有值的行必须有 enc/hmac（否则读切换后登录/查重落空）
    const missing = await prisma.user.count({
      where: {
        OR: [
          { phone: { not: null }, phoneHmac: null },
          { email: { not: null }, emailHmac: null },
        ],
      },
    });
    const total = await prisma.user.count();
    console.log(
      `用户总数: ${total}，未转换（有明文但派生列缺失）: ${missing}`
    );
    if (missing > 0) {
      console.error(
        `❌ 校验失败：仍有 ${missing} 行未转换（phone/email 有值但 enc/hmac 缺失）。` +
          '请先运行 scripts/pii-backfill.js 完成回填并校验通过，再执行本脚本。'
      );
      process.exit(1);
    }
    console.log('✅ 校验通过：所有 phone/email 行均已有派生列（enc/hmac）');

    if (PHASE === 'verify') {
      console.log('[verify] 只读校验完成，未写库。可执行 --phase backup-redact 进入置空阶段。');
      return;
    }

    if (PHASE === 'backup-redact') {
      // 阶段 2：备份明文列（幂等：备份表已存在则跳过创建，置空为幂等 UPDATE）
      await prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS ${BACKUP_TABLE} AS
         SELECT id, email, phone FROM users
         WHERE email IS NOT NULL OR phone IS NOT NULL`
      );
      // 置空：仅对仍持有真实明文的行置 [REDACTED]（已置空的行 email=phone='[REDACTED]' 不再匹配）
      const redacted = await prisma.$executeRawUnsafe(
        `UPDATE users
         SET email = ${JSON.stringify(REDACT)},
             phone = ${JSON.stringify(REDACT)}
         WHERE (email IS NOT NULL AND email <> ${JSON.stringify(REDACT)})
            OR (phone IS NOT NULL AND phone <> ${JSON.stringify(REDACT)})`
      );
      console.log(
        `✅ 备份表 ${BACKUP_TABLE} 就绪，置空 [REDACTED] 行数: ${redacted}`
      );
      console.log(
        '⚠️ 已进入观察期（7–30 天）。确认登录/查重/审计导出无异常后，执行 --phase drop-column --yes 删列。'
      );
      return;
    }

    // 阶段 3：DROP COLUMN（观察期后，显式 --yes 确认）
    if (!CONFIRMED) {
      console.error(
        '❌ 阶段 3（drop-column）需显式 --yes 确认。请先完成观察期（7–30 天），再执行 --phase drop-column --yes。'
      );
      process.exit(1);
    }
    // 删列前最后校验：明文列应已全部置空（无真实明文残留）
    const residual = await prisma.user.count({
      where: {
        OR: [
          { email: { not: null, not: REDACT } },
          { phone: { not: null, not: REDACT } },
        ],
      },
    });
    if (residual > 0) {
      console.error(
        `❌ 删列前校验失败：仍有 ${residual} 行明文列未置空（email/phone 非 [REDACTED]）。请先执行 --phase backup-redact。`
      );
      process.exit(1);
    }
    // 删列 + 删唯一索引（email/phone 的 @unique）
    await prisma.$executeRawUnsafe(
      `ALTER TABLE users DROP COLUMN email;
       ALTER TABLE users DROP COLUMN phone;`
    );
    // 同步更新 Prisma schema（移除 email/phone 字段）后，须手动生成 migration 并提交
    console.log(
      `✅ 已删除 users.email / users.phone 列。请同步更新 packages/db/prisma/schema.prisma（移除 email/phone 字段）并生成 migration 提交。备份表 ${BACKUP_TABLE} 保留（可回滚）。`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('明文列下线脚本执行失败:', err);
  process.exit(1);
});

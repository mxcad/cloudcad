/**
 * 数据库密码重置（#417，ADR-0073 带外运维恢复通道）
 *
 * 用途：数据库口令丢失或需要轮换时的运维手段。与 admin:reset-password 同构的
 * 带外恢复通道——不在认证体系内，因此**不索取旧口令**：旧口令只记录在 .env，
 * 能执行本命令的人本来就能读到它，校验它不构成任何边界。
 *
 *   node runtime/scripts/cli.js db:reset-password [--interactive] [--no-restart]
 *
 * 动作：
 *   1. 读 .env 的 DB_USERNAME/DB_HOST/DB_PORT/DB_DATABASE，确定被改密的目标；
 *   2. ALTER USER 改密（用 .env 里的旧口令连接维护库 postgres）；
 *   3. 立刻用**新**口令回连验证——只有验证通过才允许写 .env，否则服务端与
 *      账本永久分叉（DATABASE_URL 优先级高于 DB_PASSWORD，见
 *      database.service.ts）。验证失败时尽力回滚旧口令。
 *   4. 成对更新 .env 的 DB_PASSWORD 与 DATABASE_URL；
 *   5. 刷新 DEPLOY-PASSWORDS.txt 凭据备份（否则该文件从此是错的）；
 *   6. 写 DB_PASSWORD_RESET 审计（resourceType=SYSTEM）；
 *   7. 重启 backend（本进程读 .env 是启动期一次性烘焙，不重启不生效）。
 *
 * 边界（刻意不做，理由见 ADR-0073）：
 * - 不做 pg_hba.conf 硬加固：部署包里的 PG 一律 `initdb -A trust`，服务端不校验
 *   密码，改 pg_hba 会改变整个部署的失败模式，而本命令正是被锁死时执行的那条——
 *   把逃生舱弄坏是最坏的失败模式。本命令做的是「账本一致」：Docker 形态与系统
 *   PG 回退形态下它已经是真门禁，嵌入式形态下它保证 .env 与服务端不漂移。
 * - 审计失败不回滚：数据已改，与 mfa.js / admin-reset-password.js 一致，仅告警。
 */

const { log } = require('../lib/logger');
const { promptConfirm } = require('../lib/prompt');
const { sqlQuote, makePsql } = require('../lib/psql');
const { BACKEND_ENV_PATH } = require('../lib/context');
const { parseEnvFile, updateEnvFile } = require('../lib/env');
const { composeDatabaseUrl } = require('../lib/database-url');
const { runPm2 } = require('../lib/proc');
const { saveCredentialBackup } = require('../lib/credentials');
const { generateStrongPassword } = require('./setup-wizard');
const { getDbEnv, getPsqlPath } = require('./db-backup');
const {
  assertPasswordPolicy,
  resolveMinLength,
  promptInteractivePassword,
  promptNewPassword,
} = require('./admin-reset-password');

// psql 执行 + 审计写入统一走 lib/psql 唯一出口（与 mfa.js / admin-reset-password.js 共用）
const { run: runPsql, writeAudit, auditorId } = makePsql({
  getPsqlPath,
  getDbEnv,
});

/**
 * 组装 DATABASE_URL。委托 lib/database-url 的 composeDatabaseUrl（唯一事实源，
 * 与 setup-wizard / config-service 同口径）：密码 encodeURIComponent，否则含 `#`
 * 的口令会被当成 URL 片段静默截断（历史事故，见 config-updater 注释）。
 * @returns {string}
 */
function buildDatabaseUrl(dbUser, password, dbHost, dbPort, dbName) {
  return composeDatabaseUrl({
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password,
    dbName,
  });
}

/**
 * 判定「用新口令回连验证」是否通过。psql -tAc "SELECT 1" 成功时输出恰为 '1'，
 * 任何异常都落在 stderr——两者都要认，不能只看 status。
 * @param {{ok?: boolean, stdout?: string}} result
 * @returns {boolean}
 */
function isConnectVerified(result) {
  return Boolean(result && result.ok && result.stdout === '1');
}

/**
 * 重置数据库密码。
 * @param {{
 *   interactive?: boolean,
 *   confirmed?: boolean,
 *   password?: string,
 *   restart?: boolean,
 * }} [options] 非交互调用（运维中心 ADR-0071）：confirmed=true 跳过确认提问；
 *   password 指定新口令；restart=false 跳过 backend 重启（默认重启）。
 * @param {object} [deps] 可注入的 IO 缝（测试用）：envPath/parseEnv/updateEnv/
 *   run/writeAudit/auditorId/backup/restart/generatePassword/resolveMinLength。
 * @returns {Promise<{ok: boolean, message: string, password?: string}>}
 */
async function dbResetPassword(options = null, deps = {}) {
  const {
    envPath = BACKEND_ENV_PATH,
    parseEnv = parseEnvFile,
    updateEnv = updateEnvFile,
    run = runPsql,
    audit = writeAudit,
    getAuditor = auditorId,
    backup = saveCredentialBackup,
    restart = runPm2,
    generatePassword = generateStrongPassword,
    resolveLimit = resolveMinLength,
  } = deps;

  // 1. 被改密的目标（来自 .env；这是本命令与「重置某个用户口令」的本质区别）
  let envConfig;
  try {
    envConfig = parseEnv(envPath);
  } catch (err) {
    const message = `无法读取 ${envPath}：${err.message}`;
    log('red', message);
    return { ok: false, message };
  }
  const dbHost = envConfig.DB_HOST || 'localhost';
  const dbPort = envConfig.DB_PORT || '5432';
  const dbUser = envConfig.DB_USERNAME || 'postgres';
  const dbName = envConfig.DB_DATABASE || 'cloudcad';
  const oldPassword = envConfig.DB_PASSWORD || '';

  log('cyan', `目标：${dbUser}@${dbHost}:${dbPort}/${dbName}`);

  // 2. 确定新口令（默认自动生成；interactive 走掩码交互，二次确认内部完成）
  const minLength = resolveLimit();
  let newPassword;
  if (options?.password) {
    newPassword = options.password;
  } else if (options?.interactive) {
    newPassword = (
      await promptInteractivePassword(
        '数据库',
        minLength,
        () => promptNewPassword('数据库')
      )
    ).password;
  } else {
    newPassword = generatePassword();
  }
  const errors = assertPasswordPolicy(newPassword, minLength);
  if (errors.length) {
    const message = `密码不符合策略：${errors.join('；')}`;
    log('red', message);
    return { ok: false, message };
  }
  if (newPassword === oldPassword) {
    const message = '新密码与当前密码相同，已取消';
    log('red', message);
    return { ok: false, message };
  }

  // 3. 确认（高危操作：改数据库口令，失败可能让后端失联）
  let confirmed = options?.confirmed === true;
  if (!confirmed) {
    console.log('');
    console.log('此操作会重启后端服务。');
    confirmed = await promptConfirm(
      `确认重置数据库密码？改密后将以新密码回连验证，验证通过才更新 .env（yes/no）：`
    );
  }
  if (!confirmed) {
    log('yellow', '已取消');
    return { ok: false, message: '已取消' };
  }

  // 4. ALTER USER（维护库 postgres + 旧口令连接）
  const alter = run(
    `ALTER USER "${dbUser.replace(/"/g, '""')}" WITH PASSWORD '${sqlQuote(newPassword)}'`,
    { database: 'postgres' }
  );
  if (!alter.ok) {
    const message = `改密失败（服务端未变更）：${alter.stderr || alter.stdout}`;
    log('red', message);
    return { ok: false, message };
  }

  // 5. 用新口令回连验证——这是「服务端与账本不漂移」的唯一保证
  const verify = run(`SELECT 1`, { database: dbName, password: newPassword });
  if (!isConnectVerified(verify)) {
    // ALTER 已生效、.env 仍是旧值：服务端与账本已分叉。尽力用旧口令回滚。
    const rollback = oldPassword
      ? run(
          `ALTER USER "${dbUser.replace(/"/g, '""')}" WITH PASSWORD '${sqlQuote(
            oldPassword
          )}'`,
          { database: 'postgres' }
        )
      : { ok: false, stderr: '旧密码为空，无法回滚' };
    log('red', `新密码回连验证失败：${verify.stderr || verify.stdout}`);
    log(
      rollback.ok ? 'green' : 'red',
      rollback.ok
        ? '  已回滚为旧密码，系统恢复原状'
        : `  回滚失败：${rollback.stderr || rollback.stdout}`
    );
    const message =
      `新密码回连验证失败：${verify.stderr || verify.stdout}` +
      (rollback.ok
        ? '；已回滚旧密码，请检查 PostgreSQL 认证方式'
        : '；回滚失败，服务端密码已变更但 .env 未更新');
    return { ok: false, message };
  }

  // 6. 成对更新 .env：DATABASE_URL 优先级高于 DB_PASSWORD，只改后者 Prisma 继续拿旧口令
  const updates = {
    DB_PASSWORD: newPassword,
    DATABASE_URL: buildDatabaseUrl(dbUser, newPassword, dbHost, dbPort, dbName),
  };
  updateEnv(envPath, updates);
  log('green', `已更新 .env：${envPath}`);

  // 7. 刷新凭据备份（否则 DEPLOY-PASSWORDS.txt 从此是错的）
  try {
    backup(updates, envConfig);
  } catch (err) {
    log('yellow', `凭据备份写入失败（不影响重置结果）：${err.message}`);
  }

  // 8. 审计（resourceType=SYSTEM；失败不回滚，仅告警）
  const aud = getAuditor();
  let auditNote = '';
  if (!aud) {
    auditNote = '，但审计跳过：系统中没有管理员账号可作归属';
  } else {
    const ins = audit({
      action: 'DB_PASSWORD_RESET',
      resourceId: 'postgresql',
      resourceName: `${dbUser}@${dbHost}`,
      userId: aud,
      resourceType: 'SYSTEM',
      params: {
        method: 'db_password_reset',
        source: options?.source || 'ops_cli',
        host: dbHost,
        port: dbPort,
        database: dbName,
        verified: true,
      },
      userAgent: options?.userAgent || 'cloudcad-cli/db-reset-password',
    });
    auditNote = ins.ok ? '' : `，但审计写入失败：${ins.stderr}`;
  }

  // 9. 重启 backend（.env 是启动期一次性烘焙，不重启不生效）
  let restartNote = '';
  if (options?.restart === false) {
    restartNote = '，未重启 backend（需手动重启才生效）';
  } else {
    const ok = restart(['restart', 'backend']);
    restartNote = ok ? '' : '，但 backend 重启失败（请手动重启）';
  }

  log('green', '已重置数据库密码（新密码回连验证通过）');
  console.log('');
  console.log(`  新密码：${newPassword}`);
  console.log('  ⚠ 密码只在本次终端显示一次，请立即记录并妥善保管。\n');

  return {
    ok: true,
    message: `已重置数据库密码${restartNote}${auditNote}`,
    password: newPassword,
  };
}

module.exports = {
  dbResetPassword,
  buildDatabaseUrl,
  isConnectVerified,
};

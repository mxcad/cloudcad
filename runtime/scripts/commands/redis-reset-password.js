/**
 * Redis 密码重置（#417，ADR-0073 带外运维恢复通道）
 *
 * 用途：Redis requirepass 丢失或需要轮换时的运维手段。与 db:reset-password 同构，
 * **不索取旧口令**：旧口令只记录在 .env，能执行本命令的人本来就能读到它。
 *
 *   node runtime/scripts/cli.js redis:reset-password [--interactive] [--no-restart]
 *
 * 动作：
 *   1. 前置检查实例在线（改一个不存在的实例只会让 .env 与服务端分叉）；
 *   2. 用裸 RESP 就地 `CONFIG SET requirepass`——不停机、不动数据、不用 redis-cli，
 *      故密码不会出现在进程列表（redis-cli -a 会把密码暴露在 ps 里）；
 *   3. 立刻用**新**口令 AUTH 回连验证——只有验证通过才允许写 .env；
 *   4. 更新 .env 的 REDIS_PASSWORD（单一事实源）；
 *   5. CONFIG REWRITE 持久化（系统安装的 redis 重启后会回到旧值）；
 *   6. 写 REDIS_PASSWORD_RESET 审计（resourceType=SYSTEM）；
 *   7. 按 redis → backend → conversion 顺序重启（只重启确实注册过的 app）。
 *
 * 边界（刻意不做，理由见 ADR-0073）：
 * - 不写 data/redis/cloudcad-redis-auth.conf：redis-manager 每次拉起都会按 .env
 *   重写它，改 .env + 重启 redis 已覆盖，直接改文件反而会制造第二份事实源。
 * - 不重启 config-service / frontend：前者禁止自重启且其 Redis 探测不带 AUTH，
 *   后者不连 Redis。cooperate 不连 Redis（HTTP 代理到 COOPERATE_URL）。
 * - 不设空密码：后端对 REDIS_PASSWORD 是生产 fail-fast，设空会让后端起不来。
 * - 审计失败不回滚：数据已改，与其他恢复通道一致，仅告警。
 */

const { log } = require('../lib/logger');
const { promptConfirm } = require('../lib/prompt');
const { makePsql } = require('../lib/psql');
const { BACKEND_ENV_PATH, PORTS } = require('../lib/context');
const { parseEnvFile, updateEnvFile } = require('../lib/env');
const { runPm2, getPm2AppStatus } = require('../lib/proc');
const { isPortOpen } = require('../lib/health');
const { generateStrongPassword } = require('./setup-wizard');
const { getDbEnv, getPsqlPath } = require('./db-backup');
const {
  assertPasswordPolicy,
  resolveMinLength,
  promptInteractivePassword,
  promptNewPassword,
} = require('./admin-reset-password');
const {
  loadRedisHost,
  probeRedisAuth,
  setRedisPasswordAtRuntime,
  persistRedisConfig,
} = require('../lib/redis-takeover');

// 审计写入统一走 lib/psql 唯一出口（与 mfa.js / admin-reset-password.js 共用）
const { writeAudit, auditorId } = makePsql({ getPsqlPath, getDbEnv });

/**
 * 按序重启，跳过未注册的 PM2 app（未注册返回 'unknown'，重启只会白报错）。
 * @param {string[]} names
 * @param {(name: string) => string} [statusOf] 注入状态查询（测试用）
 * @param {(args: string[]) => boolean} [restart] 注入重启动作（测试用）
 * @returns {{done: string[], failed: string[], skipped: string[]}}
 */
function restartRegistered(names, statusOf = getPm2AppStatus, restart = runPm2) {
  const done = [];
  const failed = [];
  const skipped = [];
  for (const name of names) {
    if (statusOf(name) === 'unknown') {
      skipped.push(name);
      continue;
    }
    (restart(['restart', name]) ? done : failed).push(name);
  }
  return { done, failed, skipped };
}

/**
 * 重置 Redis requirepass。
 * @param {{
 *   interactive?: boolean,
 *   confirmed?: boolean,
 *   password?: string,
 *   restart?: boolean,
 * }} [options] 非交互调用（运维中心 ADR-0071）：confirmed=true 跳过确认提问；
 *   password 指定新口令；restart=false 跳过重启（默认重启）。
 * @param {object} [deps] 可注入的 IO 缝（测试用）：envPath/parseEnv/updateEnv/
 *   audit/auditorId/isPortOpen/probe/setPassword/persist/restartRegistered/
 *   generatePassword/resolveLimit。
 * @returns {Promise<{ok: boolean, message: string, password?: string}>}
 */
async function redisResetPassword(options = null, deps = {}) {
  const {
    envPath = BACKEND_ENV_PATH,
    parseEnv = parseEnvFile,
    updateEnv = updateEnvFile,
    audit = writeAudit,
    getAuditor = auditorId,
    portOpen = isPortOpen,
    probe = probeRedisAuth,
    setPassword = setRedisPasswordAtRuntime,
    persist = persistRedisConfig,
    doRestart = restartRegistered,
    generatePassword = generateStrongPassword,
    resolveLimit = resolveMinLength,
  } = deps;

  // 1. 目标（来自 .env）
  let envConfig;
  try {
    envConfig = parseEnv(envPath);
  } catch (err) {
    const message = `无法读取 ${envPath}：${err.message}`;
    log('red', message);
    return { ok: false, message };
  }
  const host =
    envConfig.REDIS_HOST || loadRedisHost(envPath) || '127.0.0.1';
  const port = envConfig.REDIS_PORT || String(PORTS.redis || 6379);
  const oldPassword = envConfig.REDIS_PASSWORD || '';

  log('cyan', `目标：${host}:${port}`);

  // 2. 前置：实例必须在线。改一个不存在的实例只会让 .env 与服务端分叉。
  if (!(await portOpen(port, host))) {
    const message = `Redis 未监听 ${host}:${port}，请先启动 Redis 服务`;
    log('red', message);
    return { ok: false, message };
  }

  // 3. 确定新口令（默认自动生成；interactive 走掩码交互，二次确认内部完成）
  const minLength = resolveLimit();
  let newPassword;
  if (options?.password) {
    newPassword = options.password;
  } else if (options?.interactive) {
    newPassword = (
      await promptInteractivePassword(
        'Redis',
        minLength,
        () => promptNewPassword('Redis')
      )
    ).password;
  } else {
    newPassword = generatePassword();
  }
  if (!newPassword) {
    const message = '密码不能为空：后端对 REDIS_PASSWORD 是生产 fail-fast，设空会让后端起不来';
    log('red', message);
    return { ok: false, message };
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

  // 4. 确认（高危操作：改 Redis 口令，失败可能让后端失联）
  let confirmed = options?.confirmed === true;
  if (!confirmed) {
    console.log('');
    console.log('此操作会重启 Redis 与后端服务。');
    confirmed = await promptConfirm(
      `确认重置 Redis 密码？改密后将以新密码 AUTH 验证，验证通过才更新 .env（yes/no）：`
    );
  }
  if (!confirmed) {
    log('yellow', '已取消');
    return { ok: false, message: '已取消' };
  }

  // 5. 就地改密（不停机；已有连接不受影响）
  const setRes = await setPassword(host, port, newPassword);
  if (!setRes.ok) {
    // 回读旧口令，判断是不是「当前密码已经不一致」这种预存问题
    const state = await probe(host, port, oldPassword);
    const hint =
      state.state === 'ok'
        ? '（旧密码仍有效，改密命令被实例拒绝）'
        : `（旧密码验证：${state.state}——实例当前密码可能已与此前不同）`;
    const message = `Redis 改密失败：${setRes.reason || '未知原因'}${hint}`;
    log('red', message);
    return { ok: false, message };
  }

  // 6. 用新口令 AUTH 回连验证——这是「服务端与账本不漂移」的唯一保证
  const probeRes = await probe(host, port, newPassword);
  if (probeRes.state !== 'ok') {
    log('red', `新密码 AUTH 验证失败：${probeRes.state}`);
    return {
      ok: false,
      message: `新密码验证失败：${probeRes.state}；服务端密码已变更但 .env 未更新`,
    };
  }

  // 7. 更新 .env（单一事实源）
  updateEnv(envPath, { REDIS_PASSWORD: newPassword });
  log('green', `已更新 .env：${envPath}`);

  // 8. 持久化：系统安装的 redis 重启后会回到旧值。失败不算错——
  //    redis-manager 每次拉起都会按 .env 重写 auth conf，下一轮重启自愈。
  const persistRes = await persist(host, port, newPassword);
  if (!persistRes.ok) {
    log(
      'yellow',
      `配置未持久化（${persistRes.reason || '未知原因'}），下次重启将按 .env 重新注入`
    );
  }

  // 9. 审计（resourceType=SYSTEM；失败不回滚，仅告警）
  const aud = getAuditor();
  let auditNote = '';
  if (!aud) {
    auditNote = '，但审计跳过：系统中没有管理员账号可作归属';
  } else {
    const ins = audit({
      action: 'REDIS_PASSWORD_RESET',
      resourceId: 'redis',
      resourceName: `${host}:${port}`,
      userId: aud,
      resourceType: 'SYSTEM',
      params: {
        method: 'redis_password_reset',
        source: options?.source || 'ops_cli',
        host,
        port,
        verified: true,
        persisted: Boolean(persistRes.ok),
      },
      userAgent: options?.userAgent || 'cloudcad-cli/redis-reset-password',
    });
    auditNote = ins.ok ? '' : `，但审计写入失败：${ins.stderr}`;
  }

  // 10. 重启（redis → backend → conversion；只重启注册过的 app）
  let restartNote = '';
  if (options?.restart === false) {
    restartNote = '，未重启服务（需手动重启才生效）';
  } else {
    const { done, failed } = doRestart(['redis', 'backend', 'conversion']);
    if (failed.length) {
      log('yellow', `以下服务重启失败，请手动重启：${failed.join('、')}`);
    }
    restartNote = failed.length
      ? `，已重启 ${done.join('、')}，${failed.join('、')} 重启失败`
      : `，已重启 ${done.join('、') || '无注册服务'}`;
  }

  log('green', '已重置 Redis 密码（新密码 AUTH 验证通过）');
  console.log('');
  console.log(`  新密码：${newPassword}`);
  console.log('  ⚠ 密码只在本次终端显示一次，请立即记录并妥善保管。\n');

  return {
    ok: true,
    message: `已重置 Redis 密码${restartNote}${auditNote}`,
    password: newPassword,
  };
}

module.exports = {
  redisResetPassword,
  restartRegistered,
};

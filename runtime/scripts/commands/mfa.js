/**
 * 管理员 TOTP 双因素解绑（#415 等保 8.1.4.1(d) 恢复通道）
 *
 * 用途：管理员丢失 TOTP 验证器（换设备 / 卸载 App / 离职）后无法登录后台时的
 * 运维恢复手段。无后端 UI 入口，仅走此命令（一次性、留痕）：
 *
 *   node runtime/scripts/cli.js mfa:totp-unbind <username>
 *
 * 动作：
 *   1. 校验目标用户存在、角色为 ADMIN、且已启用 TOTP（totpEnabled=true）；
 *   2. UPDATE users SET totpSecret=NULL, totpEnabled=false（解绑，下次登录需重新绑定）；
 *   3. 写入 MFA_UNBIND 审计（audit_logs，params.source=ops_cli，便于安全回溯）。
 *
 * 说明：解绑后该管理员下次登录将回到「未绑定」态，被锁定至绑定页重新绑定。
 */

const readline = require('readline');
const { log } = require('../lib/logger');
const { promptConfirm } = require('../lib/prompt');
const { sqlQuote, makePsql } = require('../lib/psql');
const { getDbEnv, getPsqlPath } = require('./db-backup');

// psql 执行 + 审计写入统一走 lib/psql 唯一出口（与 admin-reset-password 共用）
const { run: runPsql, writeAudit } = makePsql({ getPsqlPath, getDbEnv });

/** 交互输入用户名（CLI 未传参时） */
function promptUsername() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question('请输入要解绑 TOTP 的管理员用户名：', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * 解绑指定管理员的 TOTP 双因素并写入 MFA_UNBIND 审计。
 * @param {string} [usernameArg] CLI 传入的用户名；缺省时交互输入。
 * @param {{confirmed?: boolean}} [options] 非交互调用（运维中心 ADR-0071）：
 *   confirmed=true 跳过确认提问（网页侧已做双重确认）。
 * @returns {{ok: boolean, message: string}} 结果与面向用户的消息
 */
async function mfaTotpUnbind(usernameArg, options = null) {
  let username = (usernameArg || '').trim();
  if (!username) {
    if (options) {
      return { ok: false, message: '未提供用户名' };
    }
    username = await promptUsername();
  }
  if (!username) {
    log('red', '未提供用户名，已取消');
    return { ok: false, message: '未提供用户名' };
  }

  log('yellow', `准备解绑 TOTP 双因素：${username}`);

  // 1. 查询目标用户（存在 + 角色 + 当前 TOTP 状态）
  let user;
  try {
    const q = runPsql(
      `SELECT u."id", u."username", r."name", u."totpEnabled" FROM "users" u ` +
        `LEFT JOIN "roles" r ON u."roleId" = r."id" ` +
        `WHERE u."username" = '${sqlQuote(username)}'`
    );
    if (!q.ok) {
      log('red', `查询失败：${q.stderr}`);
      return { ok: false, message: `查询失败：${q.stderr}` };
    }
    if (!q.stdout) {
      log('red', `用户不存在：${username}`);
      return { ok: false, message: `用户不存在：${username}` };
    }
    const [id, uname, role, totpEnabled] = q.stdout.split('|');
    user = { id, username: uname, role, totpEnabled: totpEnabled === 't' };
  } catch (err) {
    log('red', `查询失败：${err.message}`);
    return { ok: false, message: `查询失败：${err.message}` };
  }

  if (user.role !== 'ADMIN') {
    log(
      'red',
      `目标用户角色为 ${user.role || '未知'}（非 ADMIN），禁止解绑 TOTP`
    );
    return {
      ok: false,
      message: `目标用户角色为 ${user.role || '未知'}（非 ADMIN），禁止解绑`,
    };
  }
  if (!user.totpEnabled) {
    log('yellow', `该管理员未启用 TOTP（totpEnabled=false），无需解绑`);
    return { ok: false, message: '该管理员未启用 TOTP，无需解绑' };
  }

  // 2. 确认（高危操作：解除管理员双因素）
  let confirmed = options?.confirmed === true;
  if (!confirmed) {
    confirmed = await promptConfirm(
      `确认解除管理员 ${user.username} 的 TOTP 双因素？此操作立即生效（yes/no）：`
    );
  }
  if (!confirmed) {
    log('yellow', '已取消');
    return { ok: false, message: '已取消' };
  }

  // 3. 解绑：清空密文 + 置未启用
  const upd = runPsql(
    `UPDATE "users" SET "totpSecret" = NULL, "totpEnabled" = false WHERE "id" = '${sqlQuote(
      user.id
    )}'`
  );
  if (!upd.ok || !/UPDATE 1/.test(upd.stdout)) {
    log('red', `解绑失败：${upd.stderr || upd.stdout || '未更新任何行'}`);
    return {
      ok: false,
      message: `解绑失败：${upd.stderr || upd.stdout || '未更新任何行'}`,
    };
  }

  // 4. 写入 MFA_UNBIND 审计（source=ops_cli，便于安全回溯）
  const ins = writeAudit({
    action: 'MFA_UNBIND',
    resourceId: user.id,
    resourceName: user.username,
    params: { method: 'mfa_unbind', source: 'ops_cli' },
    userAgent: 'cloudcad-cli/mfa-unbind',
  });
  if (!ins.ok) {
    // 解绑已生效，审计失败不应回滚（数据已改），仅告警
    log('yellow', `解绑已生效，但审计写入失败：${ins.stderr}`);
    return {
      ok: true,
      message: `已解除 TOTP，但审计写入失败：${ins.stderr}`,
    };
  }

  log('green', `已解除管理员 ${user.username} 的 TOTP 双因素（MFA_UNBIND 审计已写入）`);
  return {
    ok: true,
    message: `已解除管理员 ${user.username} 的 TOTP 双因素`,
  };
}

module.exports = { mfaTotpUnbind };

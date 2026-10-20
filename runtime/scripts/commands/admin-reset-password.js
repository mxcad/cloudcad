/**
 * 重置管理员密码（#417 运维恢复通道，ADR-0072）
 *
 * 为什么必须走带外：管理员登录唯一入口 POST /admin/auth/login 走 ADMIN 角色 + IP
 * 白名单校验，普通 /auth/login 对 ADMIN 恒返 401（对称防御），admin 命名空间下
 * 没有任何找回/重置端点，INITIAL_ADMIN_PASSWORD 仅在 user.count()===0 时读一次
 * （运行期零读取点）。忘后即永久失去登录能力——恢复通道只能落在认证体系之外，
 * 凭据是「能连上部署机 + 有 shell 权限」，与 mfa.js 同属一类恢复通道。
 *
 * 用法：
 *   node runtime/scripts/cli.js admin:reset-password [<username>] [--interactive]
 *                                                    [--also-unbind-totp]
 * 动作：
 *   1. 定位目标管理员（缺省参数时列出全部 ADMIN 供选择——管理员可以有多个，
 *      且客户往往连用户名都记不全）；
 *   2. 新口令默认生成强随机（16 位四类全覆盖，不落地不落 shell history），
 *      --interactive 改为终端掩码输入二次确认；两者都断言与后端同口径的口令策略；
 *   3. bcrypt 哈希（cost 12，与后端 password.service 的 bcrypt.hash(p, 12) 一致）
 *      写入 users.password，并置 passwordChangedAt=now()（不再视为「首登未改密」）；
 *   4. 同一事务内 DELETE refresh_tokens（对齐 resetPassword 语义：重置密码 =
 *      全量撤销既有会话，旧 refresh token 最长 7 天，不清则泄漏场景下仍有效）；
 *   5. 写入 ADMIN_PASSWORD_RESET 审计（params.source=ops_cli，便于安全回溯）。
 *
 * 取舍（改动前请读）：
 * - 不做 Redis session 清理：session value 里才是 userId，按用户清理需 SCAN + 逐条
 *   反序列化，而 runtime 脚本刻意零外部依赖（无 redis client）。真实恢复场景里被锁
 *   死的管理员根本没有 session；access token 最多 1h 自然过期，refresh 已清空无法续
 *   期，暴露窗口 ≤1h，与 mfa.js 解绑行为一致。
 * - 不校验弱口令黑名单：黑名单在 backend 的 TS 模块里（runtime 无法解析），且它只在
 *   设置口令入口生效、不影响登录；生成器产出 16 位四类随机口令，命中概率可忽略。
 * - 审计失败不回滚：数据已改，与 mfa.js 一致，仅告警。
 */

const path = require('path');
const readline = require('readline');

const { log } = require('../lib/logger');
const { promptConfirm, promptPasswordWithConfirm } = require('../lib/prompt');
const { sqlQuote, makePsql } = require('../lib/psql');
const { PROJECT_ROOT } = require('../lib/context');
const { parseEnvFile } = require('../lib/env');
const { generateStrongPassword } = require('./setup-wizard');
const { getDbEnv, getPsqlPath, getEnvPath, getDockerExec } = require('./db-backup');

// psql 执行 + 审计写入统一走 lib/psql 唯一出口（与 mfa.js 共用）；
// docker 形态经 dockerExec 在 cloudcad-pg 容器内执行（#442）
const { run: runPsql, writeAudit } = makePsql({
  getPsqlPath,
  getDbEnv,
  dockerExec: getDockerExec,
});

/** bcrypt 成本因子，与后端 password.service.ts 的 bcrypt.hash(p, 12) 保持一致 */
const BCRYPT_COST = 12;

/** bcryptjs 可能的两个位置：pnpm（backend 自有 node_modules）与 npm 扁平化（仓库根） */
const BCRYPTJS_CANDIDATES = [
  path.join(PROJECT_ROOT, 'packages', 'backend', 'node_modules', 'bcryptjs'),
  path.join(PROJECT_ROOT, 'node_modules', 'bcryptjs'),
];

/**
 * 断言口令策略，与后端 password-policy.service.assertPasswordPolicy 同口径：
 * 长度下限（默认 10，可被 env PASSWORD_POLICY_MIN_LENGTH 抬高）+ 四类至少三类。
 * @param {string} password 待校验口令
 * @param {number} minLength 长度下限
 * @returns {string[]} 不满足的原因列表；空数组表示通过
 */
function assertPasswordPolicy(password, minLength) {
  const errors = [];
  if (!password || password.length < minLength) {
    errors.push(`长度至少 ${minLength} 位`);
  }
  const categories = [
    /[a-z]/.test(password || ''),
    /[A-Z]/.test(password || ''),
    /\d/.test(password || ''),
    /[^a-zA-Z0-9]/.test(password || ''),
  ].filter(Boolean).length;
  if (categories < 3) {
    errors.push('需包含大小写字母、数字、特殊字符中至少三类');
  }
  return errors;
}

/**
 * 读取后端配置里的口令长度下限，缺省 10（与后端默认一致）。
 * 低于 8 的取值一律回退默认——那种配置本身就不安全，不应被运维通道采纳。
 * @param {{PASSWORD_POLICY_MIN_LENGTH?: string}} [envConfig] 注入 .env 解析结果（测试用）
 */
function resolveMinLength(envConfig = null) {
  if (!envConfig) {
    try {
      // .env 路径走 getEnvPath（docker 形态 = 部署根 .env，#442）
      envConfig = parseEnvFile(getEnvPath());
    } catch (_) {
      // .env 缺失或不可读时回退后端默认
      envConfig = {};
    }
  }
  const raw = parseInt(envConfig.PASSWORD_POLICY_MIN_LENGTH, 10);
  return Number.isFinite(raw) && raw >= 8 ? raw : 10;
}

/**
 * 加载 bcryptjs（纯 JS，无原生编译依赖）。任一候选路径不可用即抛错——
 * 没有它就无法生成后端可校验的哈希，硬失败比写出登录不上的口令安全。
 */
function loadBcrypt() {
  for (const candidate of BCRYPTJS_CANDIDATES) {
    try {
      return require(candidate);
    } catch (_) {
      // 继续下一个候选布局
    }
  }
  throw new Error(
    `无法加载 bcryptjs（已尝试 ${BCRYPTJS_CANDIDATES.join('、')}），` +
      '后端依赖未安装，无法生成口令哈希'
  );
}

/** 用后端同款算法与成本因子计算哈希 */
function hashPassword(plain) {
  return loadBcrypt().hashSync(plain, BCRYPT_COST);
}

/**
 * 解析管理员候选列表的 psql 输出（每行 id|username|totpEnabled|status）。
 * @param {string} stdout psql -tA 原始输出
 * @returns {Array<{id: string, username: string, totpEnabled: boolean, status: string}>}
 */
function parseAdminList(stdout) {
  if (!stdout) return [];
  return stdout
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const [id, username, totpEnabled, status] = line.split('|');
      return {
        id,
        username,
        totpEnabled: totpEnabled === 't',
        status: status || '',
      };
    });
}

/** 查询某用户名对应的 ADMIN 角色用户（与 queryAdminCandidates 同一角色口径） */
function queryAdminByUsername(username) {
  try {
    const q = runPsql(
      `SELECT u."id", u."username", u."totpEnabled", u."status" FROM "users" u ` +
        `JOIN "roles" r ON u."roleId" = r."id" ` +
        `WHERE r."name" = 'ADMIN' AND u."username" = '${sqlQuote(username)}'`
    );
    return q.ok
      ? { ok: true, admins: parseAdminList(q.stdout) }
      : { ok: false, message: `查询失败：${q.stderr}` };
  } catch (err) {
    return { ok: false, message: `查询失败：${err.message}` };
  }
}

/** 查询全部 ADMIN 角色用户（缺省参数时的候选列表） */
function queryAdminCandidates() {
  try {
    const q = runPsql(
      `SELECT u."id", u."username", u."totpEnabled", u."status" FROM "users" u ` +
        `JOIN "roles" r ON u."roleId" = r."id" ` +
        `WHERE r."name" = 'ADMIN' ORDER BY u."username"`
    );
    return q.ok
      ? { ok: true, admins: parseAdminList(q.stdout) }
      : { ok: false, message: `查询失败：${q.stderr}` };
  } catch (err) {
    return { ok: false, message: `查询失败：${err.message}` };
  }
}

/** 交互式选择管理员（缺省参数且存在多个 ADMIN 时） */
function promptAdminChoice(admins) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  admins.forEach((admin, index) => {
    const totp = admin.totpEnabled ? '，TOTP 已启用' : '';
    console.log(
      `  ${index + 1}. ${admin.username}（状态: ${admin.status}${totp}）`
    );
  });
  const question = `输入编号或用户名：`;
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const text = answer.trim();
      const byIndex = admins[parseInt(text, 10) - 1];
      if (byIndex) {
        resolve(byIndex.username);
        return;
      }
      const byName = admins.find((admin) => admin.username === text);
      resolve(byName ? byName.username : '');
    });
  });
}

/**
 * 交互式输入新口令（掩码 + 二次确认，复用 lib/prompt 唯一出口）。
 * 空白输入返回 null（由调用方回退到自动生成）；两次输入不一致时由
 * promptPasswordWithConfirm 内部重问，绝不返回空串——避免把「确认失败」
 * 误当成「自动生成」而静默采用一个操作员没设定的口令。
 * @returns {Promise<string|null>} 确认一致的口令，或 null（空白=自动生成）
 */
async function promptNewPassword(subject = '管理员') {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return await promptPasswordWithConfirm(
      rl,
      `输入新${subject}密码`,
      '[空白=自动生成强随机]'
    );
  } finally {
    rl.close();
  }
}

/**
 * 交互模式下确定新口令：空白（prompter 返回 null/空）自动生成强随机，
 * 掩码输入由 prompter 内部完成二次确认，不满足策略则重输（Ctrl+C 抛出即中止）。
 * 契约：prompter 只返回「确认一致的口令」或 null（空白）——二次输入不一致由
 * prompter 内部重问，绝不以空串形式外泄，故本循环不会把「确认失败」误当「自动生成」。
 * @param {string} subject 被重置对象的展示名（如 `管理员 admin` / `数据库` / `Redis`）
 * @param {number} minLength
 * @param {Function} [prompter] 口令输入函数（测试注入用）
 * @returns {Promise<{ok: true, password: string}>}
 */
async function promptInteractivePassword(
  subject,
  minLength,
  prompter = promptNewPassword
) {
  console.log('');
  console.log(
    `即将重置${subject}的密码（当前策略：≥${minLength} 位，` +
      '大小写/数字/特殊字符至少三类'
  );
  for (;;) {
    const entered = await prompter();
    if (!entered) {
      const generated = generateStrongPassword();
      console.log('  → 已自动生成强随机口令');
      return { ok: true, password: generated };
    }
    const errors = assertPasswordPolicy(entered, minLength);
    if (!errors.length) {
      return { ok: true, password: entered };
    }
    console.log(`  ✗ 不符合策略：${errors.join('；')}，请重新输入`);
  }
}

/**
 * 定位重置目标：给用户名则精确校验存在，缺省则列出全部 ADMIN 供选择。
 * 失败时 ok=false + message（查询失败与「查得到但为空」是两种不同故障，必须区分）。
 * @param {string} [usernameArg]
 * @param {object} [options] 仅 `nonInteractive` 生效：非交互调用方（未来运维中心）
 *   无法弹候选列表，未给用户名时拒绝执行。CLI 恒为交互，不置该标记，故
 *   `--interactive` 不带用户名时仍可走候选列表——不与「交互式输口令」语义纠缠。
 * @returns {Promise<{ok: false, message: string}|{ok: true, username: string, target: object}>}
 */
async function resolveTargetAdmin(usernameArg, options) {
  const username = (usernameArg || '').trim();

  if (username) {
    const result = queryAdminByUsername(username);
    if (!result.ok) return result;
    if (!result.admins.length) {
      return { ok: false, message: `用户不存在或不是管理员：${username}` };
    }
    return { ok: true, username, target: result.admins[0] };
  }

  const result = queryAdminCandidates();
  if (!result.ok) return result;
  if (!result.admins.length) {
    return { ok: false, message: '系统中没有任何管理员账号' };
  }
  if (options?.nonInteractive) {
    return {
      ok: false,
      message: '未提供用户名，无法在非交互模式执行',
    };
  }
  if (result.admins.length === 1) {
    const only = result.admins[0];
    log('cyan', `找到唯一管理员：${only.username}`);
    return { ok: true, username: only.username, target: only };
  }

  console.log('找到多个管理员账号：');
  const chosen = await promptAdminChoice(result.admins);
  if (!chosen) {
    return { ok: false, message: '未选择有效管理员，已取消' };
  }
  const target = result.admins.find((admin) => admin.username === chosen);
  return { ok: true, username: chosen, target };
}

/**
 * 校验事务输出里的 UPDATE 行数是否等于预期条数。
 * 必须精确计数而非正则匹配：`--also-unbind-totp` 时解绑那条也会输出 "UPDATE 1"，
 * 用 `/UPDATE 1/` 会把「口令未更新」误判为成功——那等于重置没生效却不报错。
 * @param {string} stdout psql -tA 事务输出
 * @param {number} expectedUpdates 预期的 UPDATE 行数
 * @returns {boolean}
 */
function verifyUpdateCount(stdout, expectedUpdates) {
  return (stdout.match(/UPDATE 1/g) || []).length === expectedUpdates;
}

/**
 * 重置指定管理员的密码并写入 ADMIN_PASSWORD_RESET 审计。
 * @param {string} [usernameArg] CLI 传入的用户名；缺省时列出全部 ADMIN 供选择。
 * @param {{
 *   confirmed?: boolean,
 *   interactive?: boolean,
 *   password?: string,
 *   alsoUnbindTotp?: boolean,
 *   nonInteractive?: boolean,
 *   source?: string,
 *   userAgent?: string,
 * }} [options] password 显式指定新口令（非交互调用方用，仍过策略校验），
 *   interactive=true 走掩码交互输口令，都缺省时自动生成强随机；
 *   nonInteractive=true（运维中心 ADR-0071）要求必须给用户名；
 *   confirmed=true 跳过确认提问；
 *   source/userAgent 记录调用来源（默认 ops_cli / cloudcad-cli/…）。
 * @returns {Promise<{ok: boolean, message: string, password?: string}>}
 */
async function adminResetPassword(usernameArg, options = null) {
  // 1. 定位目标管理员（给用户名=精确校验；缺省=列全部 ADMIN 供选择）
  const picked = await resolveTargetAdmin(usernameArg, options);
  if (!picked.ok) {
    log('red', picked.message);
    return { ok: false, message: picked.message };
  }
  const { username, target } = picked;
  if (options?.alsoUnbindTotp && !target.totpEnabled) {
    log('yellow', '该管理员未启用 TOTP，--also-unbind-totp 已忽略');
  }

  // 2. 确定新口令（优先级：显式指定 > interactive 掩码输入 > 自动生成）
  const minLength = resolveMinLength();
  let newPassword;
  if (options?.password) {
    newPassword = options.password;
  } else if (options?.interactive) {
    const prompted = await promptInteractivePassword(
      `管理员 ${username}`,
      minLength
    );
    if (!prompted.ok) {
      log('red', prompted.message);
      return { ok: false, message: prompted.message };
    }
    newPassword = prompted.password;
  } else {
    newPassword = generateStrongPassword();
  }
  // 三个来源统一过策略：显式指定的口令来自外部调用方（运维中心网页表单），
  // 不校验等于把弱口令直接写进 users.password
  const policyErrors = assertPasswordPolicy(newPassword, minLength);
  if (policyErrors.length) {
    const message = `密码不符合策略：${policyErrors.join('；')}`;
    log('red', message);
    return { ok: false, message };
  }

  const totpNote = target.totpEnabled
    ? `（该管理员已启用 TOTP：重置后首次登录仍会被动态码挡住，` +
      `验证器也丢失时请同时执行 mfa:totp-unbind）`
    : '';
  // 本次是否真的解绑了 TOTP（= 请求解绑 且 该账号确实启用着）
  const unboundTotp = Boolean(options?.alsoUnbindTotp && target.totpEnabled);

  // 3. 确认（高危操作：覆盖管理员口令）
  let confirmed = options?.confirmed === true;
  if (!confirmed) {
    console.log('');
    console.log(`${totpNote || '此操作不可撤销。'}`);
    confirmed = await promptConfirm(
      `确认重置管理员 ${username} 的密码？同时撤销其全部刷新令牌（yes/no）：`
    );
  }
  if (!confirmed) {
    log('yellow', '已取消');
    return { ok: false, message: '已取消' };
  }

  // 4. 写口令哈希 + 撤销会话（同一事务：任一失败则全部回滚）
  const hash = hashPassword(newPassword);
  const statements = [];
  if (unboundTotp) {
    statements.push(
      `UPDATE "users" SET "totpSecret" = NULL, "totpEnabled" = false ` +
        `WHERE "id" = '${sqlQuote(target.id)}'`
    );
  }
  statements.push(
    `UPDATE "users" SET "password" = '${sqlQuote(hash)}', ` +
      `"passwordChangedAt" = now() WHERE "id" = '${sqlQuote(target.id)}'`,
    `DELETE FROM "refresh_tokens" WHERE "userId" = '${sqlQuote(target.id)}'`
  );
  const tx = runPsql(`BEGIN;${statements.join(';')};COMMIT;`);
  if (!tx.ok) {
    log('red', `重置失败：${tx.stderr}`);
    return { ok: false, message: `重置失败：${tx.stderr}` };
  }
  // 校验 UPDATE 行数与预期一致（解绑 TOTP + 改口令各一条）
  const expectedUpdates = (unboundTotp ? 1 : 0) + 1;
  const updates = (tx.stdout.match(/UPDATE 1/g) || []).length;
  if (!verifyUpdateCount(tx.stdout, expectedUpdates)) {
    // UPDATE 0 是语句级零行命中（非错误），事务照常提交——措辞须如实，
    // 不能谎称「已回滚」；真实含义是「事务已提交但口令未更新」。
    log('red', `重置失败：期望 ${expectedUpdates} 行更新，实际 ${updates} 行（事务已提交但口令未更新）`);
    return {
      ok: false,
      message: `重置失败：期望 ${expectedUpdates} 行更新，实际 ${updates} 行（事务已提交但口令未更新）`,
    };
  }

  // 5. 写审计（source=ops_cli；失败不回滚，仅告警）
  const ins = writeAudit({
    action: 'ADMIN_PASSWORD_RESET',
    resourceId: target.id,
    resourceName: target.username,
    params: {
      method: 'admin_password_reset',
      source: 'ops_cli',
      unbindTotp: unboundTotp,
      source: options?.source || 'ops_cli',
    },
    userAgent: options?.userAgent || 'cloudcad-cli/admin-reset-password',
  });
  const auditNote = ins.ok ? '' : `，但审计写入失败：${ins.stderr}`;

  log('green', `已重置管理员 ${username} 的密码（refresh_tokens 已清空）`);
  console.log('');
  console.log(
    `${totpNote}\n  新密码：${newPassword}\n  登录入口：管理员登录页（/admin/auth/login）`
  );
  console.log(
    '  ⚠ 密码只在本次终端显示一次，请立即记录并妥善保管。\n'
  );
  return {
    ok: true,
    message: `已重置管理员 ${username} 的密码${auditNote}`,
    password: newPassword,
    // 调用方（运维中心网页）据此提示「登录后仍会被动态码挡住」
    totpEnabled: target.totpEnabled,
    unbindTotp: unboundTotp,
  };
}

module.exports = {
  adminResetPassword,
  assertPasswordPolicy,
  parseAdminList,
  // 供运维中心（config-service）列管理员下拉用
  queryAdminCandidates,
  verifyUpdateCount,
  promptInteractivePassword,
  promptNewPassword,
  hashPassword,
  loadBcrypt,
  resolveMinLength,
};

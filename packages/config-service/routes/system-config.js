const { log, parseBody, sendJson } = require('../lib/utils');
const { requireSession } = require('../lib/session');
const { parseEnvFile, updateEnvFile } = require('../lib/env');
const { parseDatabaseUrl, composeDatabaseUrl } = require('../lib/database-url');
const { ENV_PATH, CONFIG_GROUPS } = require('../lib/constants');
const path = require('path');
const crypto = require('crypto');
const {
  listAdminUsers,
  runDbPasswordReset,
  runRedisPasswordReset,
  runAdminUserPasswordReset,
} = require('../lib/ops');

/**
 * 把 CLI 密码重置结果翻译成 HTTP 响应。
 * ok=200 并回带 message；失败 400 并回带 error（表单据此显示在错误区）。
 * @param {import('http').ServerResponse} res
 * @param {{ok?: boolean, message?: string, error?: string}} result
 */
function sendPasswordResetResult(res, result) {
  const ok = result && result.ok === true;
  const detail = result?.message || result?.error || '修改失败';
  sendJson(res, ok ? 200 : 400, {
    success: ok,
    message: ok ? detail : undefined,
    error: ok ? undefined : detail,
    // 只有管理员密码重置会带这两个字段（网页据此提示「登录后仍会被动态码挡住」）；
    // JSON.stringify 丢弃未设置的 undefined，对数据库/Redis 两条调用无影响
    totpEnabled: ok ? Boolean(result?.totpEnabled) : undefined,
    unbindTotp: ok ? Boolean(result?.unbindTotp) : undefined,
  });
}

async function handle(req, res, pathname, method) {
  if (pathname === '/api/config/schema' && method === 'GET') {
    if (!requireSession(req, res)) return true;
    sendJson(res, 200, { groups: CONFIG_GROUPS });
    return true;
  }

  if (pathname === '/api/config' && method === 'GET') {
    if (!requireSession(req, res)) return true;

    const env = parseEnvFile(ENV_PATH);
    const config = {};

    CONFIG_GROUPS.forEach((group) => {
      group.items.forEach((item) => {
        const value = env[item.key] || '';
        if (item.sensitive) {
          config[item.key] = value ? '(已设置)' : '(未设置)';
        } else {
          config[item.key] = value;
        }
      });
    });

    sendJson(res, 200, { config, env });
    return true;
  }

  if (pathname === '/api/config' && method === 'PUT') {
    if (!requireSession(req, res)) return true;

    const body = await parseBody(req);
    const updates = body.updates || {};

    Object.keys(updates).forEach((key) => {
      if (updates[key] === '(已设置)' || updates[key] === '(未设置)') {
        delete updates[key];
      }
    });

    if (Object.keys(updates).length === 0) {
      sendJson(res, 400, { error: '没有有效的更新内容' });
      return true;
    }

    const dbConfigKeys = [
      'DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD', 'DB_DATABASE',
    ];
    const hasDbConfigChange = dbConfigKeys.some((key) => updates[key]);

    if (hasDbConfigChange) {
      const env = parseEnvFile(ENV_PATH);
      // DATABASE_URL 权威（ADR-0073）：未显式变更的部件优先取现有 URL 的部件，
      // 再回落 DB_* 环境变量，最后内置默认；查询参数（?sslmode= 等）逐字保留。
      // 用 DB_* 部件重组会静默丢弃查询串与 URL 内密码——runtime 侧 infra.js 已
      // 明确拒绝重组，此处对齐（漂移守卫见 runtime/scripts/database-url.test.js）。
      const cur = parseDatabaseUrl(env.DATABASE_URL);
      updates.DATABASE_URL = composeDatabaseUrl({
        host: updates.DB_HOST || cur.host || env.DB_HOST || 'localhost',
        port: updates.DB_PORT || cur.port || env.DB_PORT || '5432',
        user: updates.DB_USERNAME || cur.user || env.DB_USERNAME || 'postgres',
        password: updates.DB_PASSWORD || cur.password || env.DB_PASSWORD || 'password',
        dbName: updates.DB_DATABASE || cur.dbName || env.DB_DATABASE || 'cloudcad',
        query: cur.query,
      });
    }

    updateEnvFile(ENV_PATH, updates);
    log('info', `配置已更新: ${Object.keys(updates).join(', ')}`);

    sendJson(res, 200, {
      success: true,
      message: '配置已保存，需要重启服务才能生效',
    });
    return true;
  }

  if (pathname === '/api/config/regenerate-jwt' && method === 'POST') {
    if (!requireSession(req, res)) return true;

    const newSecret = crypto.randomBytes(64).toString('hex');
    updateEnvFile(ENV_PATH, { JWT_SECRET: newSecret });
    log('info', 'JWT 密钥已重新生成');

    sendJson(res, 200, {
      success: true,
      message: 'JWT 密钥已重新生成，需要重启服务才能生效',
    });
    return true;
  }

  // 数据库密码重置（ADR-0073）：改密、新口令回连验证、成对改 .env、凭据备份、
  // 审计、重启 backend 全在 runtime/scripts 的 db:reset-password 里，本层只做
  // ADR-0071 允许的输入校验（网页表单带旧密码字段，作为防误改的人机确认）。
  if (pathname === '/api/password/database' && method === 'POST') {
    if (!requireSession(req, res)) return true;

    const body = await parseBody(req);
    const { oldPassword, newPassword } = body;
    if (typeof newPassword !== 'string' || !newPassword || !oldPassword) {
      sendJson(res, 400, { error: '请输入旧密码和新密码' });
      return true;
    }
    if (oldPassword !== (parseEnvFile(ENV_PATH).DB_PASSWORD || '')) {
      sendJson(res, 400, { error: '旧密码错误' });
      return true;
    }
    sendPasswordResetResult(res, await runDbPasswordReset(newPassword));
    return true;
  }

  // Redis 密码重置（ADR-0073）：同上，成功后按 redis → backend → conversion 重启。
  if (pathname === '/api/password/redis' && method === 'POST') {
    if (!requireSession(req, res)) return true;

    const body = await parseBody(req);
    const { oldPassword, newPassword } = body;
    if (typeof newPassword !== 'string' || !newPassword || !oldPassword) {
      sendJson(res, 400, { error: '请输入旧密码和新密码' });
      return true;
    }
    if (oldPassword !== (parseEnvFile(ENV_PATH).REDIS_PASSWORD || '')) {
      sendJson(res, 400, { error: '旧密码错误' });
      return true;
    }
    sendPasswordResetResult(res, await runRedisPasswordReset(newPassword));
    return true;
  }

  // 平台管理员密码重置（ADR-0072 的 nonInteractive 通道）。
  // 与上面两条刻意不同：**不索取旧密码**——被锁死的恰恰是「不知道旧密码」，
  // 核对旧口令在这里构成伪边界。改口令 + 撤销该账号全部刷新令牌 + 审计 +
  // 「必须是 ADMIN 角色」校验全在 runtime/scripts 的 admin:reset-password 里。
  // 网页无法交互询问用户选谁，故先暴露只读的候选列表。
  if (pathname === '/api/password/admin-users' && method === 'GET') {
    if (!requireSession(req, res)) return true;

    const result = listAdminUsers();
    if (!result || result.ok !== true) {
      sendJson(res, 400, {
        error: result?.message || result?.error || '查询管理员失败',
      });
      return true;
    }
    sendJson(res, 200, {
      admins: result.admins.map((a) => ({
        username: a.username,
        totpEnabled: a.totpEnabled,
        status: a.status,
      })),
    });
    return true;
  }

  if (pathname === '/api/password/admin-user' && method === 'POST') {
    if (!requireSession(req, res)) return true;

    const body = await parseBody(req);
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const newPassword = body.newPassword;
    if (!username) {
      sendJson(res, 400, { error: '请选择要重置密码的管理员' });
      return true;
    }
    if (typeof newPassword !== 'string' || !newPassword) {
      sendJson(res, 400, { error: '请输入新密码' });
      return true;
    }
    sendPasswordResetResult(
      res,
      await runAdminUserPasswordReset({
        username,
        password: newPassword,
        unbindTotp: body.unbindTotp === true,
      })
    );
    return true;
  }

  return false;
}

module.exports = { handle };

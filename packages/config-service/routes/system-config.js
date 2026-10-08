const { log, parseBody, sendJson } = require('../lib/utils');
const { authMiddleware } = require('../lib/session');
const { parseEnvFile, extractDbNameFromUrl, updateEnvFile } = require('../lib/env');
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
    const session = authMiddleware(req, res);
    if (!session) return true;
    sendJson(res, 200, { groups: CONFIG_GROUPS });
    return true;
  }

  if (pathname === '/api/config' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return true;

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
    const session = authMiddleware(req, res);
    if (!session) return true;

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
      const dbHost = updates.DB_HOST || env.DB_HOST || 'localhost';
      const dbPort = updates.DB_PORT || env.DB_PORT || '5432';
      const dbName = updates.DB_DATABASE || env.DB_DATABASE || extractDbNameFromUrl(env.DATABASE_URL) || 'cloudcad';
      const dbUser = updates.DB_USERNAME || env.DB_USERNAME || 'postgres';
      const dbPassword = updates.DB_PASSWORD || env.DB_PASSWORD || 'password';
      const encodedPassword = encodeURIComponent(dbPassword);
      updates.DATABASE_URL = `postgresql://${dbUser}:${encodedPassword}@${dbHost}:${dbPort}/${dbName}`;
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
    const session = authMiddleware(req, res);
    if (!session) return true;

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
    const session = authMiddleware(req, res);
    if (!session) return true;

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
    const session = authMiddleware(req, res);
    if (!session) return true;

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
    const session = authMiddleware(req, res);
    if (!session) return true;

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
    const session = authMiddleware(req, res);
    if (!session) return true;

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

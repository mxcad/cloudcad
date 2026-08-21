const { log, parseBody, sendJson } = require('../lib/utils');
const {
  createSession,
  destroySession,
  authMiddleware,
  checkLoginLock,
  recordLoginAttempt,
} = require('../lib/session');
const { parseEnvFile, updateEnvFile } = require('../lib/env');
const { ENV_PATH } = require('../lib/constants');

async function handle(req, res, pathname, method) {
  if (pathname === '/api/auth/login' && method === 'POST') {
    const ip = req.socket.remoteAddress;
    const lockStatus = checkLoginLock(ip);

    if (lockStatus.locked) {
      sendJson(res, 429, {
        error: `登录失败次数过多，请 ${lockStatus.remaining} 秒后重试`,
      });
      return true;
    }

    const body = await parseBody(req);
    const env = parseEnvFile(ENV_PATH);
    if (!env.INITIAL_ADMIN_PASSWORD) {
      log('warn', 'INITIAL_ADMIN_PASSWORD 未设置，使用默认密码（不安全）');
    }
    const adminPassword = env.INITIAL_ADMIN_PASSWORD || 'admin123';

    if (body.password === adminPassword) {
      recordLoginAttempt(ip, true);
      const token = createSession('admin');
      log('info', '管理员登录成功');
      sendJson(res, 200, { success: true, token });
    } else {
      recordLoginAttempt(ip, false);
      log('warn', `登录失败，IP: ${ip}`);
      sendJson(res, 401, { error: '密码错误' });
    }
    return true;
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    if (token) destroySession(token);
    sendJson(res, 200, { success: true });
    return true;
  }

  if (pathname === '/api/auth/status' && method === 'GET') {
    const session = authMiddleware(req, res);
    if (!session) return true;
    sendJson(res, 200, { authenticated: true, username: session.username });
    return true;
  }

  if (pathname === '/api/auth/change-password' && method === 'POST') {
    const session = authMiddleware(req, res);
    if (!session) return true;

    const body = await parseBody(req);
    const { oldPassword, newPassword } = body;

    if (!oldPassword || !newPassword) {
      sendJson(res, 400, { error: '请输入旧密码和新密码' });
      return true;
    }

    const env = parseEnvFile(ENV_PATH);
    if (!env.INITIAL_ADMIN_PASSWORD) {
      log('warn', 'INITIAL_ADMIN_PASSWORD 未设置，使用默认密码（不安全）');
    }
    const currentPassword = env.INITIAL_ADMIN_PASSWORD || 'admin123';

    if (oldPassword !== currentPassword) {
      sendJson(res, 400, { error: '旧密码错误' });
      return true;
    }

    if (newPassword.length < 8) {
      sendJson(res, 400, { error: '新密码长度至少 8 位' });
      return true;
    }

    updateEnvFile(ENV_PATH, { INITIAL_ADMIN_PASSWORD: newPassword });
    log('info', '管理员密码已修改');
    sendJson(res, 200, { success: true, message: '密码已修改' });
    return true;
  }

  return false;
}

module.exports = { handle };

const { generateToken, sendJson } = require('./utils');
const { SESSION_TTL, MAX_LOGIN_ATTEMPTS, LOCKOUT_TIME } = require('./constants');

const sessions = new Map();
const loginAttempts = new Map();
const downloadTokens = new Map();

function createSession(username) {
  const token = generateToken();
  sessions.set(token, {
    username,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL,
  });
  return token;
}

function validateSession(token) {
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL;
  return session;
}

function destroySession(token) {
  sessions.delete(token);
}

function createDownloadToken(filename) {
  const downloadToken = generateToken();
  downloadTokens.set(downloadToken, {
    filename,
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
  return downloadToken;
}

function consumeDownloadToken(downloadToken) {
  const data = downloadTokens.get(downloadToken);
  if (!data) return null;

  if (Date.now() > data.expiresAt) {
    downloadTokens.delete(downloadToken);
    return null;
  }

  downloadTokens.delete(downloadToken);
  return data.filename;
}

function checkLoginLock(ip) {
  const attempts = loginAttempts.get(ip);
  if (!attempts) return { locked: false };

  if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
    const elapsed = Date.now() - attempts.lastAttempt;
    if (elapsed < LOCKOUT_TIME) {
      return {
        locked: true,
        remaining: Math.ceil((LOCKOUT_TIME - elapsed) / 1000),
      };
    }
    loginAttempts.delete(ip);
  }
  return { locked: false };
}

function recordLoginAttempt(ip, success) {
  if (success) {
    loginAttempts.delete(ip);
  } else {
    const attempts = loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };
    attempts.count++;
    attempts.lastAttempt = Date.now();
    loginAttempts.set(ip, attempts);
  }
}

function authMiddleware(req, res) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  const session = validateSession(token);

  if (!session) {
    sendJson(res, 401, { error: '未登录或会话已过期' });
    return null;
  }
  return session;
}

/**
 * 鉴权前置守卫（布尔语义）。
 *
 * 校验 Authorization Bearer 会话；未登录/过期时写 401 并返回 false，
 * 调用方据此 `return true` 认领请求（停止路由匹配）。
 *
 * 绝大多数 handler 只需要「必须登录」这道门、不读 session 本体，过去各自手写
 * 「const session = authMiddleware(req, res); if (!session) return true;」两行
 * 前言——安全相关且极易漏抄一处（漏一处即未鉴权端点）。此处收为单一出口，
 * 401 文案与短路语义只在这里定义一次。
 * 需要 session 对象的唯一例外（GET /api/auth/me 读 username）仍用 authMiddleware。
 */
function requireSession(req, res) {
  return authMiddleware(req, res) !== null;
}

module.exports = {
  createSession,
  validateSession,
  destroySession,
  createDownloadToken,
  consumeDownloadToken,
  checkLoginLock,
  recordLoginAttempt,
  authMiddleware,
  requireSession,
};

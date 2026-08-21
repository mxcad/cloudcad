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

module.exports = {
  createSession,
  validateSession,
  destroySession,
  createDownloadToken,
  consumeDownloadToken,
  checkLoginLock,
  recordLoginAttempt,
  authMiddleware,
};

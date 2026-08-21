const crypto = require('crypto');
const { JWT_SECRET } = require('./constants');

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
  return true;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

/**
 * 简单 JWT 验证（仅 HS256）
 * 验证 token 签名 + 检查过期
 */
function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const signature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${parts[0]}.${parts[1]}`)
      .digest('base64url');

    if (signature !== parts[2]) return null;

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (payload.exp && Date.now() >= payload.exp * 1000) return null;

    return payload;
  } catch {
    return null;
  }
}

module.exports = { log, sendJson, parseBody, verifyToken };

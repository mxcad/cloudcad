// 统一 JSON 日志（零依赖），实现见 ./logger
const { log, resolveRequestId, runWithRequest } = require('./logger');

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

function generateId() {
  return `fw_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 8)}`;
}

module.exports = { log, resolveRequestId, runWithRequest, sendJson, parseBody, generateId };

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function log(level, message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function parseMultipart(req) {
  return new Promise((resolve) => {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);

    if (!boundaryMatch) {
      resolve({ error: '无法解析 multipart boundary' });
      return;
    }

    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const chunks = [];

    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const parts = buffer
        .toString('binary')
        .split(`--${boundary}`)
        .filter(Boolean);

      for (const part of parts) {
        const lines = part.split(/\r?\n/);
        const headerLine = lines[0];

        if (!headerLine.includes('Content-Disposition')) continue;

        const nameMatch = headerLine.match(/name="([^"]+)"/);
        const filenameMatch = headerLine.match(/filename="([^"]+)"/);

        if (!filenameMatch) continue;

        const contentTypeMatch = lines[1]?.match(/Content-Type:\s*([^\s]+)/i);
        const filename = filenameMatch[1];

        const bodyStart2 = part.indexOf('\r\n\r\n') + 4;
        const bodyEnd = part.length - (part.endsWith('\r\n') ? 2 : 0);
        const fileBuffer = buffer.slice(
          buffer.indexOf(part) + bodyStart2,
          buffer.indexOf(part) + bodyEnd
        );

        resolve({
          file: {
            fieldname: nameMatch[1],
            filename,
            contentType: contentTypeMatch
              ? contentTypeMatch[1]
              : 'application/octet-stream',
            buffer: fileBuffer,
          },
        });
        return;
      }

      resolve({ error: '未找到文件' });
    });
    req.on('error', () => resolve({ error: '请求错误' }));
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  log,
  parseBody,
  parseMultipart,
  sendJson,
  generateToken,
};

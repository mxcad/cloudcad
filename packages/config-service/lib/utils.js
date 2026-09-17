const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// 统一 JSON 日志（零依赖），实现见 ./logger
const { log, resolveRequestId, runWithRequest } = require('./logger');

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
      // 必须用 latin1 做字符串往返：它是逐字节映射，字符串偏移 == 字节偏移。
      // 默认 utf8 会把图片里的高位字节替换成 U+FFFD，导致 indexOf 返回 -1。
      const text = buffer.toString('latin1');
      const parts = text.split(`--${boundary}`).filter(Boolean);

      for (const part of parts) {
        const headerEndMatch = part.match(/\r?\n\r?\n/);
        if (!headerEndMatch) continue;

        const headerEnd = headerEndMatch.index + headerEndMatch[0].length;
        // 只切 header 段，避免对二进制正文做 split
        const headerLines = part.slice(0, headerEnd).split(/\r?\n/);
        const headerLine = headerLines.find((l) =>
          l.includes('Content-Disposition')
        );

        if (!headerLine) continue;

        const nameMatch = headerLine.match(/name="([^"]+)"/);
        const filenameMatch = headerLine.match(/filename="([^"]+)"/);

        if (!filenameMatch) continue;

        const contentTypeLine = headerLines.find((l) =>
          /^Content-Type:/i.test(l.trim())
        );
        const contentTypeMatch = contentTypeLine?.match(
          /Content-Type:\s*([^\s]+)/i
        );
        const filename = filenameMatch[1];

        const bodyStart = headerEnd;
        // 正文与下一个 boundary 之间恰好一个行尾，CRLF 和 LF 都要退掉
        const trailer = /\r?\n$/.exec(part);
        const bodyEnd = part.length - (trailer ? trailer[0].length : 0);
        const fileBuffer = buffer.subarray(
          text.indexOf(part) + bodyStart,
          text.indexOf(part) + bodyEnd
        );

        resolve({
          file: {
            fieldname: nameMatch ? nameMatch[1] : null,
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
  resolveRequestId,
  runWithRequest,
  parseBody,
  parseMultipart,
  sendJson,
  generateToken,
};

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { EventEmitter } = require('node:events');

// 与 token.test.js 一致：让 lib/utils 的 verifyToken 用同一共享密钥
process.env.BACKEND_JWT_SECRET = 'test-shared-secret';

// 测试日志落临时目录，保持 hermetic（/data 虽 gitignore，仍不依赖仓库 data/logs）
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.LOG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-test-logs-'));

const TokenValidator = require('../services/token');
const { create } = require('../routes/files');

const SECRET = 'test-shared-secret';

function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

/**
 * 构造一个最小 HTTP 请求对象：带 headers，body 以 data/end 事件推送。
 * 事件在 process.nextTick 里发出——晚于 routes/files 的 parseBody 注册监听器，
 * 保证 await parseBody(req) 能收到完整 body。
 */
function makeReq(headers, bodyString) {
  const req = new EventEmitter();
  req.headers = headers;
  process.nextTick(() => {
    if (bodyString) req.emit('data', Buffer.from(bodyString));
    req.emit('end');
  });
  return req;
}

function makeRes() {
  return {
    statusCode: null,
    body: null,
    writeHead(code) {
      this.statusCode = code;
    },
    end(body) {
      this.body = body;
    },
  };
}

function makeFileHandler() {
  const written = [];
  return {
    written,
    write: async (path) => {
      written.push(path);
    },
  };
}

async function postUpload(token, bodyString) {
  const fileHandler = makeFileHandler();
  const routes = create(fileHandler, new TokenValidator());
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  const res = makeRes();
  await routes.handle(makeReq(headers, bodyString), res, '/v1/files/upload', 'POST');
  return { res, fileHandler };
}

describe('POST /v1/files/upload 路径约束（ADR-0015）', () => {
  it('写入路径只信令牌：无 path 的令牌 + body.path 不得写任意路径（回归锁定）', async () => {
    // 令牌合法（签名对、operation=upload）但无 path 字段；
    // 修复前 `tokenData.path || body.path` 会落到 body.path，客户端可写任意路径
    const token = signToken({ operation: 'upload', exp: Math.floor(Date.now() / 1000) + 3600 });
    const body = JSON.stringify({ path: 'evil/arbitrary.dwg', contents: Buffer.from('x').toString('base64') });

    const { res, fileHandler } = await postUpload(token, body);

    assert.equal(res.statusCode, 400);
    assert.equal(JSON.parse(res.body).error, 'path required');
    assert.deepEqual(fileHandler.written, []);
  });

  it('合法令牌（带 path）写入令牌指定路径，忽略 body.path', async () => {
    const token = signToken({
      path: '202607/node1/a.dwg',
      operation: 'upload',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    // body.path 与令牌 path 不同——令牌是权威值
    const body = JSON.stringify({ path: 'other/b.dwg', contents: Buffer.from('hello').toString('base64') });

    const { res, fileHandler } = await postUpload(token, body);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(fileHandler.written, ['202607/node1/a.dwg']);
  });

  it('缺少/非法令牌返回 401', async () => {
    const { res, fileHandler } = await postUpload(null, JSON.stringify({ path: 'x.dwg' }));
    assert.equal(res.statusCode, 401);
    assert.deepEqual(fileHandler.written, []);
  });

  it('写入后落审计日志（含 userId 与 path，ADR-0015）', async () => {
    const token = signToken({
      path: '202607/node1/a.dwg',
      operation: 'upload',
      userId: 'user-42',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const body = JSON.stringify({ contents: Buffer.from('hello').toString('base64') });

    // 捕获 stdout 上的 JSON 日志行（log 双输出：stdout + 文件；文件已落临时目录）
    const lines = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk, ...args) => {
      lines.push(String(chunk));
      return origWrite(chunk, ...args);
    };
    let result;
    try {
      result = await postUpload(token, body);
    } finally {
      process.stdout.write = origWrite;
    }

    assert.equal(result.res.statusCode, 200);
    const auditLine = lines.find((l) => l.includes('[Upload]'));
    assert.ok(auditLine, '应有一条 [Upload] 审计日志');
    const record = JSON.parse(auditLine);
    assert.match(record.message, /path=202607\/node1\/a\.dwg/);
    assert.match(record.message, /userId=user-42/);
  });
});

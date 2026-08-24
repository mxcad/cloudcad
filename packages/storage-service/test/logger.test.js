'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// 测试专用日志目录（logger 在调用时读取 env，支持运行时覆盖）
process.env.LOG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-svc-logs-'));
process.env.LOG_RETENTION_DAYS = '180';

const { log, resolveRequestId, runWithRequest } = require('../lib/logger');

function captureStdout(fn) {
  const lines = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk) => {
    lines.push(String(chunk));
    return true;
  };
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  return lines.join('');
}

describe('logger (零依赖 JSON 日志)', () => {
  it('输出 JSON 单行，含 time/level/service/message', () => {
    const out = captureStdout(() => log('hello', 'world'));
    const record = JSON.parse(out.trim());
    assert.equal(record.level, 'info');
    assert.equal(record.service, 'storage-service');
    assert.equal(record.message, 'hello world');
    assert.ok(record.time);
    assert.equal(out.split('\n').length - 1, 1); // 单行
  });

  it('兼容 log(level, message) 调用形态', () => {
    const out = captureStdout(() => log('warn', '注意'));
    const record = JSON.parse(out.trim());
    assert.equal(record.level, 'warn');
    assert.equal(record.message, '注意');
  });

  it('兼容 log("[Error] xxx") 前缀形态并归一化 level', () => {
    const out = captureStdout(() => log('[Error] 出错了'));
    const record = JSON.parse(out.trim());
    assert.equal(record.level, 'error');
    assert.equal(record.message, '出错了');
  });

  it('runWithRequest 内的日志携带 requestId', () => {
    const out = captureStdout(() =>
      runWithRequest('req-test-1', () => log('带请求id')),
    );
    const record = JSON.parse(out.trim());
    assert.equal(record.requestId, 'req-test-1');
  });

  it('无请求上下文的日志不含 requestId 字段', () => {
    const out = captureStdout(() => log('无请求id'));
    const record = JSON.parse(out.trim());
    assert.equal('requestId' in record, false);
  });

  it('resolveRequestId 回传入站合法 id 并写入响应头', () => {
    const req = { headers: { 'x-request-id': 'abc-123_XYZ.01' } };
    let headerValue;
    const res = { setHeader: (k, v) => { if (k === 'X-Request-Id') headerValue = v; } };
    const id = resolveRequestId(req, res);
    assert.equal(id, 'abc-123_XYZ.01');
    assert.equal(headerValue, 'abc-123_XYZ.01');
  });

  it('入站缺失/非法 id 时自生成', () => {
    const idMissing = resolveRequestId({ headers: {} }, null);
    assert.match(idMissing, /^[a-z0-9]+-[a-z0-9]+$/);

    const injectionId = 'bad id\nwith newline';
    const idInjected = resolveRequestId({ headers: { 'x-request-id': injectionId } }, null);
    assert.notEqual(idInjected, injectionId);
    assert.match(idInjected, /^[A-Za-z0-9._-]{1,128}$/);
  });

  it('日志落盘到 data/logs/<service>/app-YYYY-MM-DD.log', () => {
    captureStdout(() => log('落盘验证'));
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const file = path.join(process.env.LOG_DIR, 'storage-service', `app-${dateStr}.log`);
    const content = fs.readFileSync(file, 'utf8');
    const lastLine = content.trim().split('\n').pop();
    assert.equal(JSON.parse(lastLine).message, '落盘验证');
  });

  it('过期日志文件按保留策略清理', async () => {
    const dir = path.join(process.env.LOG_DIR, 'storage-service');
    const staleName = 'app-2000-01-01.log';
    fs.writeFileSync(path.join(dir, staleName), '{}\n');

    // 重载模块（清空模块级轮转状态）并缩短保留期，首次写入即触发清理
    process.env.LOG_RETENTION_DAYS = '1';
    delete require.cache[require.resolve('../lib/logger')];
    const fresh = require('../lib/logger');
    captureStdout(() => fresh.log('触发轮转清理'));

    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(fs.existsSync(path.join(dir, staleName)), false);
    process.env.LOG_RETENTION_DAYS = '180';
  });
});

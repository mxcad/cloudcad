'use strict';

/**
 * 零外部依赖 JSON 日志（ADR-0055 §1 对齐）
 *
 * - JSON 单行：{"time","level","service","message","requestId"?}
 * - 双输出：stdout + 文件落盘 data/logs/<service>/app-YYYY-MM-DD.log
 * - 按天轮转 + 保留期清理（LOG_RETENTION_DAYS，默认 180 天，与 backend 一致）
 * - 目录经 LOG_DIR env 可配（相对路径基于项目根解析，默认 data/logs，与 backend 语义一致）
 * - 请求级 requestId 经 AsyncLocalStorage 传播（纯 Node 能力，非第三方依赖）
 */

const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');
const { PROJECT_ROOT } = require('./constants');

const SERVICE_NAME = 'storage-service';
const LEVELS = ['debug', 'info', 'warn', 'error'];
const DEFAULT_RETENTION_DAYS = 180;
const REQUEST_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;

const requestStore = new AsyncLocalStorage();

function getLogDir() {
  const raw = process.env.LOG_DIR || 'data/logs';
  // 相对路径基于项目根解析（与 backend 语义一致），日志统一落 data/logs/<service>/，
  // 避免随包内 __dirname 漂移到包内 data（各服务日志散落在 packages/*/data 的问题）
  return path.isAbsolute(raw) ? raw : path.resolve(PROJECT_ROOT, raw);
}

function getRetentionDays() {
  return parseInt(process.env.LOG_RETENTION_DAYS || '', 10) || DEFAULT_RETENTION_DAYS;
}

function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

let currentDateStr = null;

function appendLine(dateStr, line) {
  const dir = path.join(getLogDir(), SERVICE_NAME);
  // 跨天首次写入时切换文件并清理过期日志
  if (currentDateStr !== dateStr) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o750 });
    cleanupExpiredLogs();
    currentDateStr = dateStr;
  }
  fs.appendFileSync(path.join(dir, `app-${dateStr}.log`), line);
}

function cleanupExpiredLogs() {
  try {
    const dir = path.join(getLogDir(), SERVICE_NAME);
    const cutoff = Date.now() - getRetentionDays() * 86400000;
    for (const name of fs.readdirSync(dir)) {
      const m = /^app-(\d{4}-\d{2}-\d{2})\.log$/.exec(name);
      if (!m) continue;
      if (new Date(`${m[1]}T00:00:00`).getTime() < cutoff) {
        fs.unlinkSync(path.join(dir, name));
      }
    }
  } catch {
    // 目录尚不存在等场景忽略；下次轮转再试
  }
}

function safeStringify(v) {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function normalizeArgs(args) {
  let level = 'info';
  // 兼容 log(level, message) 与 log('[Error] xxx') 两种历史调用形态
  if (args.length > 1 && LEVELS.includes(String(args[0]).toLowerCase())) {
    level = String(args[0]).toLowerCase();
    args = args.slice(1);
  } else if (typeof args[0] === 'string') {
    const m = /^\[(debug|info|warn|error)\]\s*/i.exec(args[0]);
    if (m) {
      level = m[1].toLowerCase();
      args[0] = args[0].slice(m[0].length);
    }
  }
  return { level, message: args.map(safeStringify).join(' ') };
}

function writeLine(level, message, requestId) {
  const record = { time: new Date().toISOString(), level, service: SERVICE_NAME, message };
  if (requestId) record.requestId = requestId;
  const line = `${JSON.stringify(record)}\n`;
  process.stdout.write(line);
  try {
    appendLine(localDateStr(), line);
  } catch {
    // 落盘失败不影响 stdout（PM2/docker 仍可采集）
  }
}

function log(...args) {
  const { level, message } = normalizeArgs(args);
  const store = requestStore.getStore();
  writeLine(level, message, store ? store.requestId : undefined);
}

function generateRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 解析入站 X-Request-Id（非法/缺失时自生成）并回传响应头。
 * 返回的 id 需配合 runWithRequest 使用。
 */
function resolveRequestId(req, res) {
  const incoming = req.headers['x-request-id'];
  const requestId =
    typeof incoming === 'string' && REQUEST_ID_RE.test(incoming)
      ? incoming
      : generateRequestId();
  if (res && typeof res.setHeader === 'function') {
    res.setHeader('X-Request-Id', requestId);
  }
  return requestId;
}

function runWithRequest(requestId, fn) {
  return requestStore.run({ requestId }, fn);
}

module.exports = { log, resolveRequestId, runWithRequest, getLogDir };

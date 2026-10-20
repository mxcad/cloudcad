'use strict';

/**
 * Redis 日志轮转与保留期清理（#472）
 *
 * Redis 用 --logfile 独占写入路径，本进程拿不到它的 fd。因此在 Redis **运行中**
 * rename 这个文件只会把写入悄悄转移到改名后的文件、且 Redis 不会重新打开——
 * 比「无界增长」更糟。CONFIG SET logfile 的开关 dance 虽能实现运行中轮转，
 * 但中途失败会留下「logfile 为空」的 Redis，日志改走 PM2 stdout，实时零输出的
 * 契约会静默破掉直到下次重启。
 *
 * 所以轮转只在 Redis **启动前**做：此时旧文件无持有者，rename 后 Redis 会在
 * 新路径创建空文件。这是唯一的介入点。
 *
 * 命名与保留期沿用三份零依赖 logger 的约定：日期戳（<base>-YYYY-MM-DD.log）+
 * LOG_RETENTION_DAYS（默认 180 天，与 backend 一致）。
 *
 * 代价（见 ADR-0076）：不重启的 Redis 其当前文件仍会增长。notice 级日常体量
 * 极小（每日数十行、数 KB），且每次部署/重启/崩溃恢复都会触发一次轮转，叠加
 * 保留期清理后总体积有界。
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_RETENTION_DAYS = 180;
// 触发轮转的当前文件大小上限。notice 级日常体量远小于此，这是安全门而非常态
// 阈值；刻意不做 env 可配——没有第二个调用方需要它。
const DEFAULT_ROTATE_BYTES = 10 * 1024 * 1024;

function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function localTimeStr(d = new Date()) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}${m}${s}`;
}

function getRetentionDays(env = process.env) {
  return parseInt(env.LOG_RETENTION_DAYS || '', 10) || DEFAULT_RETENTION_DAYS;
}

/**
 * 轮转命名用的 base：去掉当前文件名的 .log 后缀。
 * 与三份 logger 的 app-YYYY-MM-DD.log 同构——是 stem + 日期 + .log，
 * 而不是 redis.log-2026-10-20.log 那种双扩展名。
 */
function logBaseName(logFile) {
  return path.basename(logFile).replace(/\.log$/, '');
}

/** 转义 base 名里的正则元字符，避免目录/文件名含特殊字符时匹配失败 */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 轮转文件名：<base>-YYYY-MM-DD.log，同日多次轮转追加 -HHMMSS */
function rotatedName(baseName, dateStr, timeStr) {
  return timeStr ? `${baseName}-${dateStr}-${timeStr}.log` : `${baseName}-${dateStr}.log`;
}

/** 纯函数：判断某个文件名是不是 base 的轮转产物 */
function isRotatedLog(name, baseName) {
  return new RegExp(`^${escapeRegExp(baseName)}-\\d{4}-\\d{2}-\\d{2}(?:-\\d{6})?\\.log$`).test(name);
}

/** 纯函数：按保留期筛出该删除的轮转文件（按文件名单里的日期判定，不读 mtime） */
function expiredRotatedLogs(names, baseName, retentionDays, now = new Date()) {
  const cutoff = now.getTime() - retentionDays * 86400000;
  const out = [];
  for (const name of names) {
    if (!isRotatedLog(name, baseName)) continue;
    const date = name.slice(baseName.length + 1, baseName.length + 11);
    const t = new Date(`${date}T00:00:00`).getTime();
    if (Number.isFinite(t) && t < cutoff) out.push(name);
  }
  return out;
}

/**
 * 轮转 + 清理。只在 Redis 启动前调用（见文件头说明）。
 *
 * @param {object} params
 * @param {string} params.logFile 当前日志文件绝对路径
 * @param {number} [params.rotateBytes] 超过此大小才轮转
 * @param {number} [params.retentionDays] 轮转文件保留天数
 * @param {Date} [params.now] 注入时钟，便于测试
 * @returns {{rotated: string|null, deleted: string[]}} 实际动作，供调用方记日志
 */
function rotateAndPrune({
  logFile,
  rotateBytes = DEFAULT_ROTATE_BYTES,
  retentionDays = getRetentionDays(),
  now = new Date(),
}) {
  const result = { rotated: null, deleted: [] };
  const dir = path.dirname(logFile);
  const baseName = logBaseName(logFile);

  try {
    const size = fs.existsSync(logFile) ? fs.statSync(logFile).size : 0;
    if (size > 0 && size > rotateBytes) {
      const dateStr = localDateStr(now);
      const target = path.join(dir, rotatedName(baseName, dateStr));
      // 同日多次轮转不覆盖：降级到秒级后缀
      const actual = fs.existsSync(target)
        ? path.join(dir, rotatedName(baseName, dateStr, localTimeStr(now)))
        : target;
      fs.renameSync(logFile, actual);
      result.rotated = path.basename(actual);
    }
  } catch {
    // 轮转失败不阻断启动：Redis 仍会写新文件（Windows 上文件被占用等）
  }

  try {
    const names = fs.readdirSync(dir);
    for (const name of expiredRotatedLogs(names, baseName, retentionDays, now)) {
      fs.unlinkSync(path.join(dir, name));
      result.deleted.push(name);
    }
  } catch {
    // 目录尚不存在等场景忽略；下次启动再试
  }

  return result;
}

module.exports = {
  DEFAULT_RETENTION_DAYS,
  DEFAULT_ROTATE_BYTES,
  localDateStr,
  logBaseName,
  rotatedName,
  isRotatedLog,
  expiredRotatedLogs,
  getRetentionDays,
  rotateAndPrune,
};
